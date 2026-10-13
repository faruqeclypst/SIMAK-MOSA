import express, { Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { pool, memoryStore, saveMemoryStore, checkDbConnection, getIsPgConnected } from './db';
import {
  getWibNow,
  getWibDisplayDate,
  getWibIsoDate,
  getWibTimeString,
  getWibDayName,
  toSafePgDate
} from './dateUtils';
import {
  fetchPbClasses,
  fetchPbTeachers,
  fetchPbStudents,
  fetchPbSubjects,
  fetchPbUsers,
  authenticateWithPocketBase,
  syncPocketBaseToDatabase,
} from './pocketbase';

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'mosa_secure_jwt_secret_key_2026';

app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize DB check & schema migrations
checkDbConnection().then(async (connected) => {
  console.log(`[Database] PostgreSQL status: ${connected ? 'CONNECTED (Port 5433/5432)' : 'OFFLINE (Operating in High-Speed In-Memory Mode)'}`);
  if (connected) {
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT TRUE;`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;`);
      await pool.query(`
        UPDATE users 
        SET password_changed_at = updated_at 
        WHERE password_changed_at IS NULL 
          AND is_first_login = FALSE 
          AND updated_at IS NOT NULL 
          AND password_hash != crypt('12345678', password_hash);
      `).catch(() => {});
      await pool.query(`ALTER TABLE jurnal_mengajar ADD COLUMN IF NOT EXISTS mapel VARCHAR(255);`);
      await pool.query(`ALTER TABLE jurnal_mengajar ADD COLUMN IF NOT EXISTS semester VARCHAR(20);`);
      await pool.query(`ALTER TABLE jurnal_mengajar ADD COLUMN IF NOT EXISTS tahun_ajaran VARCHAR(20);`);
      await pool.query(`ALTER TABLE piket_izin_siswa ADD COLUMN IF NOT EXISTS semester VARCHAR(20);`);
      await pool.query(`ALTER TABLE piket_izin_siswa ADD COLUMN IF NOT EXISTS tahun_ajaran VARCHAR(20);`);
      await pool.query(`ALTER TABLE asrama_kehadiran ADD COLUMN IF NOT EXISTS semester VARCHAR(20);`);
      await pool.query(`ALTER TABLE asrama_kehadiran ADD COLUMN IF NOT EXISTS tahun_ajaran VARCHAR(20);`);
      await pool.query(`ALTER TABLE siswa ADD COLUMN IF NOT EXISTS tahun_lulus VARCHAR(10);`);
      await pool.query(`ALTER TABLE piket_matriks ADD COLUMN IF NOT EXISTS jam_9 VARCHAR(100);`);
      await pool.query(`ALTER TABLE piket_matriks ADD COLUMN IF NOT EXISTS jam_10 VARCHAR(100);`);
      await pool.query(`ALTER TABLE guru_berhalangan ALTER COLUMN status TYPE VARCHAR(100);`).catch(() => {});
      
      // Accuracy enhancements: audit trail & delegation fields
      await pool.query(`ALTER TABLE jurnal_mengajar ADD COLUMN IF NOT EXISTS status_ketepatan VARCHAR(20) DEFAULT 'tepat_waktu';`);
      await pool.query(`ALTER TABLE guru_berhalangan ADD COLUMN IF NOT EXISTS link_tugas TEXT;`);
      await pool.query(`ALTER TABLE guru_berhalangan ADD COLUMN IF NOT EXISTS guru_pengganti VARCHAR(255);`);
      await pool.query(`ALTER TABLE guru_berhalangan ADD COLUMN IF NOT EXISTS status_penanganan VARCHAR(50);`);
      for (let i = 1; i <= 10; i++) {
        await pool.query(`ALTER TABLE piket_matriks ADD COLUMN IF NOT EXISTS jam_${i}_source VARCHAR(50);`).catch(() => {});
      }
      
      // Ensure 'admin' user exists in users table with is_first_login = FALSE
      await pool.query(`
        INSERT INTO users (username, password_hash, nama, mapel, role, is_first_login)
        VALUES ('admin', crypt('12345678', gen_salt('bf')), 'Administrator SIMAK', 'Manajemen Kurikulum & Sistem', 'admin', FALSE)
        ON CONFLICT (username) DO UPDATE 
        SET role = 'admin', is_first_login = FALSE;
      `);

      // Update any users without is_first_login to FALSE
      await pool.query(`
        UPDATE users 
        SET is_first_login = FALSE 
        WHERE is_first_login IS NULL OR username = 'admin';
      `);
      console.log('[Database] Auth & schema migration initialized successfully.');
    } catch (err) {
      console.warn('[Database] Auth migration check warning:', err);
    }
  }

  // Synchronize subjects from PocketBase ExamKu REST API
  try {
    const pbSubjects = await fetchPbSubjects();
    if (pbSubjects && pbSubjects.length > 0) {
      const names = pbSubjects.map((s: any) => s.name).filter(Boolean);
      memoryStore.mapel = names;
      saveMemoryStore();
      if (getIsPgConnected()) {
        for (const name of names) {
          await pool.query('INSERT INTO mata_pelajaran (nama_mapel) VALUES ($1) ON CONFLICT (nama_mapel) DO NOTHING', [name]).catch(() => {});
        }
      }
      console.log(`[PocketBase] Synchronized ${names.length} subjects from ExamKu REST API`);
    }
  } catch (e: any) {
    console.warn('[PocketBase] Startup subject sync error:', e?.message);
  }

  // Synchronize teachers & users from PocketBase ExamKu REST API
  try {
    const [pbTeachers, pbUsers] = await Promise.all([
      fetchPbTeachers().catch(() => []),
      fetchPbUsers().catch(() => []),
    ]);

    if (pbTeachers && pbTeachers.length > 0) {
      memoryStore.guru = pbTeachers.map((t: any) => t.name).filter(Boolean);
      saveMemoryStore();
    }

    if (getIsPgConnected()) {
      const pbTeacherMap: Record<string, any> = {};
      (pbTeachers || []).forEach((t: any) => {
        if (t.id) pbTeacherMap[t.id] = t;
        if (t.username) pbTeacherMap[t.username.toLowerCase()] = t;
      });

      // 1. Sinkronkan seluruh 47 akun dari koleksi users PocketBase ExamKu
      for (const u of (pbUsers || [])) {
        const username = u.username;
        if (!username) continue;
        const teacher = u.teacherId ? pbTeacherMap[u.teacherId] : null;
        let mapel = teacher && Array.isArray(teacher.subjects)
          ? teacher.subjects.join(', ')
          : (teacher?.subjects || '');

        if (username === 'alfaruq_asri') {
          mapel = 'Informatika, Koding dan Kecerdasan Artifisial';
        } else if (!mapel) {
          mapel = 'Guru Mata Pelajaran';
        }

        const defaultRole = (u.role === 'admin' || username === 'alfaruq_asri' || username === 'admin') ? 'admin' : 'guru';

        await pool.query(
          `INSERT INTO users (username, password_hash, nama, mapel, role, email, is_first_login)
           VALUES ($1, crypt('12345678', gen_salt('bf')), $2, $3, $4, $5, FALSE)
           ON CONFLICT (username) DO UPDATE 
           SET nama = EXCLUDED.nama, 
               mapel = EXCLUDED.mapel,
               role = CASE WHEN users.role IN ('admin', 'wakil_kepala', 'piket', 'asrama', 'kurikulum') THEN users.role ELSE EXCLUDED.role END,
               email = COALESCE(EXCLUDED.email, users.email),
               is_first_login = FALSE`,
          [username, u.name || teacher?.name || username, mapel, defaultRole, u.email || '']
        ).catch(() => {});
      }

      // 2. Sinkronkan juga jika ada teacher yang belum punya record user
      for (const t of (pbTeachers || [])) {
        const username = t.username || t.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const defaultRole = (username === 'alfaruq_asri' || username === 'admin') ? 'admin' : 'guru';
        let mapel = Array.isArray(t.subjects) ? t.subjects.join(', ') : (t.subjects || '');
        if (username === 'alfaruq_asri') {
          mapel = 'Informatika, Koding dan Kecerdasan Artifisial';
        }
        await pool.query(
          `INSERT INTO users (username, password_hash, nama, mapel, role, email, is_first_login)
           VALUES ($1, crypt('12345678', gen_salt('bf')), $2, $3, $4, '', FALSE)
           ON CONFLICT (username) DO UPDATE 
           SET nama = EXCLUDED.nama, 
               mapel = EXCLUDED.mapel,
               role = CASE WHEN users.role IN ('admin', 'wakil_kepala', 'piket', 'asrama', 'kurikulum') THEN users.role ELSE EXCLUDED.role END,
               is_first_login = FALSE`,
          [username, t.name, mapel || 'Guru Mata Pelajaran', defaultRole]
        ).catch(() => {});
      }

      console.log(`[PocketBase] Synchronized ${pbUsers.length} user accounts and ${pbTeachers.length} teachers from ExamKu REST API`);
    }
  } catch (e: any) {
    console.warn('[PocketBase] Startup teacher sync error:', e?.message);
  }

  // Synchronize classes from PocketBase ExamKu REST API (including ABC & Dummy, no fase)
  try {
    const pbClasses = await fetchPbClasses();
    const valid = pbClasses.filter((c: any) => c.name && c.name !== 'ALUMNI' && !c.name.toLowerCase().includes('alumni'));
    if (valid.length > 0 && getIsPgConnected()) {
      for (const c of valid) {
        const tingkat = c.name.startsWith('XI-') ? 'XI' : c.name.startsWith('XII-') ? 'XII' : 'X';
        await pool.query(
          `INSERT INTO kelas (nama_kelas, tingkat, fase) 
           VALUES ($1, $2, '') 
           ON CONFLICT (nama_kelas) DO UPDATE SET tingkat = EXCLUDED.tingkat, fase = ''`,
          [c.name, tingkat]
        ).catch(() => {});
      }
      await pool.query("UPDATE kelas SET fase = '' WHERE fase != ''").catch(() => {});
      console.log(`[PocketBase] Synchronized ${valid.length} classes from ExamKu REST API (including ABC & Dummy, no fase)`);
    }
  } catch (e: any) {
    console.warn('[PocketBase] Startup class sync error:', e?.message);
  }
});

// Middleware: Verify Token
function authenticate(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, status: 'error', message: 'Token tidak ditemukan' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, status: 'error', message: 'Sesi kedaluwarsa atau tidak valid' });
  }
}

// Middleware: Role-based Authorization
function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: Function) => {
    const user = (req as any).user;
    if (!user || !user.role) {
      return res.status(401).json({ success: false, status: 'error', message: 'Autentikasi diperlukan.' });
    }
    // Admin always has full access
    if (user.role === 'admin' || allowedRoles.includes(user.role)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      status: 'error',
      message: `Akses ditolak: role '${user.role}' tidak memiliki izin untuk tindakan ini.`
    });
  };
}

// ==========================================
// 1. AUTHENTICATION & USERS LIST
// ==========================================

