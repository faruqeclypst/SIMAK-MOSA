// API Client for SIMAK-MOSA NextGen

const API_BASE = '/api';

export interface User {
  id?: string;
  username?: string;
  nama: string;
  mapel: string;
  role: 'admin' | 'wakil_kepala' | 'guru' | 'piket' | 'asrama' | 'kurikulum' | string;
  email?: string | null;
  is_first_login?: boolean;
  created_at?: string;
}

export interface Kelas {
  nama: string;
  tingkat: string;
  fase: string;
}

export interface JurnalEntry {
  id?: string;
  tanggalWaktu: string;
  tanggalInput: string;
  tanggalIso?: string;
  createdAtIso?: string;
  namaGuru: string;
  mapel: string;
  kelas: string;
  jam: string;
  materi: string;
  absen: string;
  catatan: string;
  sesi: string;
  semester?: string;
  tahunAjaran?: string;
  statusKetepatan?: string;
}

export interface IzinEntry {
  id?: string;
  tanggal: string;
  kelas: string;
  namaSiswa: string;
  status?: string;
  keterangan: string;
  asalLaporan: 'Piket' | 'Asrama';
  semester?: string;
  tahunAjaran?: string;
  created_at?: string;
}

export interface GuruBerhalanganEntry {
  id?: string;
  tanggal: string;
  namaGuru: string;
  status: string;
  catatan: string;
  linkTugas?: string;
  guruPengganti?: string;
  statusPenanganan?: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('mosa_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(username: string, password: string): Promise<{
  success: boolean;
  status?: string;
  token?: string;
  user?: User;
  message?: string;
  mustChangePassword?: boolean;
}> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

export async function changePassword(newPassword: string): Promise<{
  success: boolean;
  status?: string;
  message: string;
  token?: string;
  user?: User;
}> {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ newPassword })
  });
  return res.json();
}

export interface UserAccountItem {
  id?: string;
  username: string;
  nama: string;
  role?: string;
  mapel?: string;
}

export async function fetchUserAccounts(): Promise<UserAccountItem[]> {
  try {
    const res = await fetch(`${API_BASE}/auth/users-list`);
    const json = await res.json();
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      return json.data;
    }
  } catch {
    // fallback to fetchGuru
  }

  const gurus = await fetchGuru();
  return [
    { username: 'admin', nama: 'Administrator SIMAK', role: 'admin' },
    ...gurus.map(g => ({
      username: g.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      nama: g,
      role: 'guru'
    }))
  ];
}

export async function fetchGuru(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/guru`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchKelas(): Promise<Kelas[]> {
  const parseSortOrder = (name: string) => {
    const parts = name.split('-');
    const roman = parts[0];
    const num = parseInt(parts[1] || '0', 10);
    const level = roman === 'X' ? 1 : roman === 'XI' ? 2 : 3;
    return level * 100 + num;
  };

  try {
    // 1. Direct fetch from PocketBase ExamKu REST API (Read-Only)
    // Filter strictly to the 18 official classes of SMAN Modal Bangsa (X-1 s/d XII-6)
    const pbRes = await fetch('https://modalbangsa.examku.my.id/api/collections/classes/records?perPage=100&sort=name');
    if (pbRes.ok) {
      const pbJson = await pbRes.json();
      if (pbJson.items && Array.isArray(pbJson.items) && pbJson.items.length > 0) {
        const valid = pbJson.items
          .filter((c: any) => c.name && /^X(I{0,2})-[1-6]$/.test(c.name.trim()))
          .map((c: any) => {
            const name = c.name.trim();
            const tingkat = name.startsWith('XII-') ? 'XII' : name.startsWith('XI-') ? 'XI' : 'X';
            const fase = tingkat === 'X' ? 'Fase E' : tingkat === 'XI' ? 'Fase F' : 'Fase F-Akhir';
            return {
              nama: name,
              tingkat,
              fase,
              id: c.id
            };
          })
          .sort((a: any, b: any) => parseSortOrder(a.nama) - parseSortOrder(b.nama));
        if (valid.length > 0) return valid;
      }
    }
  } catch (e) {
    console.warn('PocketBase direct class fetch failed, using SIMAK API fallback:', e);
  }

  // 2. Fallback to SIMAK Backend API
  try {
    const res = await fetch(`${API_BASE}/kelas`);
    const json = await res.json();
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      return json.data
        .filter((c: any) => c.nama && /^X(I{0,2})-[1-6]$/.test(c.nama.trim()))
        .sort((a: any, b: any) => parseSortOrder(a.nama) - parseSortOrder(b.nama));
    }
  } catch (e) {
    console.warn('SIMAK Backend /api/kelas fallback failed:', e);
  }

  // 3. Guaranteed fallback: 18 official classes of SMAN Modal Bangsa
  return [
    { nama: 'X-1', tingkat: 'X', fase: 'Fase E' },
    { nama: 'X-2', tingkat: 'X', fase: 'Fase E' },
    { nama: 'X-3', tingkat: 'X', fase: 'Fase E' },
    { nama: 'X-4', tingkat: 'X', fase: 'Fase E' },
    { nama: 'X-5', tingkat: 'X', fase: 'Fase E' },
    { nama: 'X-6', tingkat: 'X', fase: 'Fase E' },
    { nama: 'XI-1', tingkat: 'XI', fase: 'Fase F' },
    { nama: 'XI-2', tingkat: 'XI', fase: 'Fase F' },
    { nama: 'XI-3', tingkat: 'XI', fase: 'Fase F' },
    { nama: 'XI-4', tingkat: 'XI', fase: 'Fase F' },
    { nama: 'XI-5', tingkat: 'XI', fase: 'Fase F' },
    { nama: 'XI-6', tingkat: 'XI', fase: 'Fase F' },
    { nama: 'XII-1', tingkat: 'XII', fase: 'Fase F-Akhir' },
    { nama: 'XII-2', tingkat: 'XII', fase: 'Fase F-Akhir' },
    { nama: 'XII-3', tingkat: 'XII', fase: 'Fase F-Akhir' },
    { nama: 'XII-4', tingkat: 'XII', fase: 'Fase F-Akhir' },
    { nama: 'XII-5', tingkat: 'XII', fase: 'Fase F-Akhir' },
    { nama: 'XII-6', tingkat: 'XII', fase: 'Fase F-Akhir' },
  ];
}

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

export async function fetchDaftarMapel(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/mapel`);
    const json = await res.json();
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      return json.data;
    }
  } catch (e) {
    // fallback
  }
  return DAFTAR_MAPEL;
}

