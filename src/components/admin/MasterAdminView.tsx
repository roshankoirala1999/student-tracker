import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  User,
  CheckCircle,
  Ban,
  KeyRound,
  Search,
  Eye,
  EyeOff,
  BookOpen,
  Users,
  X,
  Lock,
  Unlock,
  Trash2,
  Edit,
  Plus,
  ArrowUp,
  ArrowDown,
  HelpCircle,
  Clock,
  Download,
  Settings,
  Mail,
  Phone,
  MapPin,
  Code,
  Bell,
  FileSpreadsheet,
  MessageSquare,
} from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { PasswordConfirmModal } from '../common/PasswordConfirmModal.tsx';
import { ProfileQuestion, DeveloperContact } from '../../types/index.ts';
import { TeacherExpiryModal } from './TeacherExpiryModal.tsx';
import { NewUserDefaultsModal } from './NewUserDefaultsModal.tsx';
import { AdminNotificationModal } from './AdminNotificationModal.tsx';
import { MessagingModal } from '../messaging/MessagingModal.tsx';

interface TeacherItem {
  id: string;
  username: string;
  fullName?: string;
  phoneNumber?: string;
  college?: string;
  dob?: string;
  customFields?: Record<string, string>;
  plainPassword?: string;
  role: string;
  status: 'active' | 'suspended';
  isDeletionLocked?: boolean;
  mustChangePassword?: boolean;
  expiryMode?: boolean;
  expiresAt?: string;
  isExpired?: boolean;
  daysRemaining?: number;
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
    fullName?: string;
    phoneNumber?: string;
    college?: string;
    dob?: string;
    status: string;
    isDeletionLocked?: boolean;
    createdAt: string;
  };
  classes: InspectedClass[];
  totalStudents: number;
}

