import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { MessagingModal } from './MessagingModal.tsx';

interface Props {
  className?: string;
  initialTargetTeacher?: {
    id: string;
    username: string;
    fullName?: string;
    phoneNumber?: string;
  } | null;
}

export const TeacherMessagingBar: React.FC<Props> = ({ className = '', initialTargetTeacher }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = async () => {
    try {
      const res = await apiRequest<{ unreadCount: number }>('/api/messages/unread-count');
      if (res.success && res.data) {
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    // Poll unread count every 15 seconds
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setUnreadCount(0);
        }}
        title="Direct Messages"
        aria-label="Direct Messages"
        className={`relative p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition-all cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center ${className}`}
      >
        <MessageSquare className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />

        {/* Unread indicator badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <MessagingModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          fetchUnreadCount();
        }}
        currentUser={user}
        initialTargetTeacher={initialTargetTeacher}
      />
    </>
  );
};
