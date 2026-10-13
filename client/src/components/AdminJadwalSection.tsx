import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock,
  BookOpen,
  UserCheck,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Search,
  ShieldCheck,
  Building,
  Save,
  X,
  Settings,
  Users,
  Key,
  UserPlus,
  Lock,
  Check,
} from 'lucide-react';
import {
  fetchAdminJadwal,
  simpanAdminJadwal,
  hapusAdminJadwal,
  fetchAdminGuruMapel,
  simpanAdminGuruMapel,
  fetchKelas,
  fetchDaftarMapel,
  DAFTAR_MAPEL,
  JadwalPelajaran,
  GuruMapelItem,
  User,
  fetchSemesterSettings,
  updateSemesterSettings,
  fetchAdminUsers,
  createAdminUser,
  updateUserRole,
  resetUserPassword,
  deleteAdminUser,
  updateUserEmail,
} from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';


interface AdminJadwalSectionProps {
  user: User | null;
  onSuccessToast?: (msg: string) => void;
}

const hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const JAM_OPTIONS = [
  { id: 'Jam 1', label: 'Jam 1', start: '07:30', end: '08:10', isSeninUpacara: true },
  { id: 'Jam 2', label: 'Jam 2', start: '08:10', end: '08:50' },
  { id: 'Jam 3', label: 'Jam 3', start: '08:50', end: '09:30' },
  { id: 'Jam 4', label: 'Jam 4', start: '09:30', end: '10:10' },
  { id: 'Jam 5', label: 'Jam 5', start: '10:30', end: '11:10' },
  { id: 'Jam 6', label: 'Jam 6', start: '11:10', end: '11:50' },
  { id: 'Jam 7', label: 'Jam 7', start: '11:50', end: '12:30' },
  { id: 'Jam 8', label: 'Jam 8', start: '12:30', end: '13:10' },
];

export const jamPresets = [
  { label: 'Jam 1-2', jams: ['Jam 1', 'Jam 2'] },
  { label: 'Jam 3-4', jams: ['Jam 3', 'Jam 4'] },
  { label: 'Jam 5-6', jams: ['Jam 5', 'Jam 6'] },
  { label: 'Jam 7-8', jams: ['Jam 7', 'Jam 8'] },
];

export const calculateWaktuOtomatis = (jams: string[], hari?: string): string => {
  if (!jams || jams.length === 0) return 'Belum dipilih';
  const matching = JAM_OPTIONS.filter((opt) => jams.includes(opt.id));
  if (matching.length === 0) return 'Belum dipilih';
  const startTime = matching[0].start;
  const endTime = matching[matching.length - 1].end;
  const prefix = (hari === 'Senin' && jams.includes('Jam 1')) ? '(Upacara & KBM) ' : '';
  return `${prefix}${startTime} - ${endTime} WIB`;
};