export const MasterAdminView: React.FC = () => {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [messagingModalTeacher, setMessagingModalTeacher] = useState<TeacherItem | null>(null);

  // Password visibility map (by teacher id)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Password edit modal state
  const [passwordModalTeacher, setPasswordModalTeacher] = useState<TeacherItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Edit Teacher Profile modal state (for administrator)
  const [editTeacher, setEditTeacher] = useState<TeacherItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCollege, setEditCollege] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editCustomFields, setEditCustomFields] = useState<Record<string, string>>({});
  const [editPasswordInput, setEditPasswordInput] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Profile Questions state
  const [questions, setQuestions] = useState<ProfileQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionRequired, setNewQuestionRequired] = useState(false);
  const [questionSubmitting, setQuestionSubmitting] = useState(false);

  // Delete teacher modal state
  const [teacherToDelete, setTeacherToDelete] = useState<TeacherItem | null>(null);

  // Inspection modal state
  const [inspectTeacher, setInspectTeacher] = useState<TeacherItem | null>(null);
  const [inspectData, setInspectData] = useState<InspectedData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Expiry modal state
  const [expiryModalTeacher, setExpiryModalTeacher] = useState<TeacherItem | null>(null);

  // New User Defaults modal state
  const [newUserDefaultsOpen, setNewUserDefaultsOpen] = useState(false);

  // Admin Notification modal state
  const [notificationModalTeacher, setNotificationModalTeacher] = useState<TeacherItem | null>(null);

  // Teacher info export state
  const [downloadingTeacherId, setDownloadingTeacherId] = useState<string | null>(null);
  const [selectedDownloadTeacherId, setSelectedDownloadTeacherId] = useState<string>('');

  // Developer contact state
  const [devName, setDevName] = useState('');
  const [devPhone, setDevPhone] = useState('');
  const [devAddress, setDevAddress] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const [devSaving, setDevSaving] = useState(false);
  const [devMsg, setDevMsg] = useState<string | null>(null);

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

  const loadQuestions = async () => {
    setQuestionsLoading(true);
    const res = await apiRequest<ProfileQuestion[]>('/api/profile-questions');
    setQuestionsLoading(false);
    if (res.success && res.data) {
      setQuestions(res.data);
    }
  };

  const loadDevContact = async () => {
    setDevLoading(true);
    const res = await apiRequest<DeveloperContact>('/api/admin/settings/developer-contact');
    setDevLoading(false);
    if (res.success && res.data) {
      setDevName(res.data.name || '');
      setDevPhone(res.data.phone || '');
      setDevAddress(res.data.address || '');
      setDevEmail(res.data.email || '');
    }
  };

  useEffect(() => {
    loadTeachers();
    loadQuestions();
    loadDevContact();
  }, []);

  const handleSaveDevContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevSaving(true);
    setDevMsg(null);
    const res = await apiRequest('/api/admin/settings/developer-contact', {
      method: 'PUT',
      body: JSON.stringify({
        name: devName.trim(),
        phone: devPhone.trim(),
        address: devAddress.trim(),
        email: devEmail.trim(),
      }),
    });
    setDevSaving(false);
    if (res.success) {
      setDevMsg('Developer contact information updated successfully.');
      setTimeout(() => setDevMsg(null), 4000);
    } else {
      setError(res.message || 'Failed to save developer contact info.');
    }
  };

  const handleDownloadTeacherInfo = async (teacher: TeacherItem) => {
    setDownloadingTeacherId(teacher.id);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/teachers/${teacher.id}/export`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error('Failed to download teacher data.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${teacher.username}_full_data.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccessMsg(`Teacher "${teacher.username}" full academic & student data downloaded successfully.`);
    } catch (err: any) {
      setError(err.message || 'Download failed.');
    } finally {
      setDownloadingTeacherId(null);
    }
  };

  const togglePasswordVisibility = (teacherId: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [teacherId]: !prev[teacherId],
    }));
  };

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

  const handleOpenEditTeacher = (teacher: TeacherItem) => {
    setEditTeacher(teacher);
    setEditFullName(teacher.fullName || '');
    setEditPhone(teacher.phoneNumber || '');
    setEditCollege(teacher.college || '');
    setEditDob(teacher.dob || '');
    setEditCustomFields(teacher.customFields || {});
    setEditPasswordInput('');
  };

  const handleSaveTeacherProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTeacher) return;

    if (editDob.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(editDob.trim())) {
      setError('Date of birth must be in strictly YYYY-MM-DD format (e.g. 2056-01-01).');
      return;
    }

    setEditLoading(true);
    const body: Record<string, unknown> = {
      fullName: editFullName.trim(),
      phoneNumber: editPhone.trim(),
      college: editCollege.trim(),
      dob: editDob.trim(),
      customFields: editCustomFields,
    };
    if (editPasswordInput.trim()) {
      body.newPassword = editPasswordInput.trim();
    }

    const res = await apiRequest(`/api/admin/teachers/${editTeacher.id}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    setEditLoading(false);

    if (res.success) {
      setSuccessMsg(`Profile for teacher "${editTeacher.username}" updated.`);
      setEditTeacher(null);
      await loadTeachers();
    } else {
      setError(res.message || 'Failed to update teacher profile.');
    }
  };

  // Questions Management
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    setQuestionSubmitting(true);
    const res = await apiRequest('/api/profile-questions', {
      method: 'POST',
      body: JSON.stringify({
        questionText: newQuestionText.trim(),
        fieldType: 'text',
        required: newQuestionRequired,
      }),
    });
    setQuestionSubmitting(false);

    if (res.success) {
      setNewQuestionText('');
      setNewQuestionRequired(false);
      setSuccessMsg('Institutional question added.');
      await loadQuestions();
    } else {
      setError(res.message || 'Failed to add question.');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    const res = await apiRequest(`/api/profile-questions/${id}`, {
      method: 'DELETE',
    });
    if (res.success) {
      setSuccessMsg('Institutional question deleted.');
      await loadQuestions();
    } else {
      setError(res.message || 'Failed to delete question.');
    }
  };

  const handleReorderQuestions = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const copy = [...questions];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);

    const questionIds = copy.map((q) => q.id);
    const res = await apiRequest('/api/profile-questions/reorder', {
      method: 'PUT',
      body: JSON.stringify({ questionIds }),
    });
    if (res.success) {
      setQuestions(copy);
    } else {
      setError(res.message || 'Failed to reorder questions.');
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

  const filtered = teachers.filter((t) => {
    const term = search.toLowerCase().trim();
    return (
      t.username.toLowerCase().includes(term) ||
      (t.fullName && t.fullName.toLowerCase().includes(term)) ||
      (t.phoneNumber && t.phoneNumber.toLowerCase().includes(term))
    );
  });

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

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setNewUserDefaultsOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            title="Configure default expiry mode and account deletion rules for new accounts"
          >
            <Settings className="w-4 h-4" />
            <span>New user default setting</span>
          </button>

          <div className="bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-300">
            Total Teachers: <span className="font-bold text-slate-900 dark:text-slate-100">{teachers.length}</span>
          </div>
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

        {/* Download Teacher Info Section */}
        <div className="bg-[#F4F6FA] dark:bg-[#0F172A] p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">Download Teacher Info</span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Export comprehensive teacher profile, class rosters, marks, and attendance logs to CSV.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={selectedDownloadTeacherId}
              onChange={(e) => setSelectedDownloadTeacherId(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
            >
              <option value="">-- Select teacher to download --</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName ? `${t.fullName} (@${t.username})` : `@${t.username}`}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!selectedDownloadTeacherId || downloadingTeacherId === selectedDownloadTeacherId}
              onClick={() => {
                const target = teachers.find((t) => t.id === selectedDownloadTeacherId);
                if (target) handleDownloadTeacherInfo(target);
              }}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingTeacherId === selectedDownloadTeacherId ? 'Downloading...' : 'Download'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F4F6FA] dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Teacher</th>
                <th className="py-3 px-4">Password</th>
                <th className="py-3 px-4 text-center">Expiry / Access</th>
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
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Loading teachers directory...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No teachers found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const isRevealed = !!revealedPasswords[t.id];
                  const displayPass = t.plainPassword || '';

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {t.fullName ? t.fullName : t.username}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <span className="font-mono">@{t.username}</span>
                          {t.phoneNumber && <span>• {t.phoneNumber}</span>}
                          {t.college && <span>• {t.college}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className={isRevealed && !displayPass ? 'text-slate-400 italic text-[11px]' : ''}>
                            {isRevealed ? (displayPass || '(Not stored yet)') : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(t.id)}
                            title={isRevealed ? 'Hide Password' : 'Show Password'}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setExpiryModalTeacher(t)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                            t.isExpired
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                              : (t.daysRemaining ?? 0) <= 3
                              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                          }`}
                          title="Click to manage account expiration days"
                        >
                          <Clock className="w-3 h-3" />
                          <span>
                            {t.isExpired
                              ? 'Expired'
                              : `${t.daysRemaining ?? 0}d left`}
                          </span>
                        </button>
                      </td>
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

                        {/* Message Teacher (2-Way Direct Messaging) */}
                        <button
                          type="button"
                          onClick={() => setMessagingModalTeacher(t)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 cursor-pointer transition-colors"
                          title="Message teacher via 2-way chat"
                        >
                          <span className="flex items-center gap-1 inline-flex">
                            <MessageSquare className="w-3.5 h-3.5" /> Message Teacher
                          </span>
                        </button>

                        {/* Download Teacher Info (CSV) */}
                        <button
                          type="button"
                          disabled={downloadingTeacherId === t.id}
                          onClick={() => handleDownloadTeacherInfo(t)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 cursor-pointer transition-colors"
                          title="Download teacher info & rosters to CSV"
                        >
                          <span className="flex items-center gap-1 inline-flex">
                            <Download className="w-3.5 h-3.5" /> {downloadingTeacherId === t.id ? 'Exporting...' : 'Download Info'}
                          </span>
                        </button>

                        {/* Manage Expiry Button */}
                        <button
                          type="button"
                          onClick={() => setExpiryModalTeacher(t)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 cursor-pointer transition-colors"
                          title="Add / Remove Expiry Days"
                        >
                          <span className="flex items-center gap-1 inline-flex">
                            <Clock className="w-3.5 h-3.5" /> Expiry
                          </span>
                        </button>

                        {/* Edit Teacher Profile */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditTeacher(t)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                          title="Edit Teacher Profile & Details"
                        >
                          <span className="flex items-center gap-1 inline-flex">
                            <Edit className="w-3.5 h-3.5" /> Edit
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Institutional Profile Fields Management Section */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
              <span>Institutional Profile Fields</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Define custom questionnaire fields presented to all teachers in their profile.
            </p>
          </div>
        </div>

        {/* Add Question Form */}
        <form onSubmit={handleAddQuestion} className="flex flex-col sm:flex-row items-end gap-3 bg-slate-50 dark:bg-[#0F172A] p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex-1 w-full">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              New Question / Field Title
            </label>
            <input
              type="text"
              required
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              placeholder="e.g. Master's Degree Specialization, Blood Group..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1A2232] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newQuestionRequired}
              onChange={(e) => setNewQuestionRequired(e.target.checked)}
              className="rounded text-[#2B547E]"
            />
            <span>Mandatory (Required)</span>
          </label>

          <button
            type="submit"
            disabled={questionSubmitting || !newQuestionText.trim()}
            className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer transition-colors shadow-xs shrink-0 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Question</span>
          </button>
        </form>

        {/* Existing Questions List */}
        <div className="space-y-2">
          {questionsLoading ? (
            <p className="text-xs text-slate-400 py-4 text-center">Loading institutional questions...</p>
          ) : questions.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center italic">No custom profile questions created yet.</p>
          ) : (
            questions.map((q, idx) => (
              <div
                key={q.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#141C2B] text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-400 w-5 text-center">{idx + 1}.</span>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{q.questionText}</span>
                    {q.required && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                        Required
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleReorderQuestions(idx, 'up')}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === questions.length - 1}
                    onClick={() => handleReorderQuestions(idx, 'down')}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer ml-1"
                    title="Delete Question"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Developer Contact Info Management Section */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Code className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
              <span>Developer Contact Info</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Set developer contact details. Whichever fields are filled will appear under "Contact Developer" in teachers' profiles. Unfilled fields remain hidden.
            </p>
          </div>
        </div>

        {devMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{devMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveDevContact} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Developer / Support Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  placeholder="e.g. John Doe / Support Team"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={devPhone}
                  onChange={(e) => setDevPhone(e.target.value)}
                  placeholder="e.g. +977 98XXXXXXXX"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Address / Location
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={devAddress}
                  onChange={(e) => setDevAddress(e.target.value)}
                  placeholder="e.g. Kathmandu, Nepal"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                />
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  placeholder="e.g. dev@example.com"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={devSaving || devLoading}
              className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{devSaving ? 'Saving...' : 'Save Developer Contact Info'}</span>
            </button>
          </div>
        </form>
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

            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNotificationModalTeacher(inspectTeacher)}
                  className="px-3.5 py-2 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Send Notification</span>
                </button>

                <button
                  type="button"
                  disabled={downloadingTeacherId === inspectTeacher.id}
                  onClick={() => handleDownloadTeacherInfo(inspectTeacher)}
                  className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingTeacherId === inspectTeacher.id ? 'Exporting...' : 'Download Info (CSV)'}</span>
                </button>
              </div>

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

      {/* Admin Edit Teacher Profile Modal */}
      {editTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl max-w-lg w-full border border-slate-200/80 dark:border-slate-700/80 p-6 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Edit Teacher Profile: @{editTeacher.username}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditTeacher(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacherProfile} className="space-y-4 pt-4 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. Ramesh Adhikari"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. 9841234567"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    College / Institution
                  </label>
                  <input
                    type="text"
                    value={editCollege}
                    onChange={(e) => setEditCollege(e.target.value)}
                    placeholder="e.g. Tribhuvan University"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    DOB (YYYY-MM-DD)
                  </label>
                  <input
                    type="text"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                    placeholder="2056-01-01"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                  />
                </div>
              </div>

              {/* Dynamic Institutional Fields */}
              {questions.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Institutional Questionnaire Fields
                  </div>
                  {questions.map((q) => (
                    <div key={q.id}>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {q.questionText} {q.required && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="text"
                        value={editCustomFields[q.id] || ''}
                        onChange={(e) =>
                          setEditCustomFields((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Optional Password Override */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Change Password (Leave blank to keep unchanged)
                </label>
                <input
                  type="text"
                  value={editPasswordInput}
                  onChange={(e) => setEditPasswordInput(e.target.value)}
                  placeholder="New password (optional)"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditTeacher(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {editLoading ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
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

      {/* Teacher Expiry Management Modal */}
      <TeacherExpiryModal
        isOpen={expiryModalTeacher !== null}
        teacher={expiryModalTeacher}
        onClose={() => setExpiryModalTeacher(null)}
        onSuccess={async () => {
          await loadTeachers();
          setSuccessMsg('Account expiry days updated successfully.');
        }}
      />

      {/* New User Default Settings Modal */}
      <NewUserDefaultsModal
        isOpen={newUserDefaultsOpen}
        onClose={() => setNewUserDefaultsOpen(false)}
        onSuccess={async () => {
          await loadTeachers();
        }}
      />

      {/* Admin 2-Way Messaging Modal */}
      {user && (
        <MessagingModal
          isOpen={messagingModalTeacher !== null}
          currentUser={user}
          initialTargetTeacher={messagingModalTeacher}
          onClose={() => setMessagingModalTeacher(null)}
        />
      )}

      {/* Admin Notification Modal (Legacy) */}
      <AdminNotificationModal
        isOpen={notificationModalTeacher !== null}
        teacher={notificationModalTeacher}
        onClose={() => setNotificationModalTeacher(null)}
      />
    </div>
  );
};
