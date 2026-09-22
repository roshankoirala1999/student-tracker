import React, { useState } from 'react';
import { GraduationCap, ShieldCheck, User, Lock, KeyRound, ArrowLeft, Sun, Moon } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { UserProfile } from '../../types/index.ts';

export const AuthPage: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<'login' | 'register' | 'admin-login' | 'admin-setup'>('login');

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapKey, setBootstrapKey] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const resetForm = () => {
    setFullName('');
    setPhoneNumber('');
    setUsername('');
    setPassword('');
    setBootstrapKey('');
    setError(null);
    setSuccessMsg(null);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 4000);
  };

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Secret Trigger / Easter Egg:
    // If username is 'admin' AND password is 'password' (case-insensitive check on username)
    if (username.trim().toLowerCase() === 'admin' && password === 'password') {
      setPassword('');
      setTab('admin-login');
      showToast('Administrator access portal opened.');
      return;
    }

    setLoading(true);

    const res = await apiRequest<UserProfile>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), password, portal: 'teacher' }),
    });

    setLoading(false);
    if (res.success && res.data) {
      login(res.data);
    } else {
      setError(res.message || 'Login failed.');
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const res = await apiRequest<UserProfile>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), password, portal: 'administrator' }),
    });

    setLoading(false);
    if (res.success && res.data) {
      login(res.data);
    } else {
      setError(res.message || 'Administrator login failed.');
    }
  };

  const handleTeacherRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanFullName = fullName.trim();
    const cleanPhone = phoneNumber.trim().replace(/[\s-]/g, '');
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanFullName) {
      setError('Please provide your Full Name.');
      return;
    }

    if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
      setError('Phone number must be a valid 10-digit number (numbers only, e.g. 9801234567).');
      return;
    }

    // 1. Username Constraint client-side check
    if (cleanUsername.includes('admin')) {
      setError("Username cannot contain the reserved term 'admin'.");
      return;
    }

    // 2. Password Constraint client-side check
    const lowerPassword = password.toLowerCase();
    if (lowerPassword.includes('password') || lowerPassword.includes('admin')) {
      setError("Password cannot contain reserved words such as 'password' or 'admin'.");
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    const res = await apiRequest<UserProfile>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: cleanFullName,
        phoneNumber: cleanPhone,
        username: cleanUsername,
        password,
      }),
    });

    setLoading(false);
    if (res.success && res.data) {
      login(res.data);
    } else {
      setError(res.message || 'Registration failed.');
    }
  };

  const handleAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await apiRequest('/api/auth/register-admin', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), password, bootstrapKey }),
    });

    setLoading(false);
    if (res.success) {
      setSuccessMsg('Administrator account initialized successfully. You may now log in.');
      setTab('admin-login');
      setPassword('');
      setBootstrapKey('');
    } else {
      setError(res.message || 'Administrator creation failed.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] dark:bg-[#0B0F19] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative transition-colors duration-200">
      {/* Theme toggle button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1A2232] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-xs cursor-pointer transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>
      </div>

      {/* Secret Trigger Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#1A2232] text-white dark:bg-[#1E293B] dark:text-emerald-400 border border-slate-700 px-4 py-2.5 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-bounce">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 bg-[#2B547E] dark:bg-[#2B547E] rounded-2xl flex items-center justify-center text-white shadow-md">
            <GraduationCap className="w-8 h-8" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Student Tracker
        </h2>
        <p className="mt-1 text-center text-xs text-[#355C7D] dark:text-blue-400 font-medium">
          Professional Class, Examination, Marks &amp; Attendance Platform
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white dark:bg-[#1A2232] py-8 px-6 shadow-xs rounded-2xl border border-slate-200/80 dark:border-slate-700/80 transition-colors">
          {/* Top Tabs: ONLY Teacher Login and Teacher Sign Up (Admin tab is completely hidden from public view) */}
          {(tab === 'login' || tab === 'register') && (
            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  resetForm();
                }}
                className={`pb-3 text-xs font-semibold uppercase tracking-wider flex-1 text-center border-b-2 transition-colors cursor-pointer ${
                  tab === 'login'
                    ? 'border-[#2B547E] text-[#2B547E] dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Teacher Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  resetForm();
                }}
                className={`pb-3 text-xs font-semibold uppercase tracking-wider flex-1 text-center border-b-2 transition-colors cursor-pointer ${
                  tab === 'register'
                    ? 'border-[#2B547E] text-[#2B547E] dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Teacher Sign Up
              </button>
            </div>
          )}

          {/* Admin Mode Header with Back Button */}
          {(tab === 'admin-login' || tab === 'admin-setup') && (
            <div className="mb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  resetForm();
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#2B547E] dark:text-blue-400 hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Teacher Login</span>
              </button>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                Admin Portal
              </span>
            </div>
          )}

          {error && (
            <div className="mb-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl p-3">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl p-3">
              {successMsg}
            </div>
          )}

          {/* Teacher Login Form */}
          {tab === 'login' && (
            <form onSubmit={handleTeacherLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Login ID / Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter teacher username"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#2B547E] hover:bg-[#355C7D] dark:bg-[#2B547E] dark:hover:bg-[#355C7D] text-white rounded-xl text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Authenticating...' : 'Sign In as Teacher'}
              </button>
            </form>
          )}

          {/* Teacher Registration Form */}
          {tab === 'register' && (
            <form onSubmit={handleTeacherRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Dr. John Doe"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                  Please use your real name. It cannot be edited later on.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    inputMode="numeric"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g. 9801234567"
                    className={`w-full px-3 py-2.5 text-sm rounded-xl border ${
                      phoneNumber && !/^\d{10}$/.test(phoneNumber.trim())
                        ? 'border-rose-400 focus:ring-rose-500'
                        : 'border-slate-300 dark:border-slate-700 focus:ring-[#2B547E] dark:focus:ring-blue-500'
                    } bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 pr-10`}
                  />
                </div>
                {phoneNumber && !/^\d{10}$/.test(phoneNumber.trim()) ? (
                  <p className="text-[11px] text-rose-500 font-semibold mt-1">
                    Phone number must be a 10-digit number (numbers only, e.g. 9801234567).
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Must be exactly 10 digits (numbers only).
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. teacher_jane"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Password (min 6 characters)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a secure password"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#2B547E] hover:bg-[#355C7D] dark:bg-[#2B547E] dark:hover:bg-[#355C7D] text-white rounded-xl text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Creating Account...' : 'Register Teacher Account'}
              </button>
            </form>
          )}

          {/* Administrator Login */}
          {tab === 'admin-login' && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Administrator access provides supervisory inspection across all teacher accounts.
                </span>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Administrator Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Admin username"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                    />
                    <ShieldCheck className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Administrator Password
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter admin password"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#1A2232] hover:bg-[#1F2937] dark:bg-[#2B547E] dark:hover:bg-[#355C7D] text-white rounded-xl text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Authenticating...' : 'Sign In as Administrator'}
                </button>
              </form>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setTab('admin-setup');
                    resetForm();
                  }}
                  className="text-xs text-[#2B547E] dark:text-blue-400 hover:underline font-medium cursor-pointer"
                >
                  Initialize Administrator Account (Requires Bootstrap Key)
                </button>
              </div>
            </div>
          )}

          {/* Administrator Setup (Requires Bootstrap Key) */}
          {tab === 'admin-setup' && (
            <form onSubmit={handleAdminSetup} className="space-y-4">
              <div className="bg-[#F4F6FA] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-400">
                Administrator accounts cannot be created via public registration. Enter your server&apos;s <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-800 dark:text-slate-200 font-mono">ADMIN_BOOTSTRAP_KEY</code>.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Admin Bootstrap Key
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={bootstrapKey}
                    onChange={(e) => setBootstrapKey(e.target.value)}
                    placeholder="Enter ADMIN_BOOTSTRAP_KEY"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500 pr-10"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Admin Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Admin Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create admin password"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E] dark:focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTab('admin-login')}
                  className="flex-1 py-2.5 px-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-3 bg-[#1A2232] hover:bg-[#1F2937] dark:bg-[#2B547E] dark:hover:bg-[#355C7D] text-white rounded-xl text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Initializing...' : 'Initialize Admin'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
