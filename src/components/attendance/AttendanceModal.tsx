import React, { useState, useEffect } from 'react';
import { X, CalendarCheck, Check, Clock, Edit2 } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { StudentItem } from '../../types/index.ts';

interface Props {
  isOpen: boolean;
  sectionId: string;
  sectionName: string;
  className: string;
  onClose: () => void;
}

interface AttendanceHistoryItem {
  id: string;
  dayNumber: number;
  submissionDate: string;
  presentCount: number;
  absentCount: number;
  totalStudents: number;
  lastModifiedAt?: string;
  createdAt: string;
}

export const AttendanceModal: React.FC<Props> = ({
  isOpen,
  sectionId,
  sectionName,
  className,
  onClose,
}) => {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [todayDate, setTodayDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'daily' | 'history'>('daily');
  const [nextDayNumber, setNextDayNumber] = useState<number>(1);
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Status mapping: studentId -> 'present' | 'absent'
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});

  // Editing historical day state
  const [editingDay, setEditingDay] = useState<{
    id: string;
    dayNumber: number;
    submissionDate: string;
  } | null>(null);
  const [editingHistoricalStudentIds, setEditingHistoricalStudentIds] = useState<string[] | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [stuRes, attRes] = await Promise.all([
      apiRequest<StudentItem[]>(`/api/sections/${sectionId}/students`),
      apiRequest<{ today: string; nextDayNumber: number; history: AttendanceHistoryItem[] }>(
        `/api/sections/${sectionId}/attendance`
      ),
    ]);

    setLoading(false);

    let currentStudents: StudentItem[] = [];
    if (stuRes.success && stuRes.data) {
      currentStudents = stuRes.data;
      setStudents(currentStudents);
    }

    if (attRes.success && attRes.data) {
      setTodayDate(attRes.data.today || '');
      setNextDayNumber(attRes.data.nextDayNumber);
      setHistory(attRes.data.history);

      // Default new attendance to all present
      const initial: Record<string, 'present' | 'absent'> = {};
      currentStudents.forEach((s) => {
        initial[s.id] = 'present';
      });
      setAttendanceMap(initial);
    } else {
      setError(attRes.message || 'Attendance is currently disabled or unavailable.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setEditingDay(null);
      setEditingHistoricalStudentIds(null);
      setActiveTab('daily');
      setSuccessMsg(null);
      loadData();
    }
  }, [isOpen, sectionId]);

  if (!isOpen) return null;

  const activeStudentList = editingDay && editingHistoricalStudentIds
    ? editingHistoricalStudentIds
        .map((sid) => students.find((s) => s.id === sid) || {
          id: sid,
          rollNumber: 0,
          studentName: `Student (${sid.slice(-4)})`,
          symbolNumber: '-',
          contactNumber: '',
          parentContact: '',
          teacherId: '',
          classId: '',
          sectionId,
          createdAt: '',
        })
    : students;

  const toggleStatus = (studentId: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === 'absent' ? 'present' : 'absent',
    }));
  };

  const markAll = (status: 'present' | 'absent') => {
    const updated: Record<string, 'present' | 'absent'> = { ...attendanceMap };
    activeStudentList.forEach((s) => {
      updated[s.id] = status;
    });
    setAttendanceMap(updated);
  };

  const handleSubmit = async () => {
    if (activeStudentList.length === 0) {
      setError(editingDay ? 'No students found in this historical record.' : 'No students enrolled in this section to take attendance.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const records = activeStudentList.map((s) => ({
      studentId: s.id,
      status: attendanceMap[s.id] || 'present',
    }));

    if (editingDay) {
      // Historical Edit (no password required, preserves dayNumber & date)
      const res = await apiRequest(`/api/attendance/${editingDay.id}`, {
        method: 'PUT',
        body: JSON.stringify({ records }),
      });
      setSubmitting(false);
      if (res.success) {
        setSuccessMsg(`Attendance for Day ${editingDay.dayNumber} updated successfully.`);
        setEditingDay(null);
        setEditingHistoricalStudentIds(null);
        setActiveTab('history');
        await loadData();
      } else {
        setError(res.message || 'Failed to update attendance.');
      }
    } else {
      // New sequential day submission
      const res = await apiRequest(`/api/sections/${sectionId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ records }),
      });
      setSubmitting(false);
      if (res.success) {
        setSuccessMsg(`Attendance for Day ${nextDayNumber} recorded successfully.`);
        await loadData();
      } else {
        setError(res.message || 'Failed to record attendance.');
      }
    }
  };

  const startEditHistoricalDay = async (item: AttendanceHistoryItem) => {
    setLoading(true);
    const res = await apiRequest<any>(`/api/attendance/${item.id}`);
    setLoading(false);
    if (res.success && res.data) {
      const records = res.data.records || [];
      const map: Record<string, 'present' | 'absent'> = {};
      const recordStudentIds: string[] = [];
      records.forEach((r: any) => {
        map[r.studentId] = r.status;
        recordStudentIds.push(r.studentId);
      });
      setAttendanceMap(map);
      setEditingHistoricalStudentIds(recordStudentIds);
      setEditingDay({
        id: item.id,
        dayNumber: item.dayNumber,
        submissionDate: item.submissionDate,
      });
      setActiveTab('daily');
    }
  };

  const presentCount = activeStudentList.filter((s) => attendanceMap[s.id] !== 'absent').length;
  const absentCount = activeStudentList.filter((s) => attendanceMap[s.id] === 'absent').length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200/80 dark:border-slate-700 max-h-[92vh] flex flex-col overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            <CalendarCheck className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>
              Attendance — {className} ({sectionName})
            </span>
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

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 pt-3 bg-[#F4F6FA] dark:bg-[#0F172A] gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`pb-2.5 min-h-[40px] text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
              activeTab === 'daily'
                ? 'border-[#2B547E] dark:border-blue-400 text-[#2B547E] dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {editingDay ? `Editing Day ${editingDay.dayNumber}` : `Day ${nextDayNumber} Roll Call`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 min-h-[40px] text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
              activeTab === 'history'
                ? 'border-[#2B547E] dark:border-blue-400 text-[#2B547E] dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Attendance History ({history.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl">
              {successMsg}
            </div>
          )}

          {/* Daily Roll Call Tab */}
          {activeTab === 'daily' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-[#0F172A] p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {editingDay ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        Editing Day {editingDay.dayNumber} (Original: {editingDay.submissionDate})
                      </span>
                    ) : (
                      <span>Day {nextDayNumber} (Today: {todayDate})</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Present: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{presentCount}</span> | Absent: <span className="font-semibold text-rose-600 dark:text-rose-400">{absentCount}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => markAll('present')}
                    className="px-3 py-1.5 min-h-[38px] text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 hover:bg-emerald-200 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-300 rounded-lg cursor-pointer transition-colors"
                  >
                    All Present
                  </button>
                  <button
                    type="button"
                    onClick={() => markAll('absent')}
                    className="px-3 py-1.5 min-h-[38px] text-xs font-semibold bg-rose-100 dark:bg-rose-950/50 hover:bg-rose-200 dark:hover:bg-rose-900/70 text-rose-800 dark:text-rose-300 rounded-lg cursor-pointer transition-colors"
                  >
                    All Absent
                  </button>
                </div>
              </div>

              {activeStudentList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  {editingDay
                    ? 'No students found in this historical record.'
                    : 'No students in this section. Add students before taking attendance.'}
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {activeStudentList.map((s) => {
                    const isPresent = attendanceMap[s.id] !== 'absent';
                    return (
                      <div
                        key={s.id}
                        onClick={() => toggleStatus(s.id)}
                        className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors select-none min-h-[52px]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300">
                            {s.rollNumber || '-'}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{s.studentName}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Symbol: {s.symbolNumber}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`px-3.5 py-1.5 min-h-[36px] rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isPresent
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-rose-600 text-white shadow-xs'
                          }`}
                        >
                          {isPresent ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Present
                            </>
                          ) : (
                            <>
                              <X className="w-3.5 h-3.5" />
                              Absent
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  No attendance records logged yet. Complete Day 1 in the Roll Call tab.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors min-h-[56px]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            Day {item.dayNumber}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {item.submissionDate}
                          </span>
                          {item.lastModifiedAt && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                              Modified
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Present: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{item.presentCount}</span> | Absent: <span className="font-semibold text-rose-600 dark:text-rose-400">{item.absentCount}</span> ({item.totalStudents} total students)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditHistoricalDay(item)}
                        className="flex items-center gap-1 px-3.5 py-2 min-h-[40px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit Day
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-[#0F172A]">
          {editingDay ? (
            <button
              type="button"
              onClick={() => {
                setEditingDay(null);
                setEditingHistoricalStudentIds(null);
                loadData();
              }}
              className="text-xs text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
            >
              Cancel Edit
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[42px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
            {activeTab === 'daily' && (
              <button
                type="button"
                disabled={submitting || activeStudentList.length === 0}
                onClick={handleSubmit}
                className="px-5 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                {submitting
                  ? 'Saving...'
                  : editingDay
                  ? `Update Day ${editingDay.dayNumber}`
                  : `Save Day ${nextDayNumber} Attendance`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
