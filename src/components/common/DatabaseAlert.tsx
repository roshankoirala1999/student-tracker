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
          Your workspace is temporarily unavailable
        </h1>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
          We could not connect to your workspace. Check your connection and try again. If this continues, ask your administrator to check the server and database configuration.
        </p>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 text-xs text-rose-800 dark:text-rose-300 font-mono mb-4 break-words">
            <div className="flex items-center gap-1 font-semibold text-rose-900 dark:text-rose-200 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Error details:
            </div>
            {error}
          </div>
        )}

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
