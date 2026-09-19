import React, { useState } from 'react';
import { KeyRound, Lock, AlertCircle, LogOut } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface ForcedPasswordChangeProps {
  onSuccess: () => Promise<void>;
}

export const ForcedPasswordChange: React.FC<ForcedPasswordChangeProps> = ({ onSuccess }) => {
  const { user, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const lowerPassword = newPassword.toLowerCase();
    if (lowerPassword.includes('password') || lowerPassword.includes('admin')) {
      setError("Password cannot contain reserved words such as 'password' or 'admin'.");
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const res = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
    setLoading(false);

    if (res.success) {
      await onSuccess();
    } else {
      setError(res.message || 'Failed to update password.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] dark:bg-[#0B0F19] flex flex-col justify-center items-center px-4 py-12 transition-colors">
      <div className="bg-white dark:bg-[#1A2232] w-full max-w-md p-8 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-lg space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-2xl flex items-center justify-center">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Password Update Required
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Hello <span className="font-semibold text-slate-800 dark:text-slate-200">{user?.username}</span>. An administrator reset your password or your account requires a mandatory password update. Please set a new password to proceed.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              New Password (min 6 characters)
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new secure password"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new secure password"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || newPassword.length < 6}
            className="w-full py-2.5 px-4 bg-[#2B547E] hover:bg-[#355C7D] dark:bg-[#2B547E] dark:hover:bg-[#355C7D] text-white rounded-xl text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Updating Password...' : 'Save New Password & Continue'}
          </button>
        </form>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out and return later</span>
          </button>
        </div>
      </div>
    </div>
  );
};
