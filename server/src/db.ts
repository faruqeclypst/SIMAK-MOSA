import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = process.env.DATABASE_URL || 'postgres://simak_admin:mosa_super_db_pass_2026@localhost:5432/simakmosa';

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

let isPgConnected = false;

pool.on('connect', (client) => {
  isPgConnected = true;
  client.query("SET timezone = 'Asia/Jakarta'").catch(() => {});
});

pool.on('error', (err) => {
  isPgConnected = false;
});

// Load memory store from initial-data.json looking in various locations
const possiblePaths = [
  path.join(__dirname, 'initial-data.json'),
  path.join(__dirname, '../src/initial-data.json'),
  path.join(__dirname, '../initial-data.json'),
  path.join(process.cwd(), 'server/src/initial-data.json'),
  path.join(process.cwd(), 'src/initial-data.json'),
];

export let memoryStore = {
  currentUser: {
    nama: 'Alfaruq Asri, S.Pd',
    mapel: 'Informatika, Koding dan Kecerdasan Artifisial',
  },
  guru: [] as string[],
  mapel: [] as string[],
  siswaPerKelas: {} as Record<string, string[]>,
  laporanKurikulum: [] as any[],
  riwayatJurnal: [] as any[],
  rekapIzin: [] as any[],
  guruBerhalangan: [] as any[],
  matriksPiket: {} as Record<string, any>,
  jadwalPelajaran: [] as any[],
  lastPbSyncedAt: '' as string,
};

let loadedDataPath = possiblePaths[0];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      memoryStore = { ...memoryStore, ...raw };
      loadedDataPath = p;
      console.log(`[Data] Loaded initial-data.json from: ${p} (${memoryStore.guru.length} guru, ${Object.keys(memoryStore.siswaPerKelas).length} kelas)`);
      break;
    } catch (e) {
      console.warn('Could not parse initial-data.json at', p, e);
    }
  }
}

export function saveMemoryStore() {
  try {
    fs.writeFileSync(loadedDataPath, JSON.stringify(memoryStore, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save memory store:', e);
  }
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SET timezone = 'Asia/Jakarta'");
    await client.query('SELECT 1');
    client.release();
    isPgConnected = true;
    return true;
  } catch (e) {
    isPgConnected = false;
    return false;
  }
}

export function getIsPgConnected() {
  return isPgConnected;
}
