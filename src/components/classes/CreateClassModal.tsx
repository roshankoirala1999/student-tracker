import React, { useState } from 'react';
import { X, BookOpen, CalendarCheck } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { ClassItem } from '../../types/index.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newClass: ClassItem) => void;
}

export const CreateClassModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a class name.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await apiRequest<ClassItem>('/api/classes', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        attendanceEnabled,
      }),
    });

    setLoading(false);
    if (res.success && res.data) {
      setName('');
      setAttendanceEnabled(true);
      onCreated(res.data);
      onClose();
    } else {
      setError(res.message || 'Failed to create class.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 p-6 transition-colors">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#2B547E]/10 dark:bg-blue-500/10 flex items-center justify-center text-[#2B547E] dark:text-blue-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Create New Class</h3>
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

        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Class Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grade 10 - Mathematics"
              className="w-full px-3.5 py-2.5 min-h-[42px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 shadow-2xs"
            />
          </div>

          <div className="bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CalendarCheck className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">Enable Attendance</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Record and track daily student attendance</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={attendanceEnabled}
              onChange={(e) => setAttendanceEnabled(e.target.checked)}
              className="w-5 h-5 text-[#2B547E] dark:text-blue-500 rounded cursor-pointer accent-[#2B547E]"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-5 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
            >
              {loading ? 'Creating...' : 'Create Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
