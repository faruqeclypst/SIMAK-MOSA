import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  BookOpen,
  Filter,
  Users,
  Search,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  FileSpreadsheet,
  X,
  LayoutGrid,
  Table as TableIcon,
  RefreshCw,
  Info,
  UserCheck,
  AlertTriangle,
  Building,
  GraduationCap
} from 'lucide-react';
import {
  fetchKurikulumHariIni,
  fetchKelas,
  fetchRekapInval,
  RekapInvalItem,
  JurnalEntry
} from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';

// Date utility functions for WIB (UTC+7)
function getTodayIso(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  const yyyy = wib.getFullYear();
  const mm = String(wib.getMonth() + 1).padStart(2, '0');
  const dd = String(wib.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getYesterdayIso(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  wib.setDate(wib.getDate() - 1);
  const yyyy = wib.getFullYear();
  const mm = String(wib.getMonth() + 1).padStart(2, '0');
  const dd = String(wib.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatIndonesianDate(isoStr: string): string {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${days[date.getDay()]}, ${d} ${months[m - 1]} ${y}`;
}

interface ParsedAbsenItem {
  id: string;
  namaSiswa: string;
  status: 'Sakit' | 'Izin' | 'Alpa' | 'Dispen' | string;
  keterangan: string;
  kelas: string;
  namaGuru: string;
  mapel: string;
  jam: string;
}

export const LaporanKurikulumSection: React.FC = () => {
  const todayIso = useMemo(() => getTodayIso(), []);
  const yesterdayIso = useMemo(() => getYesterdayIso(), []);

  // Filter & Navigation states
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [activeKurikulumTab, setActiveKurikulumTab] = useState<'rombel' | 'absensi' | 'inval'>('rombel');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [filterTingkat, setFilterTingkat] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'terisi' | 'belum'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAbsenQuery, setSearchAbsenQuery] = useState('');
  const [searchInvalQuery, setSearchInvalQuery] = useState('');

  // Modal states
  const [selectedClassForDetail, setSelectedClassForDetail] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Queries
  const {
    data: jurnalEntries = [],
    isLoading: isLoadingJurnal,
    isFetching: isFetchingJurnal,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['kurikulumHariIni', selectedDate],
    queryFn: () => fetchKurikulumHariIni(selectedDate),
  });

  const { data: rekapInvalList = [], isLoading: isLoadingInval } = useQuery<RekapInvalItem[]>({
    queryKey: ['rekapInval'],
    queryFn: fetchRekapInval,
  });

  const { data: kelasList = [] } = useQuery({
    queryKey: ['kelas'],
    queryFn: fetchKelas,
  });

  // Filter ketat hanya 18 rombel resmi SMAN Modal Bangsa (X-1 s/d XII-6)
  const officialClasses = useMemo(() => {
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

  // Group jurnal entries by class
  const sessionsByClass = useMemo(() => {
    const map = new Map<string, JurnalEntry[]>();
    officialClasses.forEach((k) => map.set(k.nama, []));

    jurnalEntries.forEach((entry) => {
      const existing = map.get(entry.kelas) || [];
      existing.push(entry);
      map.set(entry.kelas, existing);
    });

    return map;
  }, [officialClasses, jurnalEntries]);

  // Parse all absent students from today's journal entries
  const parsedAbsensiList = useMemo(() => {
    const list: ParsedAbsenItem[] = [];

    jurnalEntries.forEach((jurnal, jIdx) => {
      if (!jurnal.absen || jurnal.absen === 'Semua Hadir' || jurnal.absen === 'Nihil') {
        return;
      }

      // Format from server: "Nama (Status: Keterangan), Nama 2 (Status)"
      const parts = jurnal.absen.split(',').map((p) => p.trim()).filter(Boolean);

      parts.forEach((part, pIdx) => {
        const match = part.match(/^(.*?)\s*\((.*?)\)$/);
        if (match) {
          const nama = match[1].trim();
          const inside = match[2].trim();
          let status = 'Sakit';
          let keterangan = '';

          if (inside.includes(':')) {
            const split = inside.split(':');
            status = split[0].trim();
            keterangan = split.slice(1).join(':').trim();
          } else {
            status = inside;
            keterangan = inside;
          }

          list.push({
            id: `${jurnal.id || jIdx}-${pIdx}-${nama}`,
            namaSiswa: nama,
            status: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
            keterangan: keterangan || status,
            kelas: jurnal.kelas,
            namaGuru: jurnal.namaGuru,
            mapel: jurnal.mapel,
            jam: jurnal.jam,
          });
        } else {
          list.push({
            id: `${jurnal.id || jIdx}-${pIdx}`,
            namaSiswa: part,
            status: 'Izin',
            keterangan: 'Keterangan tidak tercantum',
            kelas: jurnal.kelas,
            namaGuru: jurnal.namaGuru,
            mapel: jurnal.mapel,
            jam: jurnal.jam,
          });
        }
      });
    });

    return list;
  }, [jurnalEntries]);

  // Statistics calculation
  const totalKelas = officialClasses.length || 18;
  const filledClassesCount = useMemo(() => {
    let count = 0;
    officialClasses.forEach((k) => {
      const sessions = sessionsByClass.get(k.nama) || [];
      if (sessions.length > 0) count++;
    });
    return count;
  }, [officialClasses, sessionsByClass]);

  const persentaseKeterisian = Math.round((filledClassesCount / totalKelas) * 100);
  const totalSesi = jurnalEntries.length;
  const tepatWaktuCount = jurnalEntries.filter(
    (j) => (j.statusKetepatan || 'tepat_waktu') === 'tepat_waktu'
  ).length;
  const terlambatCount = totalSesi - tepatWaktuCount;
  const punctualityRate = totalSesi > 0 ? Math.round((tepatWaktuCount / totalSesi) * 100) : 100;

  // Breakdown of absences
  const sakitCount = parsedAbsensiList.filter((a) => a.status.toLowerCase().includes('sakit')).length;
  const izinCount = parsedAbsensiList.filter((a) => a.status.toLowerCase().includes('izin')).length;
  const alpaCount = parsedAbsensiList.filter((a) => a.status.toLowerCase().includes('alpa')).length;

  // Filtered classes list
  const filteredKelas = useMemo(() => {
    return officialClasses.filter((k) => {
      if (filterTingkat === 'X' && !k.nama.startsWith('X-')) return false;
      if (filterTingkat === 'XI' && !k.nama.startsWith('XI-')) return false;
      if (filterTingkat === 'XII' && !k.nama.startsWith('XII-')) return false;

      const sessions = sessionsByClass.get(k.nama) || [];
      const isFilled = sessions.length > 0;

      if (filterStatus === 'terisi' && !isFilled) return false;
      if (filterStatus === 'belum' && isFilled) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchClass = k.nama.toLowerCase().includes(q);
        const matchTeacher = sessions.some((s) => s.namaGuru.toLowerCase().includes(q));
        const matchMapel = sessions.some((s) => s.mapel.toLowerCase().includes(q));
        const matchMateri = sessions.some((s) => s.materi.toLowerCase().includes(q));
        if (!matchClass && !matchTeacher && !matchMapel && !matchMateri) return false;
      }

      return true;
    });
  }, [officialClasses, filterTingkat, filterStatus, searchQuery, sessionsByClass]);

  // Filtered absences list
  const filteredAbsensi = useMemo(() => {
    return parsedAbsensiList.filter((item) => {
      if (!searchAbsenQuery.trim()) return true;
      const q = searchAbsenQuery.toLowerCase();
      return (
        item.namaSiswa.toLowerCase().includes(q) ||
        item.kelas.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        item.keterangan.toLowerCase().includes(q) ||
        item.mapel.toLowerCase().includes(q) ||
        item.namaGuru.toLowerCase().includes(q)
      );
    });
  }, [parsedAbsensiList, searchAbsenQuery]);

  // Filtered inval list
  const filteredInvalList = useMemo(() => {
    return rekapInvalList.filter((item) => {
      if (!searchInvalQuery.trim()) return true;
      const q = searchInvalQuery.toLowerCase();
      return (
        item.namaGuru.toLowerCase().includes(q) ||
        (item.rincian && item.rincian.toLowerCase().includes(q))
      );
    });
  }, [rekapInvalList, searchInvalQuery]);

  // Details for selected class modal
  const selectedClassSessions = useMemo(() => {
    if (!selectedClassForDetail) return [];
    return sessionsByClass.get(selectedClassForDetail) || [];
  }, [selectedClassForDetail, sessionsByClass]);

  useModalBehavior(!!selectedClassForDetail, () => setSelectedClassForDetail(null));
  useModalBehavior(isPrintModalOpen, () => setIsPrintModalOpen(false));

  return (
    <div className="space-y-6">
      {/* Top Header & Context Banner */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
                Bidang Kurikulum & Akademik
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Semester Genap TP 2025/2026
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Laporan & Monitoring KBM Rombel
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              Pengawasan terintegrasi kegiatan belajar mengajar pada 18 rombel resmi SMAN Modal Bangsa,
              mencakup ketepatan waktu guru, materi tersampaikan, dan presensi siswa secara harian.
            </p>
          </div>

          {/* Quick Date Navigator Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedDate(todayIso)}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  selectedDate === todayIso
                    ? 'bg-blue-900 text-white shadow-2xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
                }`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(yesterdayIso)}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  selectedDate === yesterdayIso
                    ? 'bg-blue-900 text-white shadow-2xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
                }`}
              >
                Kemarin
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                title="Pilih tanggal laporan"
              />
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetchingJurnal}
              title="Perbarui Data"
              className="min-h-[38px] w-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-900 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingJurnal ? 'animate-spin text-blue-900' : ''}`} />
            </button>
          </div>
        </div>

        {/* Selected Date Information Banner & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Menampilkan data:</span>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-900 rounded font-bold border border-blue-200">
              {formatIndonesianDate(selectedDate)}
            </span>
            {selectedDate === todayIso && (
              <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Live Hari Ini
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="min-h-[38px] px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Cetak Laporan / PDF</span>
            </button>
          </div>
        </div>

        {/* Executive KPI Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Card 1: Keterisian Rombel */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Keterisian Rombel
              </span>
              <Building className="w-4 h-4 text-blue-800" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-slate-900">
                  {filledClassesCount}
                  <span className="text-sm font-semibold text-slate-500"> / {totalKelas}</span>
                </p>
                <span className="text-xs font-extrabold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">
                  {persentaseKeterisian}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-blue-800 h-full rounded-full transition-all duration-500"
                  style={{ width: `${persentaseKeterisian}%` }}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-600 font-medium pt-0.5">
              {totalKelas - filledClassesCount === 0
                ? 'Semua 18 rombel telah terisi'
                : `${totalKelas - filledClassesCount} rombel belum ada jurnal`}
            </p>
          </div>

          {/* Card 2: Total Sesi KBM */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Sesi Pembelajaran
              </span>
              <BookOpen className="w-4 h-4 text-emerald-800" />
            </div>
            <div>
              <p className="text-2xl font-black text-emerald-900">
                {totalSesi} <span className="text-sm font-semibold text-slate-600">Sesi</span>
              </p>
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              Tercatat pada jurnal mengajar guru
            </p>
          </div>

          {/* Card 3: Ketepatan Waktu Guru */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Ketepatan Waktu KBM
              </span>
              <Clock className="w-4 h-4 text-indigo-800" />
            </div>
            <div>
              <p className="text-2xl font-black text-indigo-950">
                {punctualityRate}%
              </p>
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              {tepatWaktuCount} Tepat Waktu {terlambatCount > 0 ? `• ${terlambatCount} Terlambat` : ''}
            </p>
          </div>

          {/* Card 4: Ketidakhadiran Siswa */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Siswa Tidak Hadir
              </span>
              <Users className="w-4 h-4 text-amber-800" />
            </div>
            <div>
              <p className="text-2xl font-black text-amber-950">
                {parsedAbsensiList.length} <span className="text-sm font-semibold text-slate-600">Siswa</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700">
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded">
                Sakit: {sakitCount}
              </span>
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-900 rounded">
                Izin: {izinCount}
              </span>
              <span className="px-1.5 py-0.5 bg-rose-100 text-rose-900 rounded">
                Alpa: {alpaCount}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveKurikulumTab('rombel')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeKurikulumTab === 'rombel'
                ? 'bg-blue-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Monitoring 18 Rombel ({filledClassesCount}/{totalKelas})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveKurikulumTab('absensi')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeKurikulumTab === 'absensi'
                ? 'bg-blue-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Rekap Siswa Tidak Hadir ({parsedAbsensiList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveKurikulumTab('inval')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeKurikulumTab === 'inval'
                ? 'bg-blue-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Rekap Guru Inval ({rekapInvalList.length})</span>
          </button>
        </div>

        {/* Filter Toolbar for Rombel View */}
        {activeKurikulumTab === 'rombel' && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 bg-slate-50/60 p-3 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              {/* Tingkat Filter Chips */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                {[
                  { id: 'all', label: 'Semua Tingkat' },
                  { id: 'X', label: 'Fase E (X)' },
                  { id: 'XI', label: 'Fase F (XI)' },
                  { id: 'XII', label: 'Fase F (XII)' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFilterTingkat(chip.id)}
                    className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                      filterTingkat === chip.id
                        ? 'bg-blue-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                    filterStatus === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('terisi')}
                  className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                    filterStatus === 'terisi'
                      ? 'bg-emerald-800 text-white'
                      : 'text-emerald-800 hover:bg-emerald-50'
                  }`}
                >
                  Terisi ({filledClassesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('belum')}
                  className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                    filterStatus === 'belum'
                      ? 'bg-amber-800 text-white'
                      : 'text-amber-800 hover:bg-amber-50'
                  }`}
                >
                  Belum ({totalKelas - filledClassesCount})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Search Class / Teacher / Subject */}
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kelas, guru, mapel..."
                  className="w-full min-h-[36px] pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:outline-none"
                />
              </div>

              {/* View Switch: Grid vs Table */}
              <div className="flex items-center bg-white p-1 rounded-lg border border-slate-300">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Tampilan Kartu Rombel"
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  title="Tampilan Tabel Rekapitulasi"
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'table'
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <TableIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isError ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">Gagal Memuat Laporan Kurikulum</h3>
          <p className="text-xs text-slate-600">
            Terjadi kendala saat mengambil data pemantauan kurikulum dari server.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="min-h-[40px] px-4 py-2 bg-blue-900 text-white text-xs font-bold rounded-xl"
          >
            Coba Muat Ulang
          </button>
        </div>
      ) : isLoadingJurnal ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-48 bg-white rounded-2xl border border-slate-200 p-5 space-y-3 animate-pulse"
            >
              <div className="h-6 bg-slate-100 rounded w-1/3" />
              <div className="h-4 bg-slate-100 rounded w-2/3" />
              <div className="h-16 bg-slate-50 rounded-xl" />
            </div>
          ))}
        </div>
      ) : activeKurikulumTab === 'rombel' ? (
        viewMode === 'grid' ? (
          /* Grid Card View */
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredKelas.map((kelas) => {
                const sessions = sessionsByClass.get(kelas.nama) || [];
                const isFilled = sessions.length > 0;
                const latestSession = sessions[sessions.length - 1];

                const roman = kelas.nama.split('-')[0];
                const fase = roman === 'X' ? 'Fase E' : 'Fase F';

                return (
                  <div
                    key={kelas.nama}
                    className={`rounded-2xl border transition-all flex flex-col justify-between ${
                      isFilled
                        ? 'bg-white border-slate-200/90 shadow-2xs hover:border-blue-400 hover:shadow-xs'
                        : 'bg-white/80 border-dashed border-slate-300'
                    }`}
                  >
                    <div className="p-4 space-y-3.5">
                      {/* Card Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm tracking-tight ${
                              isFilled
                                ? 'bg-blue-900 text-amber-300 shadow-2xs'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {kelas.nama}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-bold text-slate-900">
                                Kelas {kelas.nama}
                              </h3>
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                {fase}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium">
                              SMAN Modal Bangsa
                            </p>
                          </div>
                        </div>

                        {isFilled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>{sessions.length} Sesi</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-semibold">
                            Belum Mengisi
                          </span>
                        )}
                      </div>

                      {/* Card Body: Session Info or Empty Placeholder */}
                      {isFilled ? (
                        <div className="space-y-2 bg-slate-50/80 p-3 rounded-xl border border-slate-100 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 truncate pr-2">
                              {latestSession.namaGuru}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded font-extrabold text-[10px] whitespace-nowrap">
                              Jam {latestSession.jam}
                            </span>
                          </div>

                          <p className="text-slate-700 font-medium">
                            <span className="text-slate-500">Mapel:</span> {latestSession.mapel}
                          </p>

                          <p className="text-slate-800 font-medium line-clamp-2" title={latestSession.materi}>
                            <span className="text-slate-500">Materi:</span> {latestSession.materi}
                          </p>

                          <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                            <span className="text-slate-600 font-medium truncate max-w-[200px]" title={latestSession.absen}>
                              {latestSession.absen === 'Semua Hadir' ? (
                                <span className="text-emerald-800 font-semibold">
                                  Hadir Lengkap
                                </span>
                              ) : (
                                <span className="text-amber-800 font-semibold">
                                  {latestSession.absen}
                                </span>
                              )}
                            </span>

                            {sessions.length > 1 && (
                              <span className="text-[10px] font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                +{sessions.length - 1} sesi lain
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="py-5 text-center text-slate-400 space-y-1">
                          <Clock className="w-5 h-5 mx-auto text-slate-300" />
                          <p className="text-xs font-medium text-slate-500">
                            Belum ada jurnal terinput pada tanggal ini
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Detail Button */}
                    <div className="px-4 pb-4 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedClassForDetail(kelas.nama)}
                        className={`w-full min-h-[38px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isFilled
                            ? 'bg-slate-900 hover:bg-blue-950 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>
                          {isFilled ? `Lihat Rincian (${sessions.length} Sesi)` : 'Lihat Riwayat Kelas'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredKelas.length === 0 && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
                <Search className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">Tidak ada rombel yang sesuai kriteria</h4>
                <p className="text-xs text-slate-500">
                  Coba sesuaikan kata kunci pencarian atau filter tingkat kelas.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Table View for Rombel */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th scope="col" className="p-3 font-bold w-12 text-center border-r border-slate-800">No</th>
                    <th scope="col" className="p-3 font-bold w-24 text-center border-r border-slate-800">Kelas</th>
                    <th scope="col" className="p-3 font-bold w-28 text-center border-r border-slate-800">Status KBM</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Guru Pengampu</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Mata Pelajaran</th>
                    <th scope="col" className="p-3 font-bold w-24 text-center border-r border-slate-800">Jam Ke</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Materi Pembelajaran</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Presensi Siswa</th>
                    <th scope="col" className="p-3 font-bold w-24 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredKelas.map((kelas, idx) => {
                    const sessions = sessionsByClass.get(kelas.nama) || [];
                    const isFilled = sessions.length > 0;
                    const latest = sessions[sessions.length - 1];

                    return (
                      <tr
                        key={kelas.nama}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          !isFilled ? 'bg-slate-50/30' : ''
                        }`}
                      >
                        <td className="p-3 text-center font-bold text-slate-500 font-mono border-r border-slate-100">
                          {idx + 1}
                        </td>
                        <td className="p-3 text-center border-r border-slate-100">
                          <span
                            className={`px-2.5 py-1 rounded-lg font-black text-xs inline-block ${
                              isFilled
                                ? 'bg-blue-900 text-amber-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {kelas.nama}
                          </span>
                        </td>
                        <td className="p-3 text-center border-r border-slate-100">
                          {isFilled ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                              {sessions.length} Sesi Terisi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium text-[11px]">
                              Kosong
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-900 border-r border-slate-100">
                          {isFilled ? latest.namaGuru : '-'}
                        </td>
                        <td className="p-3 text-slate-700 font-medium border-r border-slate-100">
                          {isFilled ? latest.mapel : '-'}
                        </td>
                        <td className="p-3 text-center font-bold text-blue-900 border-r border-slate-100">
                          {isFilled ? latest.jam : '-'}
                        </td>
                        <td className="p-3 text-slate-800 font-medium max-w-xs truncate border-r border-slate-100" title={isFilled ? latest.materi : ''}>
                          {isFilled ? latest.materi : '-'}
                        </td>
                        <td className="p-3 text-slate-600 font-medium max-w-xs truncate border-r border-slate-100" title={isFilled ? latest.absen : ''}>
                          {isFilled ? (
                            latest.absen === 'Semua Hadir' ? (
                              <span className="text-emerald-800 font-semibold">Semua Hadir</span>
                            ) : (
                              <span className="text-amber-800 font-semibold">{latest.absen}</span>
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedClassForDetail(kelas.nama)}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900 hover:bg-blue-900 hover:text-white transition-colors font-bold text-xs"
                          >
                            Rincian
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : activeKurikulumTab === 'absensi' ? (
        /* Rekap Ketidakhadiran Siswa Harian */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Rekapitulasi Siswa Tidak Hadir ({formatIndonesianDate(selectedDate)})
              </h2>
              <p className="text-xs text-slate-500">
                Daftar siswa yang tercatat Sakit, Izin, atau Alpa pada pengisian jurnal mengajar harian.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchAbsenQuery}
                onChange={(e) => setSearchAbsenQuery(e.target.value)}
                placeholder="Cari siswa, kelas, alasan..."
                className="w-full min-h-[36px] pl-8 pr-3 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:outline-none"
              />
            </div>
          </div>

          {filteredAbsensi.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl space-y-2 border border-slate-100">
              <UserCheck className="w-8 h-8 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">
                Tidak Ada Catatan Ketidakhadiran Siswa
              </h4>
              <p className="text-xs text-slate-500">
                Seluruh siswa tercatat hadir lengkap atau belum ada sesi KBM yang diinput pada tanggal ini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th scope="col" className="p-3 font-bold w-12 text-center border-r border-slate-800">No</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Nama Siswa</th>
                    <th scope="col" className="p-3 font-bold w-20 text-center border-r border-slate-800">Kelas</th>
                    <th scope="col" className="p-3 font-bold w-28 text-center border-r border-slate-800">Status</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Keterangan / Alasan</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Dicatat Oleh Guru</th>
                    <th scope="col" className="p-3 font-bold">Mata Pelajaran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredAbsensi.map((item, idx) => {
                    const isSakit = item.status.toLowerCase().includes('sakit');
                    const isIzin = item.status.toLowerCase().includes('izin');
                    const isAlpa = item.status.toLowerCase().includes('alpa');

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 text-center font-bold text-slate-500 font-mono border-r border-slate-100">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900 border-r border-slate-100">{item.namaSiswa}</td>
                        <td className="p-3 text-center font-extrabold text-blue-900 bg-blue-50/50 border-r border-slate-100">
                          {item.kelas}
                        </td>
                        <td className="p-3 text-center border-r border-slate-100">
                          <span
                            className={`px-2.5 py-1 rounded-full font-extrabold text-[11px] ${
                              isSakit
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : isIzin
                                ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                : isAlpa
                                ? 'bg-rose-100 text-rose-900 border border-rose-200'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 font-medium border-r border-slate-100">{item.keterangan}</td>
                        <td className="p-3 font-semibold text-slate-800 border-r border-slate-100">{item.namaGuru}</td>
                        <td className="p-3 text-slate-600">{item.mapel} (Jam {item.jam})</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Rekap Guru Inval */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Rekapitulasi Tugas Pendidik Inval (Guru Pengganti)
              </h2>
              <p className="text-xs text-slate-500">
                Akumulasi penugasan guru pengganti untuk kelas yang gurunya berhalangan hadir.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchInvalQuery}
                onChange={(e) => setSearchInvalQuery(e.target.value)}
                placeholder="Cari nama guru pengganti..."
                className="w-full min-h-[36px] pl-8 pr-3 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:outline-none"
              />
            </div>
          </div>

          {filteredInvalList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl space-y-1">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">Belum Ada Catatan Tugas Inval</p>
              <p>Seluruh jam pelajaran kosong tertangani melalui penugasan mandiri atau belum ada jadwal berhalangan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th scope="col" className="p-3 font-bold w-12 text-center border-r border-slate-800">No</th>
                    <th scope="col" className="p-3 font-bold border-r border-slate-800">Nama Guru Inval (Pengganti)</th>
                    <th scope="col" className="p-3 font-bold text-center w-32 border-r border-slate-800">Total Penugasan</th>
                    <th scope="col" className="p-3 font-bold">Rincian Tanggal & Guru Digantikan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredInvalList.map((item, idx) => (
                    <tr key={item.namaGuru} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 text-center font-mono font-bold text-slate-500 border-r border-slate-100">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-900 border-r border-slate-100">{item.namaGuru}</td>
                      <td className="p-3 text-center border-r border-slate-100">
                        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200 font-extrabold text-[11px]">
                          {item.totalInval} Kali
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 font-medium">{item.rincian || '-'}</td>
                    </tr>                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Interactive Class Detail Modal ("Rincian Sesi KBM Kelas") */}
      {selectedClassForDetail && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rincian-kelas-title"
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-900 text-amber-300 font-black flex items-center justify-center text-sm shadow-2xs">
                  {selectedClassForDetail}
                </div>
                <div>
                  <h3 id="rincian-kelas-title" className="text-base font-bold text-slate-900">
                    Rincian KBM Kelas {selectedClassForDetail}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {formatIndonesianDate(selectedDate)} • SMAN Modal Bangsa
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClassForDetail(null)}
                className="w-9 h-9 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {selectedClassSessions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Clock className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">
                    Belum Ada Jurnal untuk Kelas Ini
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Guru yang mengajar pada tanggal {formatIndonesianDate(selectedDate)} belum mengunggah jurnal presensi & materi.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Daftar Sesi Pembelajaran ({selectedClassSessions.length} Sesi)
                    </span>
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Tersinkronisasi
                    </span>
                  </div>

                  {selectedClassSessions.map((session, sIdx) => (
                    <div
                      key={session.id || sIdx}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-blue-900 text-white font-extrabold text-xs rounded-lg shadow-2xs">
                            Jam Ke- {session.jam}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {session.mapel}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            (session.statusKetepatan || 'tepat_waktu') === 'tepat_waktu'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {(session.statusKetepatan || 'tepat_waktu') === 'tepat_waktu'
                            ? 'Tepat Waktu'
                            : 'Terlambat'}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <p className="text-slate-700">
                          <strong className="text-slate-900">Pendidik:</strong> {session.namaGuru}
                        </p>
                        <p className="text-slate-700">
                          <strong className="text-slate-900">Materi Pokok:</strong> {session.materi}
                        </p>
                        {session.catatan && session.catatan !== 'Aman' && (
                          <p className="text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                            <strong className="text-slate-800">Catatan Kelas:</strong> {session.catatan}
                          </p>
                        )}
                        <div className="pt-2 border-t border-slate-200 text-slate-600">
                          <strong className="text-slate-800">Presensi Siswa:</strong>{' '}
                          {session.absen === 'Semua Hadir' ? (
                            <span className="text-emerald-800 font-bold">Semua Siswa Hadir Lengkap</span>
                          ) : (
                            <span className="text-amber-900 font-semibold">{session.absen}</span>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 text-right pt-1">
                        Diinput pada: {session.tanggalWaktu || session.tanggalInput}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedClassForDetail(null)}
                className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Printable Report Sheet Modal */}
      {isPrintModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau dokumen monitoring KBM"
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Preview Toolbar */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-100 no-print">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pratinjau Dokumen Resmi Monitoring KBM
                </h3>
                <p className="text-xs text-slate-500">
                  Format resmi cetak untuk pimpinan sekolah dan arsip kurikulum.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[40px] px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-300" />
                  <span>Cetak Dokumen Sekarang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="w-9 h-9 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                  title="Tutup Pratinjau"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Printable Area */}
            <div className="p-8 overflow-y-auto space-y-6 text-slate-900 bg-white font-sans text-xs">
              {/* Kop Surat Resmi */}
              <div className="border-b-2 border-slate-900 pb-3 text-center space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Pemerintah Aceh • Dinas Pendidikan
                </h4>
                <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">
                  SMA Negeri Modal Bangsa
                </h2>
                <p className="text-[10px] text-slate-600">
                  Jalan Bandara Sultan Iskandar Muda Km. 12,5 Blang Bintang, Aceh Besar, Aceh 23372
                </p>
                <p className="text-[10px] text-slate-600">
                  Website: www.sman-modalbangsa.sch.id | Email: info@sman-modalbangsa.sch.id
                </p>
              </div>

              {/* Title & Metadata */}
              <div className="text-center space-y-1 pt-2">
                <h3 className="text-sm font-black underline uppercase text-slate-950">
                  Laporan Harian Keterlaksanaan Kegiatan Belajar Mengajar (KBM)
                </h3>
                <div className="flex items-center justify-center gap-4 text-[11px] text-slate-700 font-semibold pt-1">
                  <span>Hari/Tanggal: <strong>{formatIndonesianDate(selectedDate)}</strong></span>
                  <span>•</span>
                  <span>Semester: <strong>Genap TP 2025/2026</strong></span>
                  <span>•</span>
                  <span>Total Rombel: <strong>18 Kelas (Fase E & F)</strong></span>
                </div>
              </div>

              {/* Executive Summary Stats */}
              <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="p-1">
                  <span className="text-slate-500 block">KETERISIAN ROMBEL</span>
                  <span className="text-xs text-blue-900 font-black">{filledClassesCount} / {totalKelas} ({persentaseKeterisian}%)</span>
                </div>
                <div className="p-1 border-l border-slate-200">
                  <span className="text-slate-500 block">TOTAL SESI KBM</span>
                  <span className="text-xs text-emerald-900 font-black">{totalSesi} Sesi Terlaksana</span>
                </div>
                <div className="p-1 border-l border-slate-200">
                  <span className="text-slate-500 block">TEPAT WAKTU</span>
                  <span className="text-xs text-indigo-900 font-black">{punctualityRate}% ({tepatWaktuCount} Sesi)</span>
                </div>
                <div className="p-1 border-l border-slate-200">
                  <span className="text-slate-500 block">SISWA TIDAK HADIR</span>
                  <span className="text-xs text-amber-900 font-black">{parsedAbsensiList.length} Siswa (S:{sakitCount}, I:{izinCount}, A:{alpaCount})</span>
                </div>
              </div>

              {/* 18 Classes Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900">
                  I. Matriks Keterlaksanaan KBM 18 Rombongan Belajar
                </h4>
                <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 border-b border-slate-300">
                      <th className="p-1.5 border border-slate-300 text-center w-8">No</th>
                      <th className="p-1.5 border border-slate-300 text-center w-14">Kelas</th>
                      <th className="p-1.5 border border-slate-300 text-center w-16">Status</th>
                      <th className="p-1.5 border border-slate-300">Guru Pengampu</th>
                      <th className="p-1.5 border border-slate-300">Mata Pelajaran</th>
                      <th className="p-1.5 border border-slate-300 text-center w-14">Jam Ke</th>
                      <th className="p-1.5 border border-slate-300">Materi Pokok</th>
                      <th className="p-1.5 border border-slate-300">Presensi Siswa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officialClasses.map((kelas, idx) => {
                      const sessions = sessionsByClass.get(kelas.nama) || [];
                      const isFilled = sessions.length > 0;
                      const latest = sessions[sessions.length - 1];

                      return (
                        <tr key={kelas.nama} className="border-b border-slate-200">
                          <td className="p-1.5 border border-slate-300 text-center font-mono">{idx + 1}</td>
                          <td className="p-1.5 border border-slate-300 text-center font-bold">{kelas.nama}</td>
                          <td className="p-1.5 border border-slate-300 text-center font-semibold">
                            {isFilled ? 'Terisi' : 'Kosong'}
                          </td>
                          <td className="p-1.5 border border-slate-300 font-medium">
                            {isFilled ? latest.namaGuru : '-'}
                          </td>
                          <td className="p-1.5 border border-slate-300">
                            {isFilled ? latest.mapel : '-'}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-center font-mono">
                            {isFilled ? latest.jam : '-'}
                          </td>
                          <td className="p-1.5 border border-slate-300">
                            {isFilled ? latest.materi : '-'}
                          </td>
                          <td className="p-1.5 border border-slate-300">
                            {isFilled ? latest.absen : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Section II: Rekap Ketidakhadiran */}
              {parsedAbsensiList.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    II. Daftar Siswa Tidak Hadir Pada Hari Ini
                  </h4>
                  <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 border-b border-slate-300">
                        <th className="p-1.5 border border-slate-300 text-center w-8">No</th>
                        <th className="p-1.5 border border-slate-300">Nama Siswa</th>
                        <th className="p-1.5 border border-slate-300 text-center w-14">Kelas</th>
                        <th className="p-1.5 border border-slate-300 text-center w-20">Status</th>
                        <th className="p-1.5 border border-slate-300">Keterangan / Alasan</th>
                        <th className="p-1.5 border border-slate-300">Guru Pelapor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedAbsensiList.map((item, idx) => (
                        <tr key={item.id} className="border-b border-slate-200">
                          <td className="p-1.5 border border-slate-300 text-center font-mono">{idx + 1}</td>
                          <td className="p-1.5 border border-slate-300 font-bold">{item.namaSiswa}</td>
                          <td className="p-1.5 border border-slate-300 text-center font-mono">{item.kelas}</td>
                          <td className="p-1.5 border border-slate-300 text-center font-semibold">{item.status}</td>
                          <td className="p-1.5 border border-slate-300">{item.keterangan}</td>
                          <td className="p-1.5 border border-slate-300">{item.namaGuru} ({item.mapel})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Official Signatures */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="space-y-16">
                  <div>
                    <p className="text-slate-500">Mengetahui,</p>
                    <p className="font-bold text-slate-900">Kepala SMA Negeri Modal Bangsa</p>
                  </div>
                  <div>
                    <p className="font-bold underline text-slate-900">Misnan, S.Pd., M.Mat.</p>
                    <p className="text-[10px] text-slate-600">NIP. 19711231 199702 1 004</p>
                  </div>
                </div>

                <div className="space-y-16">
                  <div>
                    <p className="text-slate-500">Aceh Besar, {formatIndonesianDate(selectedDate)}</p>
                    <p className="font-bold text-slate-900">Koordinator Piket / Tim Kurikulum</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 underline">( ............................................................ )</p>
                    <p className="text-[10px] text-slate-600">NIP. -</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