export const AdminJadwalSection: React.FC<AdminJadwalSectionProps> = ({
  user,
  onSuccessToast,
}) => {
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isWakasek = user?.role === 'wakil_kepala';

  const [activeTab, setActiveTab] = useState<'jadwal' | 'mapel' | 'semester' | 'users'>('jadwal');
  const [filterHari, setFilterHari] = useState<string>('all');
  const [filterKelas, setFilterKelas] = useState<string>('all');
  const [searchGuru, setSearchGuru] = useState('');
  const [searchUser, setSearchUser] = useState('');

  // Modal State for Schedule Form
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formHari, setFormHari] = useState('Senin');
  const [formKelas, setFormKelas] = useState('X-1');
  const [selectedJamList, setSelectedJamList] = useState<string[]>(['Jam 1', 'Jam 2']);
  const [formGuru, setFormGuru] = useState('Alfaruq Asri, S.Pd');
  const [selectedMapel, setSelectedMapel] = useState<string>('Informatika');
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const toggleJam = (jamId: string) => {
    setSelectedJamList((prev) => {
      const next = prev.includes(jamId)
        ? prev.filter((j) => j !== jamId)
        : [...prev, jamId];
      return next.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
    });
  };

  const handleSelectAllJam = () => {
    const maxJam = formHari === 'Jumat' ? 6 : 8;
    setSelectedJamList(
      JAM_OPTIONS.filter((j) => parseInt(j.id.replace(/\D/g, '')) <= maxJam).map((j) => j.id)
    );
  };

  const handleClearAllJam = () => {
    setSelectedJamList([]);
  };

  // Edit Mapel Modal
  const [editingGuruItem, setEditingGuruItem] = useState<GuruMapelItem | null>(null);
  const [editMapelText, setEditMapelText] = useState('');

  // Semester State
  const [inputTahunAjaran, setInputTahunAjaran] = useState('2025/2026');
  const [inputSemester, setInputSemester] = useState('Genap');

  // User Management State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newNama, setNewNama] = useState('');
  const [newMapel, setNewMapel] = useState('Guru Mata Pelajaran');
  const [newRole, setNewRole] = useState('guru');
  const [newPassword, setNewPassword] = useState('12345678');
  const [newEmail, setNewEmail] = useState('');

  // Reset Password State
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('12345678');

  // Change Role State
  const [roleTargetUser, setRoleTargetUser] = useState<User | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState('guru');

  // Queries
  const { data: jadwalList = [], isLoading: isLoadingJadwal } = useQuery({
    queryKey: ['adminJadwal', filterHari, filterKelas],
    queryFn: () =>
      fetchAdminJadwal({
        hari: filterHari === 'all' ? undefined : filterHari,
        kelas: filterKelas === 'all' ? undefined : filterKelas,
      }),
  });

  const { data: guruMapelList = [], isLoading: isLoadingGuru } = useQuery({
    queryKey: ['adminGuruMapel'],
    queryFn: fetchAdminGuruMapel,
  });

  const relatedMapelList = useMemo(() => {
    const matched = guruMapelList.find((g) => g.nama === formGuru);
    if (!matched || !matched.mapel) return [];
    return matched.mapel
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [guruMapelList, formGuru]);

  const { data: kelasList = [] } = useQuery({
    queryKey: ['kelas'],
    queryFn: fetchKelas,
  });

  const { data: daftarMapel = DAFTAR_MAPEL } = useQuery({
    queryKey: ['daftarMapel'],
    queryFn: fetchDaftarMapel,
  });

  const { data: semesterSettings } = useQuery({
    queryKey: ['semesterSettings'],
    queryFn: fetchSemesterSettings,
  });

  React.useEffect(() => {
    if (semesterSettings) {
      setInputTahunAjaran(semesterSettings.activeTahunAjaran);
      setInputSemester(semesterSettings.activeSemester);
    }
  }, [semesterSettings]);

  const { data: usersList = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: fetchAdminUsers,
    enabled: isAdmin,
  });

  // Mutations
  const mutationJadwal = useMutation({
    mutationFn: simpanAdminJadwal,
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['adminJadwal'] });
      setAlertMsg(res.message || 'Slot jadwal pelajaran berhasil disimpan.');
      if (onSuccessToast) onSuccessToast(res.message || 'Slot jadwal pelajaran berhasil disimpan.');
      setIsOpenModal(false);
      resetForm();
      setTimeout(() => setAlertMsg(null), 3500);
    },
    onError: (err: any) => {
      setAlertMsg(err.message || 'Gagal menyimpan slot jadwal pelajaran.');
      setTimeout(() => setAlertMsg(null), 4000);
    },
  });

  const mutationDelete = useMutation({
    mutationFn: hapusAdminJadwal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminJadwal'] });
      setAlertMsg('Slot jadwal berhasil dihapus.');
      if (onSuccessToast) onSuccessToast('Slot jadwal berhasil dihapus.');
      setTimeout(() => setAlertMsg(null), 3000);
    },
  });

  const mutationUpdateMapel = useMutation({
    mutationFn: (data: { namaGuru: string; mapel: string }) =>
      simpanAdminGuruMapel(data.namaGuru, data.mapel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminGuruMapel'] });
      queryClient.invalidateQueries({ queryKey: ['adminJadwal'] });
      setAlertMsg('Penugasan mapel guru berhasil diperbarui.');
      if (onSuccessToast) onSuccessToast('Penugasan mapel guru berhasil diperbarui.');
      setEditingGuruItem(null);
      setTimeout(() => setAlertMsg(null), 3000);
    },
  });

  const mutationSemester = useMutation({
    mutationFn: (data: { tahunAjaran: string; semester: string }) =>
      updateSemesterSettings(data.tahunAjaran, data.semester),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['semesterSettings'] });
      setAlertMsg(res.message || 'Semester aktif berhasil diperbarui.');
      if (onSuccessToast) onSuccessToast(res.message || 'Semester aktif berhasil diperbarui.');
      setTimeout(() => setAlertMsg(null), 3500);
    },
    onError: (err: any) => {
      setAlertMsg(err.message || 'Gagal memperbarui semester aktif.');
      setTimeout(() => setAlertMsg(null), 3500);
    }
  });

  const mutationCreateUser = useMutation({
    mutationFn: createAdminUser,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['guru'] });
      queryClient.invalidateQueries({ queryKey: ['adminGuruMapel'] });
      setAlertMsg(res.message || 'Akun pengguna baru berhasil dibuat.');
      if (onSuccessToast) onSuccessToast(res.message || 'Akun pengguna baru berhasil dibuat.');
      setIsAddUserOpen(false);
      setNewUsername('');
      setNewNama('');
      setNewEmail('');
      setTimeout(() => setAlertMsg(null), 3500);
    },
    onError: (err: any) => {
      alert(err.message || 'Gagal membuat akun pengguna.');
    }
  });

  const mutationRole = useMutation({
    mutationFn: (data: { id: string; role: string }) => updateUserRole(data.id, data.role),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminGuruMapel'] });
      setAlertMsg(res.message || 'Role pengguna berhasil diperbarui.');
      if (onSuccessToast) onSuccessToast(res.message || 'Role pengguna berhasil diperbarui.');
      setRoleTargetUser(null);
      setTimeout(() => setAlertMsg(null), 3500);
    }
  });

  const mutationResetPassword = useMutation({
    mutationFn: (data: { id: string; newPassword?: string }) => resetUserPassword(data.id, data.newPassword),
    onSuccess: (res) => {
      setAlertMsg(res.message || 'Password pengguna berhasil direset.');
      if (onSuccessToast) onSuccessToast(res.message || 'Password pengguna berhasil direset.');
      setResetTargetUser(null);
      setTimeout(() => setAlertMsg(null), 3500);
    }
  });

  const mutationDeleteUser = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminGuruMapel'] });
      queryClient.invalidateQueries({ queryKey: ['guru'] });
      setAlertMsg(res.message || 'Pengguna berhasil dihapus.');
      if (onSuccessToast) onSuccessToast(res.message || 'Pengguna berhasil dihapus.');
      setTimeout(() => setAlertMsg(null), 3500);
    }
  });

  const resetForm = () => {
    setEditId(null);
    setFormHari('Senin');
    setFormKelas(kelasList[0]?.nama || 'X-1');
    setSelectedJamList(['Jam 1', 'Jam 2']);
    const defaultTeacher = guruMapelList[0]?.nama || user?.nama || 'Alfaruq Asri, S.Pd';
    setFormGuru(defaultTeacher);
    const matched = guruMapelList.find((g) => g.nama === defaultTeacher);
    if (matched && matched.mapel) {
      const parsed = matched.mapel.split(',').map((s) => s.trim()).filter(Boolean);
      setSelectedMapel(parsed[0] || 'Informatika');
    } else {
      setSelectedMapel('Informatika');
    }
  };

  const handleOpenCreate = () => {
    resetForm();
    mutationJadwal.reset();
    setIsOpenModal(true);
  };

  const handleOpenEdit = (item: JadwalPelajaran) => {
    mutationJadwal.reset();
    setEditId(item.id);
    setFormHari(item.hari);
    setFormKelas(item.nama_kelas);

    // Parse jam_ke
    const parsedJam: string[] = [];
    JAM_OPTIONS.forEach((opt) => {
      if (item.jam_ke && item.jam_ke.includes(opt.id)) {
        parsedJam.push(opt.id);
      }
    });
    setSelectedJamList(parsedJam.length > 0 ? parsedJam : ['Jam 1', 'Jam 2']);

    setFormGuru(item.nama_guru);

    // Match teacher's related subjects
    const matched = guruMapelList.find((g) => g.nama === item.nama_guru);
    const parsed = matched?.mapel ? matched.mapel.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const itemMapelFirst = item.mapel ? item.mapel.split(',')[0].trim() : '';

    if (parsed.includes(itemMapelFirst)) {
      setSelectedMapel(itemMapelFirst);
    } else if (parsed.length > 0) {
      setSelectedMapel(parsed[0]);
    } else {
      setSelectedMapel(itemMapelFirst || daftarMapel[0] || 'Informatika');
    }

    setIsOpenModal(true);
  };

  const handleSubmitSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedJamList.length === 0) {
      alert('Pilih minimal satu jam pelajaran untuk slot jadwal ini.');
      return;
    }
    if (!selectedMapel || !selectedMapel.trim()) {
      alert('Pilih satu mata pelajaran yang diajarkan.');
      return;
    }

    const jamKeString = selectedJamList.join(', ');
    const waktuOtomatis = calculateWaktuOtomatis(selectedJamList);

    mutationJadwal.mutate({
      id: editId || undefined,
      hari: formHari,
      nama_kelas: formKelas,
      namaKelas: formKelas,
      jam_ke: jamKeString,
      jamKe: jamKeString,
      waktu: waktuOtomatis,
      nama_guru: formGuru,
      namaGuru: formGuru,
      mapel: selectedMapel.trim(),
      ruangan: 'Ruang Kelas',
    });
  };

  const filteredJadwal = useMemo(() => {
    return jadwalList.filter((j) => {
      const matchSearch =
        j.nama_guru.toLowerCase().includes(searchGuru.toLowerCase()) ||
        j.mapel.toLowerCase().includes(searchGuru.toLowerCase());
      return matchSearch;
    });
  }, [jadwalList, searchGuru]);

  const filteredTeachers = useMemo(() => {
    return guruMapelList.filter(
      (g) =>
        g.nama.toLowerCase().includes(searchGuru.toLowerCase()) ||
        g.mapel.toLowerCase().includes(searchGuru.toLowerCase())
    );
  }, [guruMapelList, searchGuru]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const q = searchUser.toLowerCase();
      const matchName = u.nama.toLowerCase().includes(q);
      const matchUsername = (u.username || '').toLowerCase().includes(q);
      const matchRole = (u.role || '').toLowerCase().includes(q);
      const matchMapel = (u.mapel || '').toLowerCase().includes(q);
      return matchName || matchUsername || matchRole || matchMapel;
    });
  }, [usersList, searchUser]);

  useModalBehavior(isOpenModal, () => setIsOpenModal(false));
  useModalBehavior(!!editingGuruItem, () => setEditingGuruItem(null));
  useModalBehavior(isAddUserOpen, () => setIsAddUserOpen(false));
  useModalBehavior(!!roleTargetUser, () => setRoleTargetUser(null));
  useModalBehavior(!!resetTargetUser, () => setResetTargetUser(null));

  return (
    <div className="space-y-6">
      {/* Admin Title Card */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-900 text-white p-6 rounded-2xl border border-blue-900 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isAdmin ? `Otoritas Super Admin: ${user?.nama}` : `Otoritas Wakil Kepala: ${user?.nama}`}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              {isAdmin ? 'Manajemen Akademik, Jadwal & Pengguna' : 'Manajemen Jadwal Pelajaran & Mapel Guru'}
            </h2>
            <p className="text-xs text-blue-100/90 mt-1 max-w-xl">
              {isAdmin
                ? 'Panel kendali terpadu administrator untuk mengelola jadwal KBM, penugasan mata pelajaran, pengaturan semester akademik, dan kontrol akun dewan guru.'
                : 'Panel khusus wakil kepala sekolah untuk mengatur jadwal KBM mingguan di seluruh rombel dan memperbarui penugasan mata pelajaran dewan guru SMAN Modal Bangsa.'}
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all self-start sm:self-auto focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            <span>+ Buat Slot Jadwal Baru</span>
          </button>
        </div>
      </div>

      {alertMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{alertMsg}</span>
        </div>
      )}

      {/* Tabs Switcher: Jadwal, Mapel, Semester, Users */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab('jadwal');
            setSearchGuru('');
          }}
          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'jadwal'
              ? 'bg-blue-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>1. Jadwal KBM ({jadwalList.length} Slot)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('mapel');
            setSearchGuru('');
          }}
          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'mapel'
              ? 'bg-blue-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>2. Penugasan Mapel ({guruMapelList.length} Guru)</span>
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => {
                setActiveTab('semester');
              }}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'semester'
                  ? 'bg-blue-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>3. Semester ({semesterSettings?.activeSemester || 'Genap'} {semesterSettings?.activeTahunAjaran || '2025/2026'})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('users');
                setSearchUser('');
              }}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'users'
                  ? 'bg-blue-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>4. Akun & Password ({usersList.length} Akun)</span>
            </button>
          </>
        )}
      </div>

      {/* TAB 1: PENGATURAN JADWAL */}
      {activeTab === 'jadwal' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Hari Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                <button
                  onClick={() => setFilterHari('all')}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-all ${
                    filterHari === 'all'
                      ? 'bg-blue-800 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua Hari
                </button>
                {hariList.map((h) => (
                  <button
                    key={h}
                    onClick={() => setFilterHari(h)}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition-all ${
                      filterHari === h
                        ? 'bg-blue-800 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>

              {/* Kelas Filter & Search Guru */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  value={filterKelas}
                  onChange={(e) => setFilterKelas(e.target.value)}
                  className="min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="all">Semua Rombel</option>
                  {kelasList.map((k) => (
                    <option key={k.nama} value={k.nama}>
                      Kelas {k.nama}
                    </option>
                  ))}
                </select>

                <div className="relative flex-1 sm:flex-initial sm:w-52">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchGuru}
                    onChange={(e) => setSearchGuru(e.target.value)}
                    placeholder="Cari guru atau mapel..."
                    className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Schedule List Grid */}
          {isLoadingJadwal ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-44 bg-white rounded-2xl border border-slate-200 animate-pulse p-4 space-y-2" />
              ))}
            </div>
          ) : filteredJadwal.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-2">
              <CalendarDays className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">Belum ada slot jadwal yang sesuai</p>
              <p>Gunakan tombol "+ Buat Slot Jadwal Baru" untuk menambahkan jam mengajar guru.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredJadwal.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-xs font-extrabold">
                        {item.hari} - {item.nama_kelas}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                        {item.jam_ke}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900 truncate" title={item.nama_guru}>
                        {item.nama_guru}
                      </h4>
                      <p className="text-xs font-semibold text-blue-800 truncate" title={item.mapel}>
                        {item.mapel}
                      </p>
                    </div>

                    <div className="text-[11px] text-slate-500 space-y-0.5 pt-2 border-t border-slate-100">
                      <p className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.waktu || '07:30 - 09:00 WIB'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions: Edit & Delete */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="min-h-[36px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Edit Slot Jadwal"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Hapus jadwal ${item.mapel} kelas ${item.nama_kelas} (${item.hari})?`)) {
                          mutationDelete.mutate(item.id);
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Hapus Slot Jadwal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PENUGASAN MAPEL GURU */}
      {activeTab === 'mapel' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Daftar Penugasan Mata Pelajaran Pendidik
              </h3>
              <p className="text-xs text-slate-500">
                Klik tombol "Ubah Mapel" untuk memperbarui penugasan guru secara permanen di database.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchGuru}
                onChange={(e) => setSearchGuru(e.target.value)}
                placeholder="Cari guru atau mapel..."
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {isLoadingGuru ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Memuat data penugasan mapel guru...
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                Tidak ada data guru yang cocok dengan kata kunci pencarian.
              </div>
            ) : (
              filteredTeachers.map((guru) => (
                <div
                  key={guru.nama}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-900 text-amber-300 font-extrabold text-sm flex items-center justify-center shrink-0">
                      {guru.nama.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {guru.nama}
                        </h4>
                        {guru.role === 'admin' && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-extrabold text-[10px]">
                            ADMIN
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Mata Pelajaran: <span className="font-semibold text-blue-900">{guru.mapel}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setEditingGuruItem(guru);
                      setEditMapelText(guru.mapel);
                    }}
                    className="min-h-[40px] px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors self-end sm:self-auto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Ubah Mapel</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PENGATURAN SEMESTER & TAHUN AJARAN */}
      {activeTab === 'semester' && isAdmin && (
        <div className="space-y-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 text-xs font-bold uppercase tracking-wider mb-2">
                <Settings className="w-4 h-4 text-blue-700" />
                <span>Pengaturan Kalender & Semester Akademik</span>
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">
                Konfigurasi Semester & Tahun Pelajaran Aktif
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                Menentukan semester aktif saat ini. Seluruh entri jurnal KBM baru, presensi kelas, dispensasi, dan izin siswa/i akan otomatis tercatat ke semester ini. Riwayat lampau tetap tersimpan rapi dan dapat disaring per semester atau dilihat gabungan.
              </p>
            </div>

            <div className="p-4 bg-gradient-to-r from-blue-900 to-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">
                  Status Berjalan di Sistem
                </span>
                <p className="text-lg font-black text-white">
                  Semester {semesterSettings?.activeSemester || 'Genap'} Tahun Ajaran {semesterSettings?.activeTahunAjaran || '2025/2026'}
                </p>
              </div>
              <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Sedang Digunakan</span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutationSemester.mutate({
                  tahunAjaran: inputTahunAjaran,
                  semester: inputSemester,
                });
              }}
              className="space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Pilih Semester:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Ganjil', 'Genap'].map((sem) => (
                      <button
                        key={sem}
                        type="button"
                        onClick={() => setInputSemester(sem)}
                        className={`min-h-[48px] px-4 py-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          inputSemester === sem
                            ? 'bg-blue-800 text-white border-blue-900 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <CalendarDays className="w-4 h-4" />
                        <span>Semester {sem}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Tahun Pelajaran:
                  </label>
                  <select
                    value={inputTahunAjaran}
                    onChange={(e) => setInputTahunAjaran(e.target.value)}
                    className="w-full min-h-[48px] px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    <option value="2024/2025">Tahun Ajaran 2024/2025</option>
                    <option value="2025/2026">Tahun Ajaran 2025/2026</option>
                    <option value="2026/2027">Tahun Ajaran 2026/2027</option>
                    <option value="2027/2028">Tahun Ajaran 2027/2028</option>
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Format: YYYY/YYYY (contoh: 2025/2026)
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Perubahan semester berlaku seketika untuk semua guru yang bertugas.
                </p>
                <button
                  type="submit"
                  disabled={mutationSemester.isPending}
                  className="min-h-[44px] px-6 py-2.5 bg-blue-800 hover:bg-blue-700 active:bg-blue-900 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{mutationSemester.isPending ? 'Menyimpan...' : 'Simpan Perubahan Semester'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: MANAJEMEN PENGGUNA & PASSWORD */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pengguna</span>
              <p className="text-xl font-extrabold text-slate-900 mt-1">{usersList.length} Akun</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Administrator</span>
              <p className="text-xl font-extrabold text-amber-600 mt-1">
                {usersList.filter(u => u.role === 'admin').length} Akun
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Wakil Kepala</span>
              <p className="text-xl font-extrabold text-blue-600 mt-1">
                {usersList.filter(u => u.role === 'wakil_kepala').length} Akun
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Dewan Guru</span>
              <p className="text-xl font-extrabold text-emerald-600 mt-1">
                {usersList.filter(u => u.role === 'guru').length} Guru
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                placeholder="Cari nama guru, username, mapel, atau role..."
                className="w-full min-h-[44px] pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
              />
            </div>

            <button
              onClick={() => {
                setNewUsername('');
                setNewNama('');
                setNewMapel('Guru Mata Pelajaran');
                setNewRole('guru');
                setNewPassword('12345678');
                setNewEmail('');
                setIsAddUserOpen(true);
              }}
              className="min-h-[44px] px-5 py-2.5 bg-blue-800 hover:bg-blue-700 active:bg-blue-900 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4 text-amber-300" />
              <span>+ Buat Akun Pengguna Baru</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {isLoadingUsers ? (
              <div className="p-12 text-center text-xs text-slate-500">
                Memuat data seluruh pengguna SIMAK-MOSA...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500 space-y-1">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-700">Tidak ada pengguna yang cocok</p>
                <p>Coba gunakan kata kunci pencarian yang lain.</p>
              </div>
            ) : (
              filteredUsers.map((item) => (
                <div
                  key={item.id || item.username}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 shadow-inner ${
                        item.role === 'admin'
                          ? 'bg-amber-400 text-slate-950 border border-amber-500'
                          : item.role === 'wakil_kepala'
                          ? 'bg-blue-600 text-white border border-blue-700'
                          : 'bg-slate-800 text-slate-200 border border-slate-700'
                      }`}
                    >
                      {item.nama.charAt(0)}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {item.nama}
                        </h4>
                        {item.role === 'admin' && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] uppercase">
                            Administrator
                          </span>
                        )}
                        {item.role === 'wakil_kepala' && (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-300 font-extrabold text-[10px] uppercase">
                            Wakil Kepala
                          </span>
                        )}
                        {item.role === 'guru' && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px] uppercase">
                            Guru
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="font-mono text-slate-600 font-medium">@{item.username}</span>
                        <span>•</span>
                        <span className="text-blue-900 font-semibold">{item.mapel}</span>
                        <span>•</span>
                        {item.email && <span className="text-[11px] text-slate-500 font-mono">{item.email}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                    

                    <button
                      onClick={() => {
                        setRoleTargetUser(item);
                        setSelectedNewRole(item.role || 'guru');
                      }}
                      className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Atur Role Pengguna"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                      <span>Atur Role</span>
                    </button>

                    <button
                      onClick={() => {
                        setResetTargetUser(item);
                        setResetPasswordVal('12345678');
                      }}
                      className="min-h-[38px] px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Reset Password Pengguna"
                    >
                      <Key className="w-3.5 h-3.5 text-amber-700" />
                      <span>Reset Password</span>
                    </button>

                    {item.username !== 'alfaruq_asri' && (
                      <button
                        onClick={() => {
                          if (confirm(`Hapus akun pengguna ${item.nama} (@${item.username})?`)) {
                            if (item.id) mutationDeleteUser.mutate(item.id);
                          }
                        }}
                        className="min-h-[38px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        title="Hapus Akun Pengguna"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: INPUT / EDIT JADWAL */}
      {isOpenModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-slot-title"
        >
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 id="admin-slot-title" className="text-base font-bold">
                {editId ? 'Edit Slot Jadwal KBM' : 'Tambah Slot Jadwal KBM Baru'}
              </h3>
              <button
                onClick={() => setIsOpenModal(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors"
                aria-label="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSchedule} className="p-5 space-y-4 text-xs text-slate-800 overflow-y-auto flex-1">
              {mutationJadwal.isError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{(mutationJadwal.error as any)?.message || 'Terjadi bentrok jadwal atau kesalahan sistem.'}</span>
                </div>
              )}

              {/* 1. HARI & KELAS (Grid 2 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-700 mb-1.5 text-xs">
                    Hari
                  </label>
                  <select
                    value={formHari}
                    onChange={(e) => {
                      const newHari = e.target.value;
                      setFormHari(newHari);
                      if (newHari === 'Jumat') {
                        setSelectedJamList((prev) =>
                          prev.filter((j) => parseInt(j.replace(/\D/g, '')) <= 6)
                        );
                      }
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-blue-800 focus:outline-none text-xs"
                  >
                    {hariList.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold uppercase tracking-wider text-slate-700 mb-1.5 text-xs">
                    Kelas / Rombel (Data PocketBase)
                  </label>
                  <select
                    value={formKelas}
                    onChange={(e) => setFormKelas(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-blue-800 focus:outline-none text-xs"
                  >
                    {kelasList
                      .filter((k) => k.nama !== 'ALUMNI' && !k.nama.toLowerCase().includes('alumni'))
                      .map((k) => (
                        <option key={k.nama} value={k.nama}>
                          Kelas {k.nama}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* 2. JAM PELAJARAN (Bisa Multiple & Bisa Off Semua) */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block font-bold uppercase tracking-wider text-slate-700 text-xs">
                    Jam Pelajaran (Pilih 1 atau Lebih)
                  </label>
                  {selectedJamList.length > 0 ? (
                    <span className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-blue-700" />
                      <span>{calculateWaktuOtomatis(selectedJamList)}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                      Semua Jam Nonaktif (0 Jam)
                    </span>
                  )}
                </div>

                {/* Quick Presets & Controls */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      Preset:
                    </span>
                    {jamPresets
                      .filter((p) =>
                        formHari === 'Jumat'
                          ? p.jams.every((j) => parseInt(j.replace(/\D/g, '')) <= 6)
                          : true
                      )
                      .map((preset) => {
                        const isSelected =
                          preset.jams.every((j) => selectedJamList.includes(j)) &&
                          selectedJamList.length === preset.jams.length;
                        return (
                          <button
                            type="button"
                            key={preset.label}
                            onClick={() => setSelectedJamList(preset.jams)}
                            className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                              isSelected
                                ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAllJam}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 transition-colors"
                    >
                      Pilih Semua ({formHari === 'Jumat' ? '6 JP' : '8 JP'})
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllJam}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-700 border border-slate-200 transition-colors"
                    >
                      Off-kan Semua
                    </button>
                  </div>
                </div>

                {/* 8 Period Grid Buttons & Break Indicators */}
                <div className="space-y-2 pt-1">
                  {formHari === 'Senin' && (
                    <div className="p-2 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold rounded-xl flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                      <span>Senin pagi JP 1 (07:30 - 08:10): Upacara Bendera Civitas Sekolah</span>
                    </div>
                  )}

                  {formHari === 'Jumat' && (
                    <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-semibold rounded-xl flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Hari Jumat hanya 6 JP (KBM tuntas pukul 11:50 WIB sebelum Shalat Jumat)</span>
                    </div>
                  )}

                  {/* Sesi 1: Jam 1 s/d Jam 4 */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Sesi Pagi (Jam 1 - 4 • 40 Menit / JP):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {JAM_OPTIONS.slice(0, 4).map((opt) => {
                        const isChecked = selectedJamList.includes(opt.id);
                        return (
                          <button
                            type="button"
                            key={opt.id}
                            onClick={() => toggleJam(opt.id)}
                            className={`min-h-[50px] py-2 px-2 rounded-xl text-center text-xs font-bold transition-all border flex flex-col items-center justify-center gap-0.5 ${
                              isChecked
                                ? 'bg-blue-900 text-white border-blue-900 shadow-2xs ring-2 ring-blue-900 ring-offset-1 font-extrabold'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                            title={`${opt.id}: ${opt.start} - ${opt.end} WIB`}
                          >
                            <span className="leading-tight flex items-center gap-1">
                              {opt.id}
                              {formHari === 'Senin' && opt.id === 'Jam 1' && (
                                <span className="text-[9px] px-1 bg-amber-400 text-slate-950 rounded font-black">Upacara</span>
                              )}
                            </span>
                            <span className={`text-[10px] leading-tight font-normal ${isChecked ? 'text-blue-200' : 'text-slate-400'}`}>
                              {opt.start} - {opt.end}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Istirahat 20 Menit */}
                  <div className="py-1 px-3 bg-amber-50/80 border border-amber-200 text-amber-800 rounded-xl text-center text-[11px] font-bold flex items-center justify-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Istirahat 20 Menit (10:10 - 10:30 WIB) setelah JP 4</span>
                  </div>

                  {/* Sesi 2: Jam 5 s/d Jam 8 (atau Jam 6 jika Jumat) */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Sesi Lanjutan ({formHari === 'Jumat' ? 'Jam 5 - 6' : 'Jam 5 - 8'}):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {(formHari === 'Jumat' ? JAM_OPTIONS.slice(4, 6) : JAM_OPTIONS.slice(4, 8)).map((opt) => {
                        const isChecked = selectedJamList.includes(opt.id);
                        return (
                          <button
                            type="button"
                            key={opt.id}
                            onClick={() => toggleJam(opt.id)}
                            className={`min-h-[50px] py-2 px-2 rounded-xl text-center text-xs font-bold transition-all border flex flex-col items-center justify-center gap-0.5 ${
                              isChecked
                                ? 'bg-blue-900 text-white border-blue-900 shadow-2xs ring-2 ring-blue-900 ring-offset-1 font-extrabold'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                            title={`${opt.id}: ${opt.start} - ${opt.end} WIB`}
                          >
                            <span className="leading-tight">{opt.id}</span>
                            <span className={`text-[10px] leading-tight font-normal ${isChecked ? 'text-blue-200' : 'text-slate-400'}`}>
                              {opt.start} - {opt.end}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span className="text-slate-600">
                    {selectedJamList.length > 0 ? (
                      <>
                        Jam terpilih: <span className="font-bold text-slate-900">{selectedJamList.join(', ')}</span> ({selectedJamList.length} jam mengajar)
                      </>
                    ) : (
                      <span className="text-rose-600 font-semibold">
                        Peringatan: Belum ada jam yang aktif. Silakan pilih minimal satu jam mengajar.
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* 3. GURU PENGAMPU */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block font-bold uppercase tracking-wider text-slate-700 mb-1.5 text-xs">
                  Guru Pengampu
                </label>
                <select
                  value={formGuru}
                  onChange={(e) => {
                    const teacherName = e.target.value;
                    setFormGuru(teacherName);
                    const matched = guruMapelList.find((g) => g.nama === teacherName);
                    if (matched && matched.mapel) {
                      const parsed = matched.mapel.split(',').map((s) => s.trim()).filter(Boolean);
                      setSelectedMapel(parsed[0] || '');
                    } else {
                      setSelectedMapel('');
                    }
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-blue-800 focus:outline-none text-xs"
                >
                  {guruMapelList.map((g) => (
                    <option key={g.nama} value={g.nama}>
                      {g.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. MATA PELAJARAN (Hanya Mapel Terelasi & Wajib 1) */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block font-bold uppercase tracking-wider text-slate-700 text-xs">
                    Mata Pelajaran (Wajib Pilih 1 Mapel Terelasi)
                  </label>
                  {selectedMapel ? (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Terpilih: {selectedMapel}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                      Belum Dipilih
                    </span>
                  )}
                </div>

                {relatedMapelList.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      Pilih 1 mata pelajaran terelasi resmi untuk guru <span className="font-bold text-slate-900">{formGuru}</span>:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {relatedMapelList.map((m) => {
                        const isSelected = selectedMapel === m;
                        return (
                          <button
                            type="button"
                            key={m}
                            onClick={() => setSelectedMapel(m)}
                            className={`min-h-[48px] p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-blue-900 text-white border-blue-900 shadow-2xs font-bold ring-2 ring-blue-900 ring-offset-1'
                                : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                            }`}
                          >
                            <span className="text-xs font-semibold">{m}</span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ml-2 ${
                                isSelected
                                  ? 'border-amber-300 bg-amber-300'
                                  : 'border-slate-400 bg-white'
                              }`}
                            >
                              {isSelected && <div className="w-2 h-2 rounded-full bg-blue-950" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      Pendidik ini belum memiliki mata pelajaran terelasi di database. Pilih 1 mapel dari daftar:
                    </p>
                    <select
                      value={selectedMapel}
                      onChange={(e) => setSelectedMapel(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-800 focus:outline-none"
                    >
                      <option value="">-- Pilih 1 Mata Pelajaran --</option>
                      {daftarMapel.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={mutationJadwal.isPending}
                  className="min-h-[44px] px-5 py-2 bg-blue-800 hover:bg-blue-900 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {mutationJadwal.isPending ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT MAPEL GURU */}
      {editingGuruItem && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-mapel-title"
        >
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between">
              <h3 id="admin-mapel-title" className="text-base font-bold">Ubah Penugasan Mapel Guru</h3>
              <button
                onClick={() => setEditingGuruItem(null)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-800">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Nama Guru Pendidik
                </span>
                <p className="text-sm font-bold text-slate-900">{editingGuruItem.nama}</p>
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Pilih Mata Pelajaran (Urutan Ascending A-Z)
                </label>
                <select
                  value={daftarMapel.includes(editMapelText) ? editMapelText : ''}
                  onChange={(e) => {
                    if (e.target.value) setEditMapelText(e.target.value);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-xs mb-2"
                >
                  <option value="">-- Pilih dari 21 Mapel Resmi SMAN Modal Bangsa --</option>
                  {daftarMapel.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl mb-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      21 Mapel Resmi (Klik Cepat):
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Ascending A-Z</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                    {daftarMapel.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditMapelText(m)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                          editMapelText === m
                            ? 'bg-blue-800 text-white shadow-2xs'
                            : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Nama Mapel yang Ditugaskan
                </label>
                <input
                  type="text"
                  value={editMapelText}
                  onChange={(e) => setEditMapelText(e.target.value)}
                  placeholder="Pilih dari daftar atau ketik kustom..."
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-xs"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingGuruItem(null)}
                  className="min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={mutationUpdateMapel.isPending}
                  onClick={() => {
                    if (!editMapelText.trim()) return alert('Mapel tidak boleh kosong');
                    mutationUpdateMapel.mutate({
                      namaGuru: editingGuruItem.nama,
                      mapel: editMapelText.trim(),
                    });
                  }}
                  className="min-h-[42px] px-5 py-2 bg-blue-800 hover:bg-blue-900 text-white font-bold rounded-xl shadow-sm"
                >
                  {mutationUpdateMapel.isPending ? 'Menyimpan...' : 'Simpan Penugasan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BUAT AKUN PENGGUNA BARU */}
      {isAddUserOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-adduser-title"
        >
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-amber-300" />
                <h3 id="admin-adduser-title" className="text-base font-bold">Buat Akun Pengguna Baru</h3>
              </div>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg transition-colors"
                aria-label="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newUsername.trim() || !newNama.trim()) {
                  alert('Username dan Nama Pengguna wajib diisi');
                  return;
                }
                mutationCreateUser.mutate({
                  username: newUsername.trim().toLowerCase(),
                  nama: newNama.trim(),
                  role: newRole,
                  mapel: newMapel.trim() || 'Guru Mata Pelajaran',
                  password: newPassword || '12345678',
                  email: newEmail.trim() || undefined,
                });
              }}
              className="p-5 space-y-4 text-xs text-slate-800"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold uppercase tracking-wider text-slate-700">
                    Username Login *
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="contoh: budi_santoso"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
                    required
                  />
                  <p className="text-[10px] text-slate-500">Huruf kecil, angka, atau garis bawah.</p>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold uppercase tracking-wider text-slate-700">
                    Nama Lengkap & Gelar *
                  </label>
                  <input
                    type="text"
                    value={newNama}
                    onChange={(e) => setNewNama(e.target.value)}
                    placeholder="contoh: Budi Santoso, S.Pd."
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Alamat Email (Opsional)
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="contoh: budi@sman-modalbangsa.sch.id"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
                
              </div>

              <div className="space-y-1">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Peran / Hak Akses (Role)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'guru', label: 'Guru', desc: 'Akses KBM' },
                    { id: 'wakil_kepala', label: 'Wakil Kepala', desc: 'Jadwal & Mapel' },
                    { id: 'admin', label: 'Admin', desc: 'Akses Penuh' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setNewRole(r.id)}
                      className={`min-h-[48px] p-2.5 rounded-xl border text-left transition-all ${
                        newRole === r.id
                          ? 'bg-blue-800 text-white border-blue-900 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <p className="font-bold text-xs leading-tight">{r.label}</p>
                      <p className={`text-[10px] mt-0.5 ${newRole === r.id ? 'text-blue-200' : 'text-slate-500'}`}>
                        {r.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Mata Pelajaran yang Diampu
                </label>
                <select
                  value={daftarMapel.includes(newMapel) ? newMapel : ''}
                  onChange={(e) => {
                    if (e.target.value) setNewMapel(e.target.value);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 mb-1.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
                >
                  <option value="">Pilih dari 21 Mata Pelajaran Resmi (A-Z)</option>
                  {daftarMapel.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newMapel}
                  onChange={(e) => setNewMapel(e.target.value)}
                  placeholder="Ketik nama mata pelajaran atau tugas..."
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Kata Sandi Awal (Password)
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Default: 12345678"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
                <p className="text-[10px] text-slate-500">Standar sandi awal: 12345678 (wajib diubah oleh pengguna saat login pertama).</p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={mutationCreateUser.isPending}
                  className="min-h-[44px] px-5 py-2 bg-blue-800 hover:bg-blue-700 active:bg-blue-900 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4 text-amber-300" />
                  <span>{mutationCreateUser.isPending ? 'Membuat Akun...' : 'Buat Akun Sekarang'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UBAH ROLE PENGGUNA */}
      {roleTargetUser && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-role-title"
        >
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-amber-300" />
                <h3 id="admin-role-title" className="text-base font-bold">Atur Peran Akses Pengguna</h3>
              </div>
              <button
                onClick={() => setRoleTargetUser(null)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg transition-colors"
                aria-label="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-800">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Pengguna Terpilih
                </span>
                <p className="text-sm font-bold text-slate-900">{roleTargetUser.nama}</p>
                <p className="text-xs font-mono text-slate-600">@{roleTargetUser.username}</p>
              </div>

              <div className="space-y-2">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Pilih Hak Akses Baru:
                </label>
                <div className="space-y-2">
                  {[
                    {
                      id: 'guru',
                      label: 'Dewan Guru (KBM)',
                      badge: 'Guru',
                      desc: 'Akses menu Workspace Guru, Jurnal Mengajar, Direktori, Piket, dan Asrama.',
                    },
                    {
                      id: 'wakil_kepala',
                      label: 'Wakil Kepala Sekolah',
                      badge: 'Waka',
                      desc: 'Akses menu Manajemen Jadwal Pelajaran dan Penugasan Mapel Guru, ditambah seluruh menu guru.',
                    },
                    {
                      id: 'admin',
                      label: 'Administrator Sistem',
                      badge: 'Admin',
                      desc: 'Akses penuh termasuk pengaturan semester aktif, kelola akun, reset password, dan sinkronisasi database.',
                    },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedNewRole(r.id)}
                      className={`w-full min-h-[52px] p-3 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
                        selectedNewRole === r.id
                          ? 'bg-blue-800 text-white border-blue-900 shadow-2xs'
                          : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{r.label}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                              selectedNewRole === r.id
                                ? 'bg-blue-950 text-amber-300'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {r.badge}
                          </span>
                        </div>
                        <p className={`text-[11px] leading-relaxed ${selectedNewRole === r.id ? 'text-blue-100' : 'text-slate-600'}`}>
                          {r.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRoleTargetUser(null)}
                  className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={mutationRole.isPending}
                  onClick={() => {
                    if (roleTargetUser.id) {
                      mutationRole.mutate({
                        id: roleTargetUser.id,
                        role: selectedNewRole,
                      });
                    }
                  }}
                  className="min-h-[44px] px-5 py-2 bg-blue-800 hover:bg-blue-700 active:bg-blue-900 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4 text-amber-300" />
                  <span>{mutationRole.isPending ? 'Menyimpan...' : 'Terapkan Role'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD PENGGUNA */}
      {resetTargetUser && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-reset-title"
        >
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-700 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-amber-300" />
                <h3 id="admin-reset-title" className="text-base font-bold">Reset Kata Sandi Akun</h3>
              </div>
              <button
                onClick={() => setResetTargetUser(null)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 hover:text-white rounded-lg transition-colors"
                aria-label="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-800">
              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                  Target Akun Pengguna
                </span>
                <p className="text-sm font-bold text-slate-900">{resetTargetUser.nama}</p>
                <p className="text-xs font-mono text-slate-600">Username: @{resetTargetUser.username}</p>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Kata Sandi Baru
                </label>
                <input
                  type="text"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  placeholder="Masukkan kata sandi baru..."
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[10px] text-slate-500">Minimal 4 karakter.</p>
                  <button
                    type="button"
                    onClick={() => setResetPasswordVal('12345678')}
                    className="text-[11px] font-bold text-blue-800 hover:underline"
                  >
                    Gunakan Standar: 12345678
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={mutationResetPassword.isPending}
                  onClick={() => {
                    if (!resetPasswordVal.trim()) {
                      alert('Kata sandi tidak boleh kosong');
                      return;
                    }
                    if (resetTargetUser.id) {
                      mutationResetPassword.mutate({
                        id: resetTargetUser.id,
                        newPassword: resetPasswordVal.trim(),
                      });
                    }
                  }}
                  className="min-h-[44px] px-5 py-2 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Key className="w-4 h-4 text-amber-200" />
                  <span>{mutationResetPassword.isPending ? 'Mereset...' : 'Simpan Sandi Baru'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
    </div>
  );
};