// Endpoint to list accounts for login dropdown
app.get('/api/auth/users-list', async (_req: Request, res: Response) => {
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT id, username, nama, role, mapel FROM users 
         ORDER BY (CASE WHEN role = 'admin' OR username = 'admin' THEN 1 ELSE 2 END), nama ASC`
      );
      if (q.rows.length > 0) {
        return res.json({ status: 'success', data: q.rows });
      }
    } catch (e) {
      console.warn('DB users-list error:', e);
    }
  }

  // Fallback
  const list = [
    { id: 'admin', username: 'admin', nama: 'Administrator SIMAK', role: 'admin' },
    { id: 'alfaruq_asri', username: 'alfaruq_asri', nama: 'Alfaruq Asri, S.Pd', role: 'admin' },
    ...memoryStore.guru.map(g => ({
      id: g.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      username: g.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      nama: g,
      role: 'guru'
    }))
  ];
  return res.json({ status: 'success', data: list });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const cleanUsername = (username || '').trim();
  const cleanPass = (password || '').trim();

  if (!cleanUsername || !cleanPass) {
    return res.status(400).json({ success: false, message: 'Username dan kata sandi wajib diisi.' });
  }

  const normInput = cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '');

  // =========================================================================
  // 1. LOCAL DATABASE VERIFICATION (PostgreSQL)
  // =========================================================================
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT id, username, nama, mapel, role, email, password_hash, 
                COALESCE(is_first_login, FALSE) as is_first_login,
                password_changed_at
         FROM users 
         WHERE LOWER(username) = LOWER($1)
            OR LOWER(nama) = LOWER($1)
            OR ($1 = 'admin' AND (role = 'admin' OR username = 'admin'))
            OR regexp_replace(LOWER(username), '[^a-z0-9]', '', 'g') = $2
            OR regexp_replace(LOWER(nama), '[^a-z0-9]', '', 'g') = $2
         ORDER BY 
           (CASE 
              WHEN LOWER(username) = LOWER($1) THEN 1 
              WHEN LOWER(nama) = LOWER($1) THEN 2 
              WHEN role = 'admin' AND $1 = 'admin' THEN 3
              ELSE 4 
            END)
         LIMIT 1`,
        [cleanUsername, normInput]
      );

      if (q.rows.length > 0) {
        const user = q.rows[0];

        // Case A: User has explicitly changed/updated their password in SIMAK MOSA
        if (user.password_changed_at) {
          const passCheck = await pool.query(
            `SELECT (password_hash = crypt($1, password_hash)) as valid FROM users WHERE id = $2`,
            [cleanPass, user.id]
          );

          if (passCheck.rows[0]?.valid) {
            const token = jwt.sign(
              { id: user.id, username: user.username, nama: user.nama, role: user.role, is_first_login: false },
              JWT_SECRET,
              { expiresIn: '12h' }
            );
            return res.json({
              success: true,
              status: 'success',
              authSource: 'local',
              token,
              mustChangePassword: false,
              user: {
                id: user.id,
                username: user.username,
                nama: user.nama,
                mapel: user.mapel,
                role: user.role,
                email: user.email,
                is_first_login: false,
              },
            });
          }

          // User already set a new custom password, but cleanPass doesn't match!
          // Reject immediately: OLD PASSWORDS MUST NOT WORK!
          return res.status(401).json({
            success: false,
            message: 'Kata sandi tidak sesuai. Silakan gunakan kata sandi baru yang telah Anda perbarui.',
          });
        }

        // Case B: User has NOT explicitly changed their password in SIMAK MOSA yet
        // Check if cleanPass matches their local password_hash (e.g. from previous ExamKu sync)
        const passCheck = await pool.query(
          `SELECT (
             password_hash = crypt($1, password_hash)
             OR (COALESCE($3, FALSE) = TRUE AND $1 = '12345678')
           ) as valid
           FROM users WHERE id = $2`,
          [cleanPass, user.id, user.is_first_login]
        );

        if (passCheck.rows[0]?.valid) {
          const isDefaultPass = cleanPass === '12345678';
          const mustChange = Boolean(user.is_first_login && isDefaultPass);
          const token = jwt.sign(
            { id: user.id, username: user.username, nama: user.nama, role: user.role, is_first_login: mustChange },
            JWT_SECRET,
            { expiresIn: '12h' }
          );
          return res.json({
            success: true,
            status: 'success',
            authSource: 'local',
            token,
            mustChangePassword: mustChange,
            user: {
              id: user.id,
              username: user.username,
              nama: user.nama,
              mapel: user.mapel,
              role: user.role,
              email: user.email,
              is_first_login: mustChange,
            },
          });
        }
      }
    } catch (e) {
      console.warn('Postgres auth error, checking PocketBase SSO:', e);
    }
  }

  // =========================================================================
  // 2. ATTEMPT POCKETBASE EXAMKU SINGLE SIGN-ON (modalbangsa.examku.my.id)
  // (Active for accounts using their ExamKu credentials)
  // =========================================================================
  let pbAuth: any = null;
  try {
    pbAuth = await authenticateWithPocketBase(cleanUsername, cleanPass);
  } catch (errPb) {
    console.warn('[PocketBase] Auth attempt error:', errPb);
  }

  if (pbAuth && pbAuth.success && pbAuth.record) {
    const pbRecord = pbAuth.record;
    const finalUsername = pbRecord.username || cleanUsername;
    const finalNama = pbRecord.name || cleanUsername;
    let finalRole = (pbRecord.role === 'admin' || finalUsername === 'alfaruq_asri' || finalUsername === 'admin' || finalNama.toLowerCase().includes('alfaruq')) ? 'admin' : 'guru';
    let finalMapel = 'Guru Mata Pelajaran';

    if (getIsPgConnected()) {
      try {
        const existQ = await pool.query(
          `SELECT id, username, nama, mapel, role, email, password_changed_at 
           FROM users 
           WHERE LOWER(username) = LOWER($1) OR LOWER(nama) = LOWER($2) 
           LIMIT 1`,
          [finalUsername, finalNama]
        );

        if (existQ.rows.length > 0) {
          const row = existQ.rows[0];

          // If this user already changed their password in SIMAK MOSA, DO NOT allow PB old password!
          if (row.password_changed_at) {
            return res.status(401).json({
              success: false,
              message: 'Kata sandi tidak sesuai. Silakan gunakan kata sandi baru yang telah Anda perbarui di SIMAK MOSA.',
            });
          }

          if (['admin', 'wakil_kepala', 'piket', 'asrama', 'kurikulum'].includes(row.role)) {
            finalRole = row.role;
          }
          if (row.mapel) finalMapel = row.mapel;

          // Update password_hash to match ExamKu password for offline resiliency
          await pool.query(
            `UPDATE users 
             SET password_hash = crypt($1, gen_salt('bf')),
                 nama = $2,
                 is_first_login = FALSE,
                 updated_at = NOW()
             WHERE id = $3`,
            [cleanPass, finalNama, row.id]
          );

          const token = jwt.sign(
            { id: row.id, username: row.username, nama: row.nama, role: finalRole, is_first_login: false },
            JWT_SECRET,
            { expiresIn: '12h' }
          );

          return res.json({
            success: true,
            status: 'success',
            authSource: 'examku',
            token,
            mustChangePassword: false,
            user: {
              id: row.id,
              username: row.username,
              nama: row.nama,
              mapel: finalMapel,
              role: finalRole,
              email: row.email || pbRecord.email || '',
              is_first_login: false,
            },
          });
        } else {
          // New ExamKu account not yet registered in local DB
          const insertQ = await pool.query(
            `INSERT INTO users (username, password_hash, nama, mapel, role, email, is_first_login)
             VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, $6, FALSE)
             RETURNING id, username, nama, mapel, role, email, is_first_login`,
            [finalUsername, cleanPass, finalNama, finalMapel, finalRole, pbRecord.email || '']
          );
          const newUser = insertQ.rows[0];
          const token = jwt.sign(
            { id: newUser.id, username: newUser.username, nama: newUser.nama, role: finalRole, is_first_login: false },
            JWT_SECRET,
            { expiresIn: '12h' }
          );

          return res.json({
            success: true,
            status: 'success',
            authSource: 'examku',
            token,
            mustChangePassword: false,
            user: {
              id: newUser.id,
              username: newUser.username,
              nama: newUser.nama,
              mapel: finalMapel,
              role: finalRole,
              email: newUser.email || '',
              is_first_login: false,
            },
          });
        }
      } catch (errPg) {
        console.warn('Syncing ExamKu user to PostgreSQL failed:', errPg);
      }
    }

    // In-memory fallback for PB user
    const memoryUser = {
      id: pbRecord.id || finalUsername,
      username: finalUsername,
      nama: finalNama,
      mapel: finalMapel,
      role: finalRole,
      is_first_login: false,
    };
    const token = jwt.sign(memoryUser, JWT_SECRET, { expiresIn: '12h' });
    return res.json({
      success: true,
      status: 'success',
      authSource: 'examku',
      token,
      mustChangePassword: false,
      user: memoryUser,
    });
  }

  // =========================================================================
  // 3. IN-MEMORY FALLBACK (ONLY IF POSTGRESQL IS OFFLINE)
  // =========================================================================
  if (!getIsPgConnected()) {
    if (cleanUsername === 'admin' && cleanPass === '12345678') {
      const user = {
        id: 'admin',
        username: 'admin',
        nama: 'Administrator SIMAK',
        mapel: 'Manajemen Kurikulum & Sistem',
        role: 'admin',
        is_first_login: false,
      };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });
      return res.json({ success: true, token, user, mustChangePassword: false, authSource: 'local' });
    }

    const matchedGuru = memoryStore.guru.find(g => 
      g.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normInput) ||
      normInput.includes(g.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    if (matchedGuru && cleanPass === '12345678') {
      const cleanHandle = matchedGuru.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const user = {
        id: cleanHandle,
        username: cleanHandle,
        nama: matchedGuru,
        mapel: 'Guru Mata Pelajaran',
        role: 'guru',
        is_first_login: true,
      };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });
      return res.json({ success: true, token, user, mustChangePassword: true, authSource: 'local' });
    }
  }

  return res.status(401).json({
    success: false,
    message: 'Username atau kata sandi tidak sesuai. Silakan gunakan username dan kata sandi akun modalbangsa.examku Anda.',
  });
});