export async function fetchSiswa(kelas?: string): Promise<string[] | Record<string, string[]>> {
  const url = kelas ? `${API_BASE}/siswa?kelas=${encodeURIComponent(kelas)}` : `${API_BASE}/siswa`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data || [];
}

export async function fetchJurnalRiwayat(namaGuru?: string): Promise<JurnalEntry[]> {
  const url = namaGuru ? `${API_BASE}/jurnal/riwayat?guru=${encodeURIComponent(namaGuru)}` : `${API_BASE}/jurnal/riwayat`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data || [];
}

export async function simpanJurnal(data: {
  namaGuru: string;
  mapel: string;
  kelas: string;
  jam: string[];
  materi: string;
  absensi: string;
  catatan: string;
  sesi?: string;
  semester?: string;
  tahunAjaran?: string;
}) {
  const res = await fetch(`${API_BASE}/jurnal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === 'error') {
    throw new Error(json.message || `Gagal menyimpan jurnal (HTTP ${res.status})`);
  }
  return json;
}

export async function fetchKurikulumHariIni(tanggal?: string): Promise<JurnalEntry[]> {
  const url = tanggal
    ? `${API_BASE}/kurikulum/hari-ini?tanggal=${encodeURIComponent(tanggal)}`
    : `${API_BASE}/kurikulum/hari-ini`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data || [];
}

export async function fetchPiketMatriks(): Promise<Record<string, Record<string, string>>> {
  const res = await fetch(`${API_BASE}/piket/matriks`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  return json.data || {};
}

export async function simpanPiketMatriks(data: Record<string, Record<string, string>>) {
  const res = await fetch(`${API_BASE}/piket/matriks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ data })
  });
  return res.json();
}

export async function fetchPiketIzin(): Promise<IzinEntry[]> {
  const res = await fetch(`${API_BASE}/piket/izin`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  return json.data || [];
}

export async function simpanPiketIzin(kelas: string, siswa: string[], status?: string, keterangan?: string) {
  const res = await fetch(`${API_BASE}/piket/izin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ kelas, siswa, status, keterangan })
  });
  return res.json();
}

export async function hapusPiketIzin(id: string) {
  const res = await fetch(`${API_BASE}/piket/izin/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  return res.json();
}

export async function fetchGuruBerhalangan(): Promise<GuruBerhalanganEntry[]> {
  const res = await fetch(`${API_BASE}/piket/guru-berhalangan`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  return json.data || [];
}

export async function simpanGuruBerhalangan(
  namaGuru: string,
  status: string,
  catatan?: string,
  linkTugas?: string,
  guruPengganti?: string,
  statusPenanganan?: string
) {
  const res = await fetch(`${API_BASE}/piket/guru-berhalangan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ namaGuru, status, catatan, linkTugas, guruPengganti, statusPenanganan })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === 'error') {
    throw new Error(json.message || `Gagal menyimpan data guru berhalangan (HTTP ${res.status})`);
  }
  return json;
}

export async function hapusGuruBerhalangan(id: string) {
  const res = await fetch(`${API_BASE}/piket/guru-berhalangan/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === 'error') {
    throw new Error(json.message || `Gagal menghapus data guru berhalangan (HTTP ${res.status})`);
  }
  return json;
}

export async function fetchAsramaKehadiran(): Promise<IzinEntry[]> {
  const res = await fetch(`${API_BASE}/asrama/kehadiran`, {
    headers: { ...getAuthHeader() },
  });
  const json = await res.json();
  return json.data || [];
}

export async function simpanAsramaKehadiran(kelas: string, siswa: string[], status: string, keterangan?: string) {
  const res = await fetch(`${API_BASE}/asrama/kehadiran`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ kelas, siswa, status, keterangan })
  });
  return res.json();
}

