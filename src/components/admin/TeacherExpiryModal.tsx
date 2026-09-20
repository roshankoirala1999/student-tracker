import React, { useState } from 'react';
import { X, Calendar, Clock, Plus, Minus, CheckCircle, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';

interface TeacherItem {
  id: string;
  username: string;
  fullName?: string;
  expiresAt?: string;
  isExpired?: boolean;
  daysRemaining?: number;
}

interface Props {
  isOpen: boolean;
  teacher: TeacherItem | null;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const TeacherExpiryModal: React.FC<Props> = ({
  isOpen,
  teacher,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>('');

  if (!isOpen || !teacher) return null;

  const currentExpiry = teacher.expiresAt ? new Date(teacher.expiresAt) : null;
  const isExpired = teacher.isExpired ?? (currentExpiry ? currentExpiry.getTime() < Date.now() : false);
  const daysRemaining = teacher.daysRemaining ?? 0;

  const handleAdjustDays = async (daysDelta: number) => {
    if (daysDelta === 0) return;
    setLoading(true);
    setError(null);

    const res = await apiRequest(`/api/admin/teachers/${teacher.id}/expiry`, {
      method: 'PATCH',
      body: JSON.stringify({ daysDelta }),
    });

    setLoading(false);
    if (res.success) {
      await onSuccess();
      onClose();
    } else {
      setError(res.message || 'Failed to update account expiry.');
    }
  };

  const handleSetExactDate = async () => {
    if (!customDate) {
      setError('Please select a valid date.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await apiRequest(`/api/admin/teachers/${teacher.id}/expiry`, {
      method: 'PATCH',
      body: JSON.stringify({ expiresAt: new Date(customDate).toISOString() }),
    });

    setLoading(false);
    if (res.success) {
      await onSuccess();
      onClose();
    } else {
      setError(res.message || 'Failed to update account expiry date.');
    }
  };

  const handleCustomDaysSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(customDays, 10);
    if (isNaN(num) || num === 0) {
      setError('Please enter a valid non-zero number of days.');
      return;
    }
    handleAdjustDays(num);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            <Clock className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>Manage Teacher Expiry</span>
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

        <div className="p-6 space-y-5">
          {/* Teacher Summary Box */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              {teacher.fullName || teacher.username}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              @{teacher.username}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">Current Expiry Status:</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                  isExpired
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                    : daysRemaining <= 3
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {isExpired ? (
                  <>
                    <AlertTriangle className="w-3 h-3" /> Expired
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3 h-3" /> {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
                  </>
                )}
              </span>
            </div>
            {currentExpiry && (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Valid until: {currentExpiry.toLocaleDateString()} ({currentExpiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* Quick Add Days */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Quick Add Days (+Extend Access)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '+3 Days (Trial)', val: 3 },
                { label: '+7 Days', val: 7 },
                { label: '+30 Days (1 Mo)', val: 30 },
                { label: '+60 Days', val: 60 },
                { label: '+90 Days (3 Mo)', val: 90 },
                { label: '+365 Days (1 Yr)', val: 365 },
              ].map((btn) => (
                <button
                  key={btn.val}
                  type="button"
                  disabled={loading}
                  onClick={() => handleAdjustDays(btn.val)}
                  className="px-2.5 py-2 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl border border-emerald-200 dark:border-emerald-800/80 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Remove Days */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Quick Remove Days (-Reduce Access)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '-1 Day', val: -1 },
                { label: '-3 Days', val: -3 },
                { label: '-7 Days', val: -7 },
                { label: '-30 Days', val: -30 },
                { label: 'Expire Now', val: -Math.max(1, daysRemaining + 1) },
              ].map((btn, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={loading}
                  onClick={() => handleAdjustDays(btn.val)}
                  className="px-2.5 py-2 text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl border border-rose-200 dark:border-rose-800/80 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Days Input */}
          <form onSubmit={handleCustomDaysSubmit} className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Custom Days Adjustment (+/-)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                placeholder="e.g. 15 or -5"
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
              />
              <button
                type="submit"
                disabled={loading || !customDays}
                className="px-4 py-2 text-xs font-semibold bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-50 text-white rounded-xl cursor-pointer transition-colors"
              >
                Apply
              </button>
            </div>
          </form>

          {/* Direct Date Picker */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Or Set Specific Expiry Date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
              />
              <button
                type="button"
                disabled={loading || !customDate}
                onClick={handleSetExactDate}
                className="px-4 py-2 text-xs font-semibold bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-50 text-white rounded-xl cursor-pointer transition-colors"
              >
                Set Date
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