app.post('/api/auth/change-password', authenticate, async (req: Request, res: Response) => {
  const { passBaru, newPassword } = req.body;
  const passwordToSet = (newPassword || passBaru || '').trim();
  const authUser = (req as any).user;

  if (!passwordToSet || passwordToSet.length < 6) {
    return res.status(400).json({ status: 'error', message: 'Kata sandi baru minimal 6 karakter.' });
  }

  if (passwordToSet === '12345678') {
    return res.status(400).json({ status: 'error', message: 'Kata sandi baru tidak boleh sama dengan kata sandi bawaan (12345678).' });
  }

  if (getIsPgConnected()) {
    try {
      const isValidUuid = typeof authUser.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUser.id);
      const q = await pool.query(
        `UPDATE users 
         SET password_hash = crypt($1, gen_salt('bf')), 
             is_first_login = FALSE, 
             password_changed_at = NOW(),
             updated_at = NOW() 
         WHERE ($2::uuid IS NOT NULL AND id = $2::uuid)
            OR LOWER(username) = LOWER($3)
         RETURNING id, username, nama, mapel, role, email, is_first_login, password_changed_at`,
        [passwordToSet, isValidUuid ? authUser.id : null, authUser.username || '']
      );

      if (q.rows.length > 0) {
        const u = q.rows[0];
        const newToken = jwt.sign(
          { id: u.id, username: u.username, nama: u.nama, role: u.role, is_first_login: false },
          JWT_SECRET,
          { expiresIn: '12h' }
        );
        return res.json({
          status: 'success',
          success: true,
          message: 'Kata sandi berhasil diperbarui.',
          token: newToken,
          user: {
            id: u.id,
            username: u.username,
            nama: u.nama,
            mapel: u.mapel,
            role: u.role,
            email: u.email,
            is_first_login: false
          }
        });
      }
    } catch (e: any) {
      console.warn('DB change password error:', e);
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  // Memory fallback
  const newToken = jwt.sign(
    { ...authUser, is_first_login: false },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  return res.json({
    status: 'success',
    success: true,
    message: 'Kata sandi berhasil diperbarui.',
    token: newToken,
    user: {
      ...authUser,
      is_first_login: false
    }
  });
});

// ==========================================
// 2. MASTER DATA: GURU, KELAS & SISWA
// ==========================================
app.get('/api/guru', async (_req: Request, res: Response) => {
  try {
    const pbTeachers = await fetchPbTeachers();
    if (pbTeachers && pbTeachers.length > 0) {
      const names = pbTeachers.map((t: any) => t.name).filter(Boolean).sort();
      return res.json({ status: 'success', data: names, source: 'pocketbase_rest_api' });
    }
  } catch (e) {
    console.warn('PocketBase fetchPbTeachers in /api/guru failed:', e);
  }

  if (getIsPgConnected()) {
    try {
      const q = await pool.query("SELECT DISTINCT nama FROM users WHERE username != 'admin' AND LOWER(nama) != 'admin' ORDER BY nama ASC");
      if (q.rows.length > 0) {
        return res.json({ status: 'success', data: q.rows.map((r: any) => r.nama) });
      }
    } catch (e) {
      console.warn('DB guru query failed, fallback to memoryStore:', e);
    }
  }
  res.json({ status: 'success', data: memoryStore.guru });
});

export const DEFAULT_KELAS = [
  { nama: 'X-1', tingkat: 'X', fase: '' },
  { nama: 'X-2', tingkat: 'X', fase: '' },
  { nama: 'X-3', tingkat: 'X', fase: '' },
  { nama: 'X-4', tingkat: 'X', fase: '' },
  { nama: 'X-5', tingkat: 'X', fase: '' },
  { nama: 'X-6', tingkat: 'X', fase: '' },
  { nama: 'XI-1', tingkat: 'XI', fase: '' },
  { nama: 'XI-2', tingkat: 'XI', fase: '' },
  { nama: 'XI-3', tingkat: 'XI', fase: '' },
  { nama: 'XI-4', tingkat: 'XI', fase: '' },
  { nama: 'XI-5', tingkat: 'XI', fase: '' },
  { nama: 'XI-6', tingkat: 'XI', fase: '' },
  { nama: 'XII-1', tingkat: 'XII', fase: '' },
  { nama: 'XII-2', tingkat: 'XII', fase: '' },
  { nama: 'XII-3', tingkat: 'XII', fase: '' },
  { nama: 'XII-4', tingkat: 'XII', fase: '' },
  { nama: 'XII-5', tingkat: 'XII', fase: '' },
  { nama: 'XII-6', tingkat: 'XII', fase: '' }
];

function sortRombelClasses(classes: any[]) {
  const parseOrder = (name: string) => {
    const parts = String(name || '').split('-');
    const roman = parts[0];
    const num = parseInt(parts[1] || '0', 10);
    const level = roman === 'X' ? 1 : roman === 'XI' ? 2 : 3;
    return level * 100 + num;
  };
  return classes.sort((a, b) => parseOrder(a.nama) - parseOrder(b.nama));
}

app.get('/api/kelas', async (req: Request, res: Response) => {
  // 1. Fetch directly from PocketBase ExamKu REST API first (Source of Truth)
  // Strict filter: only include 18 official classes (X-1 to XII-6), ignore testing classes like ABC, Dummy
  try {
    const pbClasses = await fetchPbClasses();
    const valid = pbClasses.filter((c: any) => c.name && /^X(I{0,2})-[1-6]$/.test(c.name.trim()));
    if (valid.length > 0) {
      const list = valid.map((c: any) => ({
        nama: c.name.trim(),
        tingkat: c.name.startsWith('XI-') ? 'XI' : c.name.startsWith('XII-') ? 'XII' : 'X',
        fase: '',
        id: c.id
      }));
      sortRombelClasses(list);

      // Cache into PostgreSQL
      if (getIsPgConnected()) {
        for (const k of list) {
          await pool.query(
            'INSERT INTO kelas (nama_kelas, tingkat, fase) VALUES ($1, $2, $3) ON CONFLICT (nama_kelas) DO UPDATE SET tingkat=EXCLUDED.tingkat, fase=EXCLUDED.fase',
            [k.nama, k.tingkat, '']
          ).catch(() => {});
        }
      }

      return res.json({ status: 'success', data: list, source: 'pocketbase_rest_api' });
    }
  } catch (e) {
    console.warn('Direct PocketBase classes fetch failed, falling back to PostgreSQL:', e);
  }

  // 2. Fallback to PostgreSQL if PocketBase is temporarily unreachable
  if (getIsPgConnected()) {
    try {
      const q = await pool.query("SELECT nama_kelas as nama, tingkat, fase FROM kelas WHERE nama_kelas ~ '^X(I{0,2})-[1-6]$' ORDER BY nama_kelas ASC");
      if (q.rows.length > 0) {
        const sorted = sortRombelClasses(q.rows);
        return res.json({ status: 'success', data: sorted, source: 'database_cache' });
      }
    } catch (e) {
      console.warn('DB kelas query failed:', e);
    }
  }

  // 3. Default fallback
  res.json({ status: 'success', data: DEFAULT_KELAS, source: 'default_preset' });
});

export const DAFTAR_MAPEL: string[] = [
  'Bahasa Indonesia',
  'Bahasa Inggris',
  'Bahasa Inggris Tingkat Lanjut',
  'Bimbingan Konseling',
  'Biologi',
  'Ekonomi',
  'Fiqih',
  'Fisika',
  'Geografi',
  'Informatika',
  'Kimia',
  'Koding dan Kecerdasan Artifisial',
  'Matematika',
  'Matematika Tingkat Lanjut',
  'PAI',
  'PJOK',
  'Pendidikan Pancasila',
  'Post Test Matrikulasi',
  'Pre Test Matrikulasi',
  'SKI',
  'Sejarah',
  'Seni dan Budaya',
  'Sosiologi'
];

app.get('/api/mapel', async (req: Request, res: Response) => {
  const forceRefresh = req.query.refresh === 'true';

  // 1. If PostgreSQL is connected and not forcing refresh, check database cache first
  if (!forceRefresh && getIsPgConnected()) {
    try {
      const q = await pool.query('SELECT nama_mapel FROM mata_pelajaran ORDER BY nama_mapel ASC');
      if (q.rows.length > 0) {
        return res.json({ status: 'success', data: q.rows.map((r: any) => r.nama_mapel) });
      }
    } catch (e) {
      console.warn('DB mapel query failed, fallback to PocketBase:', e);
    }
  }

  // 2. Fetch directly from PocketBase ExamKu REST API
  try {
    const pbSubjects = await fetchPbSubjects();
    if (pbSubjects && pbSubjects.length > 0) {
      const names = pbSubjects.map((s: any) => s.name).filter(Boolean).sort();
      // Cache to PostgreSQL
      if (getIsPgConnected()) {
        for (const name of names) {
          await pool.query(
            'INSERT INTO mata_pelajaran (nama_mapel) VALUES ($1) ON CONFLICT (nama_mapel) DO NOTHING',
            [name]
          ).catch(() => {});
        }
      }
      // Cache to memory store
      memoryStore.mapel = names;
      saveMemoryStore();
      return res.json({ status: 'success', data: names });
    }
  } catch (e) {
    console.warn('Direct PocketBase subject fetch failed:', e);
  }

  // 3. Fallback to PostgreSQL
  if (getIsPgConnected()) {
    try {
      const q = await pool.query('SELECT nama_mapel FROM mata_pelajaran ORDER BY nama_mapel ASC');
      if (q.rows.length > 0) {
        return res.json({ status: 'success', data: q.rows.map((r: any) => r.nama_mapel) });
      }
    } catch (e) {}
  }

  // 4. Fallback to memoryStore
  if (memoryStore.mapel && memoryStore.mapel.length > 0) {
    return res.json({ status: 'success', data: memoryStore.mapel });
  }

  // 5. Ultimate fallback
  res.json({ status: 'success', data: DAFTAR_MAPEL });
});

app.get('/api/siswa', async (req: Request, res: Response) => {
  const kelas = req.query.kelas as string;
  const status = (req.query.status as string) || 'aktif'; // 'aktif', 'alumni', or 'all'

  if (getIsPgConnected()) {
    try {
      let query = 'SELECT s.id, s.pb_id, s.nisn, s.nama, s.status, s.tahun_lulus, k.nama_kelas FROM siswa s JOIN kelas k ON s.kelas_id = k.id WHERE 1=1';
      const params: any[] = [];

      if (status !== 'all') {
        params.push(status);
        query += ` AND s.status = $${params.length}`;
      }

      if (kelas) {
        params.push(kelas);
        query += ` AND k.nama_kelas = $${params.length}`;
      }

      query += ' ORDER BY k.nama_kelas, s.nama ASC';
      const q = await pool.query(query, params);

      if (kelas) {
        return res.json({ status: 'success', data: q.rows.map((r: any) => r.nama) });
      }

      const map: Record<string, string[]> = {};
      q.rows.forEach((r: any) => {
        if (!map[r.nama_kelas]) map[r.nama_kelas] = [];
        map[r.nama_kelas].push(r.nama);
      });
      return res.json({ status: 'success', data: map, list: q.rows });
    } catch (e) {
      console.warn('DB siswa query failed, fallback to memoryStore:', e);
    }
  }
  if (kelas) {
    const list = memoryStore.siswaPerKelas[kelas] || [];
    return res.json({ status: 'success', data: list });
  }
  res.json({ status: 'success', data: memoryStore.siswaPerKelas });
});

// Get Alumni List
app.get('/api/siswa/alumni', async (_req: Request, res: Response) => {
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT s.id, s.pb_id, s.nisn, s.nama, s.status, 
                COALESCE(s.tahun_lulus, '') as tahun_lulus, 
                k.nama_kelas, s.created_at
         FROM siswa s
         JOIN kelas k ON s.kelas_id = k.id
         WHERE s.status = 'alumni'
         ORDER BY s.nama ASC`
      );
      return res.json({ status: 'success', data: q.rows });
    } catch (e: any) {
      console.warn('DB alumni query error, fallback to empty list:', e.message);
      return res.json({ status: 'success', data: [] });
    }
  }
  res.json({ status: 'success', data: [] });
});

// Get Complete Student History (Presensi & Izin per semester atau gabungan)
app.get('/api/siswa/:id/history', async (req: Request, res: Response) => {
  const { id } = req.params;
  const semester = req.query.semester as string;

  if (getIsPgConnected()) {
    try {
      const sRes = await pool.query(
        'SELECT s.*, k.nama_kelas FROM siswa s LEFT JOIN kelas k ON s.kelas_id = k.id WHERE s.id::text = $1 OR s.pb_id = $1',
        [id]
      );
      if (sRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Data siswa tidak ditemukan.' });
      }
      const student = sRes.rows[0];

      // Jurnal attendance records
      let presensiQuery = `
        SELECT pj.status, pj.keterangan as catatan, jm.tanggal as tanggal_mengajar, 
               array_to_string(jm.jam_pelajaran, ', ') as jam_ke, jm.materi, jm.semester, jm.tahun_ajaran, 
               COALESCE(u.nama, jm.nama_guru) as nama_guru, COALESCE(u.mapel, 'Mata Pelajaran') as nama_mapel
        FROM presensi_jurnal pj
        JOIN jurnal_mengajar jm ON pj.jurnal_id = jm.id
        LEFT JOIN users u ON jm.guru_id = u.id
        WHERE (pj.siswa_id = $1 OR pj.nama_siswa = $2)
      `;
      const presensiParams: any[] = [student.id, student.nama];
      if (semester && semester !== 'all' && semester !== 'Semua') {
        presensiParams.push(semester);
        presensiQuery += ` AND jm.semester = $${presensiParams.length}`;
      }
      presensiQuery += ' ORDER BY jm.tanggal DESC LIMIT 100';
      const presensiRes = await pool.query(presensiQuery, presensiParams);

      // Piket permits records
      let izinQuery = `
        SELECT p.id, p.tanggal as tanggal_izin, p.status, p.keterangan as alasan, p.dicatat_oleh as penjemput, p.semester, p.tahun_ajaran, p.nama_kelas
        FROM piket_izin_siswa p 
        WHERE (p.siswa_id = $1 OR p.nama_siswa = $2)
      `;
      const izinParams: any[] = [student.id, student.nama];
      if (semester && semester !== 'all' && semester !== 'Semua') {
        izinParams.push(semester);
        izinQuery += ` AND p.semester = $${izinParams.length}`;
      }
      izinQuery += ' ORDER BY p.tanggal DESC LIMIT 50';
      const izinRes = await pool.query(izinQuery, izinParams);

      return res.json({
        status: 'success',
        data: {
          student,
          presensi: presensiRes.rows,
          izin: izinRes.rows,
        }
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  res.json({
    status: 'success',
    data: {
      student: { id, nama: 'Santri SMAN Modal Bangsa', status: 'aktif' },
      presensi: [],
      izin: []
    }
  });
});

// ==========================================
// 3. JURNAL MENGAJAR & RIWAYAT
// ==========================================
app.get('/api/jurnal/riwayat', async (req: Request, res: Response) => {
  const guru = req.query.guru as string;
  const semester = req.query.semester as string;
  const tahunAjaran = req.query.tahunAjaran as string;

  if (getIsPgConnected()) {
    try {
      let qStr = `
        SELECT jm.id, 
               TO_CHAR(jm.tanggal, 'DD-MM-YYYY') as "tanggalInput",
               TO_CHAR(jm.tanggal, 'YYYY-MM-DD') as "tanggalIso",
               CONCAT(TO_CHAR(jm.tanggal, 'DD-MM-YYYY'), ' ', TO_CHAR(jm.created_at, 'HH24:MI:SS')) as "tanggalWaktu",
               jm.created_at as "createdAtIso",
               jm.nama_guru as "namaGuru",
               COALESCE(jm.mapel, u.mapel, 'Mata Pelajaran') as mapel,
               jm.nama_kelas as kelas,
               array_to_string(jm.jam_pelajaran, ', ') as jam,
               jm.materi,
               COALESCE(
                 (SELECT string_agg(CONCAT(pj.nama_siswa, ' (', pj.status, CASE WHEN pj.keterangan IS NOT NULL AND pj.keterangan != pj.status::text THEN CONCAT(': ', pj.keterangan) ELSE '' END, ')'), ', ')
                  FROM presensi_jurnal pj WHERE pj.jurnal_id = jm.id),
                 'Semua Hadir'
               ) as absen,
               COALESCE(jm.catatan, 'Aman') as catatan,
               jm.sesi,
               jm.semester,
               jm.tahun_ajaran as "tahunAjaran",
                COALESCE(jm.status_ketepatan, 'tepat_waktu') as "statusKetepatan"
        FROM jurnal_mengajar jm
        LEFT JOIN users u ON jm.guru_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (guru) {
        params.push(guru);
        qStr += ` AND jm.nama_guru = $${params.length}`;
      }
      if (semester && semester !== 'all' && semester !== 'Semua') {
        params.push(semester);
        qStr += ` AND jm.semester = $${params.length}`;
      }
      if (tahunAjaran && tahunAjaran !== 'all') {
        params.push(tahunAjaran);
        qStr += ` AND jm.tahun_ajaran = $${params.length}`;
      }
      qStr += ` ORDER BY jm.created_at DESC LIMIT 200`;

      const dbRes = await pool.query(qStr, params);
      return res.json({ status: 'success', data: dbRes.rows });
    } catch (e: any) {
      console.warn('DB fetch riwayat jurnal error, fallback to memory:', e.message);
    }
  }

  let list = memoryStore.riwayatJurnal;
  if (guru) {
    list = list.filter(j => j.namaGuru === guru);
  }
  if (semester && semester !== 'all' && semester !== 'Semua') {
    list = list.filter(j => !j.semester || j.semester === semester);
  }
  if (tahunAjaran && tahunAjaran !== 'all') {
    list = list.filter(j => !j.tahunAjaran || j.tahunAjaran === tahunAjaran);
  }
  res.json({ status: 'success', data: list });
});

