import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  School,
  LogIn,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  UserCheck,
  KeyRound,
  ArrowLeft,
  ShieldAlert,
  GraduationCap,
} from 'lucide-react';
import { login, changePassword, fetchUserAccounts, User, UserAccountItem } from '../lib/api';

interface LoginPageProps {
  onSuccess: (user: User, token: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<'login' | 'change_password'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // First login state
  const [pendingAuth, setPendingAuth] = useState<{ user: User; token: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Fetch list of user accounts for accurate username selection
  const { data: userAccounts = [] } = useQuery<UserAccountItem[]>({
    queryKey: ['user-accounts'],
    queryFn: fetchUserAccounts,
  });

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Username dan kata sandi wajib diisi.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await login(username.trim(), password.trim());
      if (res.success && res.user && res.token) {
        if (res.mustChangePassword || res.user.is_first_login) {
          localStorage.setItem('mosa_token', res.token);
          setPendingAuth({ user: res.user, token: res.token });
          setStep('change_password');
          setSuccessMsg('Ini adalah login perdana Anda dengan kata sandi bawaan. Demi keamanan akun, silakan buat kata sandi baru.');
          return;
        }
        localStorage.setItem('mosa_token', res.token);
        onSuccess(res.user, res.token);
      } else {
        setErrorMsg(res.message || 'Username atau kata sandi tidak sesuai.');
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server SIMAK. Silakan periksa koneksi internet.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Kata sandi baru minimal 6 karakter.');
      return;
    }

    if (newPassword === '12345678') {
      setErrorMsg('Kata sandi baru tidak boleh sama dengan kata sandi bawaan (12345678).');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok dengan kata sandi baru.');
      return;
    }

    if (!pendingAuth) {
      setErrorMsg('Sesi tidak valid. Silakan ulangi proses login.');
      setStep('login');
      return;
    }

    setIsLoading(true);

    try {
      const res = await changePassword(newPassword.trim());
      if (res.success || res.status === 'success') {
        setSuccessMsg('Kata sandi berhasil diperbarui. Mengalihkan ke dashboard...');
        const updatedUser: User = res.user || {
          ...pendingAuth.user,
          is_first_login: false,
        };
        const finalToken = res.token || pendingAuth.token;
        localStorage.setItem('mosa_token', finalToken);
        localStorage.setItem('mosa_user', JSON.stringify(updatedUser));
        setTimeout(() => {
          onSuccess(updatedUser, finalToken);
        }, 800);
      } else {
        setErrorMsg(res.message || 'Gagal memperbarui kata sandi. Silakan coba lagi.');
      }
    } catch {
      setErrorMsg('Terjadi kesalahan saat menyimpan kata sandi baru.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAccount = (selectedUsername: string) => {
    if (!selectedUsername) return;
    setUsername(selectedUsername);
    setErrorMsg(null);
  };

  const handleCancelFirstLogin = () => {
    localStorage.removeItem('mosa_token');
    setPendingAuth(null);
    setNewPassword('');
    setConfirmPassword('');
    setPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setStep('login');
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between items-center bg-slate-900 text-slate-100 p-4 sm:p-6 selection:bg-amber-300 selection:text-slate-900">
      {/* Top Identity Bar */}
      <header className="w-full max-w-5xl flex items-center justify-between py-2 text-slate-300 text-xs">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-amber-400" />
          <span className="font-bold tracking-wide uppercase text-[11px] sm:text-xs text-slate-200">
            SMAN Modal Bangsa Aceh
          </span>
        </div>
        <div className="text-[11px] text-slate-400 hidden sm:block">
          Sistem Informasi Manajemen Aktivitas &amp; Kehadiran
        </div>
      </header>

      {/* Main Login Card Container */}
      <main className="w-full max-w-md my-auto py-6">
        <div className="bg-white rounded-3xl p-6 sm:p-8 w-full shadow-2xl border border-slate-200/90 text-slate-900 animate-fadeIn">
          {/* Header Branding */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-900 text-amber-400 mx-auto flex items-center justify-center shadow-md border border-blue-800">
              {step === 'login' ? <School className="w-8 h-8" /> : <KeyRound className="w-8 h-8" />}
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              SIMAK <span className="text-blue-900">MOSA</span>
            </h1>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {step === 'login'
                ? 'Sistem Informasi Manajemen Aktivitas & Kehadiran SMAN Modal Bangsa'
                : 'Pembaruan Kata Sandi Wajib (Login Pertama)'}
            </p>
          </div>

          {/* Notifications */}
          {errorMsg && (
            <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2 animate-fadeIn" role="alert">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fadeIn" role="status">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* STEP 1: FORM LOGIN UTAMA */}
          {step === 'login' && (
            <>
              {/* ExamKu Single Sign-On Info Banner */}
              <div className="mt-4 p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-blue-900 text-[11px] leading-relaxed flex items-start gap-2.5">
                <div className="p-1 rounded-lg bg-blue-100 text-blue-800 shrink-0 mt-0.5">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-blue-950">
                    <span>Terintegrasi dengan PocketBase ExamKu</span>
                    <span className="inline-block px-1.5 py-0.5 text-[9px] bg-blue-200 text-blue-900 rounded font-bold uppercase tracking-wider">SSO</span>
                  </div>
                  <p className="mt-0.5 text-blue-800/90 text-[11px]">
                    Gunakan username dan kata sandi yang sama persis dengan akun <strong className="font-semibold text-blue-950">modalbangsa.examku.my.id</strong> Anda.
                  </p>
                </div>
              </div>

              {/* Quick-Select Dropdown Akun Pengguna */}
              <div className="mt-4 space-y-1 text-xs">
                <label htmlFor="guru-select" className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-800" />
                  <span>Pilih Akun Guru / Pengguna:</span>
                </label>
                <select
                  id="guru-select"
                  onChange={(e) => handleSelectAccount(e.target.value)}
                  value={username}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
                >
                  <option value="">Pilih dari Daftar Akun...</option>
                  {userAccounts.map((acc) => (
                    <option key={acc.username} value={acc.username}>
                      {acc.nama} {acc.role === 'admin' ? '(Admin)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Form Input Username & Password */}
              <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3.5 text-xs text-slate-800">
                <div className="space-y-1">
                  <label htmlFor="username-input" className="block font-bold uppercase tracking-wider text-slate-700">
                    Username Pendidik / Admin *
                  </label>
                  <input
                    id="username-input"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ketik username akun Anda"
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="password-input" className="block font-bold uppercase tracking-wider text-slate-700">
                    Kata Sandi *
                  </label>
                  <div className="relative">
                    <input
                      id="password-input"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi..."
                      className="w-full min-h-[44px] pl-4 pr-11 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-800 p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-800 rounded-lg"
                      aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[46px] py-3 rounded-xl bg-blue-900 hover:bg-blue-800 active:bg-blue-950 text-white font-bold text-xs shadow-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-800"
                >
                  <LogIn className="w-4 h-4 text-amber-300" />
                  <span>{isLoading ? 'Memverifikasi...' : 'Masuk ke Sistem'}</span>
                </button>
              </form>

              <div className="mt-5 pt-3 border-t border-slate-100 text-center space-y-1 text-[11px] text-slate-500">
                <p className="font-semibold text-slate-700">
                  Hak Akses: Administrator, Wakil Kepala, Dewan Guru
                </p>
                <p className="text-[10px] text-slate-400">
                  SMA Negeri Modal Bangsa Aceh &copy; 2026
                </p>
              </div>
            </>
          )}

          {/* STEP 2: WAJIB GANTI PASSWORD BARU (LOGIN PERTAMA) */}
          {step === 'change_password' && pendingAuth && (
            <div className="mt-5 space-y-4 text-xs text-slate-800">
              {/* Info Box Akun & Keamanan */}
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Ganti Kata Sandi Baru Diperlukan</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Halo, <strong>{pendingAuth.user.nama}</strong>. Anda baru pertama kali login menggunakan kata sandi bawaan. Demi keamanan akun Anda, silakan buat kata sandi baru pribadi.
                </p>
              </div>

              <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5">
                <div className="space-y-1">
                  <label htmlFor="new-password-input" className="block font-bold uppercase tracking-wider text-slate-700">
                    Kata Sandi Baru *
                  </label>
                  <div className="relative">
                    <input
                      id="new-password-input"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full min-h-[44px] pl-4 pr-11 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-800 p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-800 rounded-lg"
                      aria-label={showNewPassword ? 'Sembunyikan sandi baru' : 'Lihat sandi baru'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Minimal 6 karakter, tidak boleh menggunakan 12345678.
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="confirm-password-input" className="block font-bold uppercase tracking-wider text-slate-700">
                    Konfirmasi Kata Sandi Baru *
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi baru..."
                      className="w-full min-h-[44px] pl-4 pr-11 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-800 p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-800 rounded-lg"
                      aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi sandi' : 'Lihat konfirmasi sandi'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[46px] py-3 rounded-xl bg-blue-900 hover:bg-blue-800 active:bg-blue-950 text-white font-bold text-xs shadow-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-800"
                >
                  <KeyRound className="w-4 h-4 text-amber-300" />
                  <span>{isLoading ? 'Menyimpan Sandi Baru...' : 'Simpan Sandi & Masuk Dashboard'}</span>
                </button>

                {pendingAuth && (
                  <button
                    type="button"
                    onClick={() => onSuccess(pendingAuth.user, pendingAuth.token)}
                    className="w-full min-h-[40px] py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-800"
                  >
                    <span>Lewati &amp; Langsung Masuk ke Dashboard</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCancelFirstLogin}
                  className="w-full min-h-[40px] py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Batal / Masuk dengan Akun Lain</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="w-full max-w-5xl py-2 text-center text-[11px] text-slate-400">
        SIMAK-MOSA &bull; Sistem Informasi Manajemen Administrasi &amp; Kurikulum &bull; Versi 2.1
      </footer>
    </div>
  );
};
