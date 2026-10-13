import https from 'https';
import { pool, memoryStore, saveMemoryStore, getIsPgConnected } from './db';

const PB_BASE = process.env.POCKETBASE_URL || 'https://modalbangsa.examku.my.id';
const PB_IDENTITY = process.env.POCKETBASE_IDENTITY || 'alfaruq_asri';
const PB_PASSWORD = process.env.POCKETBASE_PASSWORD || 'sudahlupa';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function httpRequest(url: string, options: https.RequestOptions, bodyData?: any): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const isAuth = url.includes('/auth-with-password');

  // Strict Read-Only Policy: SIMAK-MOSA is strictly forbidden from mutating data on PocketBase VPS utama
  if (method !== 'GET' && !isAuth) {
    const errorMsg = `[PocketBase Read-Only Guard] Operasi ${method} ke ${url} DITOLAK! SIMAK-MOSA beroperasi dalam mode Read-Only murni terhadap PocketBase VPS utama (https://modalbangsa.examku.my.id). Tidak diperkenankan melakukan update, create, atau delete data di PocketBase ExamKu.`;
    console.error(errorMsg);
    return Promise.reject(new Error(errorMsg));
  }

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

// Authenticate a user directly against PocketBase ExamKu (Single Sign-On SSO)
export async function authenticateWithPocketBase(identity: string, password: string): Promise<{
  success: boolean;
  token?: string;
  record?: any;
  message?: string;
}> {
  try {
    const payload = JSON.stringify({ identity: identity.trim(), password: password.trim() });
    const res = await httpRequest(`${PB_BASE}/api/collections/users/auth-with-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, payload);

    if (res.token && res.record) {
      return {
        success: true,
        token: res.token,
        record: res.record,
      };
    }
    return {
      success: false,
      message: res.message || 'Kredensial PocketBase tidak valid.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menghubungi server PocketBase ExamKu.',
    };
  }
}

// Authenticate as system/admin to PocketBase
export async function getPocketBaseToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  try {
    const payload = JSON.stringify({ identity: PB_IDENTITY, password: PB_PASSWORD });
    const res = await httpRequest(`${PB_BASE}/api/collections/users/auth-with-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, payload);

    if (res.token) {
      cachedToken = res.token;
      // Expire in 6 days
      tokenExpiresAt = now + 6 * 24 * 3600 * 1000;
      console.log('[PocketBase] Successfully authenticated to ExamKu instance');
      return cachedToken || '';
    }
    console.warn('[PocketBase] Auth response did not contain token:', res);
    return '';
  } catch (err) {
    console.error('[PocketBase] Auth failed:', err);
    return '';
  }
}

// Fetch Users (Account credentials metadata) from PocketBase
export async function fetchPbUsers(): Promise<any[]> {
  try {
    const token = await getPocketBaseToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = token;

    const res = await httpRequest(`${PB_BASE}/api/collections/users/records?perPage=100`, {
      method: 'GET',
      headers,
    });
    return res.items || [];
  } catch (err) {
    console.error('[PocketBase] fetchPbUsers failed:', err);
    return [];
  }
}

// Fetch Classes from PocketBase
export async function fetchPbClasses(): Promise<any[]> {
  try {
    const token = await getPocketBaseToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = token;

    const res = await httpRequest(`${PB_BASE}/api/collections/classes/records?perPage=100&sort=name`, {
      method: 'GET',
      headers,
    });
    return res.items || [];
  } catch (err) {
    console.error('[PocketBase] fetchPbClasses failed:', err);
    return [];
  }
}

// Fetch Teachers from PocketBase
export async function fetchPbTeachers(): Promise<any[]> {
  try {
    const token = await getPocketBaseToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = token;

    const res = await httpRequest(`${PB_BASE}/api/collections/teachers/records?perPage=100&sort=name`, {
      method: 'GET',
      headers,
    });
    return res.items || [];
  } catch (err) {
    console.error('[PocketBase] fetchPbTeachers failed:', err);
    return [];
  }
}

// Fetch Subjects from PocketBase REST API
export async function fetchPbSubjects(): Promise<any[]> {
  try {
    const token = await getPocketBaseToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = token;

    const res = await httpRequest(`${PB_BASE}/api/collections/subjects/records?perPage=100&sort=name`, {
      method: 'GET',
      headers,
    });
    return res.items || [];
  } catch (err) {
    console.error('[PocketBase] fetchPbSubjects failed:', err);
    return [];
  }
}

// Fetch Students from PocketBase with class details
export async function fetchPbStudents(page = 1, perPage = 500, classId?: string): Promise<{ items: any[]; totalItems: number }> {
  try {
    const token = await getPocketBaseToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = token;

    let url = `${PB_BASE}/api/collections/students/records?page=${page}&perPage=${perPage}&sort=name`;
    if (classId) {
      url += `&filter=${encodeURIComponent(`classId='${classId}'`)}`;
    }

    const res = await httpRequest(url, {
      method: 'GET',
      headers,
    });
    return {
      items: res.items || [],
      totalItems: res.totalItems || 0,
    };
  } catch (err) {
    console.error('[PocketBase] fetchPbStudents failed:', err);
    return { items: [], totalItems: 0 };
  }
}

