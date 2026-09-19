import React, { useState, useEffect } from 'react';
import { Lock, AlertTriangle, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  title: string;
  description: string;
  confirmButtonText?: string;
  isDestructive?: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
  children?: React.ReactNode;
}

export const PasswordConfirmModal: React.FC<Props> = ({
  isOpen,
  title,
  description,
  confirmButtonText = 'Confirm',
  isDestructive = true,
  onClose,
  onConfirm,
  children,
}) => {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your login password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onConfirm(password);
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Password confirmation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 max-h-[92vh] flex flex-col overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            {isDestructive ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            ) : (
              <Lock className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            )}
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>

          {isDestructive && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300">
              This action cannot be undone. Enter your current login password to proceed.
            </div>
          )}

          {children}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Current Login Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Enter your password"
                autoFocus
                required
                className="w-full px-3.5 py-2.5 min-h-[42px] text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10 shadow-2xs"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          {error && <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</div>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setPassword('');
                onClose();
              }}
              disabled={submitting}
              className="px-4 py-2.5 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2.5 min-h-[42px] text-xs font-semibold text-white rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-xs ${
                isDestructive
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-[#2B547E] hover:bg-[#355C7D]'
              } disabled:opacity-50`}
            >
              {submitting ? 'Verifying...' : confirmButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
