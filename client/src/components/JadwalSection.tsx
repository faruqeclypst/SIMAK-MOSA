import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Users,
  ChevronRight,
  GraduationCap,
  ShieldCheck,
  Plus,
  Sliders,
  UserX,
  X,
  Save,
  Check
} from 'lucide-react';
import {
  User,
  fetchJurnalRiwayat,
  fetchRekapIzinSemua,
  fetchAdminJadwal,
  fetchGuruBerhalangan,
  simpanGuruBerhalangan,
  hapusGuruBerhalangan,
  JurnalEntry,
  GuruBerhalanganEntry
} from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';

interface JadwalSectionProps {
  user: User | null;
  onOpenQuickJurnalWithClass?: (kelas: string, jam: string[], mapel?: string) => void;
  onNavigateToAdmin?: () => void;
}

export const JadwalSection: React.FC<JadwalSectionProps> = ({
  user,
  onOpenQuickJurnalWithClass,
  onNavigateToAdmin,
}) => {
  const queryClient = useQueryClient();
  const teacherName = user?.nama || 'Alfaruq Asri, S.Pd';

  // Modal & form state for reporting absence
  const [isModalBerhalanganOpen, setIsModalBerhalanganOpen] = useState(false);
  const [berhalanganStatus, setBerhalanganStatus] = useState('Dinas Luar');
  const [berhalanganCatatan, setBerhalanganCatatan] = useState('');
  const [berhalanganAlert, setBerhalanganAlert] = useState<string | null>(null);

  // Fetch recent journal records for this teacher
  const {
    data: riwayatGuru = [],
    isLoading: isLoadingJurnal,
    isError: isErrorJurnal,
    refetch: refetchJurnal,
  } = useQuery({
    queryKey: ['riwayatJurnal', teacherName],
    queryFn: () => fetchJurnalRiwayat(teacherName),
  });

  // Fetch today's permits from Piket & Asrama
  const {
    data: rekapIzinHariIni = [],
    isLoading: isLoadingIzin,
  } = useQuery({
    queryKey: ['rekapIzin'],
    queryFn: () => fetchRekapIzinSemua(),
  });

  // Fetch today's teacher absence records
  const {
    data: daftarGuruBerhalangan = [],
  } = useQuery({
    queryKey: ['guruBerhalangan'],
    queryFn: fetchGuruBerhalangan,
  });

  // Check if current logged in teacher is recorded as absent today
  const myBerhalangan = useMemo(() => {
    return daftarGuruBerhalangan.find(
      (g) => g.namaGuru?.toLowerCase().trim() === teacherName.toLowerCase().trim()
    );
  }, [daftarGuruBerhalangan, teacherName]);

  // Mutations for absence
  const mutationSimpanBerhalangan = useMutation({
    mutationFn: (data: { namaGuru: string; status: string; catatan: string }) =>
      simpanGuruBerhalangan(data.namaGuru, data.status, data.catatan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guruBerhalangan'] });
      queryClient.invalidateQueries({ queryKey: ['piketMatriks'] });
      setBerhalanganAlert('Laporan guru berhalangan hadir berhasil disimpan dan otomatis masuk ke Matriks KBM pos piket.');
      setIsModalBerhalanganOpen(false);
      setBerhalanganCatatan('');
      setTimeout(() => setBerhalanganAlert(null), 4000);
    },
    onError: (err: any) => {
      setBerhalanganAlert(`Gagal melaporkan: ${err.message || 'Terjadi kesalahan'}`);
    },
  });

  const mutationBatalBerhalangan = useMutation({
    mutationFn: (id: string) => hapusGuruBerhalangan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guruBerhalangan'] });
      queryClient.invalidateQueries({ queryKey: ['piketMatriks'] });
      setBerhalanganAlert('Catatan berhalangan hadir telah dibatalkan. Anda tercatat hadir hari ini.');
      setTimeout(() => setBerhalanganAlert(null), 4000);
    },
    onError: (err: any) => {
      setBerhalanganAlert(`Gagal membatalkan: ${err.message || 'Terjadi kesalahan'}`);
    },
  });

  // Fetch configured schedule from database
  const { data: dbJadwal = [] } = useQuery({
    queryKey: ['adminJadwal', teacherName],
    queryFn: () => fetchAdminJadwal({ guru: teacherName }),
  });

  const [scheduleView, setScheduleView] = useState<'today' | 'all'>('today');
  const [filterDay, setFilterDay] = useState<string>('all');

  const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayWibStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date()).replace(/\//g, '-');
  }, []);
  const todayDay = useMemo(() => {
    const wib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    return HARI_INDONESIA[wib.getDay()];
  }, []);
  const todayDateStr = todayWibStr;

  const izinTodayFiltered = useMemo(() => {
    return rekapIzinHariIni.filter((i) => !i.tanggal || i.tanggal === todayWibStr);
  }, [rekapIzinHariIni, todayWibStr]);

  // Dynamic scheduled teaching classes for this teacher
  const allSchedules = useMemo(() => {
    if (dbJadwal && dbJadwal.length > 0) {
      return dbJadwal.map((item) => {
        const cleanMapel = (item.mapel || '').split(',')[0].trim() || 'Informatika';
        return {
          id: item.id,
          hari: item.hari || 'Senin',
          kelas: item.nama_kelas,
          jam: item.jam_ke ? item.jam_ke.split(',').map((j) => j.trim()) : ['Jam 1', 'Jam 2'],
          waktu: item.waktu || '07:30 - 09:00 WIB',
          ruang: item.ruangan || 'Ruang Kelas',
          topikRencana: cleanMapel,
          mapel: cleanMapel,
        };
      });
    }
    return [];
  }, [dbJadwal]);

  // Schedules for today only
  const todaySchedules = useMemo(() => {
    return allSchedules.filter(
      (item) => item.hari.toLowerCase() === todayDay.toLowerCase()
    );
  }, [allSchedules, todayDay]);

  // Filtered schedules for display based on active view and day filter
  const displayedSchedules = useMemo(() => {
    if (scheduleView === 'today') {
      return todaySchedules;
    }
    if (filterDay === 'all') {
      return allSchedules;
    }
    return allSchedules.filter(
      (item) => item.hari.toLowerCase() === filterDay.toLowerCase()
    );
  }, [scheduleView, filterDay, todaySchedules, allSchedules]);

  // Helper to check if journal has been filled TODAY for a specific class
  const getJurnalStatus = (kelas: string) => {
    const todayIso = new Date().toISOString().split('T')[0];
    return riwayatGuru.find((j) => {
      const isSameClass = j.kelas === kelas;
      const isToday =
        j.tanggalIso === todayIso ||
        j.tanggalInput === todayDateStr ||
        (j.tanggalWaktu && j.tanggalWaktu.startsWith(todayDateStr));
      return isSameClass && isToday;
    });
  };

  const todayJurnalTerisiCount = todaySchedules.filter((item) =>
    getJurnalStatus(item.kelas)
  ).length;

  useModalBehavior(isModalBerhalanganOpen, () => setIsModalBerhalanganOpen(false));

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 text-blue-900 rounded-md text-xs font-bold uppercase tracking-wider mb-1.5 border border-blue-100">
            <GraduationCap className="w-3.5 h-3.5 text-blue-700" />
            <span>Workspace Akademik Guru</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Selamat Mengajar, {teacherName}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Mata Pelajaran: <span className="font-semibold text-slate-800">{user?.mapel || 'Informatika'}</span>
          </p>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Jadwal Hari Ini ({todayDay})</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{todaySchedules.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Sesi KBM aktif hari ini</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Jurnal Hari Ini</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-800 mt-2">
            {todayJurnalTerisiCount} / {todaySchedules.length}
          </p>
          <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">
            {todaySchedules.length === 0
              ? 'Tidak ada jadwal wajib'
              : todayJurnalTerisiCount === todaySchedules.length
              ? 'Seluruh jurnal hari ini tuntas'
              : 'Perlu dilengkapi'}
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Izin Siswa Hari Ini</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-800 mt-2">{izinTodayFiltered.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Terdata di Piket / Asrama</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Jam Mingguan</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-800 mt-2">{allSchedules.length * 2} Jam</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{allSchedules.length} sesi pertemuan per pekan</p>
        </div>
      </div>

      {/* Main Grid: Teaching Schedule & Actions + Today's Absence Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Schedule & Actions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header Controls & View Toggle */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {scheduleView === 'today' ? `Jadwal Mengajar Hari Ini (${todayDay})` : 'Seluruh Jadwal Mengajar Mingguan'}
                </h3>
                <p className="text-xs text-slate-500">
                  {scheduleView === 'today'
                    ? `Pilih kelas untuk mencatat materi dan kehadiran KBM hari ini (${todayDateStr}).`
                    : 'Daftar seluruh rombel KBM mingguan yang diampu sesuai kalender akademik.'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsModalBerhalanganOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border shadow-2xs ${
                    myBerhalangan
                      ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                  title="Laporkan ketidakhadiran mandiri (sakit, dinas luar, dll.)"
                >
                  <UserX className="w-3.5 h-3.5 text-amber-600" />
                  <span>{myBerhalangan ? `Berhalangan (${myBerhalangan.status})` : 'Guru Berhalangan Hadir'}</span>
                </button>

                {user?.role === 'admin' && onNavigateToAdmin && (
                  <button
                    onClick={onNavigateToAdmin}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors border border-amber-300/60 shadow-2xs"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Atur Jadwal (Admin)</span>
                  </button>
                )}
              </div>
            </div>

            {berhalanganAlert && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{berhalanganAlert}</span>
              </div>
            )}

            {myBerhalangan && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
                    <UserX className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">Anda Terdata Berhalangan Hadir Hari Ini</span>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold rounded text-[10px]">
                        {myBerhalangan.status}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-1">
                      Catatan Tugas: <span className="font-semibold text-slate-800">{myBerhalangan.catatan || 'Tugas mandiri diberikan'}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Data ini otomatis tampil di pos piket sekolah dan matriks pemantauan KBM.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (myBerhalangan?.id && window.confirm('Batalkan status berhalangan hadir dan konfirmasi Anda hadir mengajar hari ini?')) {
                      mutationBatalBerhalangan.mutate(myBerhalangan.id);
                    }
                  }}
                  disabled={mutationBatalBerhalangan.isPending}
                  className="min-h-[38px] px-3.5 py-1.5 bg-white hover:bg-slate-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-colors shrink-0 shadow-2xs"
                >
                  {mutationBatalBerhalangan.isPending ? 'Membatalkan...' : 'Batalkan (Saya Sudah Hadir)'}
                </button>
              </div>
            )}

            {/* View Switcher: Hari Ini vs Seluruh Jadwal Mingguan */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setScheduleView('today')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  scheduleView === 'today'
                    ? 'bg-blue-800 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hari Ini ({todayDay})
              </button>
              <button
                type="button"
                onClick={() => setScheduleView('all')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  scheduleView === 'all'
                    ? 'bg-blue-800 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Jadwal Mingguan Lengkap ({allSchedules.length} Sesi)
              </button>
            </div>

            {/* Day Filter Chips (Only shown in Weekly view) */}
            {scheduleView === 'all' && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 pb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                  Pilih Hari:
                </span>
                {['all', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((hari) => (
                  <button
                    key={hari}
                    type="button"
                    onClick={() => setFilterDay(hari)}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      filterDay === hari
                        ? 'bg-blue-800 text-white shadow-2xs'
                        : hari === todayDay
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {hari === 'all' ? 'Semua Hari' : hari}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scheduled Cards List */}
          <div className="space-y-3">
            {displayedSchedules.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-800 mx-auto flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {scheduleView === 'today'
                      ? `Tidak Ada Jadwal Mengajar Terjadwal Hari Ini (${todayDay})`
                      : `Tidak ada jadwal KBM yang cocok dengan filter "${filterDay}".`}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    {scheduleView === 'today'
                      ? 'Anda tidak memiliki jam mengajar terjadwal pada hari ini. Jika Anda mengisi jam inval atau mengajar di luar jadwal, Anda tetap dapat mencatat jurnal secara langsung.'
                      : 'Silakan pilih hari lain atau periksa konfigurasi jadwal di menu admin.'}
                  </p>
                </div>
                {onOpenQuickJurnalWithClass && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenQuickJurnalWithClass(
                        'X-1',
                        ['Jam 1', 'Jam 2'],
                        (user?.mapel || '').split(',').map((m) => m.trim()).filter(Boolean)[0] || 'Informatika'
                      )
                    }
                    className="min-h-[44px] px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 shadow-sm transition-all"
                  >
                    <Plus className="w-4 h-4 text-amber-300" />
                    <span>Catat KBM Inval / Tambahan</span>
                  </button>
                )}
              </div>
            ) : (
              displayedSchedules.map((item) => {
                const existingJurnal = getJurnalStatus(item.kelas);
                const isFilledToday = !!existingJurnal;

                return (
                  <div
                    key={item.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      isFilledToday
                        ? 'bg-white border-emerald-200 shadow-2xs'
                        : 'bg-white border-slate-200 shadow-2xs hover:border-blue-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-extrabold text-sm ${
                            isFilledToday
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-800 text-white shadow-sm'
                          }`}
                        >
                          {item.kelas}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h4 className="text-base font-bold text-slate-900">
                              Kelas {item.kelas}
                            </h4>
                            {isFilledToday ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Tuntas
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                Belum Diisi
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-600 mt-1 flex-wrap">
                            <span className="font-semibold text-blue-900">{item.mapel}</span>
                            <span className="text-slate-300">•</span>
                            <span>{item.jam.join(', ')}</span>
                            <span className="text-slate-300">•</span>
                            <span>{item.waktu}</span>
                            {item.hari && scheduleView === 'all' && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="font-medium text-slate-700">{item.hari}</span>
                              </>
                            )}
                          </div>

                          {isFilledToday && existingJurnal ? (
                            <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-0.5 max-w-lg">
                              <p className="text-slate-800 font-medium truncate">
                                Materi: <span className="font-semibold">{existingJurnal.materi}</span>
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Presensi: {existingJurnal.absen || 'Semua Hadir'}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="shrink-0 pt-2 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenQuickJurnalWithClass) {
                              onOpenQuickJurnalWithClass(item.kelas, item.jam, item.mapel);
                            }
                          }}
                          className={`w-full sm:w-auto min-h-[44px] px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                            isFilledToday
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              : 'bg-blue-800 hover:bg-blue-900 text-white shadow-sm'
                          }`}
                        >
                          {isFilledToday ? (
                            <>
                              <BookOpen className="w-4 h-4 text-slate-500" />
                              <span>Perbarui Jurnal</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 text-amber-300" />
                              <span>Isi Jurnal KBM</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Col: Live Student Absence Watchlist from Piket/Asrama */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                <span>Izin Siswa Hari Ini</span>
              </h3>
              <p className="text-xs text-slate-500">
                Disinkronkan dari database Piket & Asrama
              </p>
            </div>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold rounded-lg">
              {izinTodayFiltered.length} Siswa
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {isLoadingIzin ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Memuat data izin siswa...
              </div>
            ) : izinTodayFiltered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="font-semibold text-slate-700">Tidak ada siswa izin hari ini</p>
                <p className="text-[11px] text-slate-400">Seluruh siswa aktif mengikuti KBM.</p>
              </div>
            ) : (
              izinTodayFiltered.map((izin, idx) => (
                <div key={idx} className="p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 truncate">
                      {izin.namaSiswa}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        izin.keterangan === 'Sakit'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {izin.keterangan || 'Izin'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Kelas: {izin.kelas}</span>
                    <span className="text-[10px] text-slate-400">Laporan: {izin.asalLaporan}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Lapor Guru Berhalangan Hadir */}
      {isModalBerhalanganOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-berhalangan-title"
            className="bg-white rounded-2xl shadow-modal w-full max-w-lg overflow-hidden border border-slate-200"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="modal-berhalangan-title" className="text-base font-bold text-white leading-tight">
                    Lapor Guru Berhalangan Hadir
                  </h3>
                  <p className="text-xs text-blue-200 mt-0.5">
                    {teacherName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalBerhalanganOpen(false)}
                className="min-h-[44px] min-w-[44px] p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl flex items-center justify-center transition-colors"
                aria-label="Tutup Dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutationSimpanBerhalangan.mutate({
                  namaGuru: teacherName,
                  status: berhalanganStatus,
                  catatan: berhalanganCatatan.trim() || 'Tugas ajar mandiri diberikan kepada siswa',
                });
              }}
              className="p-5 sm:p-6 space-y-4 text-xs"
            >
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
                <p className="font-semibold">Informasi Sinkronisasi KBM:</p>
                <p className="text-[11px] text-blue-800 mt-0.5">
                  Laporan ini akan langsung diteruskan ke Pos Piket Sekolah agar piket dapat memandu kelas yang Anda ampu hari ini dengan tugas mandiri.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Nama Guru
                </label>
                <input
                  type="text"
                  value={teacherName}
                  disabled
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Status / Alasan Berhalangan
                </label>
                <select
                  value={berhalanganStatus}
                  onChange={(e) => setBerhalanganStatus(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  <option value="Dinas Luar">Dinas Luar / Pelatihan / MGMP</option>
                  <option value="Sakit">Sakit / Berobat</option>
                  <option value="Cuti / Urusan Keluarga">Cuti / Urusan Keluarga Penting</option>
                  <option value="Tugas Pengawas / Pembina">Tugas Pengawas / Pembina Lomba</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Tugas Pengganti / Catatan Siswa
                </label>
                <textarea
                  rows={3}
                  value={berhalanganCatatan}
                  onChange={(e) => setBerhalanganCatatan(e.target.value)}
                  placeholder="Contoh: Siswa mengerjakan LKS Bab 3 nomor 1-10 secara berkelompok, dikumpulkan ke meja piket..."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-700"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalBerhalanganOpen(false)}
                  className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={mutationSimpanBerhalangan.isPending}
                  className="min-h-[44px] px-5 py-2 bg-blue-800 hover:bg-blue-900 active:bg-blue-950 text-white font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {mutationSimpanBerhalangan.isPending ? (
                    'Menyimpan...'
                  ) : (
                    <>
                      <UserX className="w-4 h-4 text-amber-300" />
                      <span>Simpan Guru Berhalangan Hadir</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