app.post('/api/jurnal', async (req: Request, res: Response) => {
  const { namaGuru, mapel, kelas, jam, materi, absensi, catatan, sesi, semester: reqSemester, tahunAjaran: reqTahunAjaran } = req.body;
  
  const today = getWibNow();
  const dateStr = getWibDisplayDate();
  const timeStr = getWibTimeString();
  const isoDateStr = getWibIsoDate();

  let activeSemester = reqSemester || 'Genap';
  let activeTahunAjaran = reqTahunAjaran || '2025/2026';

  if (getIsPgConnected() && (!reqSemester || !reqTahunAjaran)) {
    try {
      const setQ = await pool.query("SELECT key, value FROM system_settings WHERE key IN ('active_tahun_ajaran', 'active_semester')");
      setQ.rows.forEach(r => {
        if (r.key === 'active_tahun_ajaran' && !reqTahunAjaran) activeTahunAjaran = r.value;
        if (r.key === 'active_semester' && !reqSemester) activeSemester = r.value;
      });
    } catch (e) {
      // fallback
    }
  }

  const jamArray = Array.isArray(jam) ? jam : (jam ? String(jam).split(',').map((j: string) => j.trim()) : ['Jam 1', 'Jam 2']);

  // Check duplicate journal in memory fallback
  if (!getIsPgConnected()) {
    const existingDup = memoryStore.riwayatJurnal.find(j => 
      j.kelas === kelas && j.tanggalInput === dateStr &&
      jamArray.some((jm: string) => (Array.isArray(j.jam) ? j.jam : String(j.jam).split(',')).map((x: string) => x.trim()).includes(jm))
    );
    if (existingDup) {
      return res.status(409).json({
        status: 'error',
        message: `Jurnal KBM untuk kelas ${kelas} pada jam tersebut sudah pernah diisi hari ini oleh ${existingDup.namaGuru} (${existingDup.mapel || 'KBM'}).`
      });
    }
  }

  const newJurnal = {
    tanggalWaktu: `${dateStr} ${timeStr}`,
    tanggalInput: dateStr,
    tanggalIso: isoDateStr,
    createdAtIso: today.toISOString(),
    namaGuru: namaGuru || 'Alfaruq Asri, S.Pd',
    mapel: mapel || 'Informatika',
    kelas,
    jam: Array.isArray(jam) ? jam.join(', ') : jam,
    materi,
    absen: absensi || '-',
    catatan: catatan || 'Aman',
    sesi: sesi || 'Kelas Pagi',
    semester: activeSemester,
    tahunAjaran: activeTahunAjaran,
  };

  // Calculate punctuality (Tepat Waktu vs Susulan)
  const todayIso = getWibIsoDate();
  const isSameDay = !newJurnal.tanggalIso || newJurnal.tanggalIso === todayIso;
  const statusKetepatan = isSameDay ? 'tepat_waktu' : 'susulan';
  (newJurnal as any).statusKetepatan = statusKetepatan;

  // Persist into PostgreSQL
  if (getIsPgConnected()) {
    try {
      const guruRes = await pool.query('SELECT id FROM users WHERE nama = $1 LIMIT 1', [newJurnal.namaGuru]);
      const guruId = guruRes.rows[0]?.id || null;

      const kelasRes = await pool.query('SELECT id FROM kelas WHERE nama_kelas = $1 LIMIT 1', [kelas]);
      const kelasId = kelasRes.rows[0]?.id || null;

      // Duplicate check: Prevent accidental duplicate journal for the same class and overlapping hours today
      if (kelasId) {
        const checkDup = await pool.query(
          `SELECT id, nama_guru, mapel, array_to_string(jam_pelajaran, ', ') as jam
           FROM jurnal_mengajar
           WHERE kelas_id = $1 AND tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date AND jam_pelajaran && $2::text[]
           LIMIT 1`,
          [kelasId, jamArray]
        );
        if (checkDup.rows.length > 0) {
          const dup = checkDup.rows[0];
          return res.status(409).json({
            status: 'error',
            message: `Jurnal KBM untuk kelas ${kelas} pada jam tersebut sudah pernah diisi hari ini oleh ${dup.nama_guru} (${dup.mapel} - ${dup.jam}).`
          });
        }
      }

      const insertJurnalQ = await pool.query(
        `INSERT INTO jurnal_mengajar 
         (guru_id, nama_guru, kelas_id, nama_kelas, tanggal, sesi, jam_pelajaran, materi, catatan, mapel, semester, tahun_ajaran, status_ketepatan)
         VALUES ($1, $2, $3, $4, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [guruId, newJurnal.namaGuru, kelasId, kelas, sesi || 'Kelas Pagi', jamArray, materi, catatan || 'Aman', newJurnal.mapel, activeSemester, activeTahunAjaran, statusKetepatan]
      );

      const insertedJurnalId = insertJurnalQ.rows[0]?.id;

      // Parse student attendance and record to presensi_jurnal
      if (insertedJurnalId && absensi && absensi !== 'Semua Hadir' && absensi !== '-') {
        const studentAbsentParts = String(absensi).split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const part of studentAbsentParts) {
          const firstParen = part.indexOf('(');
          const lastParen = part.lastIndexOf(')');
          let studentName = part.trim();
          let statusInfo = 'Izin';
          if (firstParen !== -1 && lastParen > firstParen) {
            studentName = part.substring(0, firstParen).trim();
            statusInfo = part.substring(firstParen + 1, lastParen).trim();
          }

          // Clean redundant stacked status prefixes and corrupted texts
          statusInfo = statusInfo
            .replace(/^(Sakit|Izin|Alpa|Dispensasi):\s*(Sakit|Izin|Alpa|Dispensasi):?/i, '$1:')
            .replace(/et:\s*Dari Piket/gi, 'Dari Piket')
            .replace(/\s+/g, ' ')
            .trim();

          let statusCategory = 'Izin';
          const sLower = statusInfo.toLowerCase();
          if (sLower.includes('sakit')) statusCategory = 'Sakit';
          else if (sLower.includes('dispensasi')) statusCategory = 'Dispensasi';
          else if (sLower.includes('pulang')) statusCategory = 'Izin Pulang';
          else if (sLower.includes('keluarga')) statusCategory = 'Izin Keluarga';
          else if (sLower.includes('dinas')) statusCategory = 'Dinas Luar';
          else if (sLower.includes('alpa')) statusCategory = 'Alpa';
          else if (sLower.includes('izin')) statusCategory = 'Izin';
          else statusCategory = 'Lainnya';

          let sId = null;
          if (kelasId) {
            const sRes = await pool.query(
              'SELECT id FROM siswa WHERE LOWER(TRIM(nama)) = LOWER(TRIM($1)) AND kelas_id = $2 LIMIT 1',
              [studentName, kelasId]
            );
            sId = sRes.rows[0]?.id || null;
          }

          await pool.query(
            `INSERT INTO presensi_jurnal (jurnal_id, siswa_id, nama_siswa, status, keterangan)
             VALUES ($1, $2, $3, $4, $5)`,
            [insertedJurnalId, sId, studentName, statusCategory, statusInfo]
          ).catch((err) => console.warn('Insert presensi_jurnal warning:', err.message));
        }
      }

      // Auto-Sync Jurnal Guru to Piket Matriks in Real-time
      if (kelasId && jamArray.length > 0) {
        const shortName = (newJurnal.namaGuru || 'Guru').split(',')[0].split(' ')[0] || 'Guru';
        const cellVal = `KBM: ${shortName} (${newJurnal.mapel || 'Mapel'})`;
        for (const jp of jamArray) {
          const num = parseInt(String(jp).replace(/\D/g, ''));
          if (num >= 1 && num <= 10) {
            const colName = `jam_${num}`;
            const srcCol = `jam_${num}_source`;
            await pool.query(
              `INSERT INTO piket_matriks (tanggal, kelas_id, nama_kelas, ${colName}, ${srcCol}, updated_at)
               VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date, $1, $2, $3, 'jurnal', NOW())
               ON CONFLICT (tanggal, kelas_id) DO UPDATE SET
                 ${colName} = EXCLUDED.${colName},
                 ${srcCol} = 'jurnal',
                 updated_at = NOW()`,
              [kelasId, kelas, cellVal]
            ).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      console.warn('DB save jurnal error:', e.message);
    }
  }

  // Prepend to history in memory
  memoryStore.riwayatJurnal.unshift(newJurnal);

  // Update real-time curriculum status in memory
  const existingKurikulumIdx = memoryStore.laporanKurikulum.findIndex(k => k.kelas === kelas && k.jam === newJurnal.jam);
  if (existingKurikulumIdx >= 0) {
    memoryStore.laporanKurikulum[existingKurikulumIdx] = newJurnal;
  } else {
    memoryStore.laporanKurikulum.unshift(newJurnal);
  }

  // Auto-sync memoryStore piket matriks
  if (jamArray.length > 0) {
    if (!memoryStore.matriksPiket[kelas]) memoryStore.matriksPiket[kelas] = {};
    const shortName = (newJurnal.namaGuru || 'Guru').split(',')[0].split(' ')[0] || 'Guru';
    const cellVal = `KBM: ${shortName} (${newJurnal.mapel || 'Mapel'})`;
    for (const jp of jamArray) {
      const num = parseInt(String(jp).replace(/\D/g, ''));
      if (num >= 1 && num <= 10) {
        memoryStore.matriksPiket[kelas][`jam_${num}`] = cellVal;
      }
    }
  }

  saveMemoryStore();

  res.json({
    status: 'success',
    message: 'Jurnal mengajar berhasil disimpan ke database.',
    data: newJurnal
  });
});

// ==========================================
// 4. LAPORAN KURIKULUM (REAL-TIME KBM)
// ==========================================
app.get('/api/kurikulum/hari-ini', async (req: Request, res: Response) => {
  const tanggalQuery = req.query.tanggal as string;
  const targetDateIso = tanggalQuery ? toSafePgDate(tanggalQuery) : getWibIsoDate();

  if (getIsPgConnected()) {
    try {
      const qStr = `
        SELECT jm.id, 
               TO_CHAR(jm.tanggal, 'DD-MM-YYYY') as "tanggalInput",
               TO_CHAR(jm.tanggal, 'YYYY-MM-DD') as "tanggalIso",
               CONCAT(TO_CHAR(jm.tanggal, 'DD-MM-YYYY'), ' ', TO_CHAR(jm.created_at, 'HH24:MI:SS')) as "tanggalWaktu",
               jm.nama_guru as "namaGuru",
               COALESCE(jm.mapel, u.mapel, 'Mata Pelajaran') as mapel,
               jm.nama_kelas as kelas,
               array_to_string(jm.jam_pelajaran, ', ') as jam,
               jm.materi,
               COALESCE(
                 (SELECT string_agg(CONCAT(pj.nama_siswa, ' (', pj.status, CASE WHEN pj.keterangan IS NOT NULL AND pj.keterangan != pj.status::text THEN CONCAT(': ', pj.keterangan) ELSE '' END, ')'), ', ')
                  FROM presensi_jurnal pj WHERE pj.jurnal_id = jm.id),
                 'Semua Hadir'
               ) as absen,
               COALESCE(jm.catatan, 'Aman') as catatan,
               jm.sesi,
               jm.semester,
               jm.tahun_ajaran as "tahunAjaran",
               COALESCE(jm.status_ketepatan, 'tepat_waktu') as "statusKetepatan"
        FROM jurnal_mengajar jm
        LEFT JOIN users u ON jm.guru_id = u.id
        WHERE jm.tanggal = $1::date
        ORDER BY jm.created_at ASC
      `;
      const dbRes = await pool.query(qStr, [targetDateIso]);
      return res.json({ status: 'success', data: dbRes.rows });
    } catch (e: any) {
      console.warn('DB kurikulum hari-ini error, fallback to memory:', e.message);
    }
  }

  let list = memoryStore.riwayatJurnal || memoryStore.laporanKurikulum || [];
  if (targetDateIso) {
    list = list.filter((j: any) => j.tanggalIso === targetDateIso || j.tanggalInput === tanggalQuery);
  }
  res.json({ status: 'success', data: list });
});

// ==========================================
// 5. RUANG KENDALI GURU PIKET & ASRAMA
// ==========================================
app.get('/api/piket/matriks', authenticate, requireRole(['piket', 'admin']), async (_req: Request, res: Response) => {
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT nama_kelas, jam_1, jam_2, jam_3, jam_4, jam_5, jam_6, jam_7, jam_8, jam_9, jam_10
         FROM piket_matriks
         WHERE tanggal = CURRENT_DATE`
      );
      const matrixObj: Record<string, any> = {};
      q.rows.forEach(r => {
        matrixObj[r.nama_kelas] = {
          jam_1: r.jam_1 || '',
          jam_2: r.jam_2 || '',
          jam_3: r.jam_3 || '',
          jam_4: r.jam_4 || '',
          jam_5: r.jam_5 || '',
          jam_6: r.jam_6 || '',
          jam_7: r.jam_7 || '',
          jam_8: r.jam_8 || '',
          jam_9: r.jam_9 || '',
          jam_10: r.jam_10 || '',
        };
      });

      // Merge realtime from jurnal_mengajar today so Piket Matrix is always 100% synchronized
      try {
        const jmToday = await pool.query(
          `SELECT jm.nama_kelas, array_to_string(jm.jam_pelajaran, ',') as jams, jm.nama_guru, COALESCE(jm.mapel, u.mapel, 'KBM') as mapel
           FROM jurnal_mengajar jm
           LEFT JOIN users u ON jm.guru_id = u.id
           WHERE jm.tanggal = CURRENT_DATE`
        );
        jmToday.rows.forEach((jm: any) => {
          if (!matrixObj[jm.nama_kelas]) {
            matrixObj[jm.nama_kelas] = {
              jam_1: '', jam_2: '', jam_3: '', jam_4: '', jam_5: '', jam_6: '', jam_7: '', jam_8: '', jam_9: '', jam_10: ''
            };
          }
          const shortName = (jm.nama_guru || 'Guru').split(',')[0].split(' ')[0] || 'Guru';
          const cellVal = `KBM: ${shortName} (${jm.mapel})`;
          const parts = (jm.jams || '').split(',').map((p: string) => p.trim());
          parts.forEach((p: string) => {
            const num = parseInt(p.replace(/\D/g, ''));
            if (num >= 1 && num <= 10) {
              const k = `jam_${num}`;
              if (!matrixObj[jm.nama_kelas][k] || matrixObj[jm.nama_kelas][k] === '-') {
                matrixObj[jm.nama_kelas][k] = cellVal;
              }
            }
          });
        });
      } catch (jmMergeErr) {
        console.warn('Merge live jurnal to piket_matriks warning:', jmMergeErr);
      }

      return res.json({ status: 'success', data: matrixObj });
    } catch (e) {
      console.warn('DB piket_matriks query error:', e);
    }
  }
  res.json({ status: 'success', data: memoryStore.matriksPiket });
});

