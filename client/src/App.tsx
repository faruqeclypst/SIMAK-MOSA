import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { QuickJurnalModal } from './components/QuickJurnalModal';
import { Toast, ToastProps } from './components/Toast';
import { JadwalSection } from './components/JadwalSection';
import { RiwayatJurnalSection } from './components/RiwayatJurnalSection';
import { LaporanKurikulumSection } from './components/LaporanKurikulumSection';
import { PiketSection } from './components/PiketSection';
import { AsramaSection } from './components/AsramaSection';
import { DirektoriSection } from './components/DirektoriSection';
import { AdminJadwalSection } from './components/AdminJadwalSection';
import { LoginPage } from './components/LoginPage';
import { BottomNav } from './components/BottomNav';
import { ShieldCheck, Home } from 'lucide-react';
import { User } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 20, // 20 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('workspace');
  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState(false);
  const [isQuickJurnalOpen, setIsQuickJurnalOpen] = useState(false);
  const [quickJurnalPreselect, setQuickJurnalPreselect] = useState<{
    kelas?: string;
    jam?: string[];
    mapel?: string;
  } | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'success' | 'error' }>>([]);

  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('mosa_user');
    const token = localStorage.getItem('mosa_token');
    if (saved && token) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.nama && parsed.nama.toLowerCase().includes('alfaruq')) {
          parsed.role = 'admin';
        }
        return parsed;
      } catch {
        // fallback
      }
    }
    return null;
  });
  const [showLogin, setShowLogin] = useState(() => {
    const saved = localStorage.getItem('mosa_user');
    const token = localStorage.getItem('mosa_token');
    return !(saved && token);
  });

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleOpenQuickJurnalWithClass = (kelas: string, jam: string[], mapel?: string) => {
    setQuickJurnalPreselect({ kelas, jam, mapel });
    setIsQuickJurnalOpen(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('mosa_user');
    localStorage.removeItem('mosa_token');
    setUser(null);
    setShowLogin(true);
  };

  const handleLoginSuccess = (loggedInUser: User, token: string) => {
    const role = loggedInUser.nama.toLowerCase().includes('alfaruq') ? 'admin' : (loggedInUser.role || 'guru');
    const updated = { ...loggedInUser, role, is_first_login: false };
    localStorage.setItem('mosa_user', JSON.stringify(updated));
    localStorage.setItem('mosa_token', token);
    setUser(updated);
    setShowLogin(false);
    addToast(`Selamat datang kembali, ${updated.nama}`);
  };

  // If user is not logged in, render the dedicated LoginPage ONLY (never show dashboard underneath)
  if (!user || showLogin) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased selection:bg-amber-300 selection:text-slate-900">
        <LoginPage onSuccess={handleLoginSuccess} />
        {/* Toast Notifications Container */}
        <div
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                id={toast.id}
                message={toast.message}
                type={toast.type}
                onClose={removeToast}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-900 font-sans antialiased selection:bg-amber-200 selection:text-slate-900">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        isOpenMobile={isOpenMobileSidebar}
        onCloseMobile={() => setIsOpenMobileSidebar(false)}
        onOpenQuickJurnal={() => setIsQuickJurnalOpen(true)}
        onUserUpdate={(updated) => {
          setUser(updated);
          addToast('Profil pengguna berhasil diperbarui.');
        }}
      />

      {/* Main App Canvas */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onOpenMobileSidebar={() => setIsOpenMobileSidebar(true)}
          user={user}
        />

        {/* Dynamic Section Content */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-28 lg:pb-12">
          {activeTab === 'workspace' && (
            <JadwalSection
              user={user}
              onOpenQuickJurnalWithClass={handleOpenQuickJurnalWithClass}
              onNavigateToAdmin={() => setActiveTab('admin')}
            />
          )}
          {activeTab === 'jurnal' && <RiwayatJurnalSection user={user} />}
          {activeTab === 'kurikulum' && <LaporanKurikulumSection />}
          {activeTab === 'piket' && (
            (user?.role === 'piket' || user?.role === 'admin') ? (
              <PiketSection />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">Akses Terbatas: Ruang Guru Piket</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Halaman ini dikhususkan untuk pendidik yang bertugas di Pos Piket Sekolah dan Administrator Sistem.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('workspace')}
                  className="min-h-[44px] px-5 py-2 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  Kembali ke Workspace Guru
                </button>
              </div>
            )
          )}
          {activeTab === 'asrama' && (
            (user?.role === 'asrama' || user?.role === 'pengasuh' || user?.role === 'admin') ? (
              <AsramaSection />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                  <Home className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">Akses Terbatas: Pengasuhan Asrama</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Halaman ini dikhususkan untuk Pengurus / Pembina Asrama Kampus dan Administrator Sistem.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('workspace')}
                  className="min-h-[44px] px-5 py-2 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  Kembali ke Workspace Guru
                </button>
              </div>
            )
          )}
          {activeTab === 'direktori' && <DirektoriSection user={user} />}
          {activeTab === 'admin' && (user?.role === 'admin' || user?.role === 'wakil_kepala') && (
            <AdminJadwalSection
              user={user}
              onSuccessToast={(msg) => addToast(msg, 'success')}
            />
          )}
        </main>
      </div>

      {/* Quick KBM Journal Modal */}
      <QuickJurnalModal
        isOpen={isQuickJurnalOpen}
        onClose={() => {
          setIsQuickJurnalOpen(false);
          setQuickJurnalPreselect(null);
        }}
        preselect={quickJurnalPreselect}
        user={user}
        onSuccessToast={(msg) => addToast(msg, 'success')}
      />

      {/* Toast Notifications Container */}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              id={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={removeToast}
            />
          </div>
        ))}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
};

export default App;
