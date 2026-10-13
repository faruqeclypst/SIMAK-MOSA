import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  BookOpen,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  Search,
  Check,
  Calendar,
  RotateCcw,
  Lock,
  Info,
  ShieldCheck,
} from 'lucide-react';
import {
  User,
  fetchKelas,
  fetchSiswa,
  simpanJurnal,
  fetchRekapIzinSemua,
  fetchAdminJadwal,
  fetchSemesterSettings,
  JadwalPelajaran,
  DAFTAR_MAPEL,
} from '../lib/api';
import { JAM_OPTIONS, jamPresets, calculateWaktuOtomatis } from './AdminJadwalSection';
import { useModalBehavior } from '../lib/useModalBehavior';

interface QuickJurnalModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccessToast: (msg: string) => void;
  preselect?: { kelas?: string; jam?: string[]; mapel?: string } | null;
}

const materiPilihan = [
  'Pendalaman Teori & Konsep',
  'Praktikum & Analisis Data',
  'Asesmen Formatif / Kuis Harian',
  'Diskusi Kelompok & Presentasi',
  'Pengerjaan Projek Kolaboratif',
  'Remedial & Pengayaan',
];

const parseJamList = (jamKe?: string | null): string[] => {
  if (!jamKe || typeof jamKe !== 'string') return [];
  return jamKe.split(',').map((j) => j.trim()).filter(Boolean);
};

const cleanSingleMapel = (m?: string): string => {
  if (!m) return '';
  const first = m.split(',')[0].trim();
  return first || m;
};