app.post('/api/piket/matriks', authenticate, requireRole(['piket', 'admin']), async (req: Request, res: Response) => {
  const { data } = req.body;
  memoryStore.matriksPiket = data || {};
  saveMemoryStore();

  if (getIsPgConnected() && data && typeof data === 'object') {
    try {
      for (const [namaKelas, hours] of Object.entries(data as Record<string, any>)) {
        const kRes = await pool.query('SELECT id FROM kelas WHERE nama_kelas = $1 LIMIT 1', [namaKelas]);
        const kId = kRes.rows[0]?.id || null;
        if (kId) {
          await pool.query(
            `INSERT INTO piket_matriks (tanggal, kelas_id, nama_kelas, jam_1, jam_2, jam_3, jam_4, jam_5, jam_6, jam_7, jam_8, jam_9, jam_10, updated_at)
             VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
             ON CONFLICT (tanggal, kelas_id) DO UPDATE SET
               jam_1 = EXCLUDED.jam_1,
               jam_2 = EXCLUDED.jam_2,
               jam_3 = EXCLUDED.jam_3,
               jam_4 = EXCLUDED.jam_4,
               jam_5 = EXCLUDED.jam_5,
               jam_6 = EXCLUDED.jam_6,
               jam_7 = EXCLUDED.jam_7,
               jam_8 = EXCLUDED.jam_8,
               jam_9 = EXCLUDED.jam_9,
               jam_10 = EXCLUDED.jam_10,
               updated_at = NOW()`,
            [
              kId,
              namaKelas,
              hours.jam_1 || null,
              hours.jam_2 || null,
              hours.jam_3 || null,
              hours.jam_4 || null,
              hours.jam_5 || null,
              hours.jam_6 || null,
              hours.jam_7 || null,
              hours.jam_8 || null,
              hours.jam_9 || null,
              hours.jam_10 || null,
            ]
          ).catch((e) => console.warn('piket_matriks upsert error:', e.message));
        }
      }
    } catch (e) {
      console.warn('DB piket_matriks save error:', e);
    }
  }

  res.json({ status: 'success', message: 'Matriks piket berhasil disimpan.' });
});

app.get('/api/piket/izin', authenticate, requireRole(['piket', 'admin']), async (_req: Request, res: Response) => {
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT id, TO_CHAR(tanggal, 'DD-MM-YYYY') as tanggal, nama_kelas as kelas, nama_siswa as "namaSiswa", status, keterangan, 'Piket' as "asalLaporan", created_at
         FROM piket_izin_siswa
         WHERE tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
         ORDER BY created_at DESC`
      );
      return res.json({ status: 'success', data: q.rows });
    } catch (e) {
      console.warn('DB piket_izin query error:', e);
    }
  }
  res.json({ status: 'success', data: memoryStore.rekapIzin.filter(i => i.asalLaporan === 'Piket' && i.tanggal === getWibDisplayDate()) });
});

app.post('/api/piket/izin', authenticate, requireRole(['piket', 'admin']), async (req: Request, res: Response) => {
  const { kelas, siswa, status: reqStatus, keterangan } = req.body;
  const today = getWibDisplayDate();
  
  let statusEnum = 'Izin';
  const cand = (reqStatus || keterangan || '').toLowerCase();
  if (cand.includes('sakit')) statusEnum = 'Sakit';
  else if (cand.includes('dispensasi')) statusEnum = 'Dispensasi';
  else if (cand.includes('pulang')) statusEnum = 'Izin Pulang';
  else if (cand.includes('keluarga')) statusEnum = 'Izin Keluarga';
  else if (cand.includes('dinas')) statusEnum = 'Dinas Luar';
  else if (cand.includes('alpa')) statusEnum = 'Alpa';
  else statusEnum = 'Izin';

  const entries = (Array.isArray(siswa) ? siswa : [siswa]).map(namaSiswa => ({
    id: Math.random().toString(36).substring(2, 11),
    tanggal: today,
    kelas,
    namaSiswa,
    status: statusEnum,
    keterangan: keterangan || statusEnum,
    asalLaporan: 'Piket'
  }));

  memoryStore.rekapIzin.unshift(...entries);
  saveMemoryStore();

  if (getIsPgConnected()) {
    try {
      const kRes = await pool.query('SELECT id FROM kelas WHERE nama_kelas = $1 LIMIT 1', [kelas]);
      const kId = kRes.rows[0]?.id || null;
      for (const namaSiswa of (Array.isArray(siswa) ? siswa : [siswa])) {
        let sId = null;
        if (kId) {
          const sRes = await pool.query(
            'SELECT id FROM siswa WHERE LOWER(TRIM(nama)) = LOWER(TRIM($1)) AND kelas_id = $2 LIMIT 1',
            [namaSiswa, kId]
          );
          sId = sRes.rows[0]?.id || null;
        }
        await pool.query(
          `INSERT INTO piket_izin_siswa (tanggal, kelas_id, nama_kelas, siswa_id, nama_siswa, status, keterangan, dicatat_oleh)
           VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date, $1, $2, $3, $4, $5, $6, 'Guru Piket')`,
          [kId, kelas, sId, namaSiswa, statusEnum, keterangan || statusEnum]
        ).catch((err) => console.warn('Insert piket_izin_siswa error:', err.message));
      }
    } catch (e) {
      console.warn('DB piket izin error:', e);
    }
  }

  res.json({ status: 'success', message: `${entries.length} data izin siswa berhasil disimpan.` });
});

// Delete Piket Izin
app.delete('/api/piket/izin/:id', authenticate, requireRole(['piket', 'admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (getIsPgConnected()) {
    try {
      await pool.query('DELETE FROM piket_izin_siswa WHERE id = $1', [id]);
      return res.json({ status: 'success', message: 'Izin piket siswa berhasil dibatalkan.' });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }
  memoryStore.rekapIzin = memoryStore.rekapIzin.filter(i => String(i.id) !== String(id));
  saveMemoryStore();
  res.json({ status: 'success', message: 'Izin piket siswa berhasil dibatalkan.' });
});

app.get('/api/piket/guru-berhalangan', authenticate, async (_req: Request, res: Response) => {
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT id, TO_CHAR(tanggal, 'DD-MM-YYYY') as tanggal, nama_guru as "namaGuru", status, catatan_tugas as catatan,
                COALESCE(link_tugas, '') as "linkTugas",
                COALESCE(guru_pengganti, '') as "guruPengganti",
                COALESCE(status_penanganan, 'Tugas Mandiri') as "statusPenanganan"
         FROM guru_berhalangan
         WHERE tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
         ORDER BY created_at DESC`
      );
      return res.json({ status: 'success', data: q.rows });
    } catch (e) {
      console.warn('DB guru_berhalangan error:', e);
    }
  }
  res.json({ status: 'success', data: memoryStore.guruBerhalangan.filter(g => g.tanggal === getWibDisplayDate()) });
});

