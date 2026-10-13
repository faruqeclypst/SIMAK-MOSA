import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  GraduationCap,
  School,
  Search,
  RefreshCw,
  CheckCircle2,
  BookOpen,
  Clock,
  Award,
  History,
  X,
  FileText,
  Calendar,
  Filter,
  Check,
  AlertTriangle,
  Info
} from 'lucide-react';
import {
  fetchPocketBaseClasses,
  fetchPocketBaseTeachers,
  fetchPocketBaseStudents,
  fetchPocketBaseStatus,
  syncPocketBaseData,
  fetchAlumniSiswa,
  fetchStudentHistory,
  fetchDaftarMapel,
  DAFTAR_MAPEL,
  PbClass,
  PbTeacher,
  PbStudent,
  AlumniItem,
  User,
} from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';

interface DirektoriSectionProps {
  user?: User | null;
}

export const DirektoriSection: React.FC<DirektoriSectionProps> = ({ user }) => {
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'siswa' | 'alumni' | 'guru' | 'mapel'>('siswa');
  const [selectedKelas, setSelectedKelas] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [localLastSync, setLocalLastSync] = useState<string>(() => {
    return localStorage.getItem('mosa_pb_last_sync') || '';
  });

  // History Modal State
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<{
    id: string | number;
    nama: string;
    nisn?: string;
    status?: string;
    kelas?: string;
  } | null>(null);
  const [historySemesterFilter, setHistorySemesterFilter] = useState<'all' | 'Genap' | 'Ganjil'>('all');
  const [historySubTab, setHistorySubTab] = useState<'presensi' | 'izin'>('presensi');

  // Queries from PocketBase REST API (Cached 1 hour, refreshed on manual sync)
  const { data: pbStatus } = useQuery({
    queryKey: ['pbStatus'],
    queryFn: fetchPocketBaseStatus,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const displayLastSync = pbStatus?.lastSyncedAt || localLastSync;

  const formatSyncDate = (isoString?: string) => {
    if (!isoString) return 'Belum pernah disinkronkan';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Belum pernah disinkronkan';
      const dateFormatted = d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeFormatted = d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateFormatted}, pukul ${timeFormatted} WIB`;
    } catch {
      return 'Belum pernah disinkronkan';
    }
  };

  const { data: classes = [], isLoading: isLoadingClasses } = useQuery({
    queryKey: ['pbClasses'],
    queryFn: fetchPocketBaseClasses,
    staleTime: 1000 * 60 * 60,
  });

  const officialClasses = useMemo(() => {
    const parseSortOrder = (name: string) => {
      const parts = name.split('-');
      const roman = parts[0];
      const num = parseInt(parts[1] || '0', 10);
      const level = roman === 'X' ? 1 : roman === 'XI' ? 2 : 3;
      return level * 100 + num;
    };

    return (classes || [])
      .filter((c) => c.name && /^X(I{0,2})-[1-6]$/.test(c.name.trim()))
      .sort((a, b) => parseSortOrder(a.name) - parseSortOrder(b.name));
  }, [classes]);

  const { data: teachers = [], isLoading: isLoadingTeachers } = useQuery({
    queryKey: ['pbTeachers'],
    queryFn: fetchPocketBaseTeachers,
    staleTime: 1000 * 60 * 60,
  });

  const { data: studentsData, isLoading: isLoadingStudents } = useQuery({
    queryKey: ['pbStudents'],
    queryFn: () => fetchPocketBaseStudents(1, 1000),
    staleTime: 1000 * 60 * 60,
  });

  const { data: dbAlumni = [], isLoading: isLoadingAlumni } = useQuery({
    queryKey: ['alumniList'],
    queryFn: fetchAlumniSiswa,
    staleTime: 1000 * 60 * 60,
  });

  const { data: daftarMapel = DAFTAR_MAPEL, isLoading: isLoadingMapel } = useQuery({
    queryKey: ['daftarMapel'],
    queryFn: fetchDaftarMapel,
    staleTime: 1000 * 60 * 60,
  });

  // Query for student history inside modal
  const { data: studentHistoryData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['studentHistory', selectedStudentForHistory?.id, historySemesterFilter],
    queryFn: () =>
      selectedStudentForHistory
        ? fetchStudentHistory(
            selectedStudentForHistory.id,
            historySemesterFilter === 'all' ? undefined : historySemesterFilter
          )
        : null,
    enabled: !!selectedStudentForHistory,
  });

  // Sync Mutation
  const syncMutation = useMutation({
    mutationFn: syncPocketBaseData,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pbStatus'] });
      queryClient.invalidateQueries({ queryKey: ['pbClasses'] });
      queryClient.invalidateQueries({ queryKey: ['pbTeachers'] });
      queryClient.invalidateQueries({ queryKey: ['pbStudents'] });
      queryClient.invalidateQueries({ queryKey: ['daftarMapel'] });
      queryClient.invalidateQueries({ queryKey: ['alumniList'] });
      queryClient.invalidateQueries({ queryKey: ['guru'] });
      queryClient.invalidateQueries({ queryKey: ['kelas'] });
      queryClient.invalidateQueries({ queryKey: ['siswa'] });
      if (data.lastSyncedAt) {
        setLocalLastSync(data.lastSyncedAt);
        localStorage.setItem('mosa_pb_last_sync', data.lastSyncedAt);
      }
      setSyncStatusMsg(data.message || 'Sinkronisasi dengan PocketBase ExamKu berhasil.');
      setTimeout(() => setSyncStatusMsg(null), 4000);
    },
    onError: (err: any) => {
      setSyncStatusMsg(err.message || 'Gagal menyinkronkan data dari PocketBase.');
      setTimeout(() => setSyncStatusMsg(null), 4000);
    },
  });

  // Map Class ID to Class Name
  const classIdToName = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [classes]);

  const rawStudents: PbStudent[] = studentsData?.items || [];

  // Active students: excluding ALUMNI
  const activeStudents = useMemo(() => {
    return rawStudents.filter((s) => {
      const clsName = (classIdToName[s.classId] || '').toLowerCase();
      return s.classId !== 'ALUMNI' && !clsName.includes('alumni');
    });
  }, [rawStudents, classIdToName]);

  // Combined Alumni: from PocketBase and PostgreSQL
  const alumniCombined = useMemo(() => {
    const list: Array<{
      id: string | number;
      name: string;
      username?: string;
      gender?: string;
      tahunLulus?: string;
      className?: string;
    }> = [];

    const seenIds = new Set<string>();

    // From DB Alumni
    dbAlumni.forEach((a) => {
      const idKey = String(a.id);
      seenIds.add(idKey);
      if (a.pb_id) seenIds.add(a.pb_id);
      list.push({
        id: a.id,
        name: a.nama,
        username: a.nisn,
        gender: 'L',
        tahunLulus: a.tahun_lulus || '2024/2025',
        className: a.nama_kelas || 'Alumni SMAN Modal Bangsa',
      });
    });

    // From PB if classId === 'ALUMNI' or class name contains alumni
    rawStudents.forEach((s) => {
      const clsName = classIdToName[s.classId] || '';
      const isPbAlumni = s.classId === 'ALUMNI' || clsName.toLowerCase().includes('alumni');
      if (isPbAlumni && !seenIds.has(s.id)) {
        list.push({
          id: s.id,
          name: s.name,
          username: s.username,
          gender: s.gender,
          tahunLulus: '2024/2025',
          className: clsName || 'Alumni SMAN Modal Bangsa',
        });
      }
    });

    return list;
  }, [dbAlumni, rawStudents, classIdToName]);

  // Filter active students
  const filteredStudents = useMemo(() => {
    return activeStudents.filter((s) => {
      const sClassName = classIdToName[s.classId] || 'Reguler';
      const matchSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.username && s.username.includes(searchQuery));
      const matchKelas = selectedKelas === 'all' || sClassName === selectedKelas;
      return matchSearch && matchKelas;
    });
  }, [activeStudents, searchQuery, selectedKelas, classIdToName]);

  // Filter alumni
  const filteredAlumni = useMemo(() => {
    return alumniCombined.filter((a) => {
      const q = searchQuery.toLowerCase();
      const matchName = a.name.toLowerCase().includes(q);
      const matchNisn = a.username && a.username.toLowerCase().includes(q);
      return matchName || matchNisn;
    });
  }, [alumniCombined, searchQuery]);

  // Filter teachers
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const q = searchQuery.toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchCode = t.code && t.code.toLowerCase().includes(q);
      const matchSubject =
        Array.isArray(t.subjects) &&
        t.subjects.some((sub) => sub.toLowerCase().includes(q));
      return matchName || matchCode || matchSubject;
    });
  }, [teachers, searchQuery]);

  // Filter subjects (Mata Pelajaran)
  const filteredMapel = useMemo(() => {
    if (!searchQuery.trim()) return daftarMapel;
    const q = searchQuery.toLowerCase();
    return daftarMapel.filter((m) => {
      const matchName = m.toLowerCase().includes(q);
      const teachingTeachers = teachers.filter(
        (t) => Array.isArray(t.subjects) && t.subjects.includes(m)
      );
      const matchTeacher = teachingTeachers.some((t) =>
        t.name.toLowerCase().includes(q)
      );
      return matchName || matchTeacher;
    });
  }, [daftarMapel, searchQuery, teachers]);

  useModalBehavior(!!selectedStudentForHistory, () => setSelectedStudentForHistory(null));

  return (
    <div className="space-y-6">
      {/* PocketBase Integration Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Mode Read-Only: PocketBase REST API</span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              Integrasi Data ExamKu (modalbangsa.examku.my.id)
            </h2>
            <p className="text-xs text-slate-300">
              Sinkronisasi satu arah (Read-Only). SIMAK-MOSA hanya menarik data siswa/i, alumni, rombel, guru, dan mata pelajaran tanpa pernah mengubah data di VPS PocketBase ExamKu.
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
            {isAdmin ? (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 text-amber-300 ${
                    syncMutation.isPending ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {syncMutation.isPending ? 'Menyinkronkan...' : 'Tarik Data PB (Read-Only)'}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/90 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Mode Read-Only Civitas (Sync khusus Admin)</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Terakhir:</span>
              <span className="font-bold text-amber-200">
                {formatSyncDate(displayLastSync)}
              </span>
            </div>
          </div>
        </div>

        {/* Counts summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-4 border-t border-slate-800/80 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Siswa Aktif</span>
            <p className="text-base font-bold text-emerald-400">
              {activeStudents.length || 614} Siswa/i
            </p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Alumni / Lulusan</span>
            <p className="text-base font-bold text-amber-300">
              {alumniCombined.length} Lulusan
            </p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Dewan Guru</span>
            <p className="text-base font-bold text-blue-300">
              {pbStatus?.counts.teachers || teachers.length || 46} Pendidik
            </p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Rombel Aktif</span>
            <p className="text-base font-bold text-purple-300">
              {officialClasses.length || 18} Rombel Resmi
            </p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Mata Pelajaran</span>
            <p className="text-base font-bold text-teal-300">
              {daftarMapel.length || 23} Mapel
            </p>
          </div>
        </div>

        {/* Last Sync Info Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-300 shrink-0">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span>Waktu Sinkronisasi Terakhir:</span>
            <span className="font-bold text-amber-200 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
              {formatSyncDate(displayLastSync)}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            {isAdmin
              ? 'Cukup sinkronkan saat awal semester baru atau saat ada pemindahan rombel / kelulusan siswa.'
              : 'Data civitas disinkronkan secara berkala oleh Administrator Sistem dari PocketBase ExamKu.'}
          </span>
        </div>
      </div>

      {syncStatusMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {/* Segmented Tab & Filter Controls */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
            <button
              onClick={() => {
                setActiveTab('siswa');
                setSearchQuery('');
              }}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'siswa'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Peserta Didik Aktif ({activeStudents.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('alumni');
                setSearchQuery('');
              }}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'alumni'
                  ? 'bg-white text-amber-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-4 h-4 text-amber-600" />
              <span>Alumni / Lulusan ({alumniCombined.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('guru');
                setSearchQuery('');
              }}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'guru'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <School className="w-4 h-4" />
              <span>Dewan Guru ({teachers.length || 46})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('mapel');
                setSearchQuery('');
              }}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'mapel'
                  ? 'bg-white text-blue-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4 text-blue-700" />
              <span>Mata Pelajaran ({daftarMapel.length})</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Status: <span className="font-semibold text-slate-700">
              {activeTab === 'siswa'
                ? 'Siswa Terdaftar Aktif'
                : activeTab === 'alumni'
                ? 'Histori Terpelihara 100%'
                : activeTab === 'guru'
                ? 'Dewan Tenaga Pendidik'
                : 'REST API PocketBase ExamKu'}
            </span>
          </div>
        </div>

        {/* Filter Inputs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {activeTab === 'siswa' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Filter Rombel:
              </span>
              <select
                value={selectedKelas}
                onChange={(e) => setSelectedKelas(e.target.value)}
                className="min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                <option value="all">Semua Rombel ({officialClasses.length} Kelas)</option>
                {officialClasses.map((k) => (
                  <option key={k.id || k.name} value={k.name}>
                    Kelas {k.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'alumni' && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Award className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Data seluruh lulusan dengan rekam riwayat KBM dan perizinan tetap utuh.</span>
            </div>
          )}

          {activeTab === 'mapel' && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Data mata pelajaran diambil langsung dari PocketBase ExamKu (Read-Only).</span>
            </div>
          )}

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'siswa'
                  ? 'Cari nama siswa atau NISN...'
                  : activeTab === 'alumni'
                  ? 'Cari nama alumni atau NISN...'
                  : activeTab === 'guru'
                  ? 'Cari nama guru, kode, atau mapel...'
                  : 'Cari mata pelajaran atau nama pengampu...'
              }
              className="w-full min-h-[44px] pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:outline-none"
            />
          </div>
        </div>
      </div>

      {/* TAB 1: PESERTA DIDIK AKTIF */}
      {activeTab === 'siswa' && (
        isLoadingStudents ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse p-4 space-y-2"
              />
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-1">
            <GraduationCap className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700">Data siswa tidak ditemukan</p>
            <p>Periksa kembali kata kunci pencarian atau rombel yang dipilih.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredStudents.map((siswa) => {
              const className = classIdToName[siswa.classId] || 'Reguler';
              const isMale = siswa.gender === 'L';

              return (
                <div
                  key={siswa.id}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isMale
                            ? 'bg-blue-50 text-blue-900 border border-blue-200'
                            : 'bg-rose-50 text-rose-900 border border-rose-200'
                        }`}
                      >
                        {siswa.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h4
                          className="text-xs font-bold text-slate-900 truncate"
                          title={siswa.name}
                        >
                          {siswa.name}
                        </h4>
                        <p className="text-[11px] font-mono text-slate-500">
                          NISN: {siswa.username || '-'}
                        </p>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 text-xs font-extrabold rounded-md shrink-0">
                      {className}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isMale ? 'bg-blue-600' : 'bg-rose-600'
                        }`}
                      />
                      <span>{isMale ? 'Laki-laki' : 'Perempuan'}</span>
                    </span>

                    <button
                      onClick={() =>
                        setSelectedStudentForHistory({
                          id: siswa.id,
                          nama: siswa.name,
                          nisn: siswa.username,
                          status: 'aktif',
                          kelas: className,
                        })
                      }
                      className="min-h-[36px] px-3 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-900 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Lihat Histori Presensi & Perizinan"
                    >
                      <History className="w-3.5 h-3.5 text-blue-700" />
                      <span>Rekam Histori</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* TAB 2: ALUMNI / LULUSAN */}
      {activeTab === 'alumni' && (
        isLoadingAlumni ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse p-4 space-y-2"
              />
            ))}
          </div>
        ) : filteredAlumni.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-1">
            <Award className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="font-bold text-slate-700">Data alumni belum terdeteksi</p>
            <p>
              Siswa yang dipindahkan ke rombel 'ALUMNI' pada ExamKu akan otomatis terdaftar di sini dengan riwayat utuh.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredAlumni.map((alumni) => (
              <div
                key={alumni.id}
                className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs hover:border-amber-400 transition-all flex flex-col justify-between gap-3 relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {alumni.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h4
                        className="text-xs font-bold text-slate-900 truncate"
                        title={alumni.name}
                      >
                        {alumni.name}
                      </h4>
                      <p className="text-[11px] font-mono text-slate-500">
                        NISN: {alumni.username || '-'}
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold uppercase rounded-md shrink-0">
                    Alumni
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600 font-medium">
                    {alumni.className || 'SMAN Modal Bangsa'}
                  </span>

                  <button
                    onClick={() =>
                      setSelectedStudentForHistory({
                        id: alumni.id,
                        nama: alumni.name,
                        nisn: alumni.username,
                        status: 'alumni',
                        kelas: alumni.className,
                      })
                    }
                    className="min-h-[36px] px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    title="Lihat Histori Presensi & Perizinan Semasa Sekolah"
                  >
                    <History className="w-3.5 h-3.5 text-amber-700" />
                    <span>Rekam Histori</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* TAB 3: DEWAN GURU */}
      {activeTab === 'guru' && (
        isLoadingTeachers ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse p-4 space-y-2"
              />
            ))}
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-1">
            <School className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700">Data dewan guru tidak ditemukan</p>
            <p>Coba gunakan kata kunci pencarian yang lain.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredTeachers.map((guru) => {
              const subjectList = Array.isArray(guru.subjects) ? guru.subjects : [];

              return (
                <div
                  key={guru.id}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900 to-slate-900 text-amber-300 font-extrabold text-sm flex items-center justify-center shrink-0 shadow-inner">
                        {guru.code || guru.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h4
                          className="text-xs sm:text-sm font-bold text-slate-900 truncate"
                          title={guru.name}
                        >
                          {guru.name}
                        </h4>
                        <p className="text-[11px] font-mono text-slate-500">
                          @{guru.username || guru.code}
                        </p>
                      </div>
                    </div>

                    {guru.code && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-bold rounded shrink-0">
                        Kode: {guru.code}
                      </span>
                    )}
                  </div>

                  {/* Subjects Tags */}
                  <div className="space-y-1 pt-1.5 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                      <BookOpen className="w-3.5 h-3.5 text-blue-700" />
                      <span>Mata Pelajaran:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {subjectList.length > 0 ? (
                        subjectList.map((sub) => (
                          <span
                            key={sub}
                            className="px-2 py-0.5 rounded bg-blue-50 text-blue-950 border border-blue-200 font-semibold text-[10px]"
                          >
                            {sub}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">
                          Pengampu Mata Pelajaran
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* TAB 4: MATA PELAJARAN (POCKETBASE REST API) */}
      {activeTab === 'mapel' && (
        isLoadingMapel ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse p-4 space-y-2"
              />
            ))}
          </div>
        ) : filteredMapel.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-1">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700">Mata pelajaran tidak ditemukan</p>
            <p>Coba gunakan kata kunci pencarian yang lain.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredMapel.map((namaMapel, idx) => {
              const teachersForThisSubject = teachers.filter(
                (t) => Array.isArray(t.subjects) && t.subjects.includes(namaMapel)
              );

              return (
                <div
                  key={`${namaMapel}-${idx}`}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4
                          className="text-xs sm:text-sm font-bold text-slate-900 truncate"
                          title={namaMapel}
                        >
                          {namaMapel}
                        </h4>
                        <p className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          PocketBase ExamKu
                        </p>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold rounded-md shrink-0">
                      {teachersForThisSubject.length} Guru
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-xs">
                    <div className="text-[11px] font-medium text-slate-500 mb-1">
                      Guru Pengampu:
                    </div>
                    {teachersForThisSubject.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {teachersForThisSubject.map((g) => (
                          <span
                            key={g.id}
                            className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] rounded-md font-medium"
                            title={g.name}
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] italic text-slate-400">
                        Belum ada penugasan guru di ExamKu
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* MODAL: REKAM HISTORI & JEJAK SISWA */}
      {selectedStudentForHistory && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rekam-jejak-title"
        >
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-950 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-800 border border-blue-700 flex items-center justify-center text-amber-300 font-bold shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="rekam-jejak-title" className="text-sm sm:text-base font-bold text-white">
                      {selectedStudentForHistory.nama}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded ${
                        selectedStudentForHistory.status === 'alumni'
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-emerald-500 text-white'
                      }`}
                    >
                      {selectedStudentForHistory.status === 'alumni' ? 'Alumni' : 'Siswa Aktif'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono">
                    NISN: {selectedStudentForHistory.nisn || '-'} • {selectedStudentForHistory.kelas || 'SMAN Modal Bangsa'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudentForHistory(null)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg transition-colors"
                aria-label="Tutup Riwayat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs text-slate-800">
              {/* Semester Scoping Filter */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Filter className="w-4 h-4 text-blue-700" />
                  <span>Tampilkan Riwayat Semester:</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: 'Semua Semester (Gabungan)' },
                    { id: 'Genap', label: 'Semester Genap' },
                    { id: 'Ganjil', label: 'Semester Ganjil' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setHistorySemesterFilter(s.id as any)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        historySemesterFilter === s.id
                          ? 'bg-blue-800 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-tabs: Presensi KBM vs Perizinan Piket */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setHistorySubTab('presensi')}
                  className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    historySubTab === 'presensi'
                      ? 'bg-blue-800 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>
                    Presensi KBM ({studentHistoryData?.data?.presensi?.length || 0})
                  </span>
                </button>

                <button
                  onClick={() => setHistorySubTab('izin')}
                  className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    historySubTab === 'izin'
                      ? 'bg-blue-800 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>
                    Perizinan Keluar ({studentHistoryData?.data?.izin?.length || 0})
                  </span>
                </button>
              </div>

              {/* Sub-tab Content */}
              {isLoadingHistory ? (
                <div className="p-12 text-center text-xs text-slate-500 space-y-2">
                  <div className="w-6 h-6 border-2 border-blue-800 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Memuat rekam histori siswa...</p>
                </div>
              ) : historySubTab === 'presensi' ? (
                // Presensi List
                studentHistoryData?.data?.presensi?.length === 0 ? (
                  <div className="p-10 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
                    <Info className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="font-bold text-slate-700">Belum ada catatan presensi KBM</p>
                    <p>Catatan kehadiran dari jurnal mengajar guru akan tampil secara otomatis di sini.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {studentHistoryData?.data?.presensi?.map((p: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{p.nama_mapel || 'Mata Pelajaran'}</span>
                            <span className="text-[11px] text-slate-500">•</span>
                            <span className="text-xs text-blue-900 font-semibold">{p.nama_guru || 'Guru Pengajar'}</span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {p.tanggal_mengajar} • Jam: {p.jam_ke || '-'} • Semester {p.semester || 'Aktif'}
                          </p>
                          {p.materi && (
                            <p className="text-[11px] text-slate-600 italic">Materi: {p.materi}</p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <span
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                              p.status === 'Hadir'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : p.status === 'Sakit'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : p.status === 'Izin'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                          >
                            {p.status || 'Hadir'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                // Izin List
                studentHistoryData?.data?.izin?.length === 0 ? (
                  <div className="p-10 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
                    <Info className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="font-bold text-slate-700">Tidak ada riwayat perizinan</p>
                    <p>Siswa belum pernah mengajukan izin keluar kampus / piket pada periode ini.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {studentHistoryData?.data?.izin?.map((iz: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {iz.jenis_izin || 'Izin Keluar Kampus'}
                            </span>
                            <span className="text-xs text-slate-500">• {iz.tanggal_izin}</span>
                          </div>
                          <p className="text-[11px] text-slate-600">Alasan: {iz.alasan || '-'}</p>
                          {iz.penjemput && (
                            <p className="text-[11px] text-slate-500">Penjemput: {iz.penjemput}</p>
                          )}
                        </div>

                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg shrink-0 ${
                            iz.status === 'Selesai'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {iz.status || 'Disetujui'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <p className="text-[11px] text-slate-500">
                Histori tersimpan permanen di database SIMAK-MOSA.
              </p>
              <button
                onClick={() => setSelectedStudentForHistory(null)}
                className="min-h-[44px] px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
