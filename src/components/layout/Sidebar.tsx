import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  X,
  MoreVertical,
  Plus,
  Edit2,
  ArrowUp,
  ArrowDown,
  FolderPlus,
} from 'lucide-react';
import { ClassItem, SectionItem } from '../../types/index.ts';
import { apiRequest } from '../../api/client.ts';

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
  onRefreshClasses?: () => Promise<void>;
  isExpired?: boolean;
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
  onRefreshClasses,
  isExpired = false,
}) => {
  // Accordion expansion state per class ID
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  // 3-dots menu state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [activeClassMenuId, setActiveClassMenuId] = useState<string | null>(null);

  // Rename modal state
  const [renamingClass, setRenamingClass] = useState<ClassItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const headerMenuRef = useRef<HTMLDivElement>(null);
  const classMenuRef = useRef<HTMLDivElement>(null);

  // Automatically expand selected class when it changes
  useEffect(() => {
    if (selectedClassId) {
      setExpandedClasses((prev) => ({
        ...prev,
        [selectedClassId]: true,
      }));
    }
  }, [selectedClassId]);

  // Click-outside listener for dropdown menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
      if (classMenuRef.current && !classMenuRef.current.contains(e.target as Node)) {
        setActiveClassMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleClassAccordion = (classId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedClasses((prev) => ({
      ...prev,
      [classId]: !prev[classId],
    }));
  };

  const handleSelectClassHeader = (classId: string) => {
    onSelectClass(classId);
    setExpandedClasses((prev) => ({
      ...prev,
      [classId]: true,
    }));
    setMobileOpen(false);
  };

  const handleMoveClass = async (index: number, direction: 'up' | 'down') => {
    setActiveClassMenuId(null);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= classes.length) return;

    const copy = [...classes];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);

    const classIds = copy.map((c) => c.id);
    const res = await apiRequest('/api/classes/reorder', {
      method: 'PUT',
      body: JSON.stringify({ classIds }),
    });

    if (res.success && onRefreshClasses) {
      await onRefreshClasses();
    }
  };

  const handleOpenRename = (cls: ClassItem) => {
    setActiveClassMenuId(null);
    setRenamingClass(cls);
    setRenameValue(cls.name);
    setRenameError(null);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingClass || !renameValue.trim()) return;

    setRenameLoading(true);
    setRenameError(null);
    const res = await apiRequest(`/api/classes/${renamingClass.id}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setRenameLoading(false);

    if (res.success) {
      setRenamingClass(null);
      if (onRefreshClasses) {
        await onRefreshClasses();
      }
    } else {
      setRenameError(res.message || 'Failed to rename class.');
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay (< 1024px) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-[#1A2232] dark:bg-[#111827] text-slate-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 border-r border-slate-800 dark:border-slate-800 shadow-xl lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header with Title and 3-dots Menu */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between min-h-[64px] relative">
          <div className="flex items-center gap-2 text-white font-bold text-xs tracking-wider uppercase">
            <BookOpen className="w-4 h-4 text-[#355C7D] dark:text-blue-400" />
            <span>Academic Classes</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Top 3-dots options menu */}
            <div className="relative" ref={headerMenuRef}>
              <button
                type="button"
                onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/80 cursor-pointer transition-colors"
                title="Class Options"
                aria-label="Class Options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {headerMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-[#141C2B] border border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                  <button
                    type="button"
                    disabled={isExpired}
                    onClick={() => {
                      if (isExpired) return;
                      setHeaderMenuOpen(false);
                      onOpenCreateClass();
                      setMobileOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title={isExpired ? 'Account expired (read-only)' : undefined}
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                    <span>Create New Class</span>
                  </button>
                  {classes.length > 0 && onRefreshClasses && (
                    <button
                      type="button"
                      onClick={async () => {
                        setHeaderMenuOpen(false);
                        await onRefreshClasses();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer transition-colors"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-slate-400" />
                      <span>Refresh Classes List</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation drawer"
              className="lg:hidden text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/80 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Classes & Sections Collapsible Accordion Scroll Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
          {classes.length === 0 ? (
            <div className="text-center py-10 px-4 text-xs text-slate-400">
              <p>No classes created yet.</p>
              <button
                type="button"
                disabled={isExpired}
                onClick={() => {
                  if (isExpired) return;
                  onOpenCreateClass();
                  setMobileOpen(false);
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={isExpired ? 'Account expired (read-only)' : undefined}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add your first class</span>
              </button>
            </div>
          ) : (
            classes.map((cls, idx) => {
              const isClassSelected = selectedClassId === cls.id;
              const isClassOnlySelected = isClassSelected && !selectedSectionId;
              const isExpanded = !!expandedClasses[cls.id];
              const sections = sectionsByClass[cls.id] || [];
              const totalStudents = sections.reduce((sum, s) => sum + (s.studentCount || 0), 0);
              const isMenuOpen = activeClassMenuId === cls.id;

              return (
                <div key={cls.id} className="space-y-1">
                  {/* Class Row: Header & Accordion Chevron with distinct solid border */}
                  <div
                    className={`group relative flex items-center justify-between rounded-xl transition-all border-2 ${
                      isClassOnlySelected
                        ? 'border-[#4A88C5] bg-[#2B547E] text-white shadow-sm font-bold ring-1 ring-blue-400/40'
                        : isClassSelected
                        ? 'border-[#2B547E] bg-[#1E2D44] text-white shadow-2xs'
                        : 'border-[#2B547E]/40 bg-[#162235]/90 text-slate-200 hover:border-[#4A88C5]/70 hover:bg-[#1C2C45] hover:text-white'
                    }`}
                  >
                    {/* Accordion Chevron Toggle Icon */}
                    <button
                      type="button"
                      onClick={(e) => toggleClassAccordion(cls.id, e)}
                      aria-label={isExpanded ? 'Collapse section list' : 'Expand section list'}
                      className="p-2.5 min-w-[36px] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-blue-300 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {/* Class Name Button (Selects Class) */}
                    <button
                      type="button"
                      onClick={() => handleSelectClassHeader(cls.id)}
                      className="flex-1 py-2 text-left text-xs font-semibold truncate cursor-pointer select-none"
                    >
                      <span className="truncate">{cls.name}</span>
                    </button>

                    {/* 3-dots Options Menu Per Class */}
                    <div className="relative pr-1" ref={isMenuOpen ? classMenuRef : undefined}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveClassMenuId(isMenuOpen ? null : cls.id);
                        }}
                        aria-label="Class settings"
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/20 text-slate-300 hover:text-white cursor-pointer transition-opacity"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-[#141C2B] border border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                          <button
                            type="button"
                            disabled={isExpired}
                            onClick={() => {
                              if (isExpired) return;
                              handleOpenRename(cls);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            title={isExpired ? 'Account expired (read-only)' : undefined}
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Rename Class</span>
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0 || isExpired}
                            onClick={() => handleMoveClass(idx, 'up')}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
                            <span>Move Up</span>
                          </button>
                          <button
                            type="button"
                            disabled={idx === classes.length - 1 || isExpired}
                            onClick={() => handleMoveClass(idx, 'down')}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                            <span>Move Down</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section Sub-items (Rendered when Accordion is Expanded) */}
                  {isExpanded && (
                    <div className="pl-4 pr-1 py-1 space-y-1.5">
                      {sections.length === 0 ? (
                        <div className="text-[11px] text-slate-400 py-1.5 pl-2 italic">
                          No sections yet
                        </div>
                      ) : (
                        <>
                          {sections.map((sec) => {
                            const isSecSelected =
                              selectedClassId === cls.id && selectedSectionId === sec.id;

                            return (
                              <button
                                key={sec.id}
                                type="button"
                                onClick={() => {
                                  onSelectSection(cls.id, sec.id);
                                  setMobileOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 min-h-[36px] rounded-lg text-xs transition-all cursor-pointer border-2 ${
                                  isSecSelected
                                    ? 'border-emerald-400 bg-emerald-700 text-white font-semibold shadow-xs ring-1 ring-emerald-400/40'
                                    : 'border-emerald-600/40 bg-[#0F2922]/80 text-emerald-200 hover:border-emerald-500/70 hover:bg-[#14382F] hover:text-white'
                                }`}
                              >
                                <span className="truncate">{sec.name}</span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    isSecSelected
                                      ? 'bg-white/20 text-white'
                                      : 'bg-emerald-950 text-emerald-300 border border-emerald-600/30'
                                  }`}
                                >
                                  {sec.studentCount ?? 0}
                                </span>
                              </button>
                            );
                          })}

                          {/* Default Combined Section (All students of every section sorted according to section) */}
                          {(() => {
                            const isCombinedSelected =
                              selectedClassId === cls.id && selectedSectionId === 'combined';
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectSection(cls.id, 'combined');
                                  setMobileOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 min-h-[36px] rounded-lg text-xs transition-all cursor-pointer border-2 ${
                                  isCombinedSelected
                                    ? 'border-indigo-400 bg-indigo-700 text-white font-semibold shadow-xs ring-1 ring-indigo-400/40'
                                    : 'border-indigo-500/40 bg-[#161B33]/80 text-indigo-200 hover:border-indigo-400/70 hover:bg-[#1E2547] hover:text-white'
                                }`}
                              >
                                <span className="truncate font-medium flex items-center gap-1.5">
                                  <span>Combined</span>
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                    isCombinedSelected
                                      ? 'bg-white/20 text-white'
                                      : 'bg-indigo-950 text-indigo-300 border border-indigo-500/40'
                                  }`}
                                >
                                  {totalStudents}
                                </span>
                              </button>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Rename Class Modal */}
      {renamingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl max-w-sm w-full border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">
              Rename Class
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter a new name for &ldquo;{renamingClass.name}&rdquo;.
            </p>

            {renameError && (
              <div className="p-2 mb-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs rounded-lg">
                {renameError}
              </div>
            )}

            <form onSubmit={handleSaveRename} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Class Name"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2B547E]"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingClass(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameLoading || !renameValue.trim()}
                  className="px-4 py-2 bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {renameLoading ? 'Renaming...' : 'Rename'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

