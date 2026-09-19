import React from 'react';
import { Database, AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  error: string | null;
  onRetry: () => void;
}

export const DatabaseAlert: React.FC<Props> = ({ error, onRetry }) => {
  return (
    <div className="min-h-screen bg-[#F4F6FA] dark:bg-[#0B0F19] flex items-center justify-center p-4 transition-colors">
      <div className="max-w-md w-full bg-white dark:bg-[#1A2232] rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/80 p-6 sm:p-8">
        <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/60 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400 mb-5">
          <Database className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          MongoDB Atlas Connection Required
        </h1>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
          The Student Tracker is configured to store all persistent records directly in MongoDB Atlas. Per strict production integrity requirements, there is no in-memory or mock storage fallback.
        </p>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 text-xs text-rose-800 dark:text-rose-300 font-mono mb-4 break-words">
            <div className="flex items-center gap-1 font-semibold text-rose-900 dark:text-rose-200 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Error details:
            </div>
            {error}
          </div>
        )}

        <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-4 text-xs text-slate-700 dark:text-slate-300 space-y-2 mb-6">
          <p className="font-semibold text-slate-900 dark:text-slate-100">How to configure:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-400">
            <li>Open your MongoDB Atlas dashboard (or create a free cluster at mongodb.com).</li>
            <li>Click <strong>Connect</strong> &rarr; <strong>Drivers</strong> &rarr; Copy the connection string.</li>
            <li>
              It must start with <code className="bg-white dark:bg-slate-900 px-1 py-0.5 rounded text-[#2B547E] dark:text-blue-400 font-mono font-semibold">mongodb+srv://</code> or <code className="bg-white dark:bg-slate-900 px-1 py-0.5 rounded text-[#2B547E] dark:text-blue-400 font-mono font-semibold">mongodb://</code>
            </li>
            <li className="break-all">
              Example format:
              <div className="mt-1 p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 font-mono text-[11px] text-slate-800 dark:text-slate-200 select-all">
                mongodb+srv://&lt;username&gt;:&lt;password&gt;@cluster0.abcde.mongodb.net/student_tracker?retryWrites=true&w=majority
              </div>
            </li>
            <li>
              Save this in your AI Studio project <strong>Settings &rarr; Secrets</strong> as <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded text-[#2B547E] dark:text-blue-400 font-mono font-semibold">MONGODB_URI</code>.
            </li>
          </ol>
        </div>

        <button
          type="button"
          onClick={onRetry}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2B547E] hover:bg-[#355C7D] dark:bg-[#2B547E] dark:hover:bg-[#355C7D] text-white rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    </div>
  );
};
