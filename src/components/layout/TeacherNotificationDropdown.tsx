import React, { useState, useEffect, useRef } from 'react';
import { Bell, Clock, Info } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { NotificationItem } from '../../types/index.ts';

export const TeacherNotificationDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await apiRequest<NotificationItem[]>('/api/notifications');
      if (res.success && res.data) {
        setNotifications(res.data);
        const unread = res.data.filter((n) => !n.isRead).length;
        setUnreadCount(unread);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for real-time notification arrival
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);

      if (unreadCount > 0) {
        // Mark all as read
        await apiRequest('/api/notifications/read', { method: 'PATCH' });
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        title="Notifications"
        aria-label="View notifications"
        className="relative p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-2xs cursor-pointer transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#1E293B] shadow-2xl border border-slate-200/80 dark:border-slate-700 overflow-hidden z-50 animate-fadeIn transition-colors">
          <div className="px-4 py-3 bg-[#F4F6FA] dark:bg-[#0F172A] border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Notifications
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-400">
              {notifications.length} message{notifications.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto p-3 space-y-2.5">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Checking notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center space-y-1">
                <Info className="w-6 h-6 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  no notification
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-xl border text-xs transition-colors ${
                    !n.isRead
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                      : 'bg-slate-50/80 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/80'
                  }`}
                >
                  <div className="font-bold text-[#2B547E] dark:text-blue-400 mb-1 flex items-center justify-between">
                    <span>Message from admin:</span>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-medium">
                    {n.message}
                  </p>
                  <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