app.post('/api/piket/guru-berhalangan', authenticate, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  const { namaGuru, status, catatan, linkTugas, guruPengganti, statusPenanganan } = req.body;
  const targetGuru = namaGuru && namaGuru.trim() ? namaGuru.trim() : (authUser?.nama || 'Guru');
  const today = getWibDisplayDate();
  
  const statusStr = status || 'Sakit';
  const catatanStr = catatan && catatan.trim() ? catatan.trim() : 'Tugas ajar mandiri diberikan kepada siswa';

  const entry = {
    id: Math.random().toString(36).substring(2, 11),
    tanggal: today,
    namaGuru: targetGuru,
    status: statusStr,
    catatan: catatanStr
  };

  memoryStore.guruBerhalangan.unshift(entry);
  saveMemoryStore();

  const currentDay = getWibDayName();

  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `INSERT INTO guru_berhalangan (tanggal, nama_guru, status, catatan_tugas, link_tugas, guru_pengganti, status_penanganan)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
         RETURNING id, TO_CHAR(tanggal, 'DD-MM-YYYY') as tanggal, nama_guru as "namaGuru", status, catatan_tugas as catatan, link_tugas as "linkTugas", guru_pengganti as "guruPengganti", status_penanganan as "statusPenanganan"`,
        [targetGuru, statusStr, catatanStr, linkTugas || '', guruPengganti || '', statusPenanganan || (guruPengganti ? 'Guru Inval' : 'Tugas Mandiri')]
      );

      // Otomatis sinkronkan status tugas ke piket_matriks untuk jadwal guru hari ini
      try {
        const jRes = await pool.query(
          `SELECT id, nama_kelas, jam_ke, mapel FROM jadwal_pelajaran
           WHERE LOWER(TRIM(nama_guru)) = LOWER(TRIM($1)) AND LOWER(TRIM(hari)) = LOWER(TRIM($2))`,
          [targetGuru, currentDay]
        );
        for (const j of jRes.rows) {
          const kRes = await pool.query('SELECT id FROM kelas WHERE nama_kelas = $1 LIMIT 1', [j.nama_kelas]);
          const kId = kRes.rows[0]?.id;
          if (kId && j.jam_ke) {
            const shortName = targetGuru.split(',')[0].split(' ')[0] || 'Guru';
            const val = (guruPengganti && guruPengganti.trim())
              ? `Inval: ${guruPengganti.split(',')[0].split(' ')[0]} (${j.mapel || 'Inval'})`
              : `Tugas: ${shortName} (${statusStr})`;
            const jamParts = j.jam_ke.split(',').map((p: string) => p.trim());
            for (const jp of jamParts) {
              const num = parseInt(jp.replace(/\D/g, ''));
              if (num >= 1 && num <= 8) {
                const colName = `jam_${num}`;
                await pool.query(
                  `INSERT INTO piket_matriks (tanggal, kelas_id, nama_kelas, ${colName}, updated_at)
                   VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date, $1, $2, $3, NOW())
                   ON CONFLICT (tanggal, kelas_id) DO UPDATE SET
                     ${colName} = EXCLUDED.${colName},
                     updated_at = NOW()`,
                  [kId, j.nama_kelas, val]
                ).catch(() => {});
              }
            }
          }
        }
      } catch (syncErr) {
        console.warn('Otomatis sync piket_matriks error:', syncErr);
      }

      return res.json({
        status: 'success',
        message: `Catatan ${targetGuru} berhalangan hadir (${statusStr}) berhasil disimpan dan disinkronkan ke matriks KBM.`,
        data: q.rows[0] || entry
      });
    } catch (e: any) {
      console.warn('DB guru_berhalangan insert error:', e);
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  // Fallback memoryStore sync
  if (memoryStore.jadwalPelajaran && memoryStore.matriksPiket) {
    const todayJadwal = memoryStore.jadwalPelajaran.filter(
      (j: any) => j.hari?.toLowerCase() === currentDay.toLowerCase() &&
           j.nama_guru?.toLowerCase() === targetGuru.toLowerCase()
    );
    todayJadwal.forEach((j: any) => {
      if (!memoryStore.matriksPiket[j.nama_kelas]) memoryStore.matriksPiket[j.nama_kelas] = {};
      const shortName = targetGuru.split(',')[0].split(' ')[0] || 'Guru';
      const val = `Tugas: ${shortName} (${statusStr})`;
      const jamParts = (j.jam_ke || '').split(',').map((p: string) => p.trim());
      jamParts.forEach((jp: string) => {
        const num = parseInt(jp.replace(/\D/g, ''));
        if (num >= 1 && num <= 8) {
          memoryStore.matriksPiket[j.nama_kelas][`jam_${num}`] = val;
        }
      });
    });
  }

  res.json({
    status: 'success',
    message: `Catatan ${targetGuru} berhalangan hadir (${statusStr}) berhasil disimpan dan disinkronkan ke matriks KBM.`,
    data: entry
  });
});

// Delete Guru Berhalangan
app.delete('/api/piket/guru-berhalangan/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const authUser = (req as any).user;
  const canDeleteAny = authUser?.role === 'piket' || authUser?.role === 'admin';

  if (getIsPgConnected()) {
    try {
      if (canDeleteAny) {
        await pool.query('DELETE FROM guru_berhalangan WHERE id = $1', [id]);
      } else {
        await pool.query('DELETE FROM guru_berhalangan WHERE id = $1 AND nama_guru = $2', [id, authUser?.nama || '']);
      }
      return res.json({ status: 'success', message: 'Catatan guru berhalangan berhasil dihapus.' });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }
  memoryStore.guruBerhalangan = memoryStore.guruBerhalangan.filter(g => String(g.id) !== String(id));
  saveMemoryStore();
  res.json({ status: 'success', message: 'Catatan guru berhalangan berhasil dihapus.' });
});

// ==========================================
// 6. LAPORAN ASRAMA & IZIN TERINTEGRASI
// ==========================================
app.get('/api/asrama/kehadiran', authenticate, requireRole(['asrama', 'pengasuh', 'admin']), async (_req: Request, res: Response) => {
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT id, TO_CHAR(tanggal, 'DD-MM-YYYY') as tanggal, nama_kelas as kelas, nama_siswa as "namaSiswa", status, keterangan, 'Asrama' as "asalLaporan", created_at
         FROM asrama_kehadiran
         WHERE tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
         ORDER BY created_at DESC`
      );
      return res.json({ status: 'success', data: q.rows });
    } catch (e) {
      console.warn('DB asrama_kehadiran query error:', e);
    }
  }
  const todayWib = getWibDisplayDate();
  const asramaList = memoryStore.rekapIzin.filter(i => i.asalLaporan === 'Asrama' && i.tanggal === todayWib);
  res.json({ status: 'success', data: asramaList });
});

app.post('/api/asrama/kehadiran', authenticate, requireRole(['asrama', 'pengasuh', 'admin']), async (req: Request, res: Response) => {
  const { kelas, siswa, status, keterangan } = req.body;
  const today = getWibDisplayDate();

  let statusEnum = 'Sakit';
  const cand = (status || '').toLowerCase();
  if (cand.includes('pulang')) statusEnum = 'Izin Pulang';
  else if (cand.includes('keluarga')) statusEnum = 'Izin Keluarga';
  else if (cand.includes('dispensasi')) statusEnum = 'Dispensasi';
  else if (cand.includes('sakit')) statusEnum = 'Sakit';
  else if (cand.includes('izin')) statusEnum = 'Izin';
  else statusEnum = 'Lainnya';

  const fullKeterangan = keterangan ? `${keterangan}` : statusEnum;

  const entries = (Array.isArray(siswa) ? siswa : [siswa]).map(namaSiswa => ({
    id: Math.random().toString(36).substring(2, 11),
    tanggal: today,
    kelas,
    namaSiswa,
    status: statusEnum,
    keterangan: fullKeterangan,
    asalLaporan: 'Asrama'
  }));

  memoryStore.rekapIzin.unshift(...entries);
  saveMemoryStore();

  if (getIsPgConnected()) {
    try {
      const kRes = await pool.query('SELECT id FROM kelas WHERE nama_kelas = $1 LIMIT 1', [kelas]);
      const kId = kRes.rows[0]?.id || null;
      for (const namaSiswa of (Array.isArray(siswa) ? siswa : [siswa])) {
        let sId = null;
        if (kId) {
          const sRes = await pool.query(
            'SELECT id FROM siswa WHERE LOWER(TRIM(nama)) = LOWER(TRIM($1)) AND kelas_id = $2 LIMIT 1',
            [namaSiswa, kId]
          );
          sId = sRes.rows[0]?.id || null;
        }
        await pool.query(
          `INSERT INTO asrama_kehadiran (tanggal, kelas_id, nama_kelas, siswa_id, nama_siswa, status, keterangan, dicatat_oleh)
           VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date, $1, $2, $3, $4, $5, $6, 'Pembina Asrama')`,
          [kId, kelas, sId, namaSiswa, statusEnum, fullKeterangan]
        ).catch((err) => console.warn('Insert asrama_kehadiran error:', err.message));
      }
    } catch (e) {
      console.warn('DB asrama kehadiran error:', e);
    }
  }

  res.json({ status: 'success', message: `${entries.length} laporan pengasuhan asrama berhasil disimpan.` });
});

// Delete Asrama Kehadiran
app.delete('/api/asrama/kehadiran/:id', authenticate, requireRole(['asrama', 'pengasuh', 'admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (getIsPgConnected()) {
    try {
      await pool.query('DELETE FROM asrama_kehadiran WHERE id = $1', [id]);
      return res.json({ status: 'success', message: 'Laporan asrama siswa berhasil dibatalkan.' });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }
  memoryStore.rekapIzin = memoryStore.rekapIzin.filter(i => String(i.id) !== String(id));
  saveMemoryStore();
  res.json({ status: 'success', message: 'Laporan asrama siswa berhasil dibatalkan.' });
});

app.get('/api/izin/rekap-semua', async (req: Request, res: Response) => {
  const { tanggal, kelas } = req.query;

  if (getIsPgConnected()) {
    try {
      let dateFilterPiket = "tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date";
      let dateFilterAsrama = "tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date";
      const params: any[] = [];

      if (tanggal === 'all') {
        dateFilterPiket = '1=1';
        dateFilterAsrama = '1=1';
      } else if (tanggal) {
        const safeDate = toSafePgDate(String(tanggal));
        params.push(safeDate);
        dateFilterPiket = `tanggal = $${params.length}::date`;
        dateFilterAsrama = `tanggal = $${params.length}::date`;
      }

      let classFilterPiket = '';
      let classFilterAsrama = '';
      if (kelas && kelas !== 'all') {
        params.push(kelas);
        classFilterPiket = ` AND nama_kelas = $${params.length}`;
        classFilterAsrama = ` AND nama_kelas = $${params.length}`;
      }

      const qStr = `
        SELECT id, TO_CHAR(tanggal, 'DD-MM-YYYY') as tanggal, nama_kelas as kelas, nama_siswa as "namaSiswa", status, keterangan, 'Piket' as "asalLaporan", created_at
        FROM piket_izin_siswa WHERE ${dateFilterPiket}${classFilterPiket}
        UNION ALL
        SELECT id, TO_CHAR(tanggal, 'DD-MM-YYYY') as tanggal, nama_kelas as kelas, nama_siswa as "namaSiswa", status, keterangan, 'Asrama' as "asalLaporan", created_at
        FROM asrama_kehadiran WHERE ${dateFilterAsrama}${classFilterAsrama}
        ORDER BY created_at DESC
      `;
      const q = await pool.query(qStr, params);
      return res.json({ status: 'success', data: q.rows });
    } catch (e) {
      console.warn('DB rekap-semua error:', e);
    }
  }

  let list = memoryStore.rekapIzin;
  if (tanggal !== 'all') {
    const targetDate = tanggal ? getWibDisplayDate(new Date(toSafePgDate(String(tanggal)))) : getWibDisplayDate();
    list = list.filter(i => i.tanggal === targetDate);
  }
  if (kelas && kelas !== 'all') {
    list = list.filter(i => i.kelas === kelas);
  }
  res.json({ status: 'success', data: list });
});

// ==========================================
// 7. POCKETBASE EXAMKU INTEGRATION
// ==========================================
app.get('/api/pocketbase/status', async (_req: Request, res: Response) => {
  try {
    let lastSyncedAt = memoryStore.lastPbSyncedAt || '';
    if (getIsPgConnected()) {
      try {
        const q = await pool.query("SELECT value FROM system_settings WHERE key = 'last_pb_sync'");
        if (q.rows.length > 0 && q.rows[0].value) {
          lastSyncedAt = q.rows[0].value;
        }
      } catch (e) {
        // fallback
      }
    }
    const classes = await fetchPbClasses();
    const teachers = await fetchPbTeachers();
    const students = await fetchPbStudents(1, 1);
    const subjects = await fetchPbSubjects();
    res.json({
      status: 'ok',
      url: 'https://modalbangsa.examku.my.id',
      connected: true,
      lastSyncedAt,
      counts: {
        classes: classes.length,
        teachers: teachers.length,
        students: students.totalItems,
        subjects: subjects.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/pocketbase/subjects', async (_req: Request, res: Response) => {
  const data = await fetchPbSubjects();
  res.json({ status: 'success', data });
});

app.get('/api/pocketbase/classes', async (_req: Request, res: Response) => {
  const data = await fetchPbClasses();
  res.json({ status: 'success', data });
});

app.get('/api/pocketbase/teachers', async (_req: Request, res: Response) => {
  const data = await fetchPbTeachers();
  res.json({ status: 'success', data });
});

app.get('/api/pocketbase/students', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const perPage = parseInt(req.query.perPage as string) || 100;
  const classId = req.query.classId as string;
  const data = await fetchPbStudents(page, perPage, classId);
  res.json({ status: 'success', data });
});

app.post('/api/pocketbase/sync', authenticate, requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    const result = await syncPocketBaseToDatabase();
    res.json({ status: 'success', ...result });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 8. ADMIN: MANAJEMEN JADWAL & MAPEL GURU
// ==========================================

// Get Schedules (Supports filter by hari, guru, kelas)
app.get('/api/admin/jadwal', async (req: Request, res: Response) => {
  const hari = req.query.hari as string;
  const guru = req.query.guru as string;
  const kelas = req.query.kelas as string;

  if (getIsPgConnected()) {
    try {
      let query = 'SELECT * FROM jadwal_pelajaran WHERE 1=1';
      const params: any[] = [];
      if (hari) {
        params.push(hari);
        query += ` AND hari = $${params.length}`;
      }
      if (guru) {
        params.push(guru);
        query += ` AND nama_guru = $${params.length}`;
      }
      if (kelas) {
        params.push(kelas);
        query += ` AND nama_kelas = $${params.length}`;
      }
      query += ' ORDER BY CASE hari WHEN \'Senin\' THEN 1 WHEN \'Selasa\' THEN 2 WHEN \'Rabu\' THEN 3 WHEN \'Kamis\' THEN 4 WHEN \'Jumat\' THEN 5 WHEN \'Sabtu\' THEN 6 ELSE 7 END, jam_ke ASC';
      const q = await pool.query(query, params);
      return res.json({ status: 'success', data: q.rows });
    } catch (err: any) {
      console.warn('DB jadwal query error:', err);
    }
  }

  let list = memoryStore.jadwalPelajaran || [];
  if (hari) list = list.filter(j => j.hari === hari);
  if (guru) list = list.filter(j => j.nama_guru === guru);
  if (kelas) list = list.filter(j => j.nama_kelas === kelas);
  res.json({ status: 'success', data: list });
});

// Create or Update Schedule Slot
app.post('/api/admin/jadwal', async (req: Request, res: Response) => {
  const b = req.body || {};
  const id = b.id;
  const hari = b.hari;
  const namaKelas = b.namaKelas || b.nama_kelas;
  const jamKe = b.jamKe || b.jam_ke;
  const waktu = b.waktu;
  const namaGuru = b.namaGuru || b.nama_guru;
  const mapel = b.mapel;
  const ruangan = b.ruangan || 'Ruang Kelas';

  if (!hari || !namaKelas || !jamKe || !namaGuru || !mapel) {
    return res.status(400).json({
      status: 'error',
      message: 'Data jadwal belum lengkap. Hari, kelas, jam pelajaran, guru, dan mapel wajib diisi.'
    });
  }

  const newJams = String(jamKe).split(',').map((j: string) => j.trim()).filter(Boolean);

  if (getIsPgConnected()) {
    try {
      // 1. Conflict Check: Same teacher in another class at overlapping jam
      const guruConflictQ = await pool.query(
        `SELECT id, nama_kelas, jam_ke, mapel FROM jadwal_pelajaran
         WHERE hari = $1 AND nama_guru = $2 AND ($3::text IS NULL OR id != $3::int)`,
        [hari, namaGuru, id ? String(id) : null]
      );
      for (const row of guruConflictQ.rows) {
        const rowJams = String(row.jam_ke).split(',').map((j: string) => j.trim());
        const overlap = newJams.filter((j: string) => rowJams.includes(j));
        if (overlap.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: `Bentrok Jadwal Guru: ${namaGuru} sudah dijadwalkan mengajar di kelas ${row.nama_kelas} pada hari ${hari} (${overlap.join(', ')}). Silakan pilih jam atau guru lain.`
          });
        }
      }

      // 2. Conflict Check: Same class with another teacher/slot at overlapping jam
      const kelasConflictQ = await pool.query(
        `SELECT id, nama_guru, jam_ke, mapel FROM jadwal_pelajaran
         WHERE hari = $1 AND nama_kelas = $2 AND ($3::text IS NULL OR id != $3::int)`,
        [hari, namaKelas, id ? String(id) : null]
      );
      for (const row of kelasConflictQ.rows) {
        const rowJams = String(row.jam_ke).split(',').map((j: string) => j.trim());
        const overlap = newJams.filter((j: string) => rowJams.includes(j));
        if (overlap.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: `Bentrok Jadwal Kelas: Kelas ${namaKelas} sudah memiliki mata pelajaran ${row.mapel} bersama ${row.nama_guru} pada hari ${hari} (${overlap.join(', ')}).`
          });
        }
      }

      if (id) {
        await pool.query(
          `UPDATE jadwal_pelajaran SET hari=$1, nama_kelas=$2, jam_ke=$3, waktu=$4, nama_guru=$5, mapel=$6, ruangan=$7, updated_at=NOW() WHERE id=$8`,
          [hari, namaKelas, jamKe, waktu || '07:30 - 09:00 WIB', namaGuru, mapel, ruangan, id]
        );
      } else {
        await pool.query(
          `INSERT INTO jadwal_pelajaran (hari, nama_kelas, jam_ke, waktu, nama_guru, mapel, ruangan) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [hari, namaKelas, jamKe, waktu || '07:30 - 09:00 WIB', namaGuru, mapel, ruangan]
        );
      }
      return res.json({ status: 'success', message: 'Jadwal pelajaran berhasil disimpan ke database.' });
    } catch (err: any) {
      console.error('Save jadwal error:', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }

  if (!memoryStore.jadwalPelajaran) memoryStore.jadwalPelajaran = [];

  // In-Memory store conflict checks
  const existingGuruSlot = memoryStore.jadwalPelajaran.find(j => 
    j.hari === hari && j.nama_guru === namaGuru && (!id || String(j.id) !== String(id)) &&
    newJams.some(nj => String(j.jam_ke).split(',').map((s: string) => s.trim()).includes(nj))
  );
  if (existingGuruSlot) {
    return res.status(400).json({
      status: 'error',
      message: `Bentrok Jadwal Guru: ${namaGuru} sudah dijadwalkan mengajar di kelas ${existingGuruSlot.nama_kelas} pada hari ${hari}.`
    });
  }

  const existingKelasSlot = memoryStore.jadwalPelajaran.find(j => 
    j.hari === hari && j.nama_kelas === namaKelas && (!id || String(j.id) !== String(id)) &&
    newJams.some(nj => String(j.jam_ke).split(',').map((s: string) => s.trim()).includes(nj))
  );
  if (existingKelasSlot) {
    return res.status(400).json({
      status: 'error',
      message: `Bentrok Jadwal Kelas: Kelas ${namaKelas} sudah memiliki mata pelajaran ${existingKelasSlot.mapel} bersama ${existingKelasSlot.nama_guru} pada hari ${hari}.`
    });
  }

  if (id) {
    const idx = memoryStore.jadwalPelajaran.findIndex(j => String(j.id) === String(id));
    if (idx >= 0) {
      memoryStore.jadwalPelajaran[idx] = { id, hari, nama_kelas: namaKelas, jam_ke: jamKe, waktu, nama_guru: namaGuru, mapel, ruangan };
    }
  } else {
    memoryStore.jadwalPelajaran.push({
      id: Math.random().toString(36).substring(2, 11),
      hari,
      nama_kelas: namaKelas,
      jam_ke: jamKe,
      waktu,
      nama_guru: namaGuru,
      mapel,
      ruangan
    });
  }
  saveMemoryStore();
  res.json({ status: 'success', message: 'Jadwal pelajaran berhasil disimpan.' });
});

