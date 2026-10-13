import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ id, message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 3500);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const bgStyles =
    type === 'success'
      ? 'bg-emerald-900 border-emerald-700 text-emerald-100'
      : type === 'error'
      ? 'bg-rose-900 border-rose-700 text-rose-100'
      : 'bg-slate-900 border-slate-700 text-slate-100';

  const Icon =
    type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Info;

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-md w-full transition-all animate-slideUp ${bgStyles}`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <p className="text-xs font-semibold flex-1 leading-snug">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
        aria-label="Tutup Notifikasi"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
