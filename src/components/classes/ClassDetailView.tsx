import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  CalendarCheck,
  Award,
  FileText,
  Users,
  ArrowRight,
  ArrowLeft,
  X,
  ChevronDown,
} from 'lucide-react';
import { ClassItem, SectionItem, ExaminationItem, AssignmentItem } from '../../types/index.ts';
import { apiRequest } from '../../api/client.ts';
import { PasswordConfirmModal } from '../common/PasswordConfirmModal.tsx';

interface Props {
  currentClass: ClassItem;
  sections: SectionItem[];
  onRefreshClass: () => Promise<void>;
  onRefreshSections: () => Promise<void>;
  onSelectSection: (sectionId: string) => void;
  onClassDeleted?: () => void;
  onBack?: () => void;
}

export const ClassDetailView: React.FC<Props> = ({
  currentClass,
  sections,
  onRefreshClass,
  onRefreshSections,
  onSelectSection,
  onClassDeleted,
  onBack,
}) => {
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Unified "+ Add" dropdown menu state
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);

  // Examinations state
  const [examinations, setExaminations] = useState<ExaminationItem[]>([]);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [examName, setExamName] = useState('');
  const [examMaxMarks, setExamMaxMarks] = useState('50');
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);

  // Assignments state
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignName, setAssignName] = useState('');
  const [assignMaxMarks, setAssignMaxMarks] = useState('10');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Sensitive structural action modal: Add Section
  const [addSectionModalOpen, setAddSectionModalOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  // Sensitive structural action modal: Delete Section
  const [sectionToDelete, setSectionToDelete] = useState<SectionItem | null>(null);

  // Delete Class modal
  const [deleteClassModalOpen, setDeleteClassModalOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setAddDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadAssessments = async () => {
    try {
      const [exRes, asRes] = await Promise.all([
        apiRequest<ExaminationItem[]>(`/api/classes/${currentClass.id}/examinations`),
        apiRequest<AssignmentItem[]>(`/api/classes/${currentClass.id}/assignments`),
      ]);
      if (exRes.success && exRes.data) setExaminations(exRes.data);
      if (asRes.success && asRes.data) setAssignments(asRes.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAssessments();
  }, [currentClass.id]);

  // Toggle Attendance at Class Level
  const handleToggleAttendance = async () => {
    setAttendanceLoading(true);
    const newStatus = !currentClass.attendanceEnabled;
    const res = await apiRequest(`/api/classes/${currentClass.id}/attendance`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: newStatus }),
    });
    setAttendanceLoading(false);
    if (res.success) {
      await onRefreshClass();
    }
  };

  // Add Section (requires teacher's password)
  const handleConfirmAddSection = async (password: string) => {
    const res = await apiRequest(`/api/classes/${currentClass.id}/sections`, {
      method: 'POST',
      body: JSON.stringify({ name: newSectionName, password }),
    });
    if (!res.success) {
      throw new Error(res.message || 'Failed to add section.');
    }
    setNewSectionName('');
    await onRefreshSections();
  };

  // Delete Section (requires teacher's password)
  const handleConfirmDeleteSection = async (password: string) => {
    if (!sectionToDelete) return;
    const res = await apiRequest(`/api/classes/${currentClass.id}/sections/${sectionToDelete.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    if (!res.success) {
      throw new Error(res.message || 'Failed to delete section.');
    }
    setSectionToDelete(null);
    await onRefreshSections();
  };

  // Delete Class (requires teacher's password)
  const handleConfirmDeleteClass = async (password: string) => {
    const res = await apiRequest(`/api/classes/${currentClass.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    if (!res.success) {
      throw new Error(res.message || 'Failed to delete class.');
    }
    setDeleteClassModalOpen(false);
    if (onClassDeleted) {
      onClassDeleted();
    } else {
      await onRefreshClass();
    }
  };

  // Create Examination
  const handleCreateExamination = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamLoading(true);
    setExamError(null);

    const res = await apiRequest(`/api/classes/${currentClass.id}/examinations`, {
      method: 'POST',
      body: JSON.stringify({ name: examName, maxMarks: Number(examMaxMarks) }),
    });

    setExamLoading(false);
    if (res.success) {
      setExamModalOpen(false);
      setExamName('');
      setExamMaxMarks('50');
      await loadAssessments();
    } else {
      setExamError(res.message || 'Failed to create examination.');
    }
  };

  // Create Assignment
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignLoading(true);
    setAssignError(null);

    const res = await apiRequest(`/api/classes/${currentClass.id}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ name: assignName, maxMarks: Number(assignMaxMarks) }),
    });

    setAssignLoading(false);
    if (res.success) {
      setAssignModalOpen(false);
      setAssignName('');
      setAssignMaxMarks('10');
      await loadAssessments();
    } else {
      setAssignError(res.message || 'Failed to create assignment.');
    }
  };

  // Metrics calculations for the single-line percentile grid
  const totalStudents = sections.reduce((acc, s) => acc + (s.studentCount || 0), 0);
  const totalCapacity = Math.max(sections.length * 100, 100);
  const enrolledPercentile = Math.round((totalStudents / totalCapacity) * 100);

  return (
    <div className="space-y-6">
      {/* Top Class Banner & Actions */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 sm:p-6 shadow-xs transition-colors space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                title="Back to Classes"
                aria-label="Back to Classes"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div>
              <div className="text-xs font-bold text-[#2B547E] dark:text-blue-400 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#2B547E] dark:bg-blue-400" />
                <span>Class Overview</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{currentClass.name}</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Unified + Add Dropdown */}
            <div className="relative" ref={addDropdownRef}>
              <button
                type="button"
                onClick={() => setAddDropdownOpen(!addDropdownOpen)}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${addDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {addDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-[#141C2B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setAddDropdownOpen(false);
                      setAddSectionModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 text-[#2B547E] dark:text-blue-400" />
                    <span>New Section</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddDropdownOpen(false);
                      setExamModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    <span>New Examination</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddDropdownOpen(false);
                      setAssignModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    <span>New Assignment</span>
                  </button>
                </div>
              )}
            </div>

            {/* Attendance Toggle */}
            <button
              type="button"
              disabled={attendanceLoading}
              onClick={handleToggleAttendance}
              className={`flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                currentClass.attendanceEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Attendance: {currentClass.attendanceEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Delete Class Button */}
            <button
              type="button"
              onClick={() => setDeleteClassModalOpen(true)}
              className="p-2.5 min-h-[40px] text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-xl cursor-pointer transition-colors"
              title="Delete Class"
              aria-label="Delete Class"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Single-Line Percentile Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="bg-[#F4F6FA] dark:bg-[#0F172A] p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Enrollment</span>
              <span className="text-slate-700 dark:text-slate-300 font-mono font-bold">{enrolledPercentile}%</span>
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {totalStudents} <span className="text-xs font-normal text-slate-500">/ {totalCapacity}</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#2B547E] dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(enrolledPercentile, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-[#F4F6FA] dark:bg-[#0F172A] p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Sections</div>
            <div className="text-lg font-bold text-[#2B547E] dark:text-blue-400 mt-0.5">
              {sections.length}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Configured Groups</div>
          </div>

          <div className="bg-[#F4F6FA] dark:bg-[#0F172A] p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Examinations</div>
            <div className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-0.5">
              {examinations.length}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Summative Tests</div>
          </div>

          <div className="bg-[#F4F6FA] dark:bg-[#0F172A] p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Assignments</div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
              {assignments.length}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Continuous Tasks</div>
          </div>
        </div>
      </div>

      {/* Sections Section */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-base">
            <Users className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>Class Sections</span>
          </div>
          <button
            type="button"
            onClick={() => setAddSectionModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Section</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.length === 0 ? (
            <div className="col-span-full py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              No sections created yet for {currentClass.name}. Click &ldquo;New Section&rdquo; to begin roster entry.
            </div>
          ) : (
            sections.map((sec) => {
              const count = sec.studentCount || 0;
              const percent = Math.min(Math.round((count / 100) * 100), 100);

              return (
                <div
                  key={sec.id}
                  className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-5 hover:border-[#2B547E] dark:hover:border-blue-400 hover:shadow-xs transition-all flex flex-col justify-between bg-white dark:bg-[#0F172A]"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-[#2B547E] dark:text-blue-400 uppercase tracking-wider">
                          Section
                        </span>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base mt-0.5">{sec.name}</h4>
                      </div>
                      <button
                        type="button"
                        title="Delete Section (Requires Password)"
                        onClick={() => setSectionToDelete(sec)}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Progress Bar & Enrolled Stats */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Students Enrolled</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {count} <span className="text-[11px] font-normal text-slate-400">/ 100</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#2B547E] dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">{100 - count} spots remaining</span>
                    <button
                      type="button"
                      onClick={() => onSelectSection(sec.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2B547E]/10 dark:bg-blue-500/10 hover:bg-[#2B547E] dark:hover:bg-blue-600 text-[#2B547E] dark:text-blue-400 hover:text-white dark:hover:text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      <span>Open Section</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Dynamic Assessments: Examinations & Assignments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dynamic Class-Specific Examinations */}
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Class Examinations</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Applied across all sections of {currentClass.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExamModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Exam</span>
            </button>
          </div>

          <div className="space-y-2">
            {examinations.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                No examinations created yet for this class.
              </div>
            ) : (
              examinations.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-[#F4F6FA] dark:bg-[#0F172A] text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{ex.name}</span>
                  <span className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[#2B547E] dark:text-blue-400 font-mono text-[11px] font-bold">
                    Max: {ex.maxMarks}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Dynamic Class Assignments */}
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                <FileText className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                <span>Class Assignments</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Dynamic coursework columns for {currentClass.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAssignModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Assignment</span>
            </button>
          </div>

          <div className="space-y-2">
            {assignments.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                No assignments created yet for this class.
              </div>
            ) : (
              assignments.map((asItem) => (
                <div
                  key={asItem.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-[#F4F6FA] dark:bg-[#0F172A] text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{asItem.name}</span>
                  <span className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[#2B547E] dark:text-blue-400 font-mono text-[11px] font-bold">
                    Max: {asItem.maxMarks}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Section Password Confirmation Modal */}
      <PasswordConfirmModal
        isOpen={addSectionModalOpen}
        title="Add New Section (Teacher Verification)"
        description={`Enter your password to confirm creating a new section for "${currentClass.name}".`}
        confirmButtonText="Create Section"
        onClose={() => {
          setAddSectionModalOpen(false);
          setNewSectionName('');
        }}
        onConfirm={handleConfirmAddSection}
      >
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
            Section Name
          </label>
          <input
            type="text"
            required
            autoFocus
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            placeholder="e.g. Section A, Morning, or Batch 2026"
            className="w-full px-3.5 py-2.5 min-h-[42px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 shadow-2xs"
          />
        </div>
      </PasswordConfirmModal>

      {/* Delete Section Password Confirmation Modal */}
      <PasswordConfirmModal
        isOpen={sectionToDelete !== null}
        title={`Delete Section: ${sectionToDelete?.name}`}
        description={`WARNING: You are about to permanently delete Section "${sectionToDelete?.name}". All student records, attendance logs, and marks associated with this section will be permanently deleted. This action cannot be undone.`}
        confirmButtonText="Delete Section & Data"
        isDestructive={true}
        onClose={() => setSectionToDelete(null)}
        onConfirm={handleConfirmDeleteSection}
      />

      {/* Delete Class Password Confirmation Modal */}
      <PasswordConfirmModal
        isOpen={deleteClassModalOpen}
        title={`Delete Class: ${currentClass.name}`}
        description={`WARNING: You are about to delete the entire class "${currentClass.name}" and all of its sections, students, marks, and attendance logs. This action cannot be undone.`}
        confirmButtonText="Delete Class & All Data"
        isDestructive={true}
        onClose={() => setDeleteClassModalOpen(false)}
        onConfirm={handleConfirmDeleteClass}
      />

      {/* Create Examination Modal */}
      {examModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl max-w-sm w-full border border-slate-200/80 dark:border-slate-700/80 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add Examination for {currentClass.name}
              </h3>
              <button
                type="button"
                onClick={() => setExamModalOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Add a summative exam assessment applied to all sections of {currentClass.name}.
            </p>

            {examError && (
              <div className="mb-3 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                {examError}
              </div>
            )}

            <form onSubmit={handleCreateExamination} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Examination Name
                </label>
                <input
                  type="text"
                  required
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="e.g. Midterm Examination or Final Exam"
                  className="w-full px-3.5 py-2.5 min-h-[42px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Maximum Marks
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={examMaxMarks}
                  onChange={(e) => setExamMaxMarks(e.target.value)}
                  placeholder="e.g. 50 or 100"
                  className="w-full px-3.5 py-2.5 min-h-[42px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExamModalOpen(false)}
                  className="px-4 py-2.5 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={examLoading}
                  className="px-5 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {examLoading ? 'Saving...' : 'Add Examination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Assignment Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl max-w-sm w-full border border-slate-200/80 dark:border-slate-700/80 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add Assignment for {currentClass.name}
              </h3>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Create a dynamic coursework assessment for all sections of {currentClass.name}.
            </p>

            {assignError && (
              <div className="mb-3 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                {assignError}
              </div>
            )}

            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Assignment Name
                </label>
                <input
                  type="text"
                  required
                  value={assignName}
                  onChange={(e) => setAssignName(e.target.value)}
                  placeholder="e.g. Assignment 1 or Project Work"
                  className="w-full px-3.5 py-2.5 min-h-[42px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Maximum Marks
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={assignMaxMarks}
                  onChange={(e) => setAssignMaxMarks(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full px-3.5 py-2.5 min-h-[42px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2.5 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignLoading}
                  className="px-5 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {assignLoading ? 'Saving...' : 'Add Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
