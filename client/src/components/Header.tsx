import React, { useState, useEffect } from 'react';
import { Menu, Clock, Calendar } from 'lucide-react';
import { User, fetchSemesterSettings } from '../lib/api';
import { useQuery } from '@tanstack/react-query';

interface HeaderProps {
  activeTab: string;
  onOpenMobileSidebar: () => void;
  user: User | null;
}

const tabTitles: Record<string, { title: string; subtitle: string }> = {
  workspace: {
    title: 'Workspace Guru',
    subtitle: 'Manajemen aktivitas mengajar dan agenda KBM harian',
  },
  jurnal: {
    title: 'Jurnal Mengajar Harian',
    subtitle: 'Riwayat terpadu catatan materi dan presensi siswa per kelas',
  },
  kurikulum: {
    title: 'Monitoring Kurikulum',
    subtitle: 'Pantauan ketuntasan KBM 18 rombel kelas X, XI, dan XII',
  },
  piket: {
    title: 'Piket Sekolah & Dispensasi',
    subtitle: 'Pencatatan izin keluar kampus, dispensasi kegiatan, dan guru pengganti',
  },
  asrama: {
    title: 'Pengasuhan Asrama',
    subtitle: 'Laporan kesehatan klinik asrama dan perizinan bermalam siswa/i',
  },
  direktori: {
    title: 'Direktori Civitas Sekolah',
    subtitle: 'Pencarian data siswa aktif, alumni, dan dewan guru SMAN Modal Bangsa',
  },
  admin: {
    title: 'Pusat Kendali Jadwal & KBM',
    subtitle: 'Pengaturan KBM mingguan, dewan guru, semester, dan manajemen akun',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenMobileSidebar,
  user,
}) => {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
      setDate(
        now.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: semesterSettings } = useQuery({
    queryKey: ['semesterSettings'],
    queryFn: fetchSemesterSettings,
  });

  const currentTabInfo = tabTitles[activeTab] || {
    title: 'SIMAK MOSA',
    subtitle: 'Sistem Informasi Manajemen Aktivitas & Kehadiran',
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 shadow-2xs">
      <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Left Side: Mobile Menu Button & Breadcrumbs */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileSidebar}
            className="lg:hidden min-h-[44px] min-w-[44px] p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-700"
            aria-label="Buka Menu Navigasi"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
                {currentTabInfo.title}
              </h1>
              {activeTab === 'admin' && user?.role === 'wakil_kepala' && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                  Wakil Kepala
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 hidden sm:block truncate">
              {currentTabInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right Side: Clock, Switcher, & CTA */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Active Semester Pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>{semesterSettings ? `Semester ${semesterSettings.activeSemester} ${semesterSettings.activeTahunAjaran}` : 'Semester Genap 2025/2026'}</span>
          </div>

          {/* Date & Time Widget */}
          <div className="hidden md:flex flex-col items-end text-right">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{date}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-blue-800">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>{time}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