export async function hapusAsramaKehadiran(id: string) {
  const res = await fetch(`${API_BASE}/asrama/kehadiran/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  return res.json();
}

export async function fetchRekapIzinSemua(filters?: { tanggal?: string; kelas?: string } | any): Promise<IzinEntry[]> {
  const params = new URLSearchParams();
  if (filters && typeof filters === 'object') {
    if (typeof filters.tanggal === 'string' && filters.tanggal) params.append('tanggal', filters.tanggal);
    if (typeof filters.kelas === 'string' && filters.kelas) params.append('kelas', filters.kelas);
  }
  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/izin/rekap-semua${queryStr}`);
  const json = await res.json();
  return json.data || [];
}

// ==========================================
// POCKETBASE EXAMKU INTEGRATION
// ==========================================
export interface PbClass {
  id: string;
  name: string;
  level: string;
  created: string;
  updated: string;
}

export interface PbTeacher {
  id: string;
  name: string;
  code: string;
  username: string;
  subjects: string[];
  email?: string;
  phone?: string;
}

export interface PbStudent {
  id: string;
  name: string;
  username: string;
  gender: string;
  classId: string;
  className?: string;
}

export interface PbSubject {
  id: string;
  name: string;
  created?: string;
  updated?: string;
}

export interface PbStatus {
  status: string;
  url: string;
  connected: boolean;
  lastSyncedAt?: string;
  counts: {
    classes: number;
    teachers: number;
    students: number;
    subjects?: number;
  };
}

export async function fetchPocketBaseStatus(): Promise<PbStatus> {
  const res = await fetch(`${API_BASE}/pocketbase/status`);
  return res.json();
}

export async function fetchPocketBaseClasses(): Promise<PbClass[]> {
  const res = await fetch(`${API_BASE}/pocketbase/classes`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchPocketBaseTeachers(): Promise<PbTeacher[]> {
  const res = await fetch(`${API_BASE}/pocketbase/teachers`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchPocketBaseSubjects(): Promise<PbSubject[]> {
  const res = await fetch(`${API_BASE}/pocketbase/subjects`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchPocketBaseStudents(page = 1, perPage = 500, classId?: string): Promise<{ items: PbStudent[]; totalItems: number }> {
  let url = `${API_BASE}/pocketbase/students?page=${page}&perPage=${perPage}`;
  if (classId) url += `&filter=${encodeURIComponent(classId)}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data || { items: [], totalItems: 0 };
}

export async function syncPocketBaseData(): Promise<{
  status: string;
  classesSynced: number;
  teachersSynced: number;
  studentsSynced: number;
  subjectsSynced?: number;
  message: string;
  lastSyncedAt?: string;
}> {
  const res = await fetch(`${API_BASE}/pocketbase/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  return res.json();
}

// ==========================================
// ADMIN: JADWAL & MAPEL GURU
// ==========================================
export interface JadwalPelajaran {
  id: string;
  hari: string;
  nama_kelas: string;
  jam_ke: string;
  waktu?: string;
  nama_guru: string;
  mapel: string;
  ruangan?: string;
}

export interface GuruMapelItem {
  id: string;
  nama: string;
  mapel: string;
  role: string;
  username?: string;
}

export async function fetchAdminJadwal(filters?: {
  hari?: string;
  guru?: string;
  kelas?: string;
}): Promise<JadwalPelajaran[]> {
  const params = new URLSearchParams();
  if (filters?.hari) params.append('hari', filters.hari);
  if (filters?.guru) params.append('guru', filters.guru);
  if (filters?.kelas) params.append('kelas', filters.kelas);

  const url = `${API_BASE}/admin/jadwal${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data || [];
}

export async function simpanAdminJadwal(data: any) {
  const payload = {
    ...data,
    namaKelas: data.nama_kelas || data.namaKelas,
    nama_kelas: data.nama_kelas || data.namaKelas,
    jamKe: data.jam_ke || data.jamKe,
    jam_ke: data.jam_ke || data.jamKe,
    namaGuru: data.nama_guru || data.namaGuru,
    nama_guru: data.nama_guru || data.namaGuru,
  };
  const res = await fetch(`${API_BASE}/admin/jadwal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === 'error') {
    throw new Error(json.message || `Gagal menyimpan jadwal (HTTP ${res.status})`);
  }
  return json;
}

export async function hapusAdminJadwal(id: string) {
  const res = await fetch(`${API_BASE}/admin/jadwal/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  return res.json();
}

export async function fetchAdminGuruMapel(): Promise<GuruMapelItem[]> {
  const res = await fetch(`${API_BASE}/admin/guru-mapel`);
  const json = await res.json();
  return json.data || [];
}

export async function simpanAdminGuruMapel(namaGuru: string, mapel: string) {
  const res = await fetch(`${API_BASE}/admin/guru-mapel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ namaGuru, mapel }),
  });
  return res.json();
}

// ==========================================
// SETTINGS: SEMESTER & TAHUN AJARAN
// ==========================================
export interface SemesterSettings {
  activeTahunAjaran: string;
  activeSemester: string;
  label: string;
}

export async function fetchSemesterSettings(): Promise<SemesterSettings> {
  const res = await fetch(`${API_BASE}/settings/semester`);
  const json = await res.json();
  return json.data || { activeTahunAjaran: '2025/2026', activeSemester: 'Genap', label: 'Semester Genap 2025/2026' };
}

export async function updateSemesterSettings(tahunAjaran: string, semester: string) {
  const res = await fetch(`${API_BASE}/admin/semester`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ tahunAjaran, semester }),
  });
  return res.json();
}

