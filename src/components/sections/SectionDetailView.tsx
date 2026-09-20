import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  UploadCloud,
  CalendarCheck,
  Table,
  Search,
  Eye,
  Edit2,
  Trash2,
  ArrowLeft,
  Users,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { ClassItem, SectionItem, StudentItem } from '../../types/index.ts';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { generateCsv, downloadCsvFile } from '../../utils/csv.ts';
import { StudentModal } from './StudentModal.tsx';
import { StudentProfileModal } from './StudentProfileModal.tsx';
import { StudentCsvUploadModal } from '../students/StudentCsvUploadModal.tsx';
import { MarksTableModal } from '../marks/MarksTableModal.tsx';
import { AttendanceModal } from '../attendance/AttendanceModal.tsx';
import { PasswordConfirmModal } from '../common/PasswordConfirmModal.tsx';

interface Props {
  currentClass: ClassItem;
  section: SectionItem;
  onBackToClass: () => void;
  onRefreshSectionCount: () => Promise<void>;
}

export const SectionDetailView: React.FC<Props> = ({
  currentClass,
  section,
  onBackToClass,
  onRefreshSectionCount,
}) => {
  const { user } = useAuth();
  const isExpired = !!user?.isExpired;

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [maxLimit, setMaxLimit] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Modals state
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<StudentItem | null>(null);

  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);
  const [studentUploadOpen, setStudentUploadOpen] = useState(false);
  const [marksTableOpen, setMarksTableOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);

  // Student deletion (requires password)
  const [studentToDelete, setStudentToDelete] = useState<StudentItem | null>(null);

  const loadStudents = async () => {
    setLoading(true);
    const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    const res = await apiRequest<StudentItem[]>(
      `/api/sections/${section.id}/students${q}`
    );
    setLoading(false);
    if (res.success && res.data) {
      setStudents(res.data);
      setTotalCount(res.totalCount !== undefined ? res.totalCount : res.data.length);
      if (res.maxLimit !== undefined) setMaxLimit(res.maxLimit);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [section.id, search]);

  const handleSaveStudent = async (data: {
    rollNumber: number;
    studentName: string;
    symbolNumber: string;
    parentContact: string;
    contactNumber?: string;
  }) => {
    if (isExpired) return;

    if (selectedStudentForEdit) {
      // Update student
      const res = await apiRequest(`/api/students/${selectedStudentForEdit.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (!res.success) {
        throw new Error(res.message || 'Failed to update student.');
      }
    } else {
      // Create student
      const res = await apiRequest(`/api/sections/${section.id}/students`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.success) {
        throw new Error(res.message || 'Failed to add student.');
      }
    }

    await loadStudents();
    await onRefreshSectionCount();
  };

  const handleConfirmDeleteStudent = async (password: string) => {
    if (isExpired || !studentToDelete) return;
    const res = await apiRequest(`/api/students/${studentToDelete.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    if (!res.success) {
      throw new Error(res.message || 'Failed to delete student.');
    }
    setStudentToDelete(null);
    await loadStudents();
    await onRefreshSectionCount();
  };

  const handleDownloadStudentTemplate = () => {
    const headers = ['Roll Number', 'Student Name', 'Symbol Number', 'Contact Number'];
    let rows: (string | number)[][] = [];

    if (students.length > 0) {
      rows = students.map((s) => [
        s.rollNumber,
        s.studentName || '',
        s.symbolNumber || '',
        s.contactNumber || s.parentContact || '',
      ]);
    } else {
      rows = [
        [1, 'Sample Student One', 'SYM-1001', '9841000001'],
        [2, 'Sample Student Two', 'SYM-1002', '9841000002'],
      ];
    }

    const csv = generateCsv(headers, rows);
    const filename = `${currentClass.name.replace(/\s+/g, '_')}_${section.name.replace(/\s+/g, '_')}_Student_Info_Template.csv`;
    downloadCsvFile(filename, csv);
  };

  const isFull = totalCount >= maxLimit;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb and Header */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            <button
              type="button"
              onClick={onBackToClass}
              className="hover:text-[#2B547E] dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {currentClass.name}
            </button>
            <span>/</span>
            <span className="text-[#2B547E] dark:text-blue-400 font-bold">{section.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{section.name}</h2>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                isFull
                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                  : totalCount >= 80
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  : 'bg-[#2B547E]/10 dark:bg-blue-500/10 text-[#2B547E] dark:text-blue-400'
              }`}
            >
              {totalCount} / {maxLimit} Students
            </span>
          </div>
        </div>

        {/* Action buttons with touch-friendly min 40px–42px targets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Add Student */}
          <button
            type="button"
            disabled={isFull || isExpired}
            onClick={() => {
              setSelectedStudentForEdit(null);
              setStudentModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title={isExpired ? 'Account expired (read-only)' : isFull ? 'Section limit reached (100 students)' : 'Add Student'}
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Student</span>
          </button>

          {/* Download CSV Template (Roll, Name, Symbol, Contact) */}
          <button
            type="button"
            onClick={handleDownloadStudentTemplate}
            className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            title="Download CSV student info template (Roll Number, Student Name, Symbol Number, Contact Number)"
          >
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Download Template</span>
          </button>

          {/* Upload Student Info (CSV) */}
          <button
            type="button"
            disabled={isExpired}
            onClick={() => setStudentUploadOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            title={isExpired ? 'Account expired (read-only)' : 'Import student info from CSV'}
          >
            <UploadCloud className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
            <span>Upload Student Info</span>
          </button>

          {/* In-Browser Marks Table */}
          <button
            type="button"
            onClick={() => setMarksTableOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            title="Open interactive marks sheet"
          >
            <Table className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Marks</span>
          </button>

          {/* Attendance (only shown if class attendance is enabled) */}
          {currentClass.attendanceEnabled && (
            <button
              type="button"
              onClick={() => setAttendanceOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              title="Record or view attendance"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Attendance</span>
            </button>
          )}
        </div>
      </div>

      {/* Account expired notice */}
      {isExpired && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 flex items-center gap-3 text-rose-900 dark:text-rose-200 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <strong className="font-bold">Account Expired (Read-Only Mode):</strong> Your subscription trial has ended. You can view student profiles and marks, but student additions, edits, deletions, and uploads are disabled. Please contact the administrator.
          </div>
        </div>
      )}

      {/* 100-student cap warning banner if at max limit */}
      {isFull && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center gap-3 text-amber-900 dark:text-amber-300 text-xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            <strong>Capacity Reached:</strong> This section has reached the maximum allowed limit of 100 students. To enroll more students, please create a new section in the Class Overview.
          </span>
        </div>
      )}

      {/* Search and Student Roster Table */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-base">
            <Users className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>Enrolled Students</span>
          </div>

          <div className="relative max-w-xs w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roll, name, symbol..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 shadow-2xs"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
          </div>
        </div>

        {/* Responsive Student Table with Sticky Roll & Student Name on mobile */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl relative">
          <table className="w-full text-left text-xs min-w-[600px]">
            <thead className="bg-[#F4F6FA] dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4 w-20 text-center sticky left-0 z-10 bg-[#F4F6FA] dark:bg-[#0F172A]">
                  Roll Number
                </th>
                <th className="py-3 px-4 sticky left-20 z-10 bg-[#F4F6FA] dark:bg-[#0F172A]">
                  Student Name
                </th>
                <th className="py-3 px-4">Symbol Number</th>
                <th className="py-3 px-4">Contact Number</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Loading student roster...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No students found in this section. Click &ldquo;Add Student&rdquo; to begin enrollment.
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group">
                    <td className="py-3.5 px-4 text-center font-bold text-slate-800 dark:text-slate-200 sticky left-0 z-10 bg-white dark:bg-[#1A2232] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60">
                      {student.rollNumber}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 sticky left-20 z-10 bg-white dark:bg-[#1A2232] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 whitespace-nowrap">
                      {student.studentName}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                      {student.symbolNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                      {student.contactNumber || student.parentContact || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {/* View Profile */}
                      <button
                        type="button"
                        onClick={() => setProfileStudentId(student.id)}
                        className="p-2 min-w-[36px] min-h-[36px] text-slate-500 dark:text-slate-400 hover:text-[#2B547E] dark:hover:text-blue-400 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                        title="View Academic Profile"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Edit Student (no password needed) */}
                      <button
                        type="button"
                        disabled={isExpired}
                        onClick={() => {
                          setSelectedStudentForEdit(student);
                          setStudentModalOpen(true);
                        }}
                        className="p-2 min-w-[36px] min-h-[36px] text-slate-500 dark:text-slate-400 hover:text-[#2B547E] dark:hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                        title={isExpired ? 'Account expired (read-only)' : 'Edit Student Information'}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Delete Student (prompts for current login password) */}
                      <button
                        type="button"
                        disabled={isExpired}
                        onClick={() => setStudentToDelete(student)}
                        className="p-2 min-w-[36px] min-h-[36px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                        title={isExpired ? 'Account expired (read-only)' : 'Delete Student (Requires Password)'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <StudentModal
        isOpen={studentModalOpen}
        student={selectedStudentForEdit}
        sectionName={section.name}
        isSectionFull={isFull}
        onClose={() => {
          setStudentModalOpen(false);
          setSelectedStudentForEdit(null);
        }}
        onSave={handleSaveStudent}
      />

      <StudentProfileModal
        studentId={profileStudentId}
        onClose={() => setProfileStudentId(null)}
      />

      <StudentCsvUploadModal
        isOpen={studentUploadOpen}
        sectionId={section.id}
        sectionName={section.name}
        className={currentClass.name}
        onClose={() => setStudentUploadOpen(false)}
        onSuccess={loadStudents}
      />

      <MarksTableModal
        isOpen={marksTableOpen}
        sectionId={section.id}
        sectionName={section.name}
        className={currentClass.name}
        onClose={() => setMarksTableOpen(false)}
      />

      <AttendanceModal
        isOpen={attendanceOpen}
        sectionId={section.id}
        sectionName={section.name}
        className={currentClass.name}
        onClose={() => setAttendanceOpen(false)}
      />

      {/* Delete Student Modal (requires password confirmation) */}
      <PasswordConfirmModal
        isOpen={studentToDelete !== null}
        title="Delete Student"
        description={`Are you sure you want to delete ${studentToDelete?.studentName} (Roll ${studentToDelete?.rollNumber})? This will permanently remove the student and their associated marks.`}
        confirmButtonText="Delete Student"
        isDestructive={true}
        onClose={() => setStudentToDelete(null)}
        onConfirm={handleConfirmDeleteStudent}
      />
    </div>
  );
};
