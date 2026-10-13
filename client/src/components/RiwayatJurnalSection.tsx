import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
} from '@tanstack/react-table';
import {
  Search,
  Filter,
  Download,
  Calendar,
  User as UserIcon,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import { fetchJurnalRiwayat, JurnalEntry, User } from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';

interface RiwayatJurnalSectionProps {
  user: User | null;
}

const columnHelper = createColumnHelper<JurnalEntry>();

export const RiwayatJurnalSection: React.FC<RiwayatJurnalSectionProps> = ({ user }) => {
  const [globalFilter, setGlobalFilter] = useState('');
  const [filterTingkat, setFilterTingkat] = useState<string>('all');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'tanggalInput', desc: true },
  ]);
  const [selectedJurnal, setSelectedJurnal] = useState<JurnalEntry | null>(null);

  // Fetch journal entries from API
  const {
    data: riwayat = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['riwayatJurnal'],
    queryFn: () => fetchJurnalRiwayat(),
  });

  // Filter by tingkat (X, XI, XII)
  const filteredData = useMemo(() => {
    if (filterTingkat === 'all') return riwayat;
    return riwayat.filter((item) => {
      if (filterTingkat === 'X') return item.kelas.startsWith('X-') || item.kelas === 'X';
      if (filterTingkat === 'XI') return item.kelas.startsWith('XI-') || item.kelas === 'XI';
      if (filterTingkat === 'XII') return item.kelas.startsWith('XII-') || item.kelas === 'XII';
      return true;
    });
  }, [riwayat, filterTingkat]);

  // Table Columns Definition
  const columns = useMemo(
    () => [
      columnHelper.accessor('tanggalInput', {
        header: 'Tanggal & Waktu',
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.createdAtIso || rowA.original.tanggalIso || rowA.original.tanggalInput || '';
          const b = rowB.original.createdAtIso || rowB.original.tanggalIso || rowB.original.tanggalInput || '';
          return a.localeCompare(b);
        },
        cell: (info) => {
          const val = info.getValue() || info.row.original.tanggalWaktu || '';
          return (
            <div className="text-xs">
              <span className="font-semibold text-slate-900 block">{val.split(' ')[0]}</span>
              <span className="text-[11px] text-slate-500">{val.split(' ')[1] || ''}</span>
            </div>
          );
        },
      }),
      columnHelper.accessor('namaGuru', {
        header: 'Guru Pengampu',
        cell: (info) => (
          <div className="text-xs">
            <span className="font-bold text-slate-900 block">{info.getValue()}</span>
            <span className="text-[11px] text-slate-500">{info.row.original.mapel}</span>
          </div>
        ),
      }),
      columnHelper.accessor('kelas', {
        header: 'Rombel',
        cell: (info) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('jam', {
        header: 'Jam',
        cell: (info) => (
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('materi', {
        header: 'Materi Pembelajaran',
        cell: (info) => (
          <p className="text-xs text-slate-800 font-medium max-w-xs truncate" title={info.getValue()}>
            {info.getValue()}
          </p>
        ),
      }),
      columnHelper.accessor('absen', {
        header: 'Presensi Siswa',
        cell: (info) => {
          const absenStr = info.getValue() || 'Semua Hadir';
          const isAllPresent =
            absenStr.toLowerCase().includes('semua hadir') || absenStr.trim() === '';
          return (
            <div className="text-xs">
              {isAllPresent ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Semua Hadir
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold truncate max-w-[140px]"
                  title={absenStr}
                >
                  {absenStr}
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Detail',
        cell: (info) => (
          <button
            onClick={() => setSelectedJurnal(info.row.original)}
            className="min-h-[36px] px-2.5 py-1 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Lihat</span>
          </button>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  // Export to CSV Function
  const handleExportCSV = () => {
    if (filteredData.length === 0) return;
    const headers = ['Tanggal', 'Nama Guru', 'Mata Pelajaran', 'Kelas', 'Jam', 'Materi', 'Presensi', 'Catatan'];
    const csvRows = [
      headers.join(';'),
      ...filteredData.map((row) =>
        [
          `"${row.tanggalInput || row.tanggalWaktu || ''}"`,
          `"${row.namaGuru || ''}"`,
          `"${row.mapel || ''}"`,
          `"${row.kelas || ''}"`,
          `"${row.jam || ''}"`,
          `"${(row.materi || '').replace(/"/g, '""')}"`,
          `"${(row.absen || '').replace(/"/g, '""')}"`,
          `"${(row.catatan || '').replace(/"/g, '""')}"`,
        ].join(';')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `jurnal-kbm-mosa-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useModalBehavior(!!selectedJurnal, () => setSelectedJurnal(null));

  return (
    <div className="space-y-4">
      {/* Top Filter & Action Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Riwayat Jurnal KBM Terpadu
            </h2>
            <p className="text-xs text-slate-500">
              Menampilkan {filteredData.length} data pembelajaran yang tercatat di database sekolah.
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors self-start sm:self-auto"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Ekspor File CSV</span>
          </button>
        </div>

        {/* Filter Chips & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Tingkat Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Semua Tingkat' },
              { id: 'X', label: 'Kelas X' },
              { id: 'XI', label: 'Kelas XI' },
              { id: 'XII', label: 'Kelas XII' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setFilterTingkat(chip.id)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  filterTingkat === chip.id
                    ? 'bg-blue-800 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Cari guru, materi, atau rombel..."
              className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Table Surface */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          /* Loading Skeleton State */
          <div className="p-6 space-y-4">
            <div className="h-6 bg-slate-100 rounded w-1/4 animate-pulse" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          /* Error State */
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">
              Gagal Memuat Riwayat Jurnal
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Terjadi kendala saat menyinkronkan data dengan server. Silakan muat ulang.
            </p>
            <button
              onClick={() => refetch()}
              className="min-h-[40px] px-4 py-2 bg-blue-800 text-white text-xs font-bold rounded-lg hover:bg-blue-900"
            >
              Coba Lagi
            </button>
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center space-y-2">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">
              Belum Ada Catatan Jurnal KBM
            </h3>
            <p className="text-xs text-slate-400">
              {globalFilter
                ? 'Tidak ditemukan data yang sesuai dengan kata kunci pencarian.'
                : 'Catatan KBM harian yang disimpan akan muncul di tabel ini.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider"
                    >
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            header.column.getIsSorted() === 'asc'
                              ? 'ascending'
                              : header.column.getIsSorted() === 'desc'
                              ? 'descending'
                              : header.column.getCanSort()
                              ? 'none'
                              : undefined
                          }
                          className="px-4 py-3"
                        >
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            disabled={!header.column.getCanSort()}
                            className="flex w-full items-center gap-1.5 text-left uppercase tracking-wider enabled:cursor-pointer enabled:select-none enabled:hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded disabled:cursor-default"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {{
                              asc: <ChevronUp className="w-3.5 h-3.5 text-blue-700" />,
                              desc: <ChevronDown className="w-3.5 h-3.5 text-blue-700" />,
                            }[header.column.getIsSorted() as string] ?? null}
                          </button>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-blue-50/40 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Halaman</span>
                <span className="font-bold text-slate-900">
                  {table.getState().pagination.pageIndex + 1} dari{' '}
                  {table.getPageCount() || 1}
                </span>
                <span className="text-slate-400">
                  ({table.getFilteredRowModel().rows.length} total entri)
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label="Halaman Selanjutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Slide-over Detail Drawer */}
      {selectedJurnal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-jurnal-title"
        >
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 id="detail-jurnal-title" className="text-base font-bold text-slate-900">
                    Detail Jurnal Pembelajaran
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kelas {selectedJurnal.kelas} : {selectedJurnal.jam}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedJurnal(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    Guru Pengampu & Mapel
                  </span>
                  <p className="font-bold text-slate-900 text-sm">
                    {selectedJurnal.namaGuru}
                  </p>
                  <p className="text-slate-600">{selectedJurnal.mapel}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    Materi Pembelajaran
                  </span>
                  <p className="text-slate-900 font-medium whitespace-pre-wrap">
                    {selectedJurnal.materi}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    Catatan Presensi Siswa
                  </span>
                  <p className="text-slate-900 font-medium">
                    {selectedJurnal.absen || 'Semua Siswa Hadir'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    Catatan Tambahan
                  </span>
                  <p className="text-slate-700 italic">
                    {selectedJurnal.catatan || 'Tidak ada catatan khusus.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    Waktu Pencatatan
                  </span>
                  <p className="text-slate-700 font-mono text-[11px]">
                    {selectedJurnal.tanggalInput || selectedJurnal.tanggalWaktu}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedJurnal(null)}
              className="w-full min-h-[44px] py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors"
            >
              Tutup Rincian
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
