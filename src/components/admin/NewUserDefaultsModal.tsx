import React, { useState, useEffect } from 'react';
import { X, Settings, ShieldCheck, CheckCircle, Clock, Trash2, ArrowLeft } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { NewUserDefaults } from '../../types/index.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const NewUserDefaultsModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [expiryMode, setExpiryMode] = useState<boolean>(true);
  const [allowAccountDeletion, setAllowAccountDeletion] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setSuccess(null);
      apiRequest<NewUserDefaults>('/api/admin/settings/new-user-defaults')
        .then((res) => {
          if (res.success && res.data) {
            setExpiryMode(res.data.expiryMode !== false);
            setAllowAccountDeletion(res.data.allowAccountDeletion !== false);
          }
        })
        .catch((err) => {
          setError(err.message || 'Failed to load settings');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const res = await apiRequest('/api/admin/settings/new-user-defaults', {
      method: 'PUT',
      body: JSON.stringify({
        expiryMode,
        allowAccountDeletion,
      }),
    });

    setSaving(false);
    if (res.success) {
      setSuccess('Default settings for new users saved successfully.');
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setError(res.message || 'Failed to save settings.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl max-w-md w-full border border-slate-200/80 dark:border-slate-700 overflow-hidden transition-colors my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            <Settings className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>New User Default Settings</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back / Close"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-5">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Configure default account parameters assigned automatically when any new teacher registers their account.
          </p>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Loading current default settings...
            </div>
          ) : (
            <div className="space-y-4">
              {/* Option 1: Expiry Mode */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <Clock className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                    <span>Expiry Mode</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {expiryMode
                      ? 'ON: New users start with 7 days trial expiry'
                      : 'OFF: New users have permanent lifetime access (no expiry)'}
                  </p>
                </div>

                <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-200/60 dark:bg-slate-900 shrink-0">
                  <button
                    type="button"
                    onClick={() => setExpiryMode(true)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      expiryMode
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    ON
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiryMode(false)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      !expiryMode
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    OFF
                  </button>
                </div>
              </div>

              {/* Option 2: Able to delete account */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>Able to Delete Account</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {allowAccountDeletion
                      ? 'YES: New users can delete their own account in profile'
                      : 'NO: Delete option is completely hidden from new users'}
                  </p>
                </div>

                <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-200/60 dark:bg-slate-900 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAllowAccountDeletion(true)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      allowAccountDeletion
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    YES
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllowAccountDeletion(false)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      !allowAccountDeletion
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    NO
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || saving}
              className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            >
              {saving ? 'Saving Settings...' : 'Save Default Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
