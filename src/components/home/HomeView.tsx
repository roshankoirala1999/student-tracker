import React from 'react';
import { GraduationCap, Plus, ChevronRight, BookOpen } from 'lucide-react';
import { ClassItem } from '../../types/index.ts';

interface Props {
  classes: ClassItem[];
  onSelectClass: (classId: string) => void;
  onOpenCreateClass: () => void;
  isExpired?: boolean;
}

export const HomeView: React.FC<Props> = ({
  classes,
  onSelectClass,
  onOpenCreateClass,
  isExpired = false,
}) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto py-4">
      {/* Welcome Card */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border-2 border-[#2B547E]/30 dark:border-blue-500/30 p-8 sm:p-10 text-center shadow-xs transition-colors">
        <div className="w-16 h-16 rounded-2xl bg-[#2B547E]/10 dark:bg-blue-500/10 border-2 border-[#2B547E] dark:border-blue-500 flex items-center justify-center text-[#2B547E] dark:text-blue-400 mx-auto mb-4">
          <GraduationCap className="w-8 h-8" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Welcome to student management section
        </h2>

        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mb-6 leading-relaxed">
          Please select a class in left bar or create a new class
        </p>

        <div className="flex justify-center">
          <button
            type="button"
            disabled={isExpired}
            onClick={onOpenCreateClass}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold cursor-pointer transition-colors shadow-xs"
            title={isExpired ? 'Account expired (read-only)' : 'Create New Class'}
          >
            <Plus className="w-4 h-4" />
            <span>Create New Class</span>
          </button>
        </div>
      </div>

      {/* Available Classes Grid (Quick Selection) */}
      {classes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Your Academic Classes ({classes.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {classes.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => onSelectClass(cls.id)}
                className="group p-5 bg-white dark:bg-[#1A2232] rounded-2xl border-2 border-[#2B547E] dark:border-blue-500 text-left hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#2B547E] dark:group-hover:text-blue-400 transition-colors">
                    {cls.name}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Click to manage sections &amp; students
                  </p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-[#2B547E] group-hover:text-white dark:group-hover:bg-blue-500 flex items-center justify-center text-slate-400 dark:text-slate-300 transition-colors shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
