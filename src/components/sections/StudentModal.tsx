import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserCheck } from 'lucide-react';
import { StudentItem } from '../../types/index.ts';

interface Props {
  isOpen: boolean;
  sectionName: string;
  student?: StudentItem | null;
  isSectionFull?: boolean;
  onClose: () => void;
  onSave: (data: {
    rollNumber: number;
    studentName: string;
    symbolNumber: string;
    parentContact: string;
    contactNumber?: string;
  }) => Promise<void>;
}

export const StudentModal: React.FC<Props> = ({
  isOpen,
  sectionName,
  student,
  isSectionFull = false,
  onClose,
  onSave,
}) => {
  const [rollNumber, setRollNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [symbolNumber, setSymbolNumber] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (student) {
      setRollNumber(student.rollNumber.toString());
      setStudentName(student.studentName);
      setSymbolNumber(student.symbolNumber);
      setContactNumber(student.contactNumber || student.parentContact || '');
    } else {
      setRollNumber('');
      setStudentName('');
      setSymbolNumber('');
      setContactNumber('');
    }
    setError(null);
  }, [student, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericRoll = Number(rollNumber);
    if (isNaN(numericRoll) || numericRoll <= 0) {
      setError('Roll Number must be a valid positive number.');
      return;
    }

    if (!studentName.trim() || !symbolNumber.trim() || !contactNumber.trim()) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSave({
        rollNumber: numericRoll,
        studentName: studentName.trim(),
        symbolNumber: symbolNumber.trim(),
        parentContact: contactNumber.trim(),
        contactNumber: contactNumber.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save student.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 max-h-[92vh] flex flex-col overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            {student ? (
              <UserCheck className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
            ) : (
              <UserPlus className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
            )}
            <span>{student ? 'Edit Student Details' : `Add Student to ${sectionName}`}</span>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {!student && isSectionFull && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300">
              This section has reached the maximum capacity of 100 students. You cannot add additional students.
            </div>
          )}

          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* 1. Roll Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Roll Number
            </label>
            <input
              type="number"
              min={1}
              required
              disabled={loading || (!student && isSectionFull)}
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="e.g. 1"
              className="w-full px-3.5 py-2.5 min-h-[42px] text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
            />
          </div>

          {/* 2. Student Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Student Name
            </label>
            <input
              type="text"
              required
              disabled={loading || (!student && isSectionFull)}
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="e.g. Student Name"
              className="w-full px-3.5 py-2.5 min-h-[42px] text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
            />
          </div>

          {/* 3. Symbol Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Symbol Number
            </label>
            <input
              type="text"
              required
              disabled={loading || (!student && isSectionFull)}
              value={symbolNumber}
              onChange={(e) => setSymbolNumber(e.target.value)}
              placeholder="e.g. 12345"
              className="w-full px-3.5 py-2.5 min-h-[42px] text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
            />
          </div>

          {/* 4. Contact Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Contact Number
            </label>
            <input
              type="text"
              required
              disabled={loading || (!student && isSectionFull)}
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="e.g. 98XXXXXXXX"
              className="w-full px-3.5 py-2.5 min-h-[42px] text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (!student && isSectionFull)}
              className="px-5 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
            >
              {loading ? 'Saving...' : student ? 'Update Student' : 'Save Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
