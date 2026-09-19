import React, { useState, useEffect } from 'react';
import { X, Award, FileText, Phone, Hash, User } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';

interface Props {
  studentId: string | null;
  onClose: () => void;
}

interface StudentRecordData {
  student: {
    id: string;
    rollNumber: number;
    studentName: string;
    symbolNumber: string;
    parentContact?: string;
    contactNumber?: string;
  };
  className: string;
  sectionName: string;
  assignments: Array<{ id: string; name: string; maxMarks: number; score: number | null }>;
  examinations: Array<{ id: string; name: string; maxMarks: number; score: number | null }>;
}

export const StudentProfileModal: React.FC<Props> = ({ studentId, onClose }) => {
  const [data, setData] = useState<StudentRecordData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      setData(null);
      return;
    }

    const loadRecord = async () => {
      setLoading(true);
      setError(null);
      const res = await apiRequest<StudentRecordData>(`/api/students/${studentId}/record`);
      setLoading(false);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.message || 'Failed to load student record.');
      }
    };

    loadRecord();
  }, [studentId]);

  if (!studentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Student Academic Record</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {data ? `${data.className} • ${data.sectionName}` : 'Loading...'}
            </p>
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

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading && (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Loading student profile and marks...
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* 1. Basic Student Info in exact specified order */}
              <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Student Details
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                      <Hash className="w-3 h-3 text-[#2B547E] dark:text-blue-400" /> Roll Number
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {data.student.rollNumber}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                      <User className="w-3 h-3 text-[#2B547E] dark:text-blue-400" /> Student Name
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {data.student.studentName}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                      <Hash className="w-3 h-3 text-[#2B547E] dark:text-blue-400" /> Symbol Number
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 text-xs bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {data.student.symbolNumber}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                      <Phone className="w-3 h-3 text-[#2B547E] dark:text-blue-400" /> Contact Number
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                      {data.student.contactNumber || data.student.parentContact || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Dynamic Class Examinations */}
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
                  <Award className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                  <span>Examinations</span>
                </div>

                {data.examinations.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                    No examinations configured for this class.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Examination Name</th>
                          <th className="py-2.5 px-3 text-center">Max Marks</th>
                          <th className="py-2.5 px-3 text-center">Marks Obtained</th>
                          <th className="py-2.5 px-3 text-right">Percentage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.examinations.map((ex) => {
                          const pct =
                            ex.score !== null
                              ? Math.round((ex.score / ex.maxMarks) * 100)
                              : null;
                          return (
                            <tr key={ex.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">{ex.name}</td>
                              <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400 font-mono">{ex.maxMarks}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-900 dark:text-slate-100">
                                {ex.score !== null ? ex.score : <span className="text-slate-400 dark:text-slate-500 font-normal">Not graded</span>}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {pct !== null ? (
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    pct >= 40 ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                  }`}>
                                    {pct}%
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. Dynamic Class Assignments */}
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
                  <FileText className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                  <span>Assignments</span>
                </div>

                {data.assignments.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                    No assignments configured for this class.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Assignment Name</th>
                          <th className="py-2.5 px-3 text-center">Max Marks</th>
                          <th className="py-2.5 px-3 text-center">Marks Obtained</th>
                          <th className="py-2.5 px-3 text-right">Percentage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.assignments.map((as) => {
                          const pct =
                            as.score !== null
                              ? Math.round((as.score / as.maxMarks) * 100)
                              : null;
                          return (
                            <tr key={as.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">{as.name}</td>
                              <td className="py-2.5 px-3 text-center text-slate-500 dark:text-slate-400 font-mono">{as.maxMarks}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-900 dark:text-slate-100">
                                {as.score !== null ? as.score : <span className="text-slate-400 dark:text-slate-500 font-normal">Not graded</span>}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {pct !== null ? (
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    pct >= 40 ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                  }`}>
                                    {pct}%
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-700 flex justify-end bg-slate-50 dark:bg-[#0F172A]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[40px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
