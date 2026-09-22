import React from 'react';
import { GraduationCap, Plus, ArrowRight, BookOpen } from 'lucide-react';
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
    <div className="space-y-8 max-w-4xl mx-auto py-6 animate-fade-in relative">
      {/* Welcome Hero Card with subtle ambient lighting */}
      <div className="relative overflow-hidden bg-white/80 dark:bg-[#131A29]/90 backdrop-blur-xl rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-8 sm:p-12 text-center shadow-lg transition-all">
        {/* Glow orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none animate-glow" />

        {/* Floating Icon Shield */}
        <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center animate-float">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/70 dark:from-slate-800 dark:to-slate-800/90 border border-blue-200/60 dark:border-slate-700/80 flex items-center justify-center text-[#2B547E] dark:text-blue-400 shadow-md">
            <GraduationCap className="w-10 h-10" />
          </div>
        </div>

        {/* Heading */}
        <h2 className="relative text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-3 tracking-tight">
          Welcome to student management section
        </h2>

        {/* Subtitle */}
        <p className="relative text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-7 leading-relaxed">
          Please select a class in left bar or create a new class
        </p>

        {/* Primary CTA */}
        <div className="relative flex justify-center">
          <button
            type="button"
            disabled={isExpired}
            onClick={onOpenCreateClass}
            className="group inline-flex items-center gap-2.5 px-6 py-3.5 min-h-[46px] bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-semibold cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
            title={isExpired ? 'Account expired (read-only)' : 'Create New Class'}
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
            <span>Create New Class</span>
          </button>
        </div>
      </div>

      {/* Available Classes Grid (Minimalist, No Clutter) */}
      {classes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Academic Classes ({classes.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls, idx) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => onSelectClass(cls.id)}
                className={`group p-5 bg-white/90 dark:bg-[#141C2B]/90 backdrop-blur-md rounded-2xl border-2 border-[#2B547E]/40 dark:border-blue-500/40 hover:border-[#2B547E] dark:hover:border-blue-400 text-left hover:shadow-lg transition-all duration-300 cursor-pointer flex items-center justify-between hover:-translate-y-0.5 active:translate-y-0 delay-${(idx % 3) + 1}`}
              >
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#2B547E] dark:group-hover:text-blue-400 transition-colors">
                    {cls.name}
                  </h4>
                </div>

                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/80 group-hover:bg-[#2B547E] group-hover:text-white dark:group-hover:bg-blue-500 flex items-center justify-center text-slate-400 dark:text-slate-300 transition-all duration-300 shrink-0 group-hover:translate-x-0.5">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