// Delete Schedule Slot
app.delete('/api/admin/jadwal/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (getIsPgConnected()) {
    try {
      await pool.query('DELETE FROM jadwal_pelajaran WHERE id = $1', [id]);
      return res.json({ status: 'success', message: 'Jadwal berhasil dihapus.' });
    } catch (err: any) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }
  if (memoryStore.jadwalPelajaran) {
    memoryStore.jadwalPelajaran = memoryStore.jadwalPelajaran.filter(j => j.id !== id);
    saveMemoryStore();
  }
  res.json({ status: 'success', message: 'Jadwal berhasil dihapus.' });
});

// Get Teacher Subjects - Synchronized with PocketBase ExamKu REST API
app.get('/api/admin/guru-mapel', async (_req: Request, res: Response) => {
  try {
    // 1. Fetch authentic teachers & assigned subjects directly from PocketBase
    const pbTeachers = await fetchPbTeachers();
    if (pbTeachers && pbTeachers.length > 0) {
      const list = pbTeachers.map(t => {
        const username = t.username || t.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const subjects = Array.isArray(t.subjects) ? t.subjects : (t.subjects ? [t.subjects] : []);
        const mapelStr = subjects.join(', ');
        return {
          id: t.id,
          username,
          nama: t.name,
          code: t.code || '',
          mapel: mapelStr,
          role: (username === 'alfaruq_asri' || username === 'admin') ? 'admin' : 'guru'
        };
      }).sort((a, b) => a.nama.localeCompare(b.nama));

      // Synchronize into PostgreSQL users table
      if (getIsPgConnected()) {
        for (const item of list) {
          await pool.query(
            `INSERT INTO users (username, password_hash, nama, mapel, role, is_first_login)
             VALUES ($1, crypt('12345678', gen_salt('bf')), $2, $3, $4, FALSE)
             ON CONFLICT (username) DO UPDATE 
             SET nama = EXCLUDED.nama, 
                 mapel = EXCLUDED.mapel,
                 role = CASE WHEN users.role IN ('admin', 'wakil_kepala') THEN users.role ELSE EXCLUDED.role END,
                 is_first_login = FALSE`,
            [item.username, item.nama, item.mapel, item.role]
          ).catch(() => {});
        }
      }

      return res.json({ status: 'success', data: list, source: 'pocketbase_rest_api' });
    }
  } catch (err) {
    console.warn('PocketBase fetchPbTeachers failed, fallback to DB:', err);
  }

  // 2. Fallback to PostgreSQL
  if (getIsPgConnected()) {
    try {
      const q = await pool.query("SELECT id, username, nama, mapel, role FROM users WHERE username != 'admin' ORDER BY nama ASC");
      return res.json({ status: 'success', data: q.rows, source: 'database_cache' });
    } catch (err) {
      console.warn('DB guru-mapel error:', err);
    }
  }

  const list = memoryStore.guru.map((nama, idx) => ({
    id: String(idx),
    nama,
    mapel: nama.includes('Alfaruq') ? 'Informatika, Koding dan Kecerdasan Artifisial' : '',
    role: nama.includes('Alfaruq') ? 'admin' : 'guru'
  }));
  res.json({ status: 'success', data: list });
});

// Update Teacher Subjects
app.post('/api/admin/guru-mapel', async (req: Request, res: Response) => {
  const { namaGuru, mapel } = req.body;
  if (!namaGuru || !mapel) {
    return res.status(400).json({ status: 'error', message: 'Nama guru dan mata pelajaran wajib diisi.' });
  }

  if (getIsPgConnected()) {
    try {
      await pool.query('UPDATE users SET mapel = $1 WHERE nama = $2', [mapel, namaGuru]);
      return res.json({ status: 'success', message: `Penugasan mapel untuk ${namaGuru} berhasil diperbarui.` });
    } catch (err: any) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }
  res.json({ status: 'success', message: `Penugasan mapel untuk ${namaGuru} berhasil diperbarui.` });
});

// ==========================================
// 9. SETTINGS: SEMESTER & TAHUN AJARAN
// ==========================================
app.get('/api/settings/semester', async (_req: Request, res: Response) => {
  let activeTahunAjaran = '2025/2026';
  let activeSemester = 'Genap';
  if (getIsPgConnected()) {
    try {
      const q = await pool.query("SELECT key, value FROM system_settings WHERE key IN ('active_tahun_ajaran', 'active_semester')");
      q.rows.forEach(r => {
        if (r.key === 'active_tahun_ajaran') activeTahunAjaran = r.value;
        if (r.key === 'active_semester') activeSemester = r.value;
      });
    } catch (e) {
      // fallback
    }
  }
  res.json({
    status: 'success',
    data: {
      activeTahunAjaran,
      activeSemester,
      label: `Semester ${activeSemester} ${activeTahunAjaran}`
    }
  });
});