// ==========================================
// ADMIN: USER MANAGEMENT
// ==========================================
export async function fetchAdminUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/admin/users`);
  const json = await res.json();
  return json.data || [];
}

export async function createAdminUser(data: {
  username: string;
  nama: string;
  mapel: string;
  role: string;
  password?: string;
  email?: string;
}) {
  const res = await fetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateUserRole(id: string, role: string) {
  const res = await fetch(`${API_BASE}/admin/users/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

export async function resetUserPassword(id: string, newPassword?: string) {
  const res = await fetch(`${API_BASE}/admin/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ newPassword }),
  });
  return res.json();
}

export async function deleteAdminUser(id: string) {
  const res = await fetch(`${API_BASE}/admin/users/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  return res.json();
}

export async function updateUserEmail(id: string, email: string) {
  const res = await fetch(`${API_BASE}/admin/users/${id}/email`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

// ==========================================
// SISWA & ALUMNI RETENTION
// ==========================================
export interface AlumniItem {
  id: number;
  pb_id?: string;
  nisn?: string;
  nama: string;
  status: string;
  tahun_lulus?: string;
  nama_kelas?: string;
  created_at?: string;
}

export async function fetchAlumniSiswa(): Promise<AlumniItem[]> {
  const res = await fetch(`${API_BASE}/siswa/alumni`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchStudentHistory(id: string | number, semester?: string) {
  const url = semester ? `${API_BASE}/siswa/${id}/history?semester=${encodeURIComponent(semester)}` : `${API_BASE}/siswa/${id}/history`;
  const res = await fetch(url);
  return res.json();
}

// ==========================================
// ACCURACY ENHANCEMENTS: EARLY WARNING & INVAL
// ==========================================
export interface EarlyWarningItem {
  kelas: string;
  mapel: string;
  namaGuru: string;
  jp: number;
  status: string;
  rekomendasi: string;
}

export interface EarlyWarningData {
  activeJp: number | null;
  evaluatedJp: number;
  jpTime: string;
  statusText: string;
  isClassHours: boolean;
  isJumat: boolean;
  warningsCount: number;
  warnings: EarlyWarningItem[];
}

export async function fetchEarlyWarning(jp?: number): Promise<EarlyWarningData> {
  const url = jp ? `${API_BASE}/piket/early-warning?jp=${jp}` : `${API_BASE}/piket/early-warning`;
  const res = await fetch(url, { headers: { ...getAuthHeader() } });
  const json = await res.json();
  return json.data || {
    activeJp: null,
    evaluatedJp: 1,
    jpTime: '07:45 - 08:25',
    statusText: 'Sistem Pemantauan Siap',
    isClassHours: false,
    warningsCount: 0,
    warnings: []
  };
}

export interface RekapInvalItem {
  namaGuru: string;
  totalInval: number;
  rincian?: string;
}

export async function fetchRekapInval(): Promise<RekapInvalItem[]> {
  const res = await fetch(`${API_BASE}/kurikulum/rekap-inval`, { headers: { ...getAuthHeader() } });
  const json = await res.json();
  return json.data || [];
}