// Sync All PocketBase Records into SIMAK-MOSA (PostgreSQL + Memory Store)
export async function syncPocketBaseToDatabase(): Promise<{
  classesSynced: number;
  teachersSynced: number;
  studentsSynced: number;
  subjectsSynced?: number;
  activeStudentsSynced?: number;
  alumniSynced?: number;
  message: string;
  lastSyncedAt?: string;
}> {
  console.log('[PocketBase] Starting synchronization with ExamKu database...');
  let activeCount = 0;
  let alumniCount = 0;
  
  // 1. Fetch Classes (including ABC and Dummy from PocketBase REST API)
  const pbClasses = await fetchPbClasses();
  const classIdToName: Record<string, string> = {};
  const validClasses = pbClasses.filter(c => c.name && c.name !== 'ALUMNI' && !c.name.toLowerCase().includes('alumni'));
  validClasses.forEach(c => {
    classIdToName[c.id] = c.name;
  });

  // 2. Fetch Subjects from PocketBase
  const pbSubjects = await fetchPbSubjects();

  // 3. Fetch Teachers from PocketBase
  const pbTeachers = await fetchPbTeachers();

  // 4. Fetch Students (loop pages if necessary)
  let allPbStudents: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetchPbStudents(page, 500);
    if (res.items && res.items.length > 0) {
      allPbStudents = allPbStudents.concat(res.items);
      if (allPbStudents.length >= res.totalItems || res.items.length < 500) {
        break;
      }
      page++;
    } else {
      break;
    }
  }

  // Update memory store with PocketBase data
  if (pbSubjects.length > 0) {
    memoryStore.mapel = pbSubjects.map(s => s.name).filter(Boolean);
  }

  if (pbTeachers.length > 0) {
    memoryStore.guru = pbTeachers.map(t => t.name).filter(Boolean);
  }

  const newSiswaPerKelas: Record<string, string[]> = {};
  allPbStudents.forEach(s => {
    const className = classIdToName[s.classId];
    if (className) {
      if (!newSiswaPerKelas[className]) newSiswaPerKelas[className] = [];
      newSiswaPerKelas[className].push(s.name);
    }
  });

  if (Object.keys(newSiswaPerKelas).length > 0) {
    memoryStore.siswaPerKelas = newSiswaPerKelas;
  }
  saveMemoryStore();

  // If PostgreSQL is connected, sync to tables
  let pgSuccess = false;
  if (getIsPgConnected()) {
    try {
      // Sync Subjects into mata_pelajaran table
      for (const s of pbSubjects) {
        if (s.name) {
          await pool.query(
            `INSERT INTO mata_pelajaran (nama_mapel) 
             VALUES ($1) 
             ON CONFLICT (nama_mapel) DO NOTHING`,
            [s.name]
          );
        }
      }

      // Sync Classes directly without adding phases
      for (const c of validClasses) {
        const tingkat = c.name.startsWith('XI-') ? 'XI' : c.name.startsWith('XII-') ? 'XII' : 'X';
        await pool.query(
          `INSERT INTO kelas (nama_kelas, tingkat, fase) 
           VALUES ($1, $2, '') 
           ON CONFLICT (nama_kelas) DO UPDATE SET tingkat = EXCLUDED.tingkat, fase = ''`,
          [c.name, tingkat]
        );
      }

      // Ensure an Alumni class exists
      await pool.query(
        `INSERT INTO kelas (nama_kelas, tingkat, fase)
         VALUES ('Alumni', 'Alumni', 'Alumni')
         ON CONFLICT (nama_kelas) DO NOTHING`
      );

      // Sync Teachers & Users from PocketBase ExamKu to users table with authentic PocketBase subjects
      const pbUsers = await fetchPbUsers().catch(() => []);
      const pbUserMap: Record<string, any> = {};
      pbUsers.forEach((u) => {
        if (u.username) pbUserMap[u.username.toLowerCase()] = u;
        if (u.teacherId) pbUserMap[u.teacherId] = u;
      });

      const activeUsernames: string[] = [];

      // 1. Process records from PocketBase Users collection
      for (const u of pbUsers) {
        const username = u.username;
        if (!username) continue;
        activeUsernames.push(username);

        const teacher = u.teacherId ? pbTeachers.find((t) => t.id === u.teacherId) : null;
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
           ON CONFLICT (username) DO UPDATE SET 
             nama = EXCLUDED.nama, 
             mapel = EXCLUDED.mapel,
             role = CASE WHEN users.role IN ('admin', 'wakil_kepala', 'piket', 'asrama', 'kurikulum') THEN users.role ELSE EXCLUDED.role END,
             email = COALESCE(EXCLUDED.email, users.email),
             is_first_login = FALSE`,
          [username, u.name || teacher?.name || username, mapel, defaultRole, u.email || '']
        ).catch((err) => console.warn('Sync pbUser to users error:', err.message));
      }

      // 2. Process records from PocketBase Teachers collection (if any teacher doesn't have users record)
      for (const t of pbTeachers) {
        const username = t.username || t.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (!activeUsernames.includes(username)) {
          activeUsernames.push(username);
          const defaultRole = (username === 'alfaruq_asri' || username === 'admin') ? 'admin' : 'guru';
          let mapel = Array.isArray(t.subjects) ? t.subjects.join(', ') : (t.subjects || '');
          if (username === 'alfaruq_asri') {
            mapel = 'Informatika, Koding dan Kecerdasan Artifisial';
          }
          await pool.query(
            `INSERT INTO users (username, password_hash, nama, mapel, role, is_first_login)
             VALUES ($1, crypt('12345678', gen_salt('bf')), $2, $3, $4, FALSE)
             ON CONFLICT (username) DO UPDATE SET 
               nama = EXCLUDED.nama, 
               mapel = EXCLUDED.mapel,
               role = CASE WHEN users.role IN ('admin', 'wakil_kepala', 'piket', 'asrama', 'kurikulum') THEN users.role ELSE EXCLUDED.role END,
               is_first_login = FALSE`,
            [username, t.name, mapel || 'Guru Mata Pelajaran', defaultRole]
          ).catch((err) => console.warn('Sync pbTeacher to users error:', err.message));
        }
      }

      if (activeUsernames.length > 0) {
        // Only remove obsolete guru accounts; protect admin, wakil_kepala, piket, asrama, and kurikulum
        await pool.query('DELETE FROM users WHERE username != ALL($1::varchar[]) AND role = \'guru\'', [activeUsernames]).catch(() => {});
      }

      // Sync Students to siswa table (preserving student id for historical foreign keys and detecting alumni)
      activeCount = 0;
      alumniCount = 0;
      for (const s of allPbStudents) {
        const isAlumni = s.classId === 'ALUMNI' || (classIdToName[s.classId] && classIdToName[s.classId].toLowerCase().includes('alumni'));
        const status = isAlumni ? 'alumni' : 'aktif';
        if (isAlumni) alumniCount++; else activeCount++;

        const className = isAlumni ? 'Alumni' : (classIdToName[s.classId] || 'X-1');
        const kRes = await pool.query('SELECT id FROM kelas WHERE nama_kelas = $1', [className]);
        if (kRes.rows.length > 0) {
          const kelasId = kRes.rows[0].id;
          const pbId = s.id;
          const nisn = s.username || '';
          const nama = s.name;

          // Check if student exists by pb_id, nisn, or nama
          const existing = await pool.query(
            `SELECT id, kelas_id FROM siswa 
             WHERE (pb_id IS NOT NULL AND pb_id = $1)
                OR (nisn IS NOT NULL AND nisn != '' AND nisn = $2)
                OR (nama = $3)
             LIMIT 1`,
            [pbId, nisn, nama]
          );

          if (existing.rows.length > 0) {
            // Existing student: update class and status while keeping primary key 'id' intact
            const existingId = existing.rows[0].id;
            await pool.query(
              `UPDATE siswa 
               SET pb_id = $1, nisn = $2, nama = $3, kelas_id = $4, status = $5 
               WHERE id = $6`,
              [pbId, nisn, nama, kelasId, status, existingId]
            );
          } else {
            // New student record
            await pool.query(
              `INSERT INTO siswa (pb_id, nisn, nama, kelas_id, status, tinggal_di_asrama)
               VALUES ($1, $2, $3, $4, $5, TRUE)`,
              [pbId, nisn, nama, kelasId, status]
            );
          }
        }
      }
      pgSuccess = true;
    } catch (pgErr) {
      console.warn('[PocketBase] PostgreSQL sync warning:', pgErr);
    }
  }

  const nowIso = new Date().toISOString();
  memoryStore.lastPbSyncedAt = nowIso;
  saveMemoryStore();

  if (getIsPgConnected()) {
    try {
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ('last_pb_sync', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [nowIso]
      );
    } catch (e) {
      console.warn('Could not save last_pb_sync to system_settings:', e);
    }
  }

  return {
    classesSynced: validClasses.length,
    teachersSynced: pbTeachers.length,
    studentsSynced: allPbStudents.length,
    subjectsSynced: pbSubjects.length,
    activeStudentsSynced: activeCount,
    alumniSynced: alumniCount,
    lastSyncedAt: nowIso,
    message: `Berhasil menyinkronkan ${allPbStudents.length} siswa (${activeCount} aktif, ${alumniCount} alumni), ${validClasses.length} kelas, ${pbTeachers.length} guru, dan ${pbSubjects.length} mata pelajaran dari PocketBase ExamKu. ${pgSuccess ? '(Disimpan ke PostgreSQL)' : '(Disimpan ke Memory Store)'}`,
  };
}
