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
} from 'lucide-react';
import { login, changePassword, fetchGuru, User } from '../lib/api';

interface LoginModalProps {
  onSuccess: (user: User, token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
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

  // Fetch list of teachers for quick username filling
  const { data: guruList = [] } = useQuery({
    queryKey: ['guru'],
    queryFn: fetchGuru,
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
    } catch (err: any) {
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
        setTimeout(() => {
          onSuccess(updatedUser, pendingAuth.token);
        }, 1200);
      } else {
        setErrorMsg(res.message || 'Gagal memperbarui kata sandi. Silakan coba lagi.');
      }
    } catch (err: any) {
      setErrorMsg('Terjadi kesalahan saat menyimpan kata sandi baru.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectGuru = (namaGuru: string) => {
    if (!namaGuru) return;
    const cleanUser = namaGuru.toLowerCase().replace(/[^a-z0-9]/g, '_');
    setUsername(cleanUser);
    // Hanya mengisi username, tidak membocorkan atau mengisi kata sandi
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-modal border border-slate-200 my-8">
        
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-900 to-slate-900 text-amber-300 mx-auto flex items-center justify-center shadow-md border border-blue-800">
            {step === 'login' ? <School className="w-8 h-8" /> : <KeyRound className="w-8 h-8" />}
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            SIMAK <span className="text-blue-900">MOSA</span>
          </h2>
          <p className="text-xs text-slate-600 font-medium">
            {step === 'login'
              ? 'Sistem Informasi Manajemen Aktivitas & Kehadiran SMAN Modal Bangsa'
              : 'Pembaruan Kata Sandi Wajib (Login Pertama)'}
          </p>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* STEP 1: FORM LOGIN BIASA */}
        {step === 'login' && (
          <>
            {/* Teacher Quick-Select Dropdown (Hanya mengisi username) */}
            <div className="mt-5 space-y-1 text-xs">
              <label className="block font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-800" />
                <span>Cari Akun Guru (Otomatis Isi Username):</span>
              </label>
              <select
                onChange={(e) => handleSelectGuru(e.target.value)}
                defaultValue=""
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                <option value="">-- Pilih dari Dewan Guru --</option>
                {guruList.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Form Input Username & Password */}
            <form onSubmit={handleLoginSubmit} className="mt-4 space-y-3.5 text-xs text-slate-800">
              <div className="space-y-1">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Username Pendidik / Admin *
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ketik username akun Anda"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Kata Sandi *
                </label>
                <div className="relative">
                  <input
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
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 p-1"
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full min-h-[46px] py-3 rounded-xl bg-blue-800 hover:bg-blue-700 active:bg-blue-900 text-white font-bold text-xs shadow-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2 focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <LogIn className="w-4 h-4 text-amber-300" />
                <span>{isLoading ? 'Memverifikasi...' : 'Masuk ke Sistem'}</span>
              </button>
            </form>

            <div className="mt-5 pt-3 border-t border-slate-100 text-center space-y-1 text-[11px] text-slate-500">
              <p className="font-semibold text-slate-700">
                Hak Akses: Administrator • Wakil Kepala • Dewan Guru
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
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Kata Sandi Baru *
                </label>
                <div className="relative">
                  <input
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
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 p-1"
                    aria-label={showNewPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Minimal 6 karakter, tidak boleh menggunakan 12345678.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block font-bold uppercase tracking-wider text-slate-700">
                  Konfirmasi Kata Sandi Baru *
                </label>
                <div className="relative">
                  <input
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
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 p-1"
                    aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi sandi' : 'Lihat konfirmasi sandi'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full min-h-[46px] py-3 rounded-xl bg-blue-800 hover:bg-blue-700 active:bg-blue-900 text-white font-bold text-xs shadow-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2 focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <KeyRound className="w-4 h-4 text-amber-300" />
                <span>{isLoading ? 'Menyimpan Sandi Baru...' : 'Simpan Sandi & Masuk Dashboard'}</span>
              </button>

              {pendingAuth && (
                <button
                  type="button"
                  onClick={() => onSuccess(pendingAuth.user, pendingAuth.token)}
                  className="w-full min-h-[40px] py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Lewati &amp; Langsung Masuk ke Dashboard</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCancelFirstLogin}
                className="w-full min-h-[40px] py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Batal / Masuk dengan Akun Lain</span>
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
