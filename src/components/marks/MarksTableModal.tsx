import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, ArrowUpDown, ArrowUp, ArrowDown, Download, UploadCloud, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { generateCsv, downloadCsvFile } from '../../utils/csv.ts';
import { MarksCsvUploadModal } from './MarksCsvUploadModal.tsx';

interface Props {
  isOpen: boolean;
  sectionId: string;
  sectionName: string;
  className: string;
  onClose: () => void;
}

interface MarksMatrixData {
  students: Array<{
    id: string;
    rollNumber: number;
    studentName: string;
    symbolNumber: string;
    contactNumber?: string;
    parentContact?: string;
  }>;
  assignments: Array<{
    id: string;
    name: string;
    maxMarks: number;
  }>;
  examinations: Array<{
    id: string;
    name: string;
    maxMarks: number;
  }>;
  marks: Record<string, Record<string, number | null>>; // studentId -> itemId -> score
}

type SortKey = 'rollNumber' | 'studentName' | 'symbolNumber' | string;

export const MarksTableModal: React.FC<Props> = ({
  isOpen,
  sectionId,
  sectionName,
  className,
  onClose,
}) => {
  const { user } = useAuth();
  const isExpired = !!user?.isExpired;

  const [data, setData] = useState<MarksMatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [localScores, setLocalScores] = useState<Record<string, Record<string, string>>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('rollNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const loadData = async () => {
    setLoading(true);
    const res = await apiRequest<MarksMatrixData>(`/api/sections/${sectionId}/marks`);
    setLoading(false);
    if (res.success && res.data) {
      setData(res.data);
      // Initialize local score inputs
      const initial: Record<string, Record<string, string>> = {};
      res.data.students.forEach((s) => {
        initial[s.id] = {};
        const studentMarks = res.data?.marks[s.id] || {};
        res.data?.assignments.forEach((a) => {
          const val = studentMarks[a.id];
          initial[s.id][a.id] = val !== null && val !== undefined ? val.toString() : '';
        });
        res.data?.examinations.forEach((e) => {
          const val = studentMarks[e.id];
          initial[s.id][e.id] = val !== null && val !== undefined ? val.toString() : '';
        });
      });
      setLocalScores(initial);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, sectionId]);

  const handleScoreBlur = async (
    studentId: string,
    itemId: string,
    itemType: 'assignment' | 'examination',
    maxMarks: number
  ) => {
    if (isExpired) return;

    const rawVal = localScores[studentId]?.[itemId]?.trim() ?? '';
    const key = `${studentId}_${itemId}`;

    if (rawVal !== '') {
      const num = Number(rawVal);
      if (isNaN(num) || num < 0 || num > maxMarks) {
        setSaveStatus((prev) => ({ ...prev, [key]: 'error' }));
        return;
      }
    }

    setSaveStatus((prev) => ({ ...prev, [key]: 'saving' }));

    const res = await apiRequest(`/api/sections/${sectionId}/marks/single`, {
      method: 'POST',
      body: JSON.stringify({
        studentId,
        itemId,
        itemType,
        marksObtained: rawVal === '' ? null : Number(rawVal),
      }),
    });

    if (res.success) {
      setSaveStatus((prev) => ({ ...prev, [key]: 'saved' }));
      setTimeout(() => {
        setSaveStatus((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }, 1500);
    } else {
      setSaveStatus((prev) => ({ ...prev, [key]: 'error' }));
    }
  };

  // Toggle column sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // Download Current Table as CSV Template
  const handleDownloadCurrentTemplate = () => {
    if (!data) return;
    const headers = ['Roll Number', 'Student Name', 'Symbol Number'];
    data.assignments.forEach((a) => headers.push(a.name));
    data.examinations.forEach((e) => headers.push(e.name));

    const rows = data.students.map((s) => {
      const row: (string | number)[] = [s.rollNumber, s.studentName || '', s.symbolNumber || ''];
      data.assignments.forEach((a) => {
        const val = localScores[s.id]?.[a.id];
        row.push(val !== undefined && val !== null ? val : '');
      });
      data.examinations.forEach((e) => {
        const val = localScores[s.id]?.[e.id];
        row.push(val !== undefined && val !== null ? val : '');
      });
      return row;
    });

    const csv = generateCsv(headers, rows);
    const filename = `${className.replace(/\s+/g, '_')}_${sectionName.replace(/\s+/g, '_')}_Marks.csv`;
    downloadCsvFile(filename, csv);
  };

  // Filter & Sort students
  const sortedStudents = useMemo(() => {
    if (!data) return [];

    const q = search.toLowerCase().trim();
    const filtered = data.students.filter((s) => {
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        s.symbolNumber.toLowerCase().includes(q) ||
        s.rollNumber.toString().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortKey === 'rollNumber') {
        comparison = a.rollNumber - b.rollNumber;
      } else if (sortKey === 'studentName') {
        comparison = a.studentName.localeCompare(b.studentName);
      } else if (sortKey === 'symbolNumber') {
        comparison = a.symbolNumber.localeCompare(b.symbolNumber);
      } else {
        // Assessment item score sort
        const valA = parseFloat(localScores[a.id]?.[sortKey] || '0') || 0;
        const valB = parseFloat(localScores[b.id]?.[sortKey] || '0') || 0;
        comparison = valA - valB;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [data, search, sortKey, sortOrder, localScores]);

  if (!isOpen) return null;

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 inline-block ml-1" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[#2B547E] dark:text-blue-400 inline-block ml-1 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#2B547E] dark:text-blue-400 inline-block ml-1 font-bold" />
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
        <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-6xl w-full border border-slate-200/80 dark:border-slate-700 max-h-[94vh] flex flex-col overflow-hidden transition-colors">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B]">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2B547E] dark:bg-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Marks — {className} ({sectionName})
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Assignment and examination scores for enrolled students. Scores save automatically on blur.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Expired warning banner if read-only */}
          {isExpired && (
            <div className="bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-900/60 px-6 py-2.5 flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Account expired. You are currently in view-only mode. Editing and marks uploads are disabled.</span>
            </div>
          )}

          {/* Toolbar */}
          <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-700/80 bg-[#F4F6FA] dark:bg-[#0F172A] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative max-w-xs w-full">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roll, name, symbol..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 shadow-2xs"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-2 hidden sm:inline">
                {sortedStudents.length} student{sortedStudents.length === 1 ? '' : 's'}
              </span>

              {/* Download Template (Current Table CSV) */}
              <button
                type="button"
                onClick={handleDownloadCurrentTemplate}
                disabled={!data || data.students.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                title="Download current table marks as CSV template"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Download Template</span>
              </button>

              {/* Upload Marks (CSV) */}
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                disabled={isExpired}
                className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-2xs cursor-pointer transition-colors"
                title={isExpired ? 'Account expired (read-only)' : 'Upload edited marks CSV'}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Marks</span>
              </button>
            </div>
          </div>

          {/* Table Container with Sticky Columns */}
          <div className="p-4 sm:p-6 overflow-auto flex-1 bg-white dark:bg-[#1E293B]">
            {loading ? (
              <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">Loading marks...</div>
            ) : !data || (data.assignments.length === 0 && data.examinations.length === 0) ? (
              <div className="text-center py-16 text-xs text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30">
                No assignments or examinations configured for this class yet. Go back to the Class Overview to add coursework and exams first.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto shadow-2xs relative">
                <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                  <thead className="bg-[#F4F6FA] dark:bg-[#0F172A] text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20 select-none">
                    <tr>
                      {/* Sticky Roll Number */}
                      <th
                        onClick={() => handleSort('rollNumber')}
                        className="py-3 px-3 border-r border-slate-200 dark:border-slate-700 w-16 text-center cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors sticky left-0 z-30 bg-[#F4F6FA] dark:bg-[#0F172A]"
                        title="Sort by Roll Number"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Roll</span>
                          {renderSortIcon('rollNumber')}
                        </div>
                      </th>

                      {/* Sticky Student Name */}
                      <th
                        onClick={() => handleSort('studentName')}
                        className="py-3 px-3 border-r border-slate-200 dark:border-slate-700 min-w-[160px] cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors sticky left-16 z-30 bg-[#F4F6FA] dark:bg-[#0F172A]"
                        title="Sort by Student Name"
                      >
                        <div className="flex items-center gap-1">
                          <span>Student Name</span>
                          {renderSortIcon('studentName')}
                        </div>
                      </th>

                      {/* Symbol Number */}
                      <th
                        onClick={() => handleSort('symbolNumber')}
                        className="py-3 px-3 border-r border-slate-200 dark:border-slate-700 w-28 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                        title="Sort by Symbol Number"
                      >
                        <div className="flex items-center gap-1">
                          <span>Symbol</span>
                          {renderSortIcon('symbolNumber')}
                        </div>
                      </th>

                      {/* Assignment Headers */}
                      {data.assignments.map((a) => (
                        <th
                          key={a.id}
                          onClick={() => handleSort(a.id)}
                          className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center min-w-[110px] bg-slate-100/70 dark:bg-slate-800/60 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                          title={`Sort by ${a.name} score`}
                        >
                          <div className="truncate max-w-[110px] mx-auto text-[#2B547E] dark:text-blue-400 font-bold flex items-center justify-center gap-1">
                            <span>{a.name}</span>
                            {renderSortIcon(a.id)}
                          </div>
                          <div className="text-[10px] text-[#355C7D] dark:text-blue-300 font-medium">Max: {a.maxMarks}</div>
                        </th>
                      ))}

                      {/* Examination Headers */}
                      {data.examinations.map((e) => (
                        <th
                          key={e.id}
                          onClick={() => handleSort(e.id)}
                          className="py-2.5 px-2 border-r border-slate-200 dark:border-slate-700 text-center min-w-[110px] bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-100/60 dark:hover:bg-amber-950/50 cursor-pointer transition-colors"
                          title={`Sort by ${e.name} score`}
                        >
                          <div className="truncate max-w-[110px] mx-auto text-amber-950 dark:text-amber-300 font-bold flex items-center justify-center gap-1">
                            <span>{e.name}</span>
                            {renderSortIcon(e.id)}
                          </div>
                          <div className="text-[10px] text-amber-800 dark:text-amber-400 font-medium">Max: {e.maxMarks}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3 + data.assignments.length + data.examinations.length}
                          className="py-12 text-center text-slate-400"
                        >
                          {search ? 'No students match your search criteria.' : 'No enrolled students found in this section.'}
                        </td>
                      </tr>
                    ) : (
                      sortedStudents.map((s) => {
                        return (
                          <tr
                            key={s.id}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            {/* Sticky Roll Number */}
                            <td className="py-2 px-3 border-r border-slate-100 dark:border-slate-800 text-center font-bold text-[#2B547E] dark:text-blue-400 sticky left-0 z-10 bg-white dark:bg-[#1E293B]">
                              {s.rollNumber}
                            </td>

                            {/* Sticky Student Name */}
                            <td className="py-2 px-3 border-r border-slate-100 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100 sticky left-16 z-10 bg-white dark:bg-[#1E293B]">
                              {s.studentName}
                            </td>

                            {/* Symbol Number */}
                            <td className="py-2 px-3 border-r border-slate-100 dark:border-slate-800 font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                              {s.symbolNumber}
                            </td>

                            {/* Assignment score inputs */}
                            {data.assignments.map((a) => {
                              const key = `${s.id}_${a.id}`;
                              const status = saveStatus[key];
                              return (
                                <td
                                  key={a.id}
                                  className="p-1 border-r border-slate-100 dark:border-slate-800 text-center bg-slate-50/30 dark:bg-slate-900/20 relative"
                                >
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={a.maxMarks}
                                      step="any"
                                      disabled={isExpired}
                                      value={localScores[s.id]?.[a.id] ?? ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setLocalScores((prev) => ({
                                          ...prev,
                                          [s.id]: {
                                            ...prev[s.id],
                                            [a.id]: val,
                                          },
                                        }));
                                      }}
                                      onBlur={() => handleScoreBlur(s.id, a.id, 'assignment', a.maxMarks)}
                                      placeholder="—"
                                      className={`w-16 py-1 px-1.5 text-center text-xs rounded-lg border transition-colors focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed ${
                                        status === 'error'
                                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:border-[#2B547E] dark:focus:border-blue-500 focus:ring-[#2B547E]'
                                      }`}
                                    />
                                    {status === 'saved' && (
                                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 absolute right-1 pointer-events-none" />
                                    )}
                                  </div>
                                </td>
                              );
                            })}

                            {/* Examination score inputs */}
                            {data.examinations.map((e) => {
                              const key = `${s.id}_${e.id}`;
                              const status = saveStatus[key];
                              return (
                                <td
                                  key={e.id}
                                  className="p-1 border-r border-slate-100 dark:border-slate-800 text-center bg-amber-50/20 dark:bg-amber-950/20 relative"
                                >
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={e.maxMarks}
                                      step="any"
                                      disabled={isExpired}
                                      value={localScores[s.id]?.[e.id] ?? ''}
                                      onChange={(evt) => {
                                        const val = evt.target.value;
                                        setLocalScores((prev) => ({
                                          ...prev,
                                          [s.id]: {
                                            ...prev[s.id],
                                            [e.id]: val,
                                          },
                                        }));
                                      }}
                                      onBlur={() => handleScoreBlur(s.id, e.id, 'examination', e.maxMarks)}
                                      placeholder="—"
                                      className={`w-16 py-1 px-1.5 text-center text-xs rounded-lg border transition-colors focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed ${
                                        status === 'error'
                                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:border-amber-600 focus:ring-amber-600'
                                      }`}
                                    />
                                    {status === 'saved' && (
                                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 absolute right-1 pointer-events-none" />
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-3 bg-[#F4F6FA] dark:bg-[#0F172A] text-xs text-slate-500 dark:text-slate-400">
            <span>Click any column header to sort ascending or descending. Unentered scores default to empty.</span>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 min-h-[40px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl font-semibold cursor-pointer transition-colors shadow-2xs"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Marks CSV Upload Modal */}
      <MarksCsvUploadModal
        isOpen={uploadModalOpen}
        sectionId={sectionId}
        sectionName={sectionName}
        className={className}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={async () => {
          await loadData();
          setUploadModalOpen(false);
        }}
        onDownloadCurrentTemplate={handleDownloadCurrentTemplate}
      />
    </>
  );
};
