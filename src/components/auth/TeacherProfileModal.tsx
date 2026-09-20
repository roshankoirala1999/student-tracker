import React, { useState, useEffect, useRef } from 'react';
import { X, User, Lock, Building, Calendar, HelpCircle, AlertCircle, CheckCircle, Trash2, KeyRound, Clock, ShieldAlert, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../api/client.ts';
import { ProfileQuestion, UserProfile } from '../../types/index.ts';
import { PasswordConfirmModal } from '../common/PasswordConfirmModal.tsx';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const TeacherProfileModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, login, logout } = useAuth();
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Profile fields state
  const [fullName, setFullName] = useState('');
  const [college, setCollege] = useState('');
  const [dob, setDob] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<ProfileQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Status & UI
  const [saveLoading, setSaveLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.fullName || '');
      setCollege(user.college || '');
      setDob(user.dob || '');
      setCustomFields(user.customFields || {});
      setProfileMsg(null);
      setPasswordMsg(null);
      setCurrentPassword('');
      setNewPassword('');

      // Fetch institutional questions
      setLoadingQuestions(true);
      apiRequest<ProfileQuestion[]>('/api/profile-questions')
        .then((res) => {
          if (res.success && res.data) {
            setQuestions(res.data);
          }
        })
        .finally(() => setLoadingQuestions(false));
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const isExpired = !!user.isExpired;
  const isReadOnly = !!user.isReadOnly;
  const daysRemaining = user.daysRemaining !== undefined ? user.daysRemaining : 0;
  const isNameLocked = !!user.fullNameLocked;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    // Validate compulsory fields
    if (!isNameLocked && !fullName.trim()) {
      setProfileMsg({ type: 'error', text: 'Full Name is compulsory. Please enter your name.' });
      return;
    }

    if (!college.trim()) {
      setProfileMsg({ type: 'error', text: 'College / Institution name is compulsory. Please enter your institution.' });
      return;
    }

    // Validate DOB if entered
    const cleanDob = dob.trim();
    if (cleanDob && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDob)) {
      setProfileMsg({ type: 'error', text: 'Date of Birth must be strictly in YYYY-MM-DD format (e.g. 2056-01-01).' });
      return;
    }

    setSaveLoading(true);
    const bodyPayload: Record<string, unknown> = {
      college: college.trim(),
      dob: cleanDob,
      customFields,
    };

    if (!isNameLocked) {
      bodyPayload.fullName = fullName.trim();
    }

    const res = await apiRequest<UserProfile>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(bodyPayload),
    });
    setSaveLoading(false);

    if (res.success && res.data) {
      login(res.data);
      if (res.data.isReadOnly) {
        if (res.data.readOnlyReason === 'expired') {
          setProfileMsg({ type: 'error', text: 'Profile saved, but you remain in Read-Only Mode due to account expiry. Contact administrator.' });
        } else {
          setProfileMsg({ type: 'error', text: `Profile saved, but still in Read-Only Mode. Missing compulsory fields: ${res.data.missingFields?.join(', ')}` });
        }
      } else {
        setProfileMsg({ type: 'success', text: 'Teacher profile details saved successfully! Full Mode is active.' });
      }
    } else {
      setProfileMsg({ type: 'error', text: res.message || 'Failed to update profile.' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!currentPassword) {
      setPasswordMsg({ type: 'error', text: 'Please enter your current password.' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }

    const lower = newPassword.toLowerCase();
    if (lower.includes('password') || lower.includes('admin')) {
      setPasswordMsg({ type: 'error', text: "Password cannot contain reserved words like 'password' or 'admin'." });
      return;
    }

    setPasswordLoading(true);
    const res = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setPasswordLoading(false);

    if (res.success) {
      setPasswordMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
    } else {
      setPasswordMsg({ type: 'error', text: res.message || 'Failed to change password.' });
    }
  };

  const handleConfirmDeleteAccount = async (pass: string) => {
    const res = await apiRequest('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password: pass }),
    });

    if (!res.success) {
      throw new Error(res.message || 'Failed to delete account.');
    }

    logout();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#1A2232] border border-slate-200 dark:border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between bg-slate-50 dark:bg-[#141C2B] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2B547E] text-white flex items-center justify-center shadow-xs">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Teacher Profile</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Account status, profile details, and credentials</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to Dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Account Expiry & Access Mode Section (Photo 4) */}
          <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                <span>Account &amp; Access Status</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                  isReadOnly
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                }`}
              >
                {isReadOnly ? 'Read-Only Mode' : 'Full Mode'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-[#1A2232] p-3 rounded-lg border border-slate-200 dark:border-slate-700/80">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">Remaining Access</span>
                <span className={`text-sm font-bold ${
                  isExpired
                    ? 'text-rose-600 dark:text-rose-400'
                    : daysRemaining <= 3
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {isExpired ? '0 Days (Expired)' : `${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Remaining`}
                </span>
              </div>

              <div className="bg-white dark:bg-[#1A2232] p-3 rounded-lg border border-slate-200 dark:border-slate-700/80">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">Expiry Date</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {user.expiresAt ? new Date(user.expiresAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>

              <div className="bg-white dark:bg-[#1A2232] p-3 rounded-lg border border-slate-200 dark:border-slate-700/80">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">Profile Completeness</span>
                <span className={`text-xs font-bold ${
                  user.missingFields && user.missingFields.length > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {user.missingFields && user.missingFields.length > 0
                    ? `${user.missingFields.length} Compulsory Field(s) Incomplete`
                    : 'Compulsory Fields Complete'}
                </span>
              </div>
            </div>

            {/* In-Profile Warning Banners (Photo 4) */}
            {isExpired ? (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Account Expired — Read-Only Mode Active</div>
                  <div className="text-[11px] mt-0.5 text-rose-700 dark:text-rose-300/90">
                    Your teacher account has expired. You are allowed to view existing classes, sections, students, and marks, but creating or modifying records is disabled. Kindly contact your master administrator to renew access.
                  </div>
                </div>
              </div>
            ) : daysRemaining <= 3 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">{daysRemaining} Day{daysRemaining === 1 ? '' : 's'} Remaining</div>
                  <div className="text-[11px] mt-0.5 text-amber-700 dark:text-amber-300/90">
                    Your account access will expire in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}. Kindly contact your administrator to renew or extend access before it transitions into read-only mode.
                  </div>
                </div>
              </div>
            ) : null}

            {user.missingFields && user.missingFields.length > 0 && !isExpired && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Compulsory Profile Incomplete — Read-Only Mode Active</div>
                  <div className="text-[11px] mt-0.5 text-amber-700 dark:text-amber-300/90">
                    You are in Read-Only Mode because compulsory profile fields are incomplete: <strong>{user.missingFields.join(', ')}</strong>. Kindly fill and save all compulsory fields below to unlock Full Mode.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Institutional Identity & Contact Info (Photo 3) */}
          <div className="bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Institutional Identity</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Managed by administrator
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Full Name: Editable 1 time only */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-1">
                  <span>Full Name *</span>
                  {isNameLocked ? (
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Lock className="w-3 h-3" /> Managed by admin</span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-normal">Edit 1x only</span>
                  )}
                </label>
                {isNameLocked ? (
                  <div className="px-3 py-2 text-xs font-medium rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span>{user.fullName || '—'}</span>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter Full Name (Compulsory)"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#1A2232] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                    />
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 block">
                      Compulsory • Can only be set once. Locks after saving.
                    </span>
                  </div>
                )}
              </div>

              {/* Phone Number: Read-Only for Teacher */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-1">
                  <span>Phone Number</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Lock className="w-3 h-3" /> Locked</span>
                </label>
                <div className="px-3 py-2 text-xs font-medium rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className={user.phoneNumber ? 'font-mono' : 'text-slate-400 italic'}>
                    {user.phoneNumber || 'Not configured'}
                  </span>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Managed by administrator.
                </span>
              </div>

              {/* Username: Read-Only */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">Username</label>
                <div className="px-3 py-2 text-xs font-mono font-medium rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  @{user.username}
                </div>
              </div>
            </div>
          </div>

          {/* Editable Profile Information Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-[#2B547E] dark:text-blue-400" />
                <span>Teacher Information</span>
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                <span className="text-rose-500 font-bold">*</span> = Compulsory for Full Mode
              </span>
            </div>

            {profileMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                profileMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}>
                {profileMsg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  College / Institution <span className="text-rose-500 font-bold">*</span> (Compulsory)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    placeholder="e.g. Tribhuvan University, St. Xavier's"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                  />
                  <Building className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Date of Birth (Optional)
                </label>
                <div className="relative">
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        (dateInputRef.current as any)?.showPicker?.();
                      } catch {
                        dateInputRef.current?.focus();
                      }
                    }}
                    className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                    title="Open calendar picker"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Dynamic Institutional Profile Questions */}
            {questions.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-slate-800">
                  <HelpCircle className="w-3.5 h-3.5 text-[#2B547E] dark:text-blue-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Institutional Questionnaire</span>
                </div>

                <div className="space-y-3">
                  {questions.map((q) => (
                    <div key={q.id}>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {q.questionText}{' '}
                        {q.required ? (
                          <span className="text-rose-500 font-bold">* (Compulsory)</span>
                        ) : (
                          <span className="text-slate-400 font-normal">(Optional)</span>
                        )}
                      </label>
                      <input
                        type="text"
                        required={q.required}
                        value={customFields[q.id] || ''}
                        onChange={(e) => setCustomFields({ ...customFields, [q.id]: e.target.value })}
                        placeholder={q.required ? 'Compulsory answer' : 'Optional answer'}
                        className={`w-full px-3 py-2 text-xs rounded-xl border bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] ${
                          q.required && (!customFields[q.id] || !customFields[q.id].trim())
                            ? 'border-amber-300 dark:border-amber-700'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saveLoading}
                className="px-5 py-2.5 bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
              >
                {saveLoading ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>

          {/* Change Password Section */}
          <div className="border-t border-slate-200 dark:border-slate-700/80 pt-5">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#2B547E] dark:text-blue-400" />
                <span>Change Password</span>
              </h3>

              {passwordMsg && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  passwordMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}>
                  {passwordMsg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{passwordMsg.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    New Password (min 6 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {passwordLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Danger Zone: Account Deletion */}
          <div className="border-t border-rose-200 dark:border-rose-900/40 pt-5">
            <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Teacher Account</span>
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 max-w-md">
                  Permanently deletes your account and cascades removal across all classes, sections, students, marks, and attendance records.
                </p>
                {user.isDeletionLocked && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1 font-medium">
                    <Lock className="w-3 h-3" /> Account deletion is administratively locked.
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={user.isDeletionLocked}
                onClick={() => setDeleteModalOpen(true)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer transition-colors shadow-xs"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>

        {/* Modal Sticky Footer with Back / Close Button */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#141C2B] flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isReadOnly ? 'Read-Only Mode Active' : 'Full Mode Active'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>

      <PasswordConfirmModal
        isOpen={deleteModalOpen}
        title="Permanently Delete Teacher Account"
        description="Are you sure you want to delete your teacher account? All classes, sections, student rosters, marks, and attendance will be permanently removed. This action cannot be undone."
        confirmButtonText="Permanently Delete Account"
        isDestructive={true}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDeleteAccount}
      />
    </div>
  );
};
