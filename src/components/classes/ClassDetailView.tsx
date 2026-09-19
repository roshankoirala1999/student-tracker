import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CalendarCheck, Award, FileText, Users, ArrowRight, X } from 'lucide-react';
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
}

export const ClassDetailView: React.FC<Props> = ({
  currentClass,
  sections,
  onRefreshClass,
  onRefreshSections,
  onSelectSection,
  onClassDeleted,
}) => {
  const [attendanceLoading, setAttendanceLoading] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Top Class Banner */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs transition-colors">
        <div>
          <div className="text-xs font-bold text-[#2B547E] dark:text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#2B547E] dark:bg-blue-400" />
            Class Management
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{currentClass.name}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {sections.length} Section{sections.length === 1 ? '' : 's'} configured for this class
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Class-level Attendance Switch */}
          <div className="flex items-center gap-3 bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl">
            <CalendarCheck className={`w-5 h-5 ${currentClass.attendanceEnabled ? 'text-[#2B547E] dark:text-blue-400' : 'text-slate-400'}`} />
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">Class Attendance</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {currentClass.attendanceEnabled ? 'Enabled across all sections' : 'Hidden for all sections'}
              </div>
            </div>
            <button
              type="button"
              disabled={attendanceLoading}
              onClick={handleToggleAttendance}
              className={`ml-2 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-bold transition-colors cursor-pointer ${
                currentClass.attendanceEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-400'
              }`}
            >
              {currentClass.attendanceEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Delete Class Button */}
          <button
            type="button"
            onClick={() => setDeleteClassModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-xl cursor-pointer transition-colors"
            title="Delete this entire class and all its sections, students, marks, and attendance"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Class</span>
          </button>
        </div>
      </div>

      {/* Sections Section */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-base">
            <Users className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>Sections</span>
          </div>
          <button
            type="button"
            onClick={() => setAddSectionModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Section</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.map((sec) => (
            <div
              key={sec.id}
              className="border border-slate-200/80 dark:border-slate-700 rounded-2xl p-5 hover:border-[#2B547E] dark:hover:border-blue-400 hover:shadow-xs transition-all flex flex-col justify-between bg-white dark:bg-[#0F172A]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{sec.name}</h4>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Enrolled: <span className="font-semibold text-slate-800 dark:text-slate-200">{sec.studentCount || 0}</span> / 100
                  </div>
                </div>
                <button
                  type="button"
                  title="Delete Section (Requires Password)"
                  onClick={() => setSectionToDelete(sec)}
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Capacity: 100 max</span>
                <button
                  type="button"
                  onClick={() => onSelectSection(sec.id)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#2B547E] dark:text-blue-400 hover:text-[#355C7D] dark:hover:text-blue-300 transition-colors cursor-pointer py-1.5"
                >
                  <span>Open Section</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
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
              className="flex items-center gap-1 px-3.5 py-2 min-h-[40px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
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
              className="flex items-center gap-1 px-3.5 py-2 min-h-[40px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
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
              assignments.map((as) => (
                <div
                  key={as.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-[#F4F6FA] dark:bg-[#0F172A] text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{as.name}</span>
                  <span className="bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[#355C7D] dark:text-blue-400 font-mono text-[11px] font-bold">
                    Max: {as.maxMarks}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Add Section (with password confirmation) */}
      <PasswordConfirmModal
        isOpen={addSectionModalOpen}
        title="Add New Section"
        description={`Add a new section to ${currentClass.name}. Creating a section is an academic structure change requiring your current login password.`}
        confirmButtonText="Create Section"
        isDestructive={false}
        onClose={() => {
          setAddSectionModalOpen(false);
          setNewSectionName('');
        }}
        onConfirm={handleConfirmAddSection}
      >
        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
            Section Name
          </label>
          <input
            type="text"
            required
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            placeholder="e.g. Section 7"
            className="w-full px-3.5 py-2.5 min-h-[42px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
          />
        </div>
      </PasswordConfirmModal>

      {/* Modal: Delete Section (with password confirmation) */}
      <PasswordConfirmModal
        isOpen={sectionToDelete !== null}
        title="Delete Section"
        description={`Are you sure you want to delete "${sectionToDelete?.name}"? All students, marks, and attendance recorded in this section will be permanently deleted.`}
        confirmButtonText="Delete Section"
        isDestructive={true}
        onClose={() => setSectionToDelete(null)}
        onConfirm={handleConfirmDeleteSection}
      />

      {/* Modal: Delete Class (with password confirmation) */}
      <PasswordConfirmModal
        isOpen={deleteClassModalOpen}
        title={`Delete Class: ${currentClass.name}`}
        description={`Are you sure you want to permanently delete "${currentClass.name}"? This action will permanently cascade delete all ${sections.length} sections, their students, marks, examinations, assignments, and attendance logs.`}
        confirmButtonText="Delete Entire Class"
        isDestructive={true}
        onClose={() => setDeleteClassModalOpen(false)}
        onConfirm={handleConfirmDeleteClass}
      />

      {/* Modal: Add Examination */}
      {examModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 p-6 transition-colors">
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
              This examination will automatically appear across all sections of {currentClass.name} and will be included in the dynamic marks sheets and Excel templates.
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
                  placeholder="e.g. Mid-Term Examination"
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
                  placeholder="e.g. 50"
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

      {/* Modal: Add Assignment */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 p-6 transition-colors">
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