app.post('/api/admin/semester', async (req: Request, res: Response) => {
  const { tahunAjaran, semester } = req.body;
  if (!tahunAjaran || !semester) {
    return res.status(400).json({ status: 'error', message: 'Tahun ajaran dan semester wajib ditentukan.' });
  }

  if (getIsPgConnected()) {
    try {
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ('active_tahun_ajaran', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [tahunAjaran]
      );
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ('active_semester', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [semester]
      );
      return res.json({
        status: 'success',
        message: `Semester aktif berhasil disimpan: Semester ${semester} ${tahunAjaran}.`,
        data: { activeTahunAjaran: tahunAjaran, activeSemester: semester }
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  res.json({
    status: 'success',
    message: `Semester aktif berhasil disimpan: Semester ${semester} ${tahunAjaran} (memory mode).`,
    data: { activeTahunAjaran: tahunAjaran, activeSemester: semester }
  });
});

// ==========================================
// 10. ADMIN: USER MANAGEMENT (ADMIN ONLY)
// ==========================================

// List all system users
app.get('/api/admin/users', async (_req: Request, res: Response) => {
  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `SELECT id, username, nama, mapel, role, email, created_at 
         FROM users 
         ORDER BY 
           CASE role 
             WHEN 'admin' THEN 1 
             WHEN 'wakil_kepala' THEN 2 
             WHEN 'kurikulum' THEN 3
             WHEN 'piket' THEN 4
             WHEN 'asrama' THEN 5
             ELSE 6 
           END, 
           nama ASC`
      );
      return res.json({ status: 'success', data: q.rows });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  res.json({
    status: 'success',
    data: memoryStore.guru.map((nama, idx) => ({
      id: String(idx),
      username: nama.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      nama,
      mapel: 'Guru Mata Pelajaran',
      role: nama.includes('Alfaruq') ? 'admin' : 'guru',
      email: null,
      created_at: new Date().toISOString()
    }))
  });
});

// Create new user account
app.post('/api/admin/users', async (req: Request, res: Response) => {
  const { username, nama, mapel, role, password, email } = req.body;
  if (!username || !nama || !password) {
    return res.status(400).json({ status: 'error', message: 'Username, nama, dan password wajib diisi.' });
  }

  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const userRole = role || 'guru';
  const userMapel = mapel || 'Guru Mata Pelajaran';

  if (getIsPgConnected()) {
    try {
      const q = await pool.query(
        `INSERT INTO users (username, password_hash, nama, mapel, role, email, is_first_login)
         VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, $6, TRUE)
         RETURNING id, username, nama, mapel, role, email, created_at, is_first_login`,
        [cleanUsername, password, nama, userMapel, userRole, email || null]
      );
      return res.json({ status: 'success', message: `Akun ${nama} (${userRole}) berhasil dibuat.`, data: q.rows[0] });
    } catch (e: any) {
      if (e.code === '23505') {
        return res.status(400).json({ status: 'error', message: 'Username sudah terdaftar dalam sistem.' });
      }
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  res.json({ status: 'success', message: `Akun ${nama} berhasil dibuat (memory mode).` });
});

// Update user role
app.put('/api/admin/users/:id/role', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!role || !['admin', 'wakil_kepala', 'guru', 'piket', 'asrama', 'kurikulum'].includes(role)) {
    return res.status(400).json({ status: 'error', message: 'Role yang dipilih tidak valid.' });
  }

  if (getIsPgConnected()) {
    try {
      // Protect alfaruq_asri from demotion
      const check = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
      if (check.rows.length > 0 && check.rows[0].username === 'alfaruq_asri' && role !== 'admin') {
        return res.status(400).json({ status: 'error', message: 'Role akun utama alfaruq_asri tidak dapat diubah.' });
      }
      await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, id]);
      return res.json({ status: 'success', message: `Role pengguna berhasil diperbarui ke ${role}.` });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  res.json({ status: 'success', message: `Role pengguna berhasil diperbarui ke ${role} (memory mode).` });
});

// Reset user password
app.post('/api/admin/users/:id/reset-password', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const passToSet = newPassword && newPassword.trim().length >= 6 ? newPassword.trim() : '12345678';

  if (getIsPgConnected()) {
    try {
      await pool.query(
        "UPDATE users SET password_hash = crypt($1, gen_salt('bf')), is_first_login = TRUE, updated_at = NOW() WHERE id = $2",
        [passToSet, id]
      );
      return res.json({ status: 'success', message: `Password berhasil direset ke: "${passToSet}". Pengguna wajib mengganti password saat login pertama.` });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  res.json({ status: 'success', message: `Password berhasil direset ke: "${passToSet}" (memory mode).` });
});

// Update user email (Admin)
app.put('/api/admin/users/:id/email', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ status: 'error', message: 'Alamat email tidak boleh kosong.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  if (getIsPgConnected()) {
    try {
      await pool.query('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [cleanEmail, id]);
      return res.json({ status: 'success', message: `Email ${cleanEmail} berhasil diperbarui.` });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }
  res.json({ status: 'success', message: `Email ${cleanEmail} berhasil diperbarui (memory mode).` });
});

// Delete user
app.delete('/api/admin/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (getIsPgConnected()) {
    try {
      const check = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
      if (check.rows.length > 0 && check.rows[0].username === 'alfaruq_asri') {
        return res.status(400).json({ status: 'error', message: 'Akun administrator alfaruq_asri tidak dapat dihapus.' });
      }
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return res.json({ status: 'success', message: 'Pengguna berhasil dihapus dari sistem.' });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  res.json({ status: 'success', message: 'Pengguna berhasil dihapus (memory mode).' });
});

// Reset all operational/transactional data (fresh start) while preserving master data
app.post('/api/admin/reset-operational-data', async (_req: Request, res: Response) => {
  try {
    memoryStore.laporanKurikulum = [];
    memoryStore.riwayatJurnal = [];
    memoryStore.rekapIzin = [];
    memoryStore.guruBerhalangan = [];
    memoryStore.matriksPiket = {};
    saveMemoryStore();

    if (getIsPgConnected()) {
      await pool.query(
        'TRUNCATE TABLE presensi_jurnal, jurnal_mengajar, piket_izin_siswa, piket_matriks, guru_berhalangan, asrama_kehadiran CASCADE'
      );
    }

    res.json({
      status: 'success',
      message: 'Seluruh data transaksi dan riwayat operasional berhasil dikosongkan. Data master siswa, kelas, guru, dan mapel tetap utuh.'
    });
  } catch (err: any) {
    console.error('Reset operational data error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'SIMAK-MOSA NextGen API',
    postgres: getIsPgConnected() ? 'connected' : 'memory-fallback',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`[SIMAK-MOSA API] Server running on http://localhost:${PORT}`);
  console.log('[PocketBase] Sync mode: On-demand (via tombol sinkron oleh Admin)');
});

// ==========================================
// 6. EARLY WARNING SYSTEM (JAM KOSONG)
// ==========================================
app.get('/api/piket/early-warning', authenticate, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const wib = new Date(utc + (3600000 * 7));
    const dayIndex = wib.getDay();
    const isJumat = dayIndex === 5;
    const isSenin = dayIndex === 1;
    const isWeekend = dayIndex === 0 || dayIndex === 6;

    const hours = wib.getHours();
    const minutes = wib.getMinutes();
    const timeMins = hours * 60 + minutes;

    let activeJp: number | null = null;
    let jpTime = '';
    let statusText = '';
    let isClassHours = false;

    if (isWeekend) {
      statusText = 'Hari Libur Akhir Pekan';
    } else if (timeMins < 465) {
      statusText = isSenin ? 'Persiapan Upacara Bendera' : 'Persiapan Masuk KBM Pagi';
    } else if (timeMins >= 465 && timeMins < 505) {
      activeJp = 1; jpTime = '07:45 - 08:25'; isClassHours = true; statusText = 'Jam Ke-1 (07:45 - 08:25)';
    } else if (timeMins >= 505 && timeMins < 545) {
      activeJp = 2; jpTime = '08:25 - 09:05'; isClassHours = true; statusText = 'Jam Ke-2 (08:25 - 09:05)';
    } else if (timeMins >= 545 && timeMins < 585) {
      activeJp = 3; jpTime = '09:05 - 09:45'; isClassHours = true; statusText = 'Jam Ke-3 (09:05 - 09:45)';
    } else if (timeMins >= 585 && timeMins < 625) {
      activeJp = 4; jpTime = '09:45 - 10:25'; isClassHours = true; statusText = 'Jam Ke-4 (09:45 - 10:25)';
    } else if (timeMins >= 625 && timeMins < 645) {
      statusText = 'Istirahat Pagi (10:25 - 10:45)';
    } else if (timeMins >= 645 && timeMins < 685) {
      activeJp = 5; jpTime = '10:45 - 11:25'; isClassHours = true; statusText = 'Jam Ke-5 (10:45 - 11:25)';
    } else if (timeMins >= 685 && timeMins < (isJumat ? 705 : 725)) {
      activeJp = 6; jpTime = isJumat ? '11:25 - 11:45' : '11:25 - 12:05'; isClassHours = true; statusText = 'Jam Ke-6';
    } else if (!isJumat && timeMins >= 725 && timeMins < 810) {
      statusText = 'Istirahat, Shalat & Makan Siang (Ishoma)';
    } else if (!isJumat && timeMins >= 810 && timeMins < 850) {
      activeJp = 7; jpTime = '13:30 - 14:10'; isClassHours = true; statusText = 'Jam Ke-7 (13:30 - 14:10)';
    } else if (!isJumat && timeMins >= 850 && timeMins < 890) {
      activeJp = 8; jpTime = '14:10 - 14:50'; isClassHours = true; statusText = 'Jam Ke-8 (14:10 - 14:50)';
    } else {
      statusText = 'KBM Selesai untuk Hari Ini';
    }

    // Allow override for preview testing: ?jp=2
    if (req.query.jp) {
      const pJp = parseInt(String(req.query.jp));
      if (pJp >= 1 && pJp <= 8) {
        activeJp = pJp;
        statusText = `Simulasi Pemantauan Jam Ke-${pJp}`;
      }
    }

    // Default to JP 1 if outside hours for testing preview
    const evaluatedJp = activeJp || 1;

    const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const currentDay = HARI_INDONESIA[dayIndex];

    let schedules: any[] = [];
    let gbList: string[] = [];
    let currentMatrix: Record<string, any> = {};

    if (getIsPgConnected()) {
      const [sRes, gRes, mRes] = await Promise.all([
        pool.query(
          `SELECT nama_kelas, nama_guru, mapel, jam_ke 
           FROM jadwal_pelajaran 
           WHERE LOWER(TRIM(hari)) = LOWER(TRIM($1))`,
          [currentDay]
        ),
        pool.query("SELECT nama_guru FROM guru_berhalangan WHERE tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date"),
        pool.query("SELECT nama_kelas, jam_1, jam_2, jam_3, jam_4, jam_5, jam_6, jam_7, jam_8 FROM piket_matriks WHERE tanggal = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date")
      ]);
      schedules = sRes.rows;
      gbList = gRes.rows.map((r: any) => r.nama_guru?.toLowerCase().trim());
      mRes.rows.forEach((r: any) => {
        currentMatrix[r.nama_kelas] = r;
      });
    }

    const warnings: any[] = [];
    const jpKey = `jam_${evaluatedJp}`;

    // Filter schedules that touch evaluatedJp
    const relevantSchedules = schedules.filter((s: any) => {
      if (!s.jam_ke) return false;
      const parts = s.jam_ke.split(',').map((p: string) => parseInt(p.replace(/\D/g, '')));
      return parts.includes(evaluatedJp);
    });

    relevantSchedules.forEach((s: any) => {
      const cls = s.nama_kelas;
      const cellVal = currentMatrix[cls]?.[jpKey] || '';
      const isGuruBerhalangan = gbList.includes((s.nama_guru || '').toLowerCase().trim());

      // If cell is empty or default, and teacher is NOT registered as absent -> WARNING!
      if ((!cellVal || cellVal.trim() === '' || cellVal === '-') && !isGuruBerhalangan) {
        warnings.push({
          kelas: cls,
          mapel: s.mapel || 'Mata Pelajaran',
          namaGuru: s.nama_guru || 'Guru Belum Terdata',
          jp: evaluatedJp,
          status: 'Belum Ada Konfirmasi KBM',
          rekomendasi: 'Harap periksa kehadiran guru di ruang kelas atau koordinasikan guru inval.'
        });
      }
    });

    return res.json({
      status: 'success',
      data: {
        activeJp,
        evaluatedJp,
        jpTime,
        statusText,
        isClassHours,
        isJumat,
        warningsCount: warnings.length,
        warnings
      }
    });
  } catch (err: any) {
    console.warn('Early warning calculation error:', err);
    return res.json({
      status: 'success',
      data: {
        activeJp: null,
        evaluatedJp: 1,
        jpTime: '07:45 - 08:25',
        statusText: 'Sistem Pemantauan Siap',
        isClassHours: false,
        warningsCount: 0,
        warnings: []
      }
    });
  }
});

// ==========================================
// 7. REKAPITULASI GURU INVAL (KURIKULUM)
// ==========================================
app.get('/api/kurikulum/rekap-inval', authenticate, async (_req: Request, res: Response) => {
  try {
    if (getIsPgConnected()) {
      const q = await pool.query(`
        SELECT guru_pengganti as "namaGuru",
               COUNT(*) as "totalInval",
               STRING_AGG(CONCAT(TO_CHAR(tanggal, 'DD/MM'), ' (', nama_guru, ')'), ', ') as "rincian"
        FROM guru_berhalangan
        WHERE guru_pengganti IS NOT NULL AND TRIM(guru_pengganti) != ''
        GROUP BY guru_pengganti
        ORDER BY "totalInval" DESC
      `);
      return res.json({ status: 'success', data: q.rows });
    }
    return res.json({ status: 'success', data: [] });
  } catch (err: any) {
    console.warn('Rekap inval error:', err);
    return res.json({ status: 'success', data: [] });
  }
});
