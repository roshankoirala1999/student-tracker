import React, { useState } from 'react';
import { GraduationCap, LogOut, ShieldCheck, User, Trash2, Lock, Sun, Moon, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { PasswordConfirmModal } from '../common/PasswordConfirmModal.tsx';
import { apiRequest } from '../../api/client.ts';

interface Props {
  viewMode: 'app' | 'admin';
  setViewMode: (mode: 'app' | 'admin') => void;
  onOpenMobileSidebar?: () => void;
}

export const Header: React.FC<Props> = ({ viewMode, setViewMode, onOpenMobileSidebar }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'master_admin' || user.role === 'administrator';

  const handleConfirmDeleteAccount = async (password: string) => {
    const res = await apiRequest('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });

    if (!res.success) {
      throw new Error(res.message || 'Failed to delete account.');
    }

    // Account successfully cascade-deleted, logout immediately
    logout();
  };

  return (
    <header className="bg-white dark:bg-[#1A2232] border-b border-slate-200/80 dark:border-slate-700/80 sticky top-0 z-30 shadow-2xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand & Mobile Hamburger */}
          <div className="flex items-center gap-3">
            {onOpenMobileSidebar && viewMode === 'app' && (
              <button
                type="button"
                onClick={onOpenMobileSidebar}
                aria-label="Open navigation drawer"
                className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Menu className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
              </button>
            )}
            <div className="w-10 h-10 bg-[#2B547E] rounded-2xl flex items-center justify-center text-white shadow-xs shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">Student Tracker</h1>
              <p className="text-[11px] text-[#355C7D] dark:text-blue-400 font-medium">Academic &amp; Marks Management</p>
            </div>
          </div>

          {/* User profile, Theme Toggle, & actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Indicator for Administrators (Classes tab hidden for admin) */}
            {isAdmin && (
              <div className="flex bg-[#F4F6FA] dark:bg-[#0F172A] p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('admin')}
                  className="px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-default bg-[#1A2232] dark:bg-[#2B547E] text-white shadow-xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Administrator</span>
                </button>
              </div>
            )}

            {/* Sun / Moon Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-2xs cursor-pointer transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Profile Pill */}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-700">
              <div className="w-8 h-8 rounded-xl bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                {isAdmin ? (
                  <ShieldCheck className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                ) : (
                  <User className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                )}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{user.username}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                  {isAdmin ? 'Administrator' : 'Teacher'}
                </p>
              </div>
            </div>

            {/* Delete Account (for teachers who are not locked) */}
            {!isAdmin && (
              <button
                type="button"
                onClick={() => setDeleteAccountModalOpen(true)}
                disabled={user.isDeletionLocked}
                title={user.isDeletionLocked ? 'Account deletion is administratively locked' : 'Delete my teacher account'}
                className={`p-2.5 rounded-xl transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                  user.isDeletionLocked
                    ? 'text-slate-400 bg-slate-50 dark:bg-slate-800/50'
                    : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                }`}
              >
                {user.isDeletionLocked ? <Lock className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}

            {/* Log Out */}
            <button
              type="button"
              onClick={logout}
              title="Log out"
              className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      <PasswordConfirmModal
        isOpen={deleteAccountModalOpen}
        title="Delete Your Teacher Account"
        description={
          user.isDeletionLocked
            ? 'Account deletion is currently LOCKED by the Administrator. You cannot delete this account at this time.'
            : 'Are you sure you want to delete your teacher account? This will cascade delete all your classes, sections, student rosters, marks, and attendance permanently.'
        }
        confirmButtonText="Permanently Delete Account"
        isDestructive={true}
        onClose={() => setDeleteAccountModalOpen(false)}
        onConfirm={handleConfirmDeleteAccount}
      />
    </header>
  );
};
