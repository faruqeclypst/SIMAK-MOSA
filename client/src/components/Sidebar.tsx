import React, { useState } from 'react';
import {
  LayoutDashboard,
  BookOpenCheck,
  BarChart3,
  ShieldCheck,
  Home,
  Users,
  LogOut,
  School,
  Database,
  X,
  PlusCircle,
  Sliders,
} from 'lucide-react';
import { User as UserType, fetchSemesterSettings } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useModalBehavior } from '../lib/useModalBehavior';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserType | null;
  onLogout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenQuickJurnal: () => void;
  onUserUpdate?: (user: UserType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  isOpenMobile,
  onCloseMobile,
  onOpenQuickJurnal,
}) => {
  const { data: semesterSettings } = useQuery({
    queryKey: ['semesterSettings'],
    queryFn: fetchSemesterSettings,
  });

  const canAccessAdmin = user?.role === 'admin' || user?.role === 'wakil_kepala';
  const canAccessPiket = user?.role === 'piket' || user?.role === 'admin';
  const canAccessAsrama = user?.role === 'asrama' || user?.role === 'pengasuh' || user?.role === 'admin';

  useModalBehavior(isOpenMobile, onCloseMobile);

  const navItems = [
    {
      id: 'workspace',
      label: 'Workspace Guru',
      sublabel: 'Jadwal & aksi harian',
      icon: LayoutDashboard,
    },
    {
      id: 'jurnal',
      label: 'Jurnal Mengajar',
      sublabel: 'Presensi & materi KBM',
      icon: BookOpenCheck,
    },
    {
      id: 'kurikulum',
      label: 'Monitoring KBM',
      sublabel: 'Laporan 18 rombel',
      icon: BarChart3,
    },
    ...(canAccessPiket
      ? [
          {
            id: 'piket',
            label: 'Ruang Guru Piket',
            sublabel: 'Izin keluar kampus',
            icon: ShieldCheck,
            badge: user?.role === 'piket' ? 'Piket' : undefined,
          },
        ]
      : []),
    ...(canAccessAsrama
      ? [
          {
            id: 'asrama',
            label: 'Pengasuhan Asrama',
            sublabel: 'Klinik & perizinan siswa/i',
            icon: Home,
            badge: user?.role === 'asrama' || user?.role === 'pengasuh' ? 'Asrama' : undefined,
          },
        ]
      : []),
    {
      id: 'direktori',
      label: 'Direktori Civitas',
      sublabel: 'Siswa, alumni & guru',
      icon: Users,
    },
    ...(canAccessAdmin
      ? [
          {
            id: 'admin',
            label: user?.role === 'admin' ? 'Pusat Kendali Admin' : 'Manajemen Jadwal KBM',
            sublabel: user?.role === 'admin' ? 'Jadwal, mapel & akun' : 'Jadwal & mapel guru',
            icon: Sliders,
            badge: user?.role === 'admin' ? 'Admin' : 'Wakasek',
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Backdrop for Mobile */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden animate-fadeIn"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigasi utama"
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-900 border border-blue-700 text-amber-300 font-black text-base flex items-center justify-center shadow-inner">
              <School className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-1.5">
                SIMAK <span className="text-amber-400">MOSA</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">SMAN Modal Bangsa Aceh</p>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden min-h-[44px] min-w-[44px] text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            aria-label="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Button: Catat KBM */}
        <div className="p-3">
          <button
            onClick={() => {
              onOpenQuickJurnal();
              if (isOpenMobile) onCloseMobile();
            }}
            className="w-full min-h-[44px] py-2.5 px-3 bg-gradient-to-r from-blue-800 to-blue-700 hover:from-blue-700 hover:to-blue-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4 text-amber-300" />
            <span>+ Catat Jurnal Mengajar</span>
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (isOpenMobile) onCloseMobile();
                }}
                className={`w-full min-h-[48px] px-3 py-2.5 rounded-xl text-left transition-all flex items-center gap-3 relative outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group ${
                  isActive
                    ? 'bg-blue-900/60 text-white border border-blue-700/60 shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                }`}
              >
                {/* Active Indicator Bar (Navy + Gold Obor Prestasi) */}
                {isActive && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-1 bg-amber-400 rounded-r-full shadow-xs"
                    aria-hidden="true"
                  />
                )}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? 'bg-blue-800 text-amber-300 shadow-inner'
                      : 'bg-slate-800/60 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-700/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs truncate ${isActive ? 'font-extrabold text-white' : 'font-semibold text-slate-200'}`}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate leading-tight">
                    {item.sublabel}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Status Sinkronisasi Akademik */}
        <div className="p-3 mx-3 mb-2 rounded-xl bg-slate-950/70 border border-slate-800/90 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-2 text-[11px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Sistem Aktif & Terhubung
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 font-mono font-bold">
              Online
            </span>
          </div>
          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>{semesterSettings ? `Semester ${semesterSettings.activeSemester}` : 'Semester Genap'}</span>
            <span className="font-bold text-slate-200">{semesterSettings?.activeTahunAjaran || '2025/2026'}</span>
          </div>
        </div>

        {/* User Profile & Logout */}
        {user && (
          <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2">
            <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-blue-900 border border-blue-700 text-amber-300 font-bold text-sm flex items-center justify-center shrink-0 shadow-inner">
                  {user.nama.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-bold text-white truncate">{user.nama}</p>
                    {user.role === 'admin' && (
                      <span className="px-1.5 py-0.5 bg-amber-400 text-slate-950 font-black text-[9px] rounded uppercase tracking-wider shrink-0">
                        Admin
                      </span>
                    )}
                    {user.role === 'wakil_kepala' && (
                      <span className="px-1.5 py-0.5 bg-blue-500 text-white font-black text-[9px] rounded uppercase tracking-wider shrink-0">
                        Wakil Kepala
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{user.mapel}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                title="Keluar dari akun"
                className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg flex items-center justify-center transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                aria-label="Keluar dari akun"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
