import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  ShieldCheck,
  Home,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Building,
  UserCheck
} from 'lucide-react';
import { fetchKelas, fetchRekapIzinSemua, IzinEntry } from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';

function getTodayIso(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  const yyyy = wib.getFullYear();
  const mm = String(wib.getMonth() + 1).padStart(2, '0');
  const dd = String(wib.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatIndonesianDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  // Check if DD-MM-YYYY or YYYY-MM-DD
  let y = 0, m = 0, d = 0;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    } else {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
    }
  } else {
    return dateStr;
  }

  const date = new Date(y, m - 1, d);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${days[date.getDay()]}, ${d} ${months[m - 1]} ${y}`;
}

export const LaporanIzinSection: React.FC = () => {
  const todayIso = useMemo(() => getTodayIso(), []);

  const [filterKelas, setFilterKelas] = useState('');
  const [filterSumber, setFilterSumber] = useState<'all' | 'Piket' | 'Asrama'>('all');
  const [filterTanggalMode, setFilterTanggalMode] = useState<'all' | 'today' | 'custom'>('all');
  const [customTanggal, setCustomTanggal] = useState<string>(todayIso);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const { data: kelasList = [] } = useQuery({ queryKey: ['kelas'], queryFn: fetchKelas });
  const {
    data: allIzin = [],
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['rekapIzinSemua'],
    queryFn: () => fetchRekapIzinSemua(),
  });

  // Filtered dataset
  const filteredData = useMemo(() => {
    return allIzin.filter((entry) => {
      // Filter Kelas
      if (filterKelas && entry.kelas !== filterKelas) return false;

      // Filter Asal Sumber
      if (filterSumber !== 'all' && (entry.asalLaporan || 'Piket') !== filterSumber) return false;

      // Filter Tanggal
      if (filterTanggalMode === 'today') {
        // Compare with today
        const entryDateParts = entry.tanggal.split('-');
        let entryIso = entry.tanggal;
        if (entryDateParts.length === 3 && entryDateParts[2].length === 4) {
          entryIso = `${entryDateParts[2]}-${entryDateParts[1].padStart(2, '0')}-${entryDateParts[0].padStart(2, '0')}`;
        }
        if (entryIso !== todayIso && entry.tanggal !== todayIso) return false;
      } else if (filterTanggalMode === 'custom') {
        const entryDateParts = entry.tanggal.split('-');
        let entryIso = entry.tanggal;
        if (entryDateParts.length === 3 && entryDateParts[2].length === 4) {
          entryIso = `${entryDateParts[2]}-${entryDateParts[1].padStart(2, '0')}-${entryDateParts[0].padStart(2, '0')}`;
        }
        if (entryIso !== customTanggal && entry.tanggal !== customTanggal) return false;
      }

      // Filter Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = entry.namaSiswa.toLowerCase().includes(q);
        const matchKet = entry.keterangan.toLowerCase().includes(q);
        const matchKelas = entry.kelas.toLowerCase().includes(q);
        if (!matchName && !matchKet && !matchKelas) return false;
      }

      return true;
    });
  }, [allIzin, filterKelas, filterSumber, filterTanggalMode, todayIso, customTanggal, searchQuery]);

  // Statistics
  const totalIzinAll = allIzin.length;
  const countPiket = allIzin.filter((i) => (i.asalLaporan || 'Piket') === 'Piket').length;
  const countAsrama = allIzin.filter((i) => i.asalLaporan === 'Asrama').length;

  useModalBehavior(isPrintModalOpen, () => setIsPrintModalOpen(false));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-900 border border-purple-200">
                Layanan Kesiswaan & Pengasuhan
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Piket Kampus & Klinik Asrama
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Laporan Izin Terintegrasi Siswa
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              Arsip histori perizinan siswa SMAN Modal Bangsa, mengintegrasikan data izin keluar kampus
              dari Pos Piket Sekolah dengan catatan kesehatan klinik asrama secara otomatis.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-blue-900' : ''}`} />
              <span>Muat Ulang</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Cetak Laporan / PDF</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">
              Total Izin Terdata
            </span>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalIzinAll}</p>
            <p className="text-[10px] text-slate-500 font-medium">Akumulasi seluruh histori</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">
                Pos Piket Sekolah
              </span>
              <ShieldCheck className="w-3.5 h-3.5 text-blue-800" />
            </div>
            <p className="text-2xl font-black text-blue-900 mt-1">{countPiket}</p>
            <p className="text-[10px] text-blue-800 font-semibold">Izin keluar kampus</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase">
                Pengasuhan Asrama
              </span>
              <Home className="w-3.5 h-3.5 text-purple-800" />
            </div>
            <p className="text-2xl font-black text-purple-900 mt-1">{countAsrama}</p>
            <p className="text-[10px] text-purple-800 font-semibold">Klinik & perizinan asrama</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase">
              Hasil Filter Saat Ini
            </span>
            <p className="text-2xl font-black text-emerald-900 mt-1">{filteredData.length}</p>
            <p className="text-[10px] text-emerald-800 font-semibold">Siap diekspor / dicetak</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Sumber */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setFilterSumber('all')}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                  filterSumber === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                Semua Sumber
              </button>
              <button
                type="button"
                onClick={() => setFilterSumber('Piket')}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                  filterSumber === 'Piket'
                    ? 'bg-blue-900 text-white'
                    : 'text-blue-900 hover:bg-blue-50'
                }`}
              >
                Piket Sekolah ({countPiket})
              </button>
              <button
                type="button"
                onClick={() => setFilterSumber('Asrama')}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                  filterSumber === 'Asrama'
                    ? 'bg-purple-900 text-white'
                    : 'text-purple-900 hover:bg-purple-50'
                }`}
              >
                Asrama ({countAsrama})
              </button>
            </div>

            {/* Filter Tanggal Mode */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setFilterTanggalMode('all')}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                  filterTanggalMode === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                Semua Tanggal
              </button>
              <button
                type="button"
                onClick={() => setFilterTanggalMode('today')}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                  filterTanggalMode === 'today'
                    ? 'bg-emerald-800 text-white'
                    : 'text-emerald-900 hover:bg-emerald-50'
                }`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setFilterTanggalMode('custom')}
                className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold transition-colors ${
                  filterTanggalMode === 'custom'
                    ? 'bg-blue-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                Pilih Tanggal
              </button>
            </div>

            {filterTanggalMode === 'custom' && (
              <input
                type="date"
                value={customTanggal}
                onChange={(e) => setCustomTanggal(e.target.value)}
                className="min-h-[34px] px-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-800"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Kelas Select */}
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="min-h-[36px] px-3 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-800"
            >
              <option value="">Semua 18 Kelas</option>
              {kelasList.map((k) => (
                <option key={k.nama} value={k.nama}>
                  Kelas {k.nama}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Cari siswa atau alasan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[36px] pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-800 bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table Data */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900 text-white font-bold">
              <tr>
                <th scope="col" className="p-3 w-12 text-center border-r border-slate-800">No</th>
                <th scope="col" className="p-3 w-28 border-r border-slate-800">Tanggal</th>
                <th scope="col" className="p-3 w-20 text-center border-r border-slate-800">Kelas</th>
                <th scope="col" className="p-3 border-r border-slate-800">Nama Siswa</th>
                <th scope="col" className="p-3 w-32 text-center border-r border-slate-800">Asal Sumber</th>
                <th scope="col" className="p-3">Keterangan / Alasan Izin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                    <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-700">Tidak ada data perizinan yang sesuai dengan filter.</p>
                    <p className="text-xs text-slate-500">Sesuaikan pilihan tanggal atau filter kelas.</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => {
                  const isAsrama = item.asalLaporan === 'Asrama';

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-mono font-bold text-slate-500 border-r border-slate-100">{idx + 1}</td>
                      <td className="p-3 font-semibold text-slate-900 whitespace-nowrap border-r border-slate-100">
                        {item.tanggal}
                      </td>
                      <td className="p-3 text-center border-r border-slate-100">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
                          {item.kelas}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-900 border-r border-slate-100">{item.namaSiswa}</td>
                      <td className="p-3 text-center border-r border-slate-100">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                            isAsrama
                              ? 'bg-purple-100 text-purple-900 border border-purple-200'
                              : 'bg-blue-100 text-blue-900 border border-blue-200'
                          }`}
                        >
                          {isAsrama ? <Home className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                          <span>{item.asalLaporan || 'Piket'}</span>
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 font-medium">{item.keterangan}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Official Printable Report Sheet Modal */}
      {isPrintModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau dokumen rekapitulasi perizinan"
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Preview Toolbar */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-100 no-print">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pratinjau Dokumen Rekapitulasi Perizinan Siswa
                </h3>
                <p className="text-xs text-slate-500">
                  Format cetak resmi untuk arsip kesiswaan, pos piket, dan pembina asrama.
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
              </div>

              {/* Title & Metadata */}
              <div className="text-center space-y-1 pt-2">
                <h3 className="text-sm font-black underline uppercase text-slate-950">
                  Laporan Rekapitulasi Perizinan & Kesehatan Siswa
                </h3>
                <div className="flex items-center justify-center gap-4 text-[11px] text-slate-700 font-semibold pt-1">
                  <span>Semester: <strong>Genap TP 2025/2026</strong></span>
                  <span>•</span>
                  <span>Filter: <strong>{filterKelas ? `Kelas ${filterKelas}` : 'Seluruh Rombel'}</strong></span>
                  <span>•</span>
                  <span>Total Data: <strong>{filteredData.length} Catatan</strong></span>
                </div>
              </div>

              {/* Table Data */}
              <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 border-b border-slate-300">
                    <th className="p-1.5 border border-slate-300 text-center w-8">No</th>
                    <th className="p-1.5 border border-slate-300 w-24">Tanggal</th>
                    <th className="p-1.5 border border-slate-300 text-center w-14">Kelas</th>
                    <th className="p-1.5 border border-slate-300">Nama Siswa</th>
                    <th className="p-1.5 border border-slate-300 text-center w-24">Sumber Laporan</th>
                    <th className="p-1.5 border border-slate-300">Keterangan / Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-200">
                      <td className="p-1.5 border border-slate-300 text-center font-mono">{idx + 1}</td>
                      <td className="p-1.5 border border-slate-300 whitespace-nowrap">{item.tanggal}</td>
                      <td className="p-1.5 border border-slate-300 text-center font-bold">{item.kelas}</td>
                      <td className="p-1.5 border border-slate-300 font-semibold">{item.namaSiswa}</td>
                      <td className="p-1.5 border border-slate-300 text-center">{item.asalLaporan || 'Piket'}</td>
                      <td className="p-1.5 border border-slate-300">{item.keterangan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Signatures */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="space-y-16">
                  <div>
                    <p className="text-slate-500">Mengetahui,</p>
                    <p className="font-bold text-slate-900">Wakil Kepala Bidang Kesiswaan</p>
                  </div>
                  <div>
                    <p className="font-bold underline text-slate-900">( ............................................................ )</p>
                    <p className="text-[10px] text-slate-600">NIP. -</p>
                  </div>
                </div>

                <div className="space-y-16">
                  <div>
                    <p className="text-slate-500">Aceh Besar, {formatIndonesianDate(todayIso)}</p>
                    <p className="font-bold text-slate-900">Koordinator Pos Piket / Asrama</p>
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
