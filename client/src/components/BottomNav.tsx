import React, { useState } from 'react';
import {
  Calendar,
  BookOpenCheck,
  BarChart3,
  ShieldCheck,
  Home,
  MoreHorizontal,
  Users,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { User } from '../lib/api';
import { useModalBehavior } from '../lib/useModalBehavior';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  user: User | null;
  onLogout: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  user,
  onLogout,
}) => {
  const [showMore, setShowMore] = useState(false);
  const canAccessAdmin = user?.role === 'admin' || user?.role === 'wakil_kepala';
  const canAccessPiket = user?.role === 'piket' || user?.role === 'admin';
  const canAccessAsrama = user?.role === 'asrama' || user?.role === 'pengasuh' || user?.role === 'admin';

  const mainTabs = [
    { id: 'workspace', label: 'Jadwal', icon: Calendar },
    { id: 'jurnal', label: 'Jurnal', icon: BookOpenCheck },
    { id: 'kurikulum', label: 'Kurikulum', icon: BarChart3 },
    ...(canAccessPiket ? [{ id: 'piket', label: 'Piket', icon: ShieldCheck }] : []),
    ...(canAccessAsrama ? [{ id: 'asrama', label: 'Asrama', icon: Home }] : []),
  ];

  const isMoreActive = activeTab === 'direktori' || activeTab === 'admin';

  useModalBehavior(showMore, () => setShowMore(false));

  return (
    <>
      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {mainTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center min-w-[52px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                  isActive ? 'text-blue-800 font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className={`p-1 rounded-lg ${isActive ? 'bg-blue-100 text-blue-900' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] sm:text-[11px] mt-0.5 leading-none">{item.label}</span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(true)}
            className={`flex flex-col items-center justify-center min-w-[52px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
              isMoreActive ? 'text-blue-800 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${isMoreActive ? 'bg-blue-100 text-blue-900' : ''}`}>
              <MoreHorizontal className="w-5 h-5" />
            </div>
            <span className="text-[10px] sm:text-[11px] mt-0.5 leading-none">Menu</span>
          </button>
        </div>
      </nav>

      {/* Drawer Overlay for Mobile "Menu Tambahan" */}
      {showMore && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowMore(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl p-5 sm:p-6 shadow-modal border-t border-slate-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
          >
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h3 id="mobile-menu-title" className="text-sm font-bold text-slate-900 uppercase tracking-wider">Menu Tambahan</h3>
              <button
                onClick={() => setShowMore(false)}
                className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-slate-700 rounded-xl flex items-center justify-center outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                aria-label="Tutup Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setActiveTab('direktori');
                  setShowMore(false);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-semibold text-xs transition-colors text-left outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                  activeTab === 'direktori' ? 'bg-blue-100 text-blue-900 font-bold' : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <Users className="w-5 h-5 text-blue-700 shrink-0" />
                <div>
                  <p className="font-bold">Direktori Civitas</p>
                  <p className="text-[11px] text-slate-500 font-normal">Data siswa, alumni, dan dewan guru</p>
                </div>
              </button>

              {canAccessAdmin && (
                <button
                  onClick={() => {
                    setActiveTab('admin');
                    setShowMore(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl font-semibold text-xs transition-colors text-left outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    activeTab === 'admin' ? 'bg-blue-100 text-blue-900 font-bold' : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <Settings className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold">Pusat Kendali Admin</p>
                      <span className="px-1.5 py-0.5 bg-amber-400 text-slate-950 text-[9px] font-black rounded uppercase">Admin</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal">Pengaturan jadwal KBM, akun, dan semester</p>
                  </div>
                </button>
              )}

              <button
                onClick={() => {
                  setShowMore(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition-colors text-left outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-700"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold">Keluar Aplikasi</p>
                  <p className="text-[11px] text-rose-500 font-normal">Akhiri sesi login pengguna di perangkat ini</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