export const QuickJurnalModal: React.FC<QuickJurnalModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccessToast,
  preselect,
}) => {
  const queryClient = useQueryClient();
  const teacherName = user?.nama || 'Alfaruq Asri, S.Pd';

  // Teacher's assigned subjects (split by comma if multiple, e.g. Informatika, Koding...)
  const teacherMapels = useMemo(() => {
    if (!user?.mapel) return [];
    return user.mapel.split(',').map((m) => m.trim()).filter(Boolean);
  }, [user?.mapel]);

  // Active form states
  const [selectedKelas, setSelectedKelas] = useState('');
  const [selectedJam, setSelectedJam] = useState<string[]>([]);
  const [selectedMapel, setSelectedMapel] = useState<string>(() => {
    const first = (user?.mapel || '').split(',').map((m) => m.trim()).filter(Boolean)[0];
    return first || 'Informatika';
  });
  const [isCustomJamOpen, setIsCustomJamOpen] = useState(false);
  const [isCustomMapelOpen, setIsCustomMapelOpen] = useState(false);
  const [materi, setMateri] = useState('');
  const [catatan, setCatatan] = useState('KBM berlangsung tertib dan kondusif');
  const [searchSiswa, setSearchSiswa] = useState('');
  const [absensiMap, setAbsensiMap] = useState<Record<string, { status: string; info?: string }>>({});
  const [errorValidation, setErrorValidation] = useState<string | null>(null);

  // Fetch Class List
  const { data: kelasList = [] } = useQuery({
    queryKey: ['kelas'],
    queryFn: fetchKelas,
  });

  const { data: semesterSettings } = useQuery({
    queryKey: ['semesterSettings'],
    queryFn: fetchSemesterSettings,
  });

  // Fetch Teacher Schedule from Database
  const { data: dbJadwal = [], isLoading: isLoadingJadwal } = useQuery({
    queryKey: ['adminJadwal', teacherName],
    queryFn: () => fetchAdminJadwal({ guru: teacherName }),
    enabled: !!teacherName && isOpen,
  });

  // Determine current day in Indonesian
  const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayDay = HARI_INDONESIA[new Date().getDay()];
  const isJumat = todayDay.toLowerCase() === 'jumat';
  const isSenin = todayDay.toLowerCase() === 'senin';

  // Filter slots for today
  const todaySlots = useMemo(() => {
    return dbJadwal.filter((j) => j.hari?.toLowerCase() === todayDay.toLowerCase());
  }, [dbJadwal, todayDay]);

  // Current slot corresponding to selected class
  const currentClassSlot = useMemo(() => {
    if (!selectedKelas) return null;
    return (
      todaySlots.find((j) => j.nama_kelas === selectedKelas) ||
      dbJadwal.find((j) => j.nama_kelas === selectedKelas) ||
      null
    );
  }, [selectedKelas, todaySlots, dbJadwal]);

  const filteredJamOptions = useMemo(() => {
    if (isJumat) {
      return JAM_OPTIONS.filter((opt) => {
        const num = parseInt(opt.id.replace(/\D/g, '')) || 0;
        return num <= 6;
      });
    }
    return JAM_OPTIONS;
  }, [isJumat]);

  const filteredJamPresets = useMemo(() => {
    if (isJumat) {
      return jamPresets.filter((p) =>
        p.jams.every((j) => (parseInt(j.replace(/\D/g, '')) || 0) <= 6)
      );
    }
    return jamPresets;
  }, [isJumat]);

  // Synchronize class, jam, and mapel automatically when modal opens or schedule loads
  useEffect(() => {
    if (!isOpen) return;

    // 1. Explicit preselection passed from caller (e.g. clicked card in workspace)
    if (preselect?.kelas) {
      setSelectedKelas(preselect.kelas);
      const match = (
        todaySlots.find((j) => j.nama_kelas === preselect.kelas) ||
        dbJadwal.find((j) => j.nama_kelas === preselect.kelas)
      );

      if (preselect.jam && preselect.jam.length > 0) {
        setSelectedJam(preselect.jam);
      } else if (match?.jam_ke) {
        setSelectedJam(parseJamList(match.jam_ke));
      }

      // Strictly lock mapel to the schedule slot chosen
      if (preselect.mapel) {
        setSelectedMapel(cleanSingleMapel(preselect.mapel));
      } else if (match?.mapel) {
        setSelectedMapel(cleanSingleMapel(match.mapel));
      } else if (teacherMapels.length > 0) {
        setSelectedMapel(cleanSingleMapel(teacherMapels[0]));
      }
      return;
    }

    // 2. Automatically select from TODAY's scheduled slots
    if (todaySlots.length > 0) {
      const firstSlot = todaySlots[0];
      setSelectedKelas(firstSlot.nama_kelas);
      setSelectedJam(parseJamList(firstSlot.jam_ke));
      if (firstSlot.mapel) {
        setSelectedMapel(cleanSingleMapel(firstSlot.mapel));
      } else if (teacherMapels.length > 0) {
        setSelectedMapel(cleanSingleMapel(teacherMapels[0]));
      }
      return;
    }

    // 3. Automatically select from ANY configured scheduled slots for this teacher
    if (dbJadwal.length > 0) {
      const firstSlot = dbJadwal[0];
      setSelectedKelas(firstSlot.nama_kelas);
      setSelectedJam(parseJamList(firstSlot.jam_ke));
      if (firstSlot.mapel) {
        setSelectedMapel(cleanSingleMapel(firstSlot.mapel));
      } else if (teacherMapels.length > 0) {
        setSelectedMapel(cleanSingleMapel(teacherMapels[0]));
      }
      return;
    }

    // 4. Fallback if no schedules exist at all
    if (kelasList.length > 0 && !selectedKelas) {
      setSelectedKelas(kelasList[0].nama);
      setSelectedJam(['Jam 1', 'Jam 2']);
      if (teacherMapels.length > 0) setSelectedMapel(teacherMapels[0]);
    }
  }, [isOpen, preselect, dbJadwal, todaySlots, kelasList, teacherMapels]);

  // Fetch Students for selected class
  const { data: rawSiswa = [], isLoading: isLoadingSiswa } = useQuery({
    queryKey: ['siswa', selectedKelas],
    queryFn: () => fetchSiswa(selectedKelas) as Promise<string[]>,
    enabled: !!selectedKelas,
  });

  const siswaList: string[] = Array.isArray(rawSiswa) ? rawSiswa : [];

  // Today's WIB date string format "DD-MM-YYYY"
  const todayWibStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date()).replace(/\//g, '-');
  }, []);

  // Fetch Today's Permissions from Piket & Asrama for auto-sync
  const { data: rekapIzinHariIni = [] } = useQuery({
    queryKey: ['rekapIzin'],
    queryFn: () => fetchRekapIzinSemua(),
  });

  // Filter permits strictly for selected class AND strictly today
  const izinTodayInThisClass = useMemo(() => {
    if (!selectedKelas) return [];
    return rekapIzinHariIni.filter(
      (i) => i.kelas === selectedKelas && (!i.tanggal || i.tanggal === todayWibStr)
    );
  }, [rekapIzinHariIni, selectedKelas, todayWibStr]);

  // Sync permits whenever class or permit data updates
  useEffect(() => {
    if (izinTodayInThisClass.length > 0) {
      setAbsensiMap((prev) => {
        const next = { ...prev };
        izinTodayInThisClass.forEach((i) => {
          if (!next[i.namaSiswa]) {
            next[i.namaSiswa] = {
              status: i.status || 'Izin',
              info: i.asalLaporan ? `Dari ${i.asalLaporan}` : undefined,
            };
          }
        });
        return next;
      });
    }
  }, [izinTodayInThisClass]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Mutation
  const mutation = useMutation({
    mutationFn: simpanJurnal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riwayatJurnal'] });
      queryClient.invalidateQueries({ queryKey: ['kurikulum'] });
      queryClient.invalidateQueries({ queryKey: ['piketMatriks'] });
      onSuccessToast(`Jurnal KBM ${selectedKelas} (${selectedJam.join(', ')}) berhasil disimpan`);
      onClose();
      // Reset form
      setMateri('');
      setAbsensiMap({});
      setErrorValidation(null);
    },
    onError: (err: any) => {
      setErrorValidation(err.message || 'Gagal menyimpan jurnal ke database');
    },
  });

  const toggleJam = (jam: string) => {
    setSelectedJam((prev) =>
      prev.includes(jam) ? prev.filter((j) => j !== jam) : [...prev, jam]
    );
  };

  const handleSelectKelas = (newKelas: string) => {
    setSelectedKelas(newKelas);
    setAbsensiMap({});

    // Automatically synchronize jam and strictly lock mapel to this class's schedule
    const match =
      todaySlots.find((j) => j.nama_kelas === newKelas) ||
      dbJadwal.find((j) => j.nama_kelas === newKelas);

    if (match) {
      if (match.jam_ke) setSelectedJam(parseJamList(match.jam_ke));
      if (match.mapel) setSelectedMapel(cleanSingleMapel(match.mapel));
    }
  };

  const handleSelectScheduleSlot = (slot: JadwalPelajaran) => {
    setSelectedKelas(slot.nama_kelas);
    setSelectedJam(parseJamList(slot.jam_ke));
    if (slot.mapel) setSelectedMapel(cleanSingleMapel(slot.mapel));
    setAbsensiMap({});
  };

  const handleResetToScheduleJam = () => {
    if (currentClassSlot?.jam_ke) {
      setSelectedJam(parseJamList(currentClassSlot.jam_ke));
    }
  };

  const handleSetStatusSiswa = (nama: string, status: string, info?: string) => {
    setAbsensiMap((prev) => {
      const next = { ...prev };
      if (!status || status === 'Hadir') {
        delete next[nama];
      } else {
        next[nama] = { status, info };
      }
      return next;
    });
  };

  const handleResetAllHadir = () => {
    setAbsensiMap({});
  };

  const totalSiswa = siswaList.length;
  const tidakHadirCount = Object.keys(absensiMap).length;
  const hadirCount = Math.max(0, totalSiswa - tidakHadirCount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValidation(null);

    if (!selectedKelas) {
      setErrorValidation('Silakan tentukan kelas terlebih dahulu.');
      return;
    }
    if (selectedJam.length === 0) {
      setErrorValidation('Pilih minimal satu jam pelajaran.');
      return;
    }
    if (!materi.trim()) {
      setErrorValidation('Isi materi pembelajaran yang diajarkan hari ini.');
      return;
    }

    const absensiStr =
      Object.entries(absensiMap).length > 0
        ? Object.entries(absensiMap)
            .map(([nama, data]) => {
              let cleanInfo = (data.info || '').trim();
              if (cleanInfo.toLowerCase().startsWith(data.status.toLowerCase() + ':')) {
                cleanInfo = cleanInfo.substring(data.status.length + 1).trim();
              }
              return `${nama} (${data.status}${cleanInfo ? ': ' + cleanInfo : ''})`;
            })
            .join(', ')
        : 'Semua Hadir';

    mutation.mutate({
      namaGuru: teacherName,
      mapel: selectedMapel || user?.mapel || 'Informatika',
      kelas: selectedKelas,
      jam: selectedJam,
      materi: materi.trim(),
      absensi: absensiStr,
      catatan: catatan.trim() || 'KBM berlangsung tertib',
      sesi: 'Kelas Pagi',
      semester: semesterSettings?.activeSemester,
      tahunAjaran: semesterSettings?.activeTahunAjaran,
    });
  };

  const filteredSiswa = siswaList.filter((nama) =>
    nama.toLowerCase().includes(searchSiswa.toLowerCase())
  );

  useModalBehavior(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fadeIn">
      {/* Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-white rounded-2xl shadow-modal w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-800/80 border border-blue-600 flex items-center justify-center text-amber-300 shadow-sm shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="modal-title" className="text-base sm:text-lg font-bold leading-tight truncate">
                Input Jurnal KBM Harian
              </h2>
              <p className="text-xs text-blue-200 truncate flex items-center gap-1.5 mt-0.5">
                <span className="font-semibold text-white">{teacherName}</span>
                <span className="text-blue-400">•</span>
                <span className="text-amber-300 font-bold">{selectedMapel || 'Informatika'}</span>
                <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  KBM Tepat Waktu
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 shrink-0"
            aria-label="Tutup Dialog Jurnal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-800">
          {errorValidation && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorValidation}</span>
            </div>
          )}

          {/* Target KBM: Rombel, Jam, dan Mapel Terintegrasi */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            {/* If teacher has multiple slots today, quick selector pills */}
            {todaySlots.length > 1 && (
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200/80 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  Jadwal Hari Ini:
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {todaySlots.map((slot) => {
                    const isSelected = selectedKelas === slot.nama_kelas;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => handleSelectScheduleSlot(slot)}
                        className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-blue-800 text-white border-blue-900 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Kelas {slot.nama_kelas} ({slot.jam_ke})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Baris Status Mata Pelajaran: Terkunci Otomatis Sesuai Jadwal Admin */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Mata Pelajaran:
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-950 border border-blue-300 text-xs font-black rounded-lg shadow-2xs flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  <span>{selectedMapel || 'Informatika'}</span>
                </span>
              </div>
            </div>

            {/* Grid 2 Kolom Lega: Rombel & Jam Pelajaran (Responsive) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              {/* Rombel / Kelas */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Rombel / Kelas
                </label>
                <select
                  value={selectedKelas}
                  onChange={(e) => handleSelectKelas(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
                >
                  {kelasList.map((k) => (
                    <option key={k.nama} value={k.nama}>
                      Kelas {k.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* Jam Pelajaran */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Jam Pelajaran {isJumat && '(Maks 6 JP)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCustomJamOpen(!isCustomJamOpen)}
                    className="text-[11px] text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
                  >
                    {isCustomJamOpen ? 'Tutup Pilihan' : 'Ubah / Inval'}
                  </button>
                </div>
                <div className="min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800 truncate">
                    {selectedJam.length > 0 ? selectedJam.join(', ') : 'Belum dipilih'}
                  </span>
                  {selectedJam.length > 0 && (
                    <span className="text-[10px] sm:text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md shrink-0">
                      {calculateWaktuOtomatis(selectedJam, todayDay)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Jam Selection Panel when toggled */}
            {isCustomJamOpen && (
              <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Pilih Jam Pelajaran:</span>
                  <div className="flex items-center gap-2">
                    {currentClassSlot?.jam_ke && (
                      <button
                        type="button"
                        onClick={handleResetToScheduleJam}
                        className="text-[11px] text-blue-700 hover:text-blue-900 font-bold"
                      >
                        Reset ke Jadwal Bawaan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsCustomJamOpen(false)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold"
                    >
                      Selesai
                    </button>
                  </div>
                </div>

                {/* Jam Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-medium mr-1">Preset:</span>
                  {filteredJamPresets.map((preset) => {
                    const isSelected =
                      selectedJam.length === preset.jams.length &&
                      preset.jams.every((j) => selectedJam.includes(j));
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setSelectedJam(preset.jams)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-blue-800 text-white border-blue-900'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Individual Jam Options with 40-minute duration and break note */}
                <div className="space-y-1.5 pt-1">
                  <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5">
                    {filteredJamOptions.slice(0, 4).map((opt) => {
                      const active = selectedJam.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleJam(opt.id)}
                          className={`min-h-[44px] rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center p-1 border ${
                            active
                              ? 'bg-blue-800 text-white border-blue-900 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="leading-tight">{opt.id}</span>
                          <span className={`text-[10px] ${active ? 'text-amber-200' : 'text-slate-400'}`}>
                            {opt.start}
                            {isSenin && opt.id === 'Jam 1' ? ' (Upacara)' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Istirahat 20 Menit Banner */}
                  <div className="py-1 px-2.5 bg-amber-50/80 border border-dashed border-amber-300 rounded-lg text-center text-[10px] font-bold text-amber-900">
                    Istirahat 20 Menit (10:10 - 10:30 WIB)
                  </div>

                  {/* Sesi Setelah Istirahat */}
                  <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5">
                    {filteredJamOptions.slice(4).map((opt) => {
                      const active = selectedJam.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleJam(opt.id)}
                          className={`min-h-[44px] rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center p-1 border ${
                            active
                              ? 'bg-blue-800 text-white border-blue-900 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="leading-tight">{opt.id}</span>
                          <span className={`text-[10px] ${active ? 'text-amber-200' : 'text-slate-400'}`}>
                            {opt.start}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 1: Materi Pembelajaran */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md bg-blue-800 text-white flex items-center justify-center text-[11px] font-bold">1</span>
                <span>Materi / Topik Pembelajaran</span>
              </label>
              <span className="text-[11px] text-slate-400">{materi.length} karakter</span>
            </div>
            <textarea
              rows={3}
              value={materi}
              onChange={(e) => setMateri(e.target.value)}
              placeholder="Contoh: Algoritma Pencarian Linear & Biner menggunakan Python..."
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
              required
            />
          </div>

          {/* Section 2: Presensi Kehadiran Siswa Interaktif */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            {/* Header Presensi & Metrik Ringkas */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-blue-800 text-white flex items-center justify-center text-[11px] font-bold">2</span>
                  <span>Presensi Siswa ({selectedKelas})</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Default hadir. Cukup tandai siswa yang berhalangan hadir.
                </p>
              </div>

              {/* Attendance Quick Metrics & Reset */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg">
                  Hadir: {hadirCount}
                </span>
                {tidakHadirCount > 0 && (
                  <span className="px-2.5 py-1 bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold rounded-lg">
                    Tidak Hadir: {tidakHadirCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetAllHadir}
                  className="min-h-[34px] px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Reset Hadir
                </button>
              </div>
            </div>

            {/* Cross-check Izin Piket Terpadu (Clean Card) */}
            {izinTodayInThisClass.length > 0 && (
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold flex items-center gap-1.5 text-blue-900">
                    <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                    <span>Sinkronisasi Izin Hari Ini: {izinTodayInThisClass.length} Siswa</span>
                  </div>
                  <span className="text-[11px] text-blue-700 font-medium hidden sm:inline">Otomatis ditandai</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {izinTodayInThisClass.map((i) => (
                    <span key={i.id || i.namaSiswa} className="inline-flex items-center px-2 py-0.5 bg-white border border-blue-200 rounded-md text-[11px] font-semibold text-blue-900 shadow-2xs">
                      {i.namaSiswa} <span className="ml-1 text-blue-700 font-bold">({i.status})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Search Student Filter */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchSiswa}
                onChange={(e) => setSearchSiswa(e.target.value)}
                placeholder="Ketik nama siswa untuk mengubah status..."
                className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
              />
            </div>

            {/* List of absent students summary chips */}
            {tidakHadirCount > 0 && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
                <div className="text-[11px] font-bold text-amber-900 uppercase">
                  Daftar Siswa Tidak Hadir ({tidakHadirCount} Siswa):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(absensiMap).map(([nama, val]) => (
                    <span
                      key={nama}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs"
                    >
                      <span>{nama}</span>
                      <span className="text-amber-800 font-bold">({val.status})</span>
                      {val.info && (
                        <span className="text-[10px] text-slate-400">[{val.info}]</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSetStatusSiswa(nama, 'Hadir')}
                        className="ml-1 text-slate-400 hover:text-rose-600 font-bold"
                        title="Jadikan Hadir"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Student Grid / List */}
            {isLoadingSiswa ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Memuat daftar siswa kelas {selectedKelas}...
              </div>
            ) : filteredSiswa.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                Tidak ada siswa yang cocok dengan pencarian "{searchSiswa}".
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {filteredSiswa.map((nama, idx) => {
                  const currentData = absensiMap[nama];
                  const isAbsent = !!currentData;

                  return (
                    <div
                      key={nama}
                      className={`p-2.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                        isAbsent ? 'bg-amber-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-slate-400 font-mono text-[11px] text-right">
                          {idx + 1}.
                        </span>
                        <span className="font-medium text-slate-900 truncate">{nama}</span>
                        {currentData?.info && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-normal">
                            {currentData.info}
                          </span>
                        )}
                      </div>

                      {/* Status Buttons: Hadir, Sakit, Izin, Alpa */}
                      <div className="flex items-center gap-1 shrink-0">
                        {currentData && !['Sakit', 'Izin', 'Alpa'].includes(currentData.status) && (
                          <span className="px-2 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[11px] font-bold">
                            {currentData.status}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSetStatusSiswa(nama, 'Hadir')}
                          className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                            !isAbsent
                              ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Hadir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatusSiswa(nama, 'Sakit')}
                          className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                            currentData?.status === 'Sakit'
                              ? 'bg-amber-600 text-white font-bold shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-800'
                          }`}
                        >
                          Sakit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatusSiswa(nama, 'Izin')}
                          className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                            currentData?.status === 'Izin'
                              ? 'bg-sky-600 text-white font-bold shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-sky-100 hover:text-sky-800'
                          }`}
                        >
                          Izin
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatusSiswa(nama, 'Alpa')}
                          className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                            currentData?.status === 'Alpa'
                              ? 'bg-rose-600 text-white font-bold shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-rose-100 hover:text-rose-800'
                          }`}
                        >
                          Alpa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Catatan KBM */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-blue-800 text-white flex items-center justify-center text-[11px] font-bold">3</span>
              <span>Catatan / Kondisi KBM (Opsional)</span>
            </label>
            <input
              type="text"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Contoh: KBM tertib, 1 siswa izin ke klinik"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
            />
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="min-h-[44px] px-6 py-2.5 bg-blue-800 hover:bg-blue-900 active:bg-blue-950 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {mutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan ke Database...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-amber-300" />
                  <span>Simpan Jurnal KBM</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
