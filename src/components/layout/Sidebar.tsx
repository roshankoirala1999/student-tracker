import React from 'react';
import { BookOpen, Users, ChevronRight, X, Plus } from 'lucide-react';
import { ClassItem, SectionItem } from '../../types/index.ts';

interface Props {
  classes: ClassItem[];
  sectionsByClass: Record<string, SectionItem[]>;
  selectedClassId: string | null;
  selectedSectionId: string | null;
  onSelectClass: (classId: string) => void;
  onSelectSection: (classId: string, sectionId: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  onOpenCreateClass: () => void;
}

export const Sidebar: React.FC<Props> = ({
  classes,
  sectionsByClass,
  selectedClassId,
  selectedSectionId,
  onSelectClass,
  onSelectSection,
  mobileOpen,
  setMobileOpen,
  onOpenCreateClass,
}) => {
  return (
    <>
      {/* Mobile Backdrop Overlay (< 1024px) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container: Pinned on lg screens (≥1024px), Slide-over drawer on mobile */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-[#1A2232] dark:bg-[#111827] text-slate-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 border-r border-slate-800 dark:border-slate-800 shadow-xl lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header / Brand in Sidebar */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between min-h-[64px]">
          <div className="flex items-center gap-2 text-white font-bold text-xs tracking-wider uppercase">
            <BookOpen className="w-4 h-4 text-[#355C7D] dark:text-blue-400" />
            <span>Academic Classes</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation drawer"
            className="lg:hidden text-slate-400 hover:text-white p-2 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Add Class Action */}
        <div className="p-3 border-b border-slate-800/60">
          <button
            type="button"
            onClick={() => {
              onOpenCreateClass();
              setMobileOpen(false);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Class</span>
          </button>
        </div>

        {/* Classes & Sections Scroll Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
          {classes.length === 0 ? (
            <div className="text-center py-8 px-2 text-xs text-slate-400">
              No classes created yet. Click &ldquo;New Class&rdquo; to start.
            </div>
          ) : (
            classes.map((cls) => {
              const isClassSelected = selectedClassId === cls.id;
              const isClassOnlySelected = isClassSelected && !selectedSectionId;
              const sections = sectionsByClass[cls.id] || [];

              return (
                <div key={cls.id} className="space-y-0.5">
                  {/* Class Header / Selection */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectClass(cls.id);
                      setMobileOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 min-h-[42px] rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                      isClassOnlySelected
                        ? 'bg-[#2B547E] text-white shadow-xs font-bold'
                        : isClassSelected
                        ? 'bg-slate-800/90 text-white'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{cls.name}</span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform shrink-0 ${
                        isClassSelected ? 'rotate-90 text-[#355C7D] dark:text-blue-400' : 'text-slate-500'
                      }`}
                    />
                  </button>

                  {/* Section sub-items when class is expanded */}
                  {isClassSelected && (
                    <div className="pl-3 pr-1 py-1 space-y-1">
                      {sections.length === 0 ? (
                        <div className="text-[11px] text-slate-400 py-1.5 pl-3 italic">
                          No sections yet
                        </div>
                      ) : (
                        sections.map((sec) => {
                          const isSecSelected = selectedSectionId === sec.id;
                          return (
                            <button
                              key={sec.id}
                              type="button"
                              onClick={() => {
                                onSelectSection(cls.id, sec.id);
                                setMobileOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 min-h-[38px] rounded-lg text-xs transition-colors cursor-pointer ${
                                isSecSelected
                                  ? 'bg-[#355C7D] text-white font-semibold shadow-xs'
                                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                              }`}
                            >
                              <span className="truncate">{sec.name}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  isSecSelected
                                    ? 'bg-white/20 text-white'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {sec.studentCount ?? 0}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
