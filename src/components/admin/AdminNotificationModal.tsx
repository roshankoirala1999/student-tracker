import React, { useState, useEffect } from 'react';
import { Bell, Send, Trash2, ArrowLeft, CheckCircle, Clock } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { NotificationItem } from '../../types/index.ts';

interface TeacherItem {
  id: string;
  username: string;
  fullName?: string;
}

interface Props {
  isOpen: boolean;
  teacher: TeacherItem | null;
  onClose: () => void;
}

export const AdminNotificationModal: React.FC<Props> = ({ isOpen, teacher, onClose }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadNotifications = async (teacherId: string) => {
    setLoadingList(true);
    const res = await apiRequest<NotificationItem[]>(`/api/admin/teachers/${teacherId}/notifications`);
    setLoadingList(false);
    if (res.success && res.data) {
      setNotifications(res.data);
    }
  };

  useEffect(() => {
    if (isOpen && teacher) {
      setMessage('');
      setError(null);
      setSuccess(null);
      loadNotifications(teacher.id);
    }
  }, [isOpen, teacher]);

  if (!isOpen || !teacher) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    const res = await apiRequest(`/api/admin/teachers/${teacher.id}/notifications`, {
      method: 'POST',
      body: JSON.stringify({ message: message.trim() }),
    });

    setSending(false);
    if (res.success) {
      setSuccess('Notification sent successfully to teacher.');
      setMessage('');
      await loadNotifications(teacher.id);
    } else {
      setError(res.message || 'Failed to send notification.');
    }
  };

  const handleDelete = async (notificationId: string) => {
    setDeletingId(notificationId);
    const res = await apiRequest(`/api/admin/notifications/${notificationId}`, {
      method: 'DELETE',
    });
    setDeletingId(null);
    if (res.success) {
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } else {
      setError(res.message || 'Failed to delete notification.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 overflow-hidden transition-colors my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A] shrink-0">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            <Bell className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>Send Notification</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back / Close"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Recipient info */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Recipient Teacher:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 ml-1.5">
              {teacher.fullName || teacher.username}
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] ml-1">
              (@{teacher.username})
            </span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Send form */}
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Notification Message
              </label>
              <textarea
                rows={3}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write message to teacher (e.g. sample message)..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] resize-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Teacher will receive this as: <em>Message from admin: {message || 'sample message'}</em>
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? 'Sending...' : 'Send Notification'}</span>
              </button>
            </div>
          </form>

          {/* Previously sent notifications to this teacher */}
          <div className="border-t border-slate-200 dark:border-slate-700/80 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Sent Notifications History</span>
              <span className="text-[11px] font-normal text-slate-400">
                {notifications.length} message{notifications.length === 1 ? '' : 's'}
              </span>
            </h4>

            {loadingList ? (
              <div className="py-4 text-center text-xs text-slate-400">
                Loading history...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                No notifications sent to this teacher yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-slate-800 dark:text-slate-200 break-words font-medium">
                        {n.message}
                      </p>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                        {n.isRead && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold ml-1.5">
                            • Read
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={deletingId === n.id}
                      onClick={() => handleDelete(n.id)}
                      title="Delete Notification (Admin only)"
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
