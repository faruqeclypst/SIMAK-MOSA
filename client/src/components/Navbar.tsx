import React, { useState, useEffect } from 'react';
import { User, LogOut, Shield, School } from 'lucide-react';
import { User as UserType } from '../lib/api';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserType | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, user, onLogout }) => {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
      setDate(now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'jadwal', label: 'Jadwal Hari Ini' },
    { id: 'riwayat', label: 'Riwayat Jurnal' },
    { id: 'kurikulum', label: 'Laporan Kurikulum' },
    { id: 'piket', label: 'Jurnal Piket' },
    { id: 'asrama', label: 'Laporan Asrama' },
    { id: 'izin', label: 'Laporan Izin' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & School Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-800 flex items-center justify-center text-amber-400 shadow-sm">
              <School className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">SIMAK</span>
                <span className="font-extrabold text-lg tracking-tight text-amber-600">MOSA</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 hidden sm:block">SMAN Modal Bangsa</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                    isActive
                      ? 'bg-blue-800 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Info: Live Time & Profile */}
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-700">{date}</span>
              <span className="text-xs font-mono font-bold text-emerald-600">{time}</span>
            </div>

            {user && (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 font-bold text-sm">
                  {user.nama.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-900 max-w-[150px] truncate">{user.nama}</p>
                  <p className="text-[10px] text-slate-500 max-w-[150px] truncate">{user.mapel}</p>
                </div>
                <button
                  onClick={onLogout}
                  title="Keluar"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
