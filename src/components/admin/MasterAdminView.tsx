import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  User,
  CheckCircle,
  Ban,
  KeyRound,
  Search,
  Eye,
  BookOpen,
  Users,
  X,
  Lock,
  Unlock,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { PasswordConfirmModal } from '../common/PasswordConfirmModal.tsx';

interface TeacherItem {
  id: string;
  username: string;
  role: string;
  status: 'active' | 'suspended';
  isDeletionLocked?: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  classCount: number;
  studentCount: number;
}

interface InspectedClass {
  id: string;
  name: string;
  attendanceEnabled: boolean;
  sections: Array<{
    id: string;
    name: string;
    order: number;
    studentCount: number;
    students: Array<{
      id: string;
      rollNumber: number;
      studentName: string;
      symbolNumber: string;
      contactNumber?: string;
      parentContact?: string;
    }>;
  }>;
  examinations: Array<{
    id: string;
    name: string;
    maxMarks: number;
  }>;
  assignments: Array<{
    id: string;
    name: string;
    maxMarks: number;
  }>;
}

interface InspectedData {
  teacher: {
    id: string;
    username: string;
    status: string;
    isDeletionLocked?: boolean;
    createdAt: string;
  };
  classes: InspectedClass[];
  totalStudents: number;
}

export const MasterAdminView: React.FC = () => {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Password edit modal state
  const [passwordModalTeacher, setPasswordModalTeacher] = useState<TeacherItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete teacher modal state
  const [teacherToDelete, setTeacherToDelete] = useState<TeacherItem | null>(null);

  // Inspection modal state
  const [inspectTeacher, setInspectTeacher] = useState<TeacherItem | null>(null);
  const [inspectData, setInspectData] = useState<InspectedData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const loadTeachers = async () => {
    setLoading(true);
    setError(null);
    const res = await apiRequest<TeacherItem[]>('/api/admin/teachers');
    setLoading(false);
    if (res.success && res.data) {
      setTeachers(res.data);
    } else {
      setError(res.message || 'Failed to load teachers directory.');
    }
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  const handleToggleStatus = async (teacher: TeacherItem) => {
    const nextStatus = teacher.status === 'active' ? 'suspended' : 'active';
    const res = await apiRequest(`/api/admin/teachers/${teacher.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.success) {
      setSuccessMsg(`Teacher "${teacher.username}" account is now ${nextStatus}.`);
      await loadTeachers();
    } else {
      setError(res.message || 'Failed to update teacher status.');
    }
  };

  const handleToggleDeletionLock = async (teacher: TeacherItem) => {
    const nextLock = !teacher.isDeletionLocked;
    const res = await apiRequest(`/api/admin/teachers/${teacher.id}/deletion-lock`, {
      method: 'PATCH',
      body: JSON.stringify({ isDeletionLocked: nextLock }),
    });
    if (res.success) {
      setSuccessMsg(`Deletion lock for "${teacher.username}" is now ${nextLock ? 'LOCKED' : 'UNLOCKED'}.`);
      await loadTeachers();
    } else {
      setError(res.message || 'Failed to update deletion lock.');
    }
  };

  const handleEditPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalTeacher) return;

    setPasswordLoading(true);
    const res = await apiRequest(`/api/admin/teachers/${passwordModalTeacher.id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ newPassword }),
    });
    setPasswordLoading(false);
    if (res.success) {
      setSuccessMsg(`Password for "${passwordModalTeacher.username}" reset successfully.`);
      setPasswordModalTeacher(null);
      setNewPassword('');
      await loadTeachers();
    } else {
      setError(res.message || 'Failed to change password.');
    }
  };

  const handleConfirmDeleteTeacher = async (password: string) => {
    if (!teacherToDelete) return;
    const res = await apiRequest(`/api/admin/teachers/${teacherToDelete.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    if (!res.success) {
      throw new Error(res.message || 'Failed to cascade delete teacher.');
    }
    setSuccessMsg(res.message || `Teacher "${teacherToDelete.username}" deleted.`);
    setTeacherToDelete(null);
    await loadTeachers();
  };

  const handleOpenInspect = async (teacher: TeacherItem) => {
    setInspectTeacher(teacher);
    setInspectLoading(true);
    setInspectData(null);
    const res = await apiRequest<InspectedData>(`/api/admin/teachers/${teacher.id}/inspect`);
    setInspectLoading(false);
    if (res.success && res.data) {
      setInspectData(res.data);
    } else {
      setError(res.message || 'Failed to retrieve teacher inspection data.');
    }
  };

  const filtered = teachers.filter((t) =>
    t.username.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 font-bold text-[#2B547E] dark:text-blue-400 text-xs uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            Supervisory Administration
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Administrator Console</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Inspect teacher accounts, review classes &amp; rosters, manage access suspension, toggle deletion locks, and execute password resets.
          </p>
        </div>

        <div className="bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 shrink-0">
          Total Registered Teachers: <span className="font-bold text-slate-900 dark:text-slate-100">{teachers.length}</span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl flex items-center justify-between">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-600 dark:text-emerald-400 hover:opacity-80 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Teachers Directory */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-base">
            <User className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>Teachers Directory</span>
          </div>

          <div className="relative max-w-xs w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teacher username..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 shadow-2xs"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F4F6FA] dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4 text-center">Classes</th>
                <th className="py-3 px-4 text-center">Students</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Deletion Lock</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading teachers directory...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No teachers found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-slate-100">{t.username}</td>
                    <td className="py-3.5 px-4 capitalize text-slate-600 dark:text-slate-400">{t.role}</td>
                    <td className="py-3.5 px-4 text-center font-semibold text-slate-800 dark:text-slate-200">{t.classCount}</td>
                    <td className="py-3.5 px-4 text-center font-semibold text-slate-800 dark:text-slate-200">{t.studentCount}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === 'active'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleDeletionLock(t)}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          t.isDeletionLocked
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                        }`}
                        title={t.isDeletionLocked ? 'Deletion Locked (Click to Unlock)' : 'Unlocked (Click to Lock)'}
                      >
                        {t.isDeletionLocked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {/* Inspect Data Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenInspect(t)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#2B547E]/10 dark:bg-blue-500/10 hover:bg-[#2B547E]/20 dark:hover:bg-blue-500/20 text-[#2B547E] dark:text-blue-400 cursor-pointer transition-colors"
                        title="Inspect classes, sections, and students"
                      >
                        <span className="flex items-center gap-1 inline-flex">
                          <Eye className="w-3.5 h-3.5" /> Inspect
                        </span>
                      </button>

                      {/* Suspend / Reactivate */}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(t)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          t.status === 'active'
                            ? 'bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {t.status === 'active' ? (
                          <span className="flex items-center gap-1 inline-flex">
                            <Ban className="w-3.5 h-3.5" /> Suspend
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 inline-flex">
                            <CheckCircle className="w-3.5 h-3.5" /> Reactivate
                          </span>
                        )}
                      </button>

                      {/* Reset / Change Password */}
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordModalTeacher(t);
                          setNewPassword('');
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                        title="Change Teacher Password"
                      >
                        <span className="flex items-center gap-1 inline-flex">
                          <KeyRound className="w-3.5 h-3.5" /> Password
                        </span>
                      </button>

                      {/* Delete Teacher */}
                      <button
                        type="button"
                        disabled={t.isDeletionLocked}
                        onClick={() => setTeacherToDelete(t)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer transition-colors"
                        title={t.isDeletionLocked ? 'Cannot delete: Deletion Locked' : 'Cascade Delete Teacher'}
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teacher Inspection Modal */}
      {inspectTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Inspecting Teacher: {inspectTeacher.username}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectTeacher(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {inspectLoading ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  Inspecting teacher records across database...
                </div>
              ) : !inspectData ? (
                <div className="py-12 text-center text-xs text-rose-500">
                  Failed to load teacher inspection details.
                </div>
              ) : (
                <>
                  {/* Overview Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Account Status</div>
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100 capitalize mt-0.5">
                        {inspectData.teacher.status}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        Deletion Lock: {inspectData.teacher.isDeletionLocked ? 'Locked' : 'Unlocked'}
                      </div>
                    </div>
                    <div className="bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Configured Classes</div>
                      <div className="text-lg font-bold text-[#2B547E] dark:text-blue-400 mt-0.5">
                        {inspectData.classes.length}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Across all academic tracks</div>
                    </div>
                    <div className="bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Enrolled Students</div>
                      <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {inspectData.totalStudents}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Across all sections</div>
                    </div>
                  </div>

                  {/* Classes & Sections Hierarchy */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                      Classes &amp; Sections Hierarchy
                    </h4>

                    {inspectData.classes.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                        This teacher has not created any classes yet.
                      </div>
                    ) : (
                      inspectData.classes.map((c) => (
                        <div key={c.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3 bg-white dark:bg-[#1A2232]">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{c.name}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                                (Attendance: {c.attendanceEnabled ? 'Enabled' : 'Disabled'})
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {c.sections.length} Section{c.sections.length === 1 ? '' : 's'}
                            </div>
                          </div>

                          {/* Sections inside class */}
                          <div className="space-y-3">
                            {c.sections.map((sec) => (
                              <div key={sec.id} className="bg-[#F4F6FA] dark:bg-[#0F172A] rounded-xl p-3 text-xs space-y-2">
                                <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                                  <span>{sec.name}</span>
                                  <span className="text-slate-500 dark:text-slate-400 font-normal">
                                    {sec.students.length} Student{sec.students.length === 1 ? '' : 's'}
                                  </span>
                                </div>

                                {sec.students.length > 0 && (
                                  <div className="max-h-48 overflow-x-auto border border-slate-200/80 dark:border-slate-700/80 rounded-xl bg-white dark:bg-[#1A2232]">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 sticky top-0">
                                        <tr>
                                          <th className="p-2 w-12 text-center">Roll</th>
                                          <th className="p-2">Name</th>
                                          <th className="p-2">Symbol</th>
                                          <th className="p-2">Contact Number</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {sec.students.map((st) => (
                                          <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="p-2 text-center font-bold text-slate-700 dark:text-slate-300">
                                              {st.rollNumber}
                                            </td>
                                            <td className="p-2 font-medium text-slate-900 dark:text-slate-100">
                                              {st.studentName}
                                            </td>
                                            <td className="p-2 font-mono text-slate-600 dark:text-slate-400">
                                              {st.symbolNumber}
                                            </td>
                                            <td className="p-2 text-slate-500 dark:text-slate-400">
                                              {st.contactNumber || st.parentContact || '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A] flex justify-end">
              <button
                type="button"
                onClick={() => setInspectTeacher(null)}
                className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Edit Modal */}
      {passwordModalTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl max-w-sm w-full border border-slate-200/80 dark:border-slate-700/80 p-6">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Change Password: {passwordModalTeacher.username}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter the new password for this teacher account.
            </p>

            <form onSubmit={handleEditPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordModalTeacher(null);
                    setNewPassword('');
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading || newPassword.length < 6}
                  className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cascade Delete Teacher Modal (requires administrator password) */}
      <PasswordConfirmModal
        isOpen={teacherToDelete !== null}
        title={`Cascade Delete Teacher: ${teacherToDelete?.username}`}
        description={`WARNING: Administrator confirmation required. You are about to permanently delete teacher "${teacherToDelete?.username}" and all of their classes, sections, students, marks, and attendance logs. This action cannot be undone.`}
        confirmButtonText="Delete Teacher & All Data"
        isDestructive={true}
        onClose={() => setTeacherToDelete(null)}
        onConfirm={handleConfirmDeleteTeacher}
      />
    </div>
  );
};
