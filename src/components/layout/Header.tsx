import React, { useState, useEffect } from 'react';
import { GraduationCap, LogOut, ShieldCheck, User, Sun, Moon, Menu, Maximize, Minimize } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { TeacherProfileModal } from '../auth/TeacherProfileModal.tsx';
import { TeacherMessagingBar } from '../messaging/TeacherMessagingBar.tsx';

interface Props {
  viewMode: 'app' | 'admin';
  setViewMode: (mode: 'app' | 'admin') => void;
  onOpenMobileSidebar?: () => void;
  onGoHome?: () => void;
}

export const Header: React.FC<Props> = ({ viewMode, setViewMode, onOpenMobileSidebar, onGoHome }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  if (!user) return null;

  const isAdmin = user.role === 'master_admin' || user.role === 'administrator';

  return (
    <header className="bg-white dark:bg-[#1A2232] border-b border-slate-200/80 dark:border-slate-700/80 sticky top-0 z-30 shadow-2xs transition-colors duration-200">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand & Mobile Hamburger pinned to leftmost edge */}
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
            <button
              type="button"
              onClick={onGoHome}
              className="flex items-center gap-3 group cursor-pointer text-left focus:outline-hidden"
              title="Go to Home"
            >
              <div className="w-10 h-10 bg-[#2B547E] group-hover:bg-[#355C7D] rounded-2xl flex items-center justify-center text-white shadow-xs shrink-0 transition-transform active:scale-95">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight group-hover:text-[#2B547E] dark:group-hover:text-blue-400 transition-colors">
                  Student management
                </h1>
              </div>
            </button>
          </div>

          {/* User profile, Theme Toggle, Fullscreen & actions */}
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
              title="Toggle theme"
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-2xs cursor-pointer transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-2xs cursor-pointer transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              {isFullscreen ? <Minimize className="w-4 h-4 text-[#2B547E] dark:text-blue-400" /> : <Maximize className="w-4 h-4" />}
            </button>

            {/* Teacher Profile Trigger / Admin Identity Pill */}
            {!isAdmin ? (
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                title="View & Edit Teacher Profile"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer text-left shadow-2xs"
              >
                <div className="w-7 h-7 rounded-lg bg-[#2B547E]/10 dark:bg-blue-500/10 text-[#2B547E] dark:text-blue-400 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {user.fullName || user.username}
                    </p>
                    {user.isReadOnly && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                        Read-Only
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Teacher Profile</p>
                </div>
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-700">
                <div className="w-8 h-8 rounded-xl bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{user.username}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Administrator</p>
                </div>
              </div>
            )}

            {/* 2-Way Direct Messaging Bar */}
            <TeacherMessagingBar />

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

      {/* Teacher Profile Modal */}
      {!isAdmin && (
        <TeacherProfileModal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
        />
      )}
    </header>
  );
};
