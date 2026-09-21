import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  CalendarCheck,
  Check,
  Clock,
  Edit2,
  ArrowLeft,
  RotateCcw,
  AlertCircle,
  FileText,
  ChevronRight,
  ListFilter,
} from 'lucide-react';
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
  comment?: string;
  presentCount: number;
  absentCount: number;
  totalStudents: number;
  lastModifiedAt?: string;
  createdAt: string;
}

type AttendanceScreen = 'day-select' | 'roll-call' | 'finalize' | 'history';

export const AttendanceModal: React.FC<Props> = ({
  isOpen,
  sectionId,
  sectionName,
  className,
  onClose,
}) => {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [todayDate, setTodayDate] = useState<string>('');
  const [nextDayNumber, setNextDayNumber] = useState<number>(1);
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Screen state following the sample app: 'day-select' | 'roll-call' | 'finalize' | 'history'
  const [screen, setScreen] = useState<AttendanceScreen>('day-select');

  // Selected Day to record or edit
  const [targetDayNumber, setTargetDayNumber] = useState<number>(1);
  const [customDayInput, setCustomDayInput] = useState<string>('');
  const [dayError, setDayError] = useState<string | null>(null);

  // Status mapping: studentId -> 'present' | 'absent'
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});

  // Active student index in the step-by-step card
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Optional comment for the day
  const [comment, setComment] = useState<string>('');

  // Editing historical day context (if any)
  const [editingDay, setEditingDay] = useState<{
    id: string;
    dayNumber: number;
    submissionDate: string;
    comment?: string;
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
      // Sort students naturally by roll number or student name
      currentStudents = [...stuRes.data].sort((a, b) => {
        if (a.rollNumber && b.rollNumber) return a.rollNumber - b.rollNumber;
        return a.studentName.localeCompare(b.studentName);
      });
      setStudents(currentStudents);
    }

    if (attRes.success && attRes.data) {
      setTodayDate(attRes.data.today || '');
      setNextDayNumber(attRes.data.nextDayNumber);
      setTargetDayNumber(attRes.data.nextDayNumber);
      setHistory(attRes.data.history || []);

      // Default attendance to all present
      const initial: Record<string, 'present' | 'absent'> = {};
      currentStudents.forEach((s) => {
        initial[s.id] = 'present';
      });
      setAttendanceMap(initial);
    } else {
      setError(attRes.message || 'Attendance is currently disabled or unavailable for this class.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setScreen('day-select');
      setEditingDay(null);
      setEditingHistoricalStudentIds(null);
      setCurrentIndex(0);
      setComment('');
      setCustomDayInput('');
      setDayError(null);
      setSuccessMsg(null);
      loadData();
    }
  }, [isOpen, sectionId]);

  // Active student list (respecting historical student IDs if editing a past record)
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

  // Start attendance for next day
  const handleStartNextDay = () => {
    if (activeStudentList.length === 0) {
      setError('No students found in this section to take attendance.');
      return;
    }
    setEditingDay(null);
    setEditingHistoricalStudentIds(null);
    setTargetDayNumber(nextDayNumber);
    setCurrentIndex(0);
    setComment('');
    setScreen('roll-call');
  };

  // Start attendance for a custom column/day (overwrite or custom day number)
  const handleStartCustomDay = () => {
    if (activeStudentList.length === 0) {
      setError('No students found in this section to take attendance.');
      return;
    }
    const parsed = parseInt(customDayInput.trim(), 10);
    if (isNaN(parsed) || parsed < 1) {
      setDayError('Enter a valid day number (1 or higher).');
      return;
    }
    setDayError(null);
    setTargetDayNumber(parsed);

    // Check if day already exists in history to prefill
    const existing = history.find((h) => h.dayNumber === parsed);
    if (existing) {
      startEditHistoricalDay(existing);
      return;
    }

    setEditingDay(null);
    setEditingHistoricalStudentIds(null);
    setCurrentIndex(0);
    setComment('');
    setScreen('roll-call');
  };

  // Record Attendance for current student (0 = Absent, 1 = Present)
  const recordAttendance = useCallback((status: 'present' | 'absent') => {
    if (currentIndex >= activeStudentList.length) return;

    const currentStudent = activeStudentList[currentIndex];
    setAttendanceMap((prev) => ({
      ...prev,
      [currentStudent.id]: status,
    }));

    if (currentIndex + 1 < activeStudentList.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Completed all students -> Go to finalize screen
      setScreen('finalize');
    }
  }, [currentIndex, activeStudentList]);

  // Undo previous student mark
  const handleUndo = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // Keyboard shortcut listener on the step-by-step card
  useEffect(() => {
    if (!isOpen || screen !== 'roll-call') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        recordAttendance('present');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        recordAttendance('absent');
      } else if (e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, screen, recordAttendance, handleUndo]);

  // Start editing a historical day
  const startEditHistoricalDay = async (item: AttendanceHistoryItem) => {
    setLoading(true);
    setError(null);
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
        comment: item.comment || '',
      });
      setTargetDayNumber(item.dayNumber);
      setComment(item.comment || '');
      setCurrentIndex(0);
      setScreen('roll-call');
    } else {
      setError(res.message || 'Failed to load historical record.');
    }
  };

  // Submit final attendance to backend
  const handleSubmitFinal = async () => {
    if (activeStudentList.length === 0) {
      setError('No students found in this record.');
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
      // Historical Edit via PUT /api/attendance/:id
      const res = await apiRequest(`/api/attendance/${editingDay.id}`, {
        method: 'PUT',
        body: JSON.stringify({ records, comment: comment.trim() }),
      });
      setSubmitting(false);

      if (res.success) {
        setSuccessMsg(`Attendance for Day ${editingDay.dayNumber} updated successfully.`);
        await loadData();
        setScreen('history');
      } else {
        setError(res.message || 'Failed to update attendance.');
      }
    } else {
      // New or Overwrite Submission via POST /api/sections/:sectionId/attendance
      const res = await apiRequest(`/api/sections/${sectionId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          records,
          targetDayNumber,
          comment: comment.trim(),
        }),
      });
      setSubmitting(false);

      if (res.success) {
        setSuccessMsg(`Attendance for Day ${targetDayNumber} recorded successfully.`);
        await loadData();
        setScreen('history');
      } else {
        setError(res.message || 'Failed to record attendance.');
      }
    }
  };

  if (!isOpen) return null;

  const totalStudents = activeStudentList.length;
  const currentStudent = activeStudentList[currentIndex];
  const progressPercent = totalStudents > 0 ? ((currentIndex) / totalStudents) * 100 : 0;

  const presentCount = activeStudentList.filter((s) => attendanceMap[s.id] !== 'absent').length;
  const absentCount = activeStudentList.filter((s) => attendanceMap[s.id] === 'absent').length;
  const absentStudents = activeStudentList.filter((s) => attendanceMap[s.id] === 'absent');

  // Find last recorded day number for display
  const lastRecordedDayNumber = history.length > 0
    ? Math.max(...history.map((h) => h.dayNumber))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200/80 dark:border-slate-700 max-h-[94vh] flex flex-col overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            <div className="w-7 h-7 rounded-lg bg-[#2C3A8C]/10 dark:bg-blue-500/10 flex items-center justify-center text-[#2C3A8C] dark:text-blue-400">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="block leading-tight">Attendance — {sectionName}</span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {className}
              </span>
            </div>
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

        {/* Status / Alert Messages */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl flex items-start gap-2">
            <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <div>{successMsg}</div>
          </div>
        )}

        {/* Modal Main Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          {/* ============================================================ */}
          {/* SCREEN 1: DAY SELECTION (Style of #scr-day from sample HTML)  */}
          {/* ============================================================ */}
          {screen === 'day-select' && (
            <div className="space-y-4">
              {/* Info Card */}
              <div className="bg-[#EAEFF9] dark:bg-[#131F37] border border-blue-100 dark:border-blue-900/40 rounded-2xl p-5 text-center">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                  Last recorded
                </div>
                <div className="text-3xl font-extrabold text-[#2C3A8C] dark:text-blue-400 my-1">
                  {lastRecordedDayNumber !== null ? `Day ${lastRecordedDayNumber}` : 'None (Ready for Day 1)'}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Choose which day to record for this section.
                </p>
              </div>

              {/* Start Next Day Button */}
              <button
                type="button"
                onClick={handleStartNextDay}
                disabled={loading || activeStudentList.length === 0}
                className="w-full py-3.5 px-5 bg-[#2C3A8C] hover:bg-[#222E73] text-white rounded-xl font-bold text-sm shadow-md cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span>Start Day {nextDayNumber}</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Divider Note */}
              <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-widest text-center my-3 uppercase">
                — OR OVERWRITE A DAY —
              </div>

              {/* Custom Day Input & Button */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={customDayInput}
                  onChange={(e) => {
                    setCustomDayInput(e.target.value);
                    setDayError(null);
                  }}
                  placeholder="Day number (e.g. 1, 2, 5)"
                  className="flex-1 px-4 py-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2C3A8C]"
                />
                <button
                  type="button"
                  onClick={handleStartCustomDay}
                  disabled={loading || activeStudentList.length === 0}
                  className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-colors disabled:opacity-50"
                >
                  Edit custom day
                </button>
              </div>
              {dayError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {dayError}
                </p>
              )}

              {/* History link */}
              <div className="pt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => setScreen('history')}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#2C3A8C] dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>View Attendance History ({history.length} records)</span>
                </button>
                <span>Total Students: <strong>{totalStudents}</strong></span>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN 2: ROLL CALL (Style of #scr-att from sample HTML)      */}
          {/* ============================================================ */}
          {screen === 'roll-call' && currentStudent && (
            <div className="space-y-4">
              {/* Top Progress Bar */}
              <div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2C3A8C] dark:bg-blue-500 transition-all duration-200 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-mono font-bold tracking-wider text-slate-500 dark:text-slate-400 mt-2 uppercase">
                  <span>Student {currentIndex + 1} of {totalStudents}</span>
                  <span className="text-[#2C3A8C] dark:text-blue-400 font-sans font-semibold">
                    {editingDay ? `Editing Day ${editingDay.dayNumber}` : `Day ${targetDayNumber}`}
                  </span>
                </div>
              </div>

              {/* Student Card - Clean, student name only */}
              <div className="bg-slate-50 dark:bg-[#111C33] border-2 border-slate-200/80 dark:border-slate-700/80 rounded-2xl py-8 px-6 text-center shadow-xs">
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {currentStudent.studentName}
                </div>
              </div>

              {/* Big Attendance Buttons (Side by Side) */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => recordAttendance('absent')}
                  className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border-2 border-rose-300 dark:border-rose-800/80 rounded-2xl py-4 sm:py-5 flex items-center justify-center gap-2 text-base sm:text-lg font-bold cursor-pointer transition-all active:scale-[0.98] shadow-xs"
                >
                  <span className="text-xl">✖</span>
                  <span>Absent</span>
                </button>

                <button
                  type="button"
                  onClick={() => recordAttendance('present')}
                  className="bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-300 dark:border-emerald-800/80 rounded-2xl py-4 sm:py-5 flex items-center justify-center gap-2 text-base sm:text-lg font-bold cursor-pointer transition-all active:scale-[0.98] shadow-xs"
                >
                  <span className="text-xl">✔</span>
                  <span>Present</span>
                </button>
              </div>

              {/* Undo Previous Student Button */}
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={handleUndo}
                className="w-full py-2.5 px-4 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo previous student</span>
              </button>

              {/* Live Tally & Keyboard Shortcuts Helper */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div>
                  Present: <span className="font-bold text-emerald-600 dark:text-emerald-400">{presentCount}</span> | Absent: <span className="font-bold text-rose-600 dark:text-rose-400">{absentCount}</span>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                  <span>[←/A: Absent]</span>
                  <span>[→/P: Present]</span>
                  <span>[Z: Undo]</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScreen('finalize')}
                  className="text-xs font-semibold text-[#2C3A8C] dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Review / Finalize →
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN 3: FINALIZE RECORD (Style of #scr-note from sample HTML) */}
          {/* ============================================================ */}
          {screen === 'finalize' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Finalize record
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Saving to Day <strong className="text-slate-800 dark:text-slate-200">{targetDayNumber}</strong> (Date: {todayDate || new Date().toISOString().split('T')[0]}).
                </p>
              </div>

              {/* Comment / Note Box */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Optional Comment / Remarks</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment/note (e.g. Practical examination day, Rain delay, Sports week)"
                  rows={2}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2C3A8C] resize-none"
                />
              </div>

              {/* Summary Chip (Highlight Card) */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-4 text-xs space-y-2">
                <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                  <span>Summary: Present: {presentCount} / {totalStudents} students</span>
                  <span className="text-rose-700 dark:text-rose-300 font-bold">
                    {absentCount} Absent
                  </span>
                </div>

                {absentStudents.length > 0 ? (
                  <div className="pt-1.5 border-t border-emerald-200/60 dark:border-emerald-800/60">
                    <div className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 mb-1">
                      Absent Students:
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {absentStudents.map((s) => (
                        <span
                          key={s.id}
                          className="px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 text-[11px] font-medium"
                        >
                          Roll #{s.rollNumber || '-'}: {s.studentName}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                    ✔ All enrolled students are marked Present.
                  </div>
                )}
              </div>

              {/* Big Green Submit Button */}
              <button
                type="button"
                disabled={submitting || totalStudents === 0}
                onClick={handleSubmitFinal}
                className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{submitting ? 'Submitting...' : '✓ Submit attendance'}</span>
              </button>

              {/* Review Students Button */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentIndex(0);
                    setScreen('roll-call');
                  }}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-[#2C3A8C] dark:hover:text-blue-400 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Review students step-by-step</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN 4: ATTENDANCE HISTORY                                 */}
          {/* ============================================================ */}
          {screen === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Recorded Days ({history.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setScreen('day-select')}
                  className="text-xs font-semibold text-[#2C3A8C] dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Take Attendance</span>
                </button>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  No attendance records logged yet for this section.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            Day {item.dayNumber}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {item.submissionDate}
                          </span>
                          {item.lastModifiedAt && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                              Updated
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Present: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{item.presentCount}</span> | Absent: <span className="font-semibold text-rose-600 dark:text-rose-400">{item.absentCount}</span> ({item.totalStudents} total students)
                        </div>
                        {item.comment && (
                          <div className="text-[10px] text-slate-600 dark:text-slate-400 italic mt-0.5">
                            Note: {item.comment}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditHistoricalDay(item)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors shrink-0"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit Day</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0F172A]">
          {screen !== 'day-select' ? (
            <button
              type="button"
              onClick={() => {
                if (screen === 'roll-call') setScreen('day-select');
                else if (screen === 'finalize') setScreen('roll-call');
                else if (screen === 'history') setScreen('day-select');
              }}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
