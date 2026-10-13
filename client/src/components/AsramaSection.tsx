import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  HeartPulse,
  CheckCircle2,
  AlertCircle,
  Users,
  Search,
  Clock,
  Filter,
  RefreshCw
} from 'lucide-react';
import {
  fetchAsramaKehadiran,
  simpanAsramaKehadiran,
  hapusAsramaKehadiran,
  fetchKelas,
  fetchSiswa,
  IzinEntry
} from '../lib/api';
import { Trash2 } from 'lucide-react';

export const AsramaSection: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedKelas, setSelectedKelas] = useState('X-1');
  const [selectedSiswa, setSelectedSiswa] = useState<string[]>([]);
  const [statusAsrama, setStatusAsrama] = useState('Sakit');
  const [catatanAsrama, setCatatanAsrama] = useState('Istirahat di Kamar Asrama / UKS');
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);
  const [searchSiswa, setSearchSiswa] = useState('');
  const [filterLogKelas, setFilterLogKelas] = useState('all');

  // Queries: Class List from PocketBase REST API
  const {
    data: kelasList = [],
    isLoading: isLoadingKelas,
    refetch: refetchKelas
  } = useQuery({
    queryKey: ['kelas'],
    queryFn: fetchKelas,
  });

  // Keep all academic and active classes from REST API including ABC and Dummy
  const validKelasList = useMemo(() => {
    return kelasList.filter(
      (k) =>
        k.nama &&
        k.nama !== 'ALUMNI' &&
        !k.nama.toLowerCase().includes('alumni')
    );
  }, [kelasList]);

  // Keep selectedKelas aligned with valid classes
  useEffect(() => {
    if (validKelasList.length > 0 && !validKelasList.some((k) => k.nama === selectedKelas)) {
      setSelectedKelas(validKelasList[0].nama);
    }
  }, [validKelasList, selectedKelas]);

  // Query: Student List for currently selected class
  const { data: rawSiswa = [], isLoading: isLoadingSiswa } = useQuery({
    queryKey: ['siswa', selectedKelas],
    queryFn: () => fetchSiswa(selectedKelas) as Promise<string[]>,
    enabled: !!selectedKelas,
  });
  const siswaList: string[] = Array.isArray(rawSiswa) ? rawSiswa : [];

  // Filter students based on search input
  const filteredSiswa = useMemo(() => {
    if (!searchSiswa.trim()) return siswaList;
    const q = searchSiswa.toLowerCase().trim();
    return siswaList.filter((s) => s.toLowerCase().includes(q));
  }, [siswaList, searchSiswa]);

  // Query: Asrama Daily Logs
  const { data: dataAsrama = [], isLoading: isLoadingAsrama } = useQuery({
    queryKey: ['asramaKehadiran'],
    queryFn: fetchAsramaKehadiran,
  });

  // Today's WIB date string format "DD-MM-YYYY"
  const todayWibStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date()).replace(/\//g, '-');
  }, []);

  // Filter logs strictly for today and by class
  const todayDataAsrama = useMemo(() => {
    return dataAsrama.filter((item) => !item.tanggal || item.tanggal === todayWibStr);
  }, [dataAsrama, todayWibStr]);

  const filteredLogs = useMemo(() => {
    if (filterLogKelas === 'all') return todayDataAsrama;
    return todayDataAsrama.filter((item) => item.kelas === filterLogKelas);
  }, [todayDataAsrama, filterLogKelas]);

  // Mutation
  const mutation = useMutation({
    mutationFn: (data: { kelas: string; siswa: string[]; status: string; keterangan?: string }) =>
      simpanAsramaKehadiran(data.kelas, data.siswa, data.status, data.keterangan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asramaKehadiran'] });
      queryClient.invalidateQueries({ queryKey: ['rekapIzin'] });
      setAlertSuccess('Laporan pengasuhan asrama berhasil disimpan ke database SIMAK.');
      setSelectedSiswa([]);
      setCatatanAsrama('Istirahat di Kamar Asrama / UKS');
      setTimeout(() => setAlertSuccess(null), 3500);
    },
  });

  const mutationDelete = useMutation({
    mutationFn: (id: string) => hapusAsramaKehadiran(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asramaKehadiran'] });
      queryClient.invalidateQueries({ queryKey: ['rekapIzin'] });
      setAlertSuccess('Catatan pengasuhan siswa berhasil dibatalkan.');
      setTimeout(() => setAlertSuccess(null), 3000);
    },
  });

  const handleToggleSiswa = (nama: string) => {
    setSelectedSiswa((prev) =>
      prev.includes(nama) ? prev.filter((s) => s !== nama) : [...prev, nama]
    );
  };

  const handleSelectAllFiltered = () => {
    setSelectedSiswa((prev) => Array.from(new Set([...prev, ...filteredSiswa])));
  };

  const handleDeselectAll = () => {
    setSelectedSiswa([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSiswa.length === 0) {
      alert('Pilih minimal satu siswa/i yang tercatat di pos pengasuhan.');
      return;
    }
    mutation.mutate({
      kelas: selectedKelas,
      siswa: selectedSiswa,
      status: statusAsrama,
      keterangan: catatanAsrama.trim() || statusAsrama,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Home className="w-5 h-5 text-blue-900" />
              <span>Pengasuhan &amp; Keasramaan Kampus</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Pencatatan kondisi siswa/i di pos pengasuhan asrama SMAN Modal Bangsa yang tersinkronisasi otomatis dengan KBM kelas pagi.
            </p>
          </div>
          {/* Status Indicator Clean */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold rounded-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>Terhubung</span>
            </span>
          </div>
        </div>
      </div>

      {alertSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold rounded-xl flex items-center gap-2 animate-fadeIn" role="status">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{alertSuccess}</span>
        </div>
      )}

      {/* Main Grid: Left Form + Right Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Input Asrama */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Input Kondisi Siswa/i
            </h3>
            <p className="text-xs text-slate-500">
              Laporan pembina asrama untuk sinkronisasi izin KBM kelas pagi.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 2. Rombel / Kelas (PocketBase REST API) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Rombel / Kelas
                </label>
                <button
                  type="button"
                  onClick={() => refetchKelas()}
                  className="text-[11px] text-blue-800 hover:text-blue-950 font-semibold flex items-center gap-1"
                  title="Sinkron ulang data kelas"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingKelas ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
              <select
                value={selectedKelas}
                onChange={(e) => {
                  setSelectedKelas(e.target.value);
                  setSelectedSiswa([]);
                  setSearchSiswa('');
                }}
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                {validKelasList.length === 0 ? (
                  <option value="X-1">Memuat data kelas dari REST API...</option>
                ) : (
                  validKelasList.map((k) => (
                    <option key={k.nama} value={k.nama}>
                      Kelas {k.nama}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 3. Siswa/i Selector with Search */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Pilih Siswa/i ({selectedSiswa.length} Dipilih)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-900 hover:bg-blue-100 font-bold border border-blue-200"
                  >
                    Pilih Semua
                  </button>
                  {selectedSiswa.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold border border-slate-200"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </div>

              {/* Search Siswa/i Input */}
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchSiswa}
                  onChange={(e) => setSearchSiswa(e.target.value)}
                  placeholder={`Cari nama siswa/i di kelas ${selectedKelas}...`}
                  className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>

              {/* Siswa/i List */}
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-1.5 divide-y divide-slate-100 bg-slate-50 text-xs">
                {isLoadingSiswa ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    Memuat daftar siswa/i kelas {selectedKelas}...
                  </div>
                ) : filteredSiswa.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    {searchSiswa
                      ? `Tidak ada siswa/i dengan nama "${searchSiswa}" di kelas ${selectedKelas}.`
                      : `Belum ada data siswa/i untuk kelas ${selectedKelas}.`}
                  </div>
                ) : (
                  filteredSiswa.map((siswa) => {
                    const isSelected = selectedSiswa.includes(siswa);
                    return (
                      <button
                        type="button"
                        key={siswa}
                        onClick={() => handleToggleSiswa(siswa)}
                        className={`w-full min-h-[38px] px-3 py-2 text-left rounded-lg flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-blue-900 text-white font-semibold shadow-2xs'
                            : 'hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        <span className="truncate">{siswa}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0 ml-2" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. Status Kehadiran / Jenis Izin */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Kategori Status Kehadiran
              </label>
              <select
                value={statusAsrama}
                onChange={(e) => setStatusAsrama(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                <option value="Sakit">Sakit (Kamar Asrama / Ruang Rawat UKS)</option>
                <option value="Izin Pulang">Izin Pulang (Pulang ke Rumah / Dijemput Wali)</option>
                <option value="Izin Keluarga">Izin Keluarga (Keperluan Keluarga Mendesak)</option>
                <option value="Dispensasi">Dispensasi Asrama (Kegiatan Resmi / Lomba Kampus)</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            {/* 4. Diagnosis / Catatan Pembina */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Keterangan / Catatan Pengasuhan
              </label>
              <input
                type="text"
                value={catatanAsrama}
                onChange={(e) => setCatatanAsrama(e.target.value)}
                placeholder="Contoh: Istirahat di klinik, demam, izin bermalam, atau observasi medis..."
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
              />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending || selectedSiswa.length === 0}
              className="w-full min-h-[46px] bg-blue-900 hover:bg-blue-800 active:bg-blue-950 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-800"
            >
              {mutation.isPending ? 'Menyimpan ke Database...' : `Simpan Laporan Pengasuhan (${selectedSiswa.length} Siswa/i)`}
            </button>
          </form>
        </div>

        {/* Right Log */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Log Pemantauan Asrama Hari Ini
              </h3>
              <p className="text-xs text-slate-500">
                Total {filteredLogs.length} catatan siswa/i terdata di pos pengasuhan.
              </p>
            </div>

            {/* Filter Kelas for Log */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={filterLogKelas}
                onChange={(e) => setFilterLogKelas(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                <option value="all">Semua Kelas ({todayDataAsrama.length})</option>
                {validKelasList.map((k) => (
                  <option key={k.nama} value={k.nama}>
                    Kelas {k.nama}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs divide-y divide-slate-100">
            {isLoadingAsrama ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Memuat catatan asrama...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-bold text-slate-800">Kondisi Asrama Sehat &amp; Aman</p>
                <p className="text-slate-500">
                  {filterLogKelas === 'all'
                    ? 'Tidak ada siswa/i yang tercatat di pos pengasuhan saat ini.'
                    : `Tidak ada siswa/i kelas ${filterLogKelas} yang tercatat di pos pengasuhan.`}
                </p>
              </div>
            ) : (
              filteredLogs.map((item, idx) => {
                const itemStatus = item.status || 'Sakit';
                const isSakit = itemStatus === 'Sakit';
                const isPulang = itemStatus === 'Izin Pulang' || itemStatus === 'Izin Keluarga';
                const isDispen = itemStatus === 'Dispensasi';

                return (
                  <div key={idx} className="py-3 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{item.namaSiswa}</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded font-extrabold text-[11px]">
                          {item.kelas}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                            isSakit
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : isPulang
                              ? 'bg-sky-50 text-sky-800 border-sky-200'
                              : isDispen
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-blue-50 text-blue-900 border-blue-200'
                          }`}
                        >
                          {itemStatus}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1">
                        Keterangan: <span className="font-semibold text-slate-800">{item.keterangan}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end">
                      <span className="text-[11px] font-mono text-slate-500 block">{item.tanggal}</span>
                      {item.id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Batalkan izin asrama untuk ${item.namaSiswa}?`)) {
                              mutationDelete.mutate(item.id!);
                            }
                          }}
                          disabled={mutationDelete.isPending}
                          className="min-h-[30px] px-2 py-0.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors border border-transparent hover:border-rose-200 mt-1"
                          title="Batalkan izin siswa ini"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Batalkan</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
