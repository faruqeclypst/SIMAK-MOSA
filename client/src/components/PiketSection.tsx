import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  UserX,
  UserCheck,
  Plus,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  Search,
  LayoutGrid, Users, ExternalLink, Printer,
  Save,
  RefreshCw,
  Trash2,
  Edit3,
  X,
  Check,
  Filter,
} from 'lucide-react';
import {
  fetchEarlyWarning,
  EarlyWarningItem,
  fetchPiketIzin,
  simpanPiketIzin,
  hapusPiketIzin,
  fetchGuruBerhalangan,
  simpanGuruBerhalangan,
  hapusGuruBerhalangan,
  fetchPiketMatriks,
  simpanPiketMatriks,
  fetchAdminJadwal,
  fetchKelas,
  fetchSiswa,
  fetchGuru,
  IzinEntry,
  GuruBerhalanganEntry
} from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';

export const PiketSection: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState<'izin' | 'guru' | 'matriks'>('izin');

  // State for recording student permission
  const [selectedKelas, setSelectedKelas] = useState('X-1');
  const [selectedSiswa, setSelectedSiswa] = useState<string[]>([]);
  const [keteranganIzin, setKeteranganIzin] = useState('Izin Keluar Kampus');
  const [catatanIzin, setCatatanIzin] = useState('');
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  // State for recording teacher absence & delegation
  const [selectedGuru, setSelectedGuru] = useState('');
  const [statusGuru, setStatusGuru] = useState('Dinas Luar');
  const [catatanGuru, setCatatanGuru] = useState('');
  const [linkTugas, setLinkTugas] = useState('');
  const [guruPengganti, setGuruPengganti] = useState('');
  const [statusPenanganan, setStatusPenanganan] = useState<'Tugas Mandiri' | 'Guru Inval' | 'Jam Kosong'>('Tugas Mandiri');
  const [isBeritaAcaraOpen, setIsBeritaAcaraOpen] = useState(false);

  // Queries
  const { data: kelasList = [] } = useQuery({ queryKey: ['kelas'], queryFn: fetchKelas });
  const { data: rawSiswa = [] } = useQuery({
    queryKey: ['siswa', selectedKelas],
    queryFn: () => fetchSiswa(selectedKelas) as Promise<string[]>,
    enabled: !!selectedKelas,
  });
  const siswaList: string[] = Array.isArray(rawSiswa) ? rawSiswa : [];

  const { data: guruList = [] } = useQuery({ queryKey: ['guru'], queryFn: fetchGuru });
  const { data: daftarIzin = [], isLoading: isLoadingIzin } = useQuery({
    queryKey: ['piketIzin'],
    queryFn: fetchPiketIzin,
  });
  const { data: daftarGuruBerhalangan = [], isLoading: isLoadingGuru } = useQuery({
    queryKey: ['guruBerhalangan'],
    queryFn: fetchGuruBerhalangan,
  });

  // Matriks Query & State
  const { data: serverMatriks = {}, isLoading: isLoadingMatriks } = useQuery({
    queryKey: ['piketMatriks'],
    queryFn: fetchPiketMatriks,
  });

  const { data: allAdminJadwal = [] } = useQuery({
    queryKey: ['adminJadwalAll'],
    queryFn: () => fetchAdminJadwal({}),
  });

  const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayDay = HARI_INDONESIA[new Date().getDay()];

  // Filter ketat hanya 18 rombel resmi SMAN Modal Bangsa (X-1 s/d XII-6)
  const officialClasses = React.useMemo(() => {
    return (kelasList || [])
      .filter((k) => /^X(I{0,2})-[1-6]$/.test(k.nama))
      .sort((a, b) => {
        const parse = (name: string) => {
          const parts = name.split('-');
          const roman = parts[0];
          const num = parseInt(parts[1] || '0', 10);
          const level = roman === 'X' ? 1 : roman === 'XI' ? 2 : 3;
          return level * 100 + num;
        };
        return parse(a.nama) - parse(b.nama);
      });
  }, [kelasList]);

  // Filter tingkat rombel & pencarian matriks
  const [tingkatFilter, setTingkatFilter] = useState<'ALL' | 'X' | 'XI' | 'XII'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState<'view' | 'sheet'>('view');

  // Modal edit cepat per sel
  const [editingCell, setEditingCell] = useState<{
    kelas: string;
    jamKey: string;
    jamLabel: string;
    jamTime: string;
    currentVal: string;
  } | null>(null);
  const [tempCellValue, setTempCellValue] = useState('');

  const [localMatriks, setLocalMatriks] = useState<Record<string, Record<string, string>>>({});
  const [isMatriksInitialized, setIsMatriksInitialized] = useState(false);

  // Early Warning System Query (Refresh every 30s)
  const { data: earlyWarning, refetch: refetchEW } = useQuery({
    queryKey: ['earlyWarning'],
    queryFn: () => fetchEarlyWarning(),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (serverMatriks && Object.keys(serverMatriks).length > 0 && !isMatriksInitialized) {
      setLocalMatriks(serverMatriks);
      setIsMatriksInitialized(true);
    }
  }, [serverMatriks, isMatriksInitialized]);

  // Mutations
  const mutationIzin = useMutation({
    mutationFn: (data: { kelas: string; siswa: string[]; status?: string; keterangan: string }) =>
      simpanPiketIzin(data.kelas, data.siswa, data.status, data.keterangan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['piketIzin'] });
      queryClient.invalidateQueries({ queryKey: ['rekapIzin'] });
      setAlertMsg('Surat izin siswa berhasil dicatat dan disinkronkan ke sistem.');
      setSelectedSiswa([]);
      setCatatanIzin('');
      setTimeout(() => setAlertMsg(null), 3000);
    },
  });

  const mutationHapusIzin = useMutation({
    mutationFn: (id?: string) => hapusPiketIzin(id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['piketIzin'] });
      queryClient.invalidateQueries({ queryKey: ['rekapIzin'] });
      setAlertMsg('Surat izin siswa berhasil dibatalkan.');
      setTimeout(() => setAlertMsg(null), 3000);
    },
  });

  const mutationGuru = useMutation({
    mutationFn: (data: {
      namaGuru: string;
      status: string;
      catatan: string;
      linkTugas?: string;
      guruPengganti?: string;
      statusPenanganan?: string;
    }) =>
      simpanGuruBerhalangan(
        data.namaGuru,
        data.status,
        data.catatan,
        data.linkTugas,
        data.guruPengganti,
        data.statusPenanganan
      ),
    onSuccess: (_resp, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guruBerhalangan'] });
      queryClient.invalidateQueries({ queryKey: ['piketMatriks'] });

      // Otomatis sinkronkan guru berhalangan ke Matriks KBM hari ini
      const nextMatriks = { ...localMatriks };
      const affectedClasses: string[] = [];

      const todayJadwalGuru = allAdminJadwal.filter(
        (j) =>
          j.hari?.toLowerCase() === todayDay.toLowerCase() &&
          j.nama_guru?.toLowerCase().trim() === variables.namaGuru.toLowerCase().trim()
      );

      todayJadwalGuru.forEach((j) => {
        if (j.nama_kelas && j.jam_ke) {
          if (!nextMatriks[j.nama_kelas]) nextMatriks[j.nama_kelas] = {};
          const shortName = variables.namaGuru.split(',')[0].split(' ')[0] || 'Guru';
          const val = `Tugas: ${shortName} (${variables.status})`;
          const jamParts = j.jam_ke.split(',').map((p: string) => p.trim());
          jamParts.forEach((jp: string) => {
            const jamNum = parseInt(jp.replace(/\D/g, ''));
            if (jamNum && jamNum <= (isJumat ? 6 : 8)) {
              nextMatriks[j.nama_kelas][`jam_${jamNum}`] = val;
              if (!affectedClasses.includes(j.nama_kelas)) affectedClasses.push(j.nama_kelas);
            }
          });
        }
      });

      if (affectedClasses.length > 0) {
        setLocalMatriks(nextMatriks);
        mutationMatriks.mutate(nextMatriks);
        setAlertMsg(
          `Pencatatan ${variables.namaGuru} berhalangan (${variables.status}) berhasil disimpan dan otomatis masuk ke Matriks KBM (Kelas ${affectedClasses.join(', ')}).`
        );
      } else {
        setAlertMsg(`Pencatatan ${variables.namaGuru} berhalangan hadir (${variables.status}) berhasil disimpan.`);
      }

      setSelectedGuru('');
      setCatatanGuru('');
      setTimeout(() => setAlertMsg(null), 4000);
    },
    onError: (err: any) => {
      setAlertMsg(`Gagal menyimpan data guru berhalangan: ${err.message || 'Terjadi kesalahan'}`);
      setTimeout(() => setAlertMsg(null), 5000);
    },
  });

  const mutationHapusGuru = useMutation({
    mutationFn: (id?: string) => hapusGuruBerhalangan(id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guruBerhalangan'] });
      queryClient.invalidateQueries({ queryKey: ['piketMatriks'] });
      setAlertMsg('Catatan guru berhalangan berhasil dihapus.');
      setTimeout(() => setAlertMsg(null), 3000);
    },
    onError: (err: any) => {
      setAlertMsg(`Gagal membatalkan catatan guru berhalangan: ${err.message || 'Terjadi kesalahan'}`);
      setTimeout(() => setAlertMsg(null), 5000);
    },
  });

  const mutationMatriks = useMutation({
    mutationFn: (data: Record<string, Record<string, string>>) => simpanPiketMatriks(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['piketMatriks'] });
      setAlertMsg('Matriks pemantauan KBM berhasil disimpan ke database.');
      setTimeout(() => setAlertMsg(null), 3000);
    },
    onError: (err: any) => {
      setAlertMsg(`Gagal menyimpan matriks KBM: ${err.message || 'Terjadi kesalahan'}`);
      setTimeout(() => setAlertMsg(null), 5000);
    },
  });

  const isJumat = todayDay.toLowerCase() === 'jumat';
  const isSenin = todayDay.toLowerCase() === 'senin';

  const matriksColumns = [
    { key: 'jam_1', label: isSenin ? 'Jam 1 (Upacara)' : 'Jam 1', time: '07:30 - 08:10' },
    { key: 'jam_2', label: 'Jam 2', time: '08:10 - 08:50' },
    { key: 'jam_3', label: 'Jam 3', time: '08:50 - 09:30' },
    { key: 'jam_4', label: 'Jam 4', time: '09:30 - 10:10' },
    { key: 'jam_5', label: 'Jam 5', time: '10:30 - 11:10' },
    { key: 'jam_6', label: 'Jam 6', time: '11:10 - 11:50' },
    ...(!isJumat
      ? [
          { key: 'jam_7', label: 'Jam 7', time: '11:50 - 12:30' },
          { key: 'jam_8', label: 'Jam 8', time: '12:30 - 13:10' },
        ]
      : []),
  ];

  const handleCellChange = (kelas: string, jamKey: string, val: string) => {
    setLocalMatriks((prev) => ({
      ...prev,
      [kelas]: {
        ...(prev[kelas] || {}),
        [jamKey]: val,
      },
    }));
  };

  const handleSyncFromSchedule = () => {
    const todayJadwal = allAdminJadwal.filter(
      (j) => j.hari?.toLowerCase() === todayDay.toLowerCase()
    );
    const nextMatriks = { ...localMatriks };
    officialClasses.forEach((k) => {
      if (!nextMatriks[k.nama]) nextMatriks[k.nama] = {};
    });

    let countTugas = 0;
    todayJadwal.forEach((j) => {
      if (j.nama_kelas && j.jam_ke) {
        if (!nextMatriks[j.nama_kelas]) nextMatriks[j.nama_kelas] = {};
        const jamParts = j.jam_ke.split(',').map((p: string) => p.trim());

        // Periksa apakah guru pengampu berhalangan hadir hari ini
        const guruAbsent = daftarGuruBerhalangan.find((g) => {
          if (!g.namaGuru || !j.nama_guru) return false;
          const a = g.namaGuru.toLowerCase().trim();
          const b = j.nama_guru.toLowerCase().trim();
          return a === b || a.includes(b) || b.includes(a);
        });

        const shortName = j.nama_guru
          ? j.nama_guru.split(',')[0].split(' ')[0]
          : 'Guru';

        jamParts.forEach((jp: string) => {
          const jamNum = parseInt(jp.replace(/\D/g, ''), 10);
          if (jamNum && jamNum <= (isJumat ? 6 : 8)) {
            const key = `jam_${jamNum}`;
            if (guruAbsent) {
              nextMatriks[j.nama_kelas][key] = `Tugas: ${shortName} (${guruAbsent.status})`;
              countTugas++;
            } else {
              nextMatriks[j.nama_kelas][key] = `${shortName} (${j.mapel || 'KBM'})`;
            }
          }
        });
      }
    });

    setLocalMatriks(nextMatriks);
    setAlertMsg(
      `Jadwal KBM hari ${todayDay} (${isJumat ? '6 JP' : '8 JP'}) berhasil diterapkan ke matriks${
        countTugas > 0 ? ` (termasuk ${countTugas} jam tugas mandiri guru berhalangan)` : ''
      }. Klik "Simpan Matriks KBM" untuk menyimpan permanen.`
    );
    setTimeout(() => setAlertMsg(null), 5000);
  };

  // Statistik KBM Hari Ini
  const stats = React.useMemo(() => {
    let totalSlots = 0;
    let terisi = 0;
    let tugas = 0;
    let kosong = 0;

    officialClasses.forEach((k) => {
      const row = localMatriks[k.nama] || {};
      matriksColumns.forEach((col) => {
        totalSlots++;
        const val = row[col.key] || '';
        if (!val || val === '-') {
          kosong++;
        } else if (val.toLowerCase().includes('tugas')) {
          tugas++;
        } else {
          terisi++;
        }
      });
    });

    return { totalSlots, terisi, tugas, kosong, totalKelas: officialClasses.length };
  }, [officialClasses, localMatriks, matriksColumns]);

  // Filter kelas berdasarkan Tingkat & Pencarian
  const filteredClasses = React.useMemo(() => {
    return officialClasses.filter((k) => {
      if (tingkatFilter === 'X' && !k.nama.startsWith('X-')) return false;
      if (tingkatFilter === 'XI' && !k.nama.startsWith('XI-')) return false;
      if (tingkatFilter === 'XII' && !k.nama.startsWith('XII-')) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchKelas = k.nama.toLowerCase().includes(q);
        const row = localMatriks[k.nama] || {};
        const matchContent = Object.values(row).some(
          (v) => typeof v === 'string' && v.toLowerCase().includes(q)
        );
        if (!matchKelas && !matchContent) return false;
      }

      return true;
    });
  }, [officialClasses, tingkatFilter, searchQuery, localMatriks]);

  const openEditModal = (
    kelas: string,
    jamKey: string,
    jamLabel: string,
    jamTime: string,
    val: string
  ) => {
    setEditingCell({
      kelas,
      jamKey,
      jamLabel,
      jamTime,
      currentVal: val || '',
    });
    setTempCellValue(val || '');
  };

  const handleSaveCellDirect = (newVal: string) => {
    if (!editingCell) return;
    handleCellChange(editingCell.kelas, editingCell.jamKey, newVal);
    setEditingCell(null);
  };

  const scheduledForEditingCell = React.useMemo(() => {
    if (!editingCell) return null;
    const jamNum = parseInt(editingCell.jamKey.replace(/\D/g, ''), 10);
    return allAdminJadwal.find((j) => {
      if (j.hari?.toLowerCase() !== todayDay.toLowerCase()) return false;
      if (j.nama_kelas !== editingCell.kelas) return false;
      if (!j.jam_ke) return false;
      const parts = j.jam_ke.split(',').map((p: string) => parseInt(p.replace(/\D/g, ''), 10));
      return parts.includes(jamNum);
    });
  }, [editingCell, allAdminJadwal, todayDay]);

  const handleToggleSiswa = (nama: string) => {
    setSelectedSiswa((prev) =>
      prev.includes(nama) ? prev.filter((s) => s !== nama) : [...prev, nama]
    );
  };

  const handleKirimIzin = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSiswa.length === 0) return alert('Silakan pilih minimal 1 siswa');
    const fullKet = catatanIzin.trim()
      ? `${keteranganIzin}: ${catatanIzin.trim()}`
      : keteranganIzin;

    let statusEnum = 'Izin';
    const low = keteranganIzin.toLowerCase();
    if (low.includes('dispensasi')) statusEnum = 'Dispensasi';
    else if (low.includes('sakit') || low.includes('uks')) statusEnum = 'Sakit';
    else if (low.includes('pulang')) statusEnum = 'Izin Pulang';
    else if (low.includes('keluarga')) statusEnum = 'Izin Keluarga';

    mutationIzin.mutate({
      kelas: selectedKelas,
      siswa: selectedSiswa,
      status: statusEnum,
      keterangan: fullKet,
    });
  };

  const handleKirimGuru = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuru) return alert('Pilih nama guru terlebih dahulu');
    mutationGuru.mutate({
      namaGuru: selectedGuru,
      status: statusGuru,
      catatan: catatanGuru.trim() || 'Tugas mandiri diberikan kepada siswa',
      linkTugas: linkTugas.trim() || undefined,
      guruPengganti: guruPengganti.trim() || undefined,
      statusPenanganan: statusPenanganan,
    });
    setLinkTugas('');
    setGuruPengganti('');
    setStatusPenanganan('Tugas Mandiri');
  };

  useModalBehavior(!!editingCell, () => setEditingCell(null));

  return (
    <div className="space-y-6">
      {/* Subtab Segmented Controls */}
      <div className="bg-white p-2 sm:p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-2 overflow-x-auto">
        {[
          { id: 'izin', label: '1. Izin & Dispensasi Siswa', count: daftarIzin.length, icon: ShieldCheck },
          { id: 'guru', label: '2. Guru Berhalangan Hadir', count: daftarGuruBerhalangan.length, icon: UserX },
          { id: 'matriks', label: `3. Matriks Pemantauan KBM (${isJumat ? 'Jam 1 - 6' : 'Jam 1 - 8'})`, count: '18 Rombel', icon: LayoutGrid },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2.5 transition-all shrink-0 ${
                isActive
                  ? 'bg-blue-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isActive
                    ? 'bg-blue-950/60 text-amber-300'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsBeritaAcaraOpen(true)}
          className="min-h-[44px] ml-auto px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-900 hover:bg-blue-900 text-white flex items-center gap-2 transition-all shadow-2xs shrink-0 cursor-pointer"
          title="Cetak Berita Acara Harian KBM Resmi untuk Arsip Sekolah"
        >
          <Printer className="w-4 h-4 text-amber-300" />
          <span className="hidden sm:inline">Cetak Berita Acara KBM</span>
          <span className="sm:hidden">Berita Acara</span>
        </button>
      </div>

      {alertMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{alertMsg}</span>
        </div>
      )}

      {/* Subtab 1: Izin & Dispensasi Siswa */}
      {activeSubTab === 'izin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 1 Col: Form Penerbitan Izin */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Catat Izin Siswa Baru
              </h3>
              <p className="text-xs text-slate-500">
                Data otomatis terhubung ke jurnal guru mapel dan presensi sekolah.
              </p>
            </div>

            <form onSubmit={handleKirimIzin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Rombel / Kelas
                </label>
                <select
                  value={selectedKelas}
                  onChange={(e) => {
                    setSelectedKelas(e.target.value);
                    setSelectedSiswa([]);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                >
                  {kelasList.map((k) => (
                    <option key={k.nama} value={k.nama}>
                      Kelas {k.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Kategori Izin
                </label>
                <select
                  value={keteranganIzin}
                  onChange={(e) => setKeteranganIzin(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="Izin Keluar Kampus">Izin Keluar Kampus (Urusan Keluarga)</option>
                  <option value="Sakit / Berobat">Sakit / Berobat di Luar Kampus</option>
                  <option value="Dispensasi Lomba">Dispensasi Lomba / Olimpiade</option>
                  <option value="Dispensasi Organisasi">Dispensasi Kegiatan Sekolah / OSIS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Pilih Siswa ({selectedSiswa.length} Dipilih)
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 divide-y divide-slate-100 bg-slate-50 text-xs">
                  {siswaList.map((siswa) => {
                    const isSelected = selectedSiswa.includes(siswa);
                    return (
                      <button
                        type="button"
                        key={siswa}
                        onClick={() => handleToggleSiswa(siswa)}
                        className={`w-full min-h-[38px] px-3 py-2 text-left rounded-lg flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-blue-800 text-white font-semibold'
                            : 'hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        <span className="truncate">{siswa}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={catatanIzin}
                  onChange={(e) => setCatatanIzin(e.target.value)}
                  placeholder="Contoh: Menghadiri olimpiade matematika tingkat provinsi"
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>

              <button
                type="submit"
                disabled={mutationIzin.isPending}
                className="w-full min-h-[44px] bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
              >
                {mutationIzin.isPending ? 'Menyimpan...' : 'Terbitkan Izin Piket'}
              </button>
            </form>
          </div>

          {/* Right 2 Cols: Log Izin Siswa Terbit */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Daftar Izin & Dispensasi Aktif Hari Ini
                </h3>
                <p className="text-xs text-slate-500">
                  Total {daftarIzin.length} siswa terdata izin dari pos piket sekolah.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs divide-y divide-slate-100">
              {isLoadingIzin ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Memuat daftar izin piket...
                </div>
              ) : daftarIzin.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-700">Belum ada izin siswa hari ini</p>
                  <p>Semua siswa berada di area kampus dan mengikuti KBM reguler.</p>
                </div>
              ) : (
                daftarIzin.map((item, idx) => (
                  <div key={item.id || idx} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 truncate">
                          {item.namaSiswa}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded font-bold text-[11px]">
                          {item.kelas}
                        </span>
                        {item.status && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-bold text-[10px]">
                            {item.status}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        Keterangan: <span className="font-medium text-slate-800">{item.keterangan}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[11px] font-mono text-slate-400 block">
                          {item.tanggal}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                          Pos Piket
                        </span>
                      </div>
                      {item.id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Batalkan izin piket untuk ${item.namaSiswa}?`)) {
                              mutationHapusIzin.mutate(item.id);
                            }
                          }}
                          disabled={mutationHapusIzin.isPending}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Batalkan Izin Siswa"
                          aria-label="Batalkan Izin Siswa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subtab 2: Guru Berhalangan Hadir */}
      {activeSubTab === 'guru' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Form */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Pencatatan Guru Berhalangan
              </h3>
              <p className="text-xs text-slate-500">
                Piket mendata guru dinas luar atau izin sakit untuk koordinasi tugas mandiri.
              </p>
            </div>

            <form onSubmit={handleKirimGuru} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Nama Guru
                </label>
                <select
                  value={selectedGuru}
                  onChange={(e) => setSelectedGuru(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                  required
                >
                  <option value="">Pilih Guru Pengampu...</option>
                  {guruList.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Status Berhalangan
                </label>
                <select
                  value={statusGuru}
                  onChange={(e) => setStatusGuru(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="Dinas Luar">Dinas Luar / Pelatihan</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Cuti / Urusan Keluarga">Cuti / Urusan Keluarga</option>
                  <option value="Tugas Pengawas / Pembina">Tugas Pengawas / Pembina Lomba</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Tugas Pengganti / Catatan KBM
                </label>
                <textarea
                  rows={2}
                  value={catatanGuru}
                  onChange={(e) => setCatatanGuru(e.target.value)}
                  placeholder="Contoh: Modul latihan Bab 4 dibagikan oleh guru piket di kelas X-1..."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Pola Penanganan KBM
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusPenanganan('Tugas Mandiri')}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      statusPenanganan === 'Tugas Mandiri'
                        ? 'bg-amber-100 text-amber-950 border-amber-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tugas Mandiri
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusPenanganan('Guru Inval')}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      statusPenanganan === 'Guru Inval'
                        ? 'bg-blue-100 text-blue-950 border-blue-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tugaskan Guru Inval
                  </button>
                </div>
              </div>

              {statusPenanganan === 'Guru Inval' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Pilih Guru Pengganti (Guru Inval)
                  </label>
                  <select
                    value={guruPengganti}
                    onChange={(e) => setGuruPengganti(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                  >
                    <option value="">-- Pilih Guru Pengganti --</option>
                    {guruList.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Tautan Modul / Tugas (Google Drive / ExamKu)
                </label>
                <input
                  type="url"
                  value={linkTugas}
                  onChange={(e) => setLinkTugas(e.target.value)}
                  placeholder="https://drive.google.com/... atau link latihan"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <button
                type="submit"
                disabled={mutationGuru.isPending}
                className="w-full min-h-[44px] bg-blue-800 hover:bg-blue-900 active:bg-blue-950 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <UserX className="w-4 h-4 text-amber-300" />
                <span>{mutationGuru.isPending ? 'Menyimpan...' : 'Simpan Guru Berhalangan Hadir'}</span>
              </button>
            </form>
          </div>

          {/* Right Log */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Daftar Guru Berhalangan Hari Ini
              </h3>
              <p className="text-xs text-slate-500">
                Pencatatan resmi absensi pendidik dan ketersediaan bahan ajar mandiri.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs divide-y divide-slate-100">
              {isLoadingGuru ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Memuat data guru berhalangan...
                </div>
              ) : daftarGuruBerhalangan.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                  <UserCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-slate-700">Seluruh Guru Hadir Lengkap</p>
                  <p>Tidak ada pendidik yang berhalangan mengajar hari ini.</p>
                </div>
              ) : (
                daftarGuruBerhalangan.map((item, idx) => (
                  <div key={item.id || idx} className="py-3 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm">{item.namaGuru}</h4>
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px] mt-1">
                        {item.status}
                      </span>
                      <p className="text-slate-600 mt-1">
                        Catatan Tugas: {item.catatan || 'Tugas ajar mandiri'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.tanggal}
                      </span>
                      {item.id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Hapus catatan guru berhalangan untuk ${item.namaGuru}?`)) {
                              mutationHapusGuru.mutate(item.id);
                            }
                          }}
                          disabled={mutationHapusGuru.isPending}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus Catatan Guru Berhalangan"
                          aria-label="Hapus Catatan Guru Berhalangan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subtab 3: Matriks Pemantauan KBM (Jam 1 s/d Jam 8) */}
      {activeSubTab === 'matriks' && (
        <div className="space-y-4">
          {/* Early Warning System Banner */}
          {earlyWarning && (
            <div
              className={`p-4 rounded-2xl border transition-all ${
                earlyWarning.warningsCount > 0
                  ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      earlyWarning.warningsCount > 0
                        ? 'bg-amber-200 text-amber-900 border border-amber-300'
                        : 'bg-emerald-200 text-emerald-900 border border-emerald-300'
                    }`}
                  >
                    {earlyWarning.warningsCount > 0 ? (
                      <AlertCircle className="w-5 h-5 text-amber-800" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-800" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                        Early Warning Pemantauan KBM
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 border border-slate-200 text-slate-700">
                        {earlyWarning.statusText}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {earlyWarning.warningsCount > 0
                        ? `Terdeteksi ${earlyWarning.warningsCount} rombel yang belum terverifikasi KBM pada jam aktif ini. Segera tindak lanjuti ke ruang kelas.`
                        : 'Seluruh rombel yang memiliki jadwal pelajaran hari ini terpantau aman dan terverifikasi.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => refetchEW()}
                  className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-700" />
                  <span>Perbarui Cek</span>
                </button>
              </div>

              {earlyWarning.warningsCount > 0 && (
                <div className="mt-3 pt-3 border-t border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {earlyWarning.warnings.map((w: EarlyWarningItem, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-amber-200 rounded-xl text-xs space-y-1.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-amber-950 font-black">Kelas {w.kelas}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                          JP {w.jp}
                        </span>
                      </div>
                      <p className="text-slate-800 font-bold truncate">{w.mapel}</p>
                      <p className="text-slate-500 text-[11px] truncate">Jadwal: {w.namaGuru}</p>
                      <button
                        type="button"
                        onClick={() =>
                          openEditModal(w.kelas, `jam_${w.jp}`, `Jam ${w.jp}`, earlyWarning.jpTime, '')
                        }
                        className="w-full mt-1 py-1.5 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold text-center transition-colors shadow-2xs"
                      >
                        + Tangani / Isi KBM
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Matriks Action Bar & Title */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                  <LayoutGrid className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Matriks Pemantauan KBM Hari Ini ({todayDay})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Pantau keterisian pendidik dan ketertiban KBM seluruh rombel dari {isJumat ? 'Jam 1 s/d Jam 6 (Jumat)' : 'Jam 1 s/d Jam 8'} (1 JP = 40 menit, istirahat 20 menit setelah JP 4).
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleSyncFromSchedule}
                className="min-h-[40px] px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors border border-slate-200/80"
                title="Terapkan jadwal pelajaran yang terdaftar hari ini"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-700" />
                <span>Sinkron Jadwal Hari Ini</span>
              </button>

              <button
                type="button"
                onClick={() => mutationMatriks.mutate(localMatriks)}
                disabled={mutationMatriks.isPending}
                className="min-h-[40px] px-4 py-1.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-amber-300" />
                <span>{mutationMatriks.isPending ? 'Menyimpan...' : 'Simpan Matriks KBM'}</span>
              </button>
            </div>
          </div>

          {/* Quick Summary Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center font-bold text-xs shrink-0">
                {stats.totalKelas}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Total Rombel</p>
                <p className="text-xs font-extrabold text-slate-900 truncate">18 Kelas Resmi</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                {stats.terisi}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">KBM Guru Hadir</p>
                <p className="text-xs font-extrabold text-emerald-950 truncate">{stats.terisi} Jam Aktif</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                {stats.tugas}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold tracking-wider text-amber-700">Tugas Mandiri</p>
                <p className="text-xs font-extrabold text-amber-950 truncate">{stats.tugas} Jam Ditinggal</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                {stats.kosong}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Belum Terisi</p>
                <p className="text-xs font-extrabold text-slate-700 truncate">{stats.kosong} Jam Kosong</p>
              </div>
            </div>
          </div>

          {/* Filter Bar: Tingkat, Search, & View Mode */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Tingkat Filter Buttons */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80 overflow-x-auto">
              {[
                { id: 'ALL', label: `Semua Rombel (${officialClasses.length})` },
                { id: 'X', label: 'Kelas X' },
                { id: 'XI', label: 'Kelas XI' },
                { id: 'XII', label: 'Kelas XII' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTingkatFilter(f.id as any)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    tingkatFilter === f.id
                      ? 'bg-white text-blue-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Right Controls: Search + Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="relative flex-1 sm:flex-initial sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kelas, guru, mapel..."
                  className="w-full min-h-[38px] pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Bersihkan pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* View Mode Toggle */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditMode('view')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    editMode === 'view'
                      ? 'bg-white text-blue-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                  title="Mode tinjau: tampilan rapi dan terstruktur untuk pemantauan"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mode Tinjau Rapi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode('sheet')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    editMode === 'sheet'
                      ? 'bg-white text-blue-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                  title="Mode spreadsheet: form input cepat per sel untuk mengetik langsung"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mode Spreadsheet</span>
                </button>
              </div>
            </div>
          </div>

          {/* Matriks Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th scope="col" className="p-3 font-bold sticky left-0 z-20 bg-slate-900 min-w-[85px] shadow-sm border-r border-slate-800">
                      Kelas
                    </th>
                    {matriksColumns.map((h) => (
                      <th key={h.key} scope="col" className="p-2.5 font-bold min-w-[135px] text-center border-r border-slate-800 last:border-r-0">
                        <div className="font-bold text-slate-100 whitespace-nowrap">{h.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 whitespace-nowrap">{h.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredClasses.length === 0 ? (
                    <tr>
                      <td colSpan={matriksColumns.length + 1} className="p-8 text-center text-xs text-slate-400">
                        Tidak ada rombel yang sesuai dengan filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredClasses.map((k) => {
                      const rowData = localMatriks[k.nama] || {};
                      return (
                        <tr key={k.nama} className="hover:bg-slate-50/70 transition-colors">
                          {/* Sticky Kelas Badge */}
                          <td className="p-2.5 font-bold text-slate-900 sticky left-0 z-10 bg-white shadow-xs border-r border-slate-100">
                            <span className="inline-flex items-center justify-center min-w-[42px] px-2 h-8 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 text-xs font-black">
                              {k.nama}
                            </span>
                          </td>

                          {/* Jam Columns */}
                          {matriksColumns.map((col) => {
                            const jamKey = col.key;
                            const val = rowData[jamKey] || '';
                            const isTugas = val.toLowerCase().includes('tugas');
                            const isKosong = !val || val === '-';
                            const isHadir = !isTugas && !isKosong;

                            return (
                              <td key={jamKey} className="p-1.5 min-w-[135px] align-middle">
                                {editMode === 'view' ? (
                                  /* Mode Tinjau: Card Interaktif Rapi */
                                  isKosong ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(k.nama, col.key, col.label, col.time, val)}
                                      className="w-full min-h-[46px] p-1.5 rounded-xl border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-center flex flex-col items-center justify-center group focus-visible:ring-2 focus-visible:ring-blue-700"
                                      title={`Klik untuk mengisi KBM ${k.nama} ${col.label}`}
                                    >
                                      <span className="text-[11px] text-slate-300 group-hover:hidden">-</span>
                                      <span className="hidden group-hover:inline-flex items-center gap-1 text-[11px] font-bold text-blue-800">
                                        <Plus className="w-3 h-3" /> Isi
                                      </span>
                                    </button>
                                  ) : isTugas ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(k.nama, col.key, col.label, col.time, val)}
                                      className="w-full min-h-[46px] p-2 rounded-xl bg-amber-50 border border-amber-200 text-left hover:border-amber-400 hover:shadow-2xs transition-all flex flex-col justify-between group focus-visible:ring-2 focus-visible:ring-amber-600"
                                      title={val}
                                    >
                                      <div className="flex items-center justify-between gap-1 w-full">
                                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-amber-800 flex items-center gap-1">
                                          <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                          Tugas
                                        </span>
                                        <Edit3 className="w-3 h-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                      <span className="text-[11px] font-bold text-amber-950 truncate max-w-[130px] leading-tight mt-0.5">
                                        {val.replace(/^tugas:\s*/i, '')}
                                      </span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(k.nama, col.key, col.label, col.time, val)}
                                      className="w-full min-h-[46px] p-2 rounded-xl bg-emerald-50/80 border border-emerald-200 text-left hover:border-emerald-400 hover:shadow-2xs transition-all flex flex-col justify-between group focus-visible:ring-2 focus-visible:ring-emerald-700"
                                      title={val}
                                    >
                                      <div className="flex items-center justify-between gap-1 w-full">
                                        <span className="text-[9px] font-bold text-emerald-800 flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                          KBM
                                        </span>
                                        <Edit3 className="w-3 h-3 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-900 truncate max-w-[130px] leading-tight mt-0.5">
                                        {val}
                                      </span>
                                    </button>
                                  )
                                ) : (
                                  /* Mode Spreadsheet: Fast Inputs */
                                  <input
                                    type="text"
                                    value={val}
                                    onChange={(e) => handleCellChange(k.nama, jamKey, e.target.value)}
                                    placeholder="-"
                                    className={`w-full px-2 py-2 text-[11px] rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-blue-700 ${
                                      isTugas
                                        ? 'bg-amber-50 text-amber-950 border-amber-300 font-semibold'
                                        : isHadir
                                        ? 'bg-emerald-50 text-emerald-950 border-emerald-300 font-medium'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                    }`}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Legend */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-700">KBM Guru Hadir</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-semibold text-slate-700">Tugas Mandiri</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <span className="font-semibold text-slate-700">Belum Terisi</span>
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                {editMode === 'view'
                  ? 'Klik kotak untuk mengatur atau mengisi guru secara instan.'
                  : 'Ketik langsung di kolom sel untuk pengisian cepat massal.'}
              </span>
            </div>
          </div>

          {/* Quick-Edit Modal Dialog untuk Sel Matriks */}
          {editingCell && (
            <div
              className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="piket-cell-title"
            >
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4 animate-scaleUp">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] font-black uppercase tracking-wider">
                      Kelas {editingCell.kelas}
                    </span>
                    <h4 id="piket-cell-title" className="text-base font-bold text-slate-900 mt-1">
                      Atur {editingCell.jamLabel}
                    </h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Waktu KBM: {editingCell.jamTime}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingCell(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    aria-label="Tutup"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Opsi Cepat 1: Jadwal Terdaftar Hari Ini */}
                {scheduledForEditingCell && (
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-blue-900">
                      Jadwal Resmi Hari Ini ({todayDay}):
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {scheduledForEditingCell.nama_guru}
                        </p>
                        <p className="text-[11px] text-slate-600 truncate">
                          {scheduledForEditingCell.mapel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const short = scheduledForEditingCell.nama_guru.split(',')[0].split(' ')[0] || 'Guru';
                          handleSaveCellDirect(`${short} (${scheduledForEditingCell.mapel || 'KBM'})`);
                        }}
                        className="px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-lg shrink-0 transition-colors"
                      >
                        Terapkan
                      </button>
                    </div>
                  </div>
                )}

                {/* Opsi Cepat 2: Guru Berhalangan Hadir */}
                {daftarGuruBerhalangan.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                      Tandai Tugas Guru Berhalangan:
                    </label>
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                      {daftarGuruBerhalangan.map((gb) => {
                        const short = gb.namaGuru.split(',')[0].split(' ')[0] || 'Guru';
                        const textVal = `Tugas: ${short} (${gb.status})`;
                        return (
                          <button
                            type="button"
                            key={gb.id || gb.namaGuru}
                            onClick={() => handleSaveCellDirect(textVal)}
                            className="w-full p-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-left text-xs text-amber-950 flex items-center justify-between gap-2 transition-colors"
                          >
                            <span className="font-semibold truncate">{gb.namaGuru}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-200/70 rounded text-amber-900 shrink-0">
                              {gb.status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Opsi Input Manual */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    Atau Ketik Keterangan Sendiri:
                  </label>
                  <input
                    type="text"
                    value={tempCellValue}
                    onChange={(e) => setTempCellValue(e.target.value)}
                    placeholder="Contoh: Alfaruq (Informatika) atau Tugas Mandiri"
                    className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveCellDirect(tempCellValue);
                      } else if (e.key === 'Escape') {
                        setEditingCell(null);
                      }
                    }}
                  />
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSaveCellDirect('')}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  >
                    Kosongkan Jam
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingCell(null)}
                      className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveCellDirect(tempCellValue)}
                      className="min-h-[38px] px-4 py-1.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
