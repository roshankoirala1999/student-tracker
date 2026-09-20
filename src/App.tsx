import React, { useState, useEffect } from 'react';
import { Menu, GraduationCap, Plus, BookOpen, AlertTriangle, Clock } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthPage } from './components/auth/AuthPage.tsx';
import { DatabaseAlert } from './components/common/DatabaseAlert.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { ClassDetailView } from './components/classes/ClassDetailView.tsx';
import { SectionDetailView } from './components/sections/SectionDetailView.tsx';
import { MasterAdminView } from './components/admin/MasterAdminView.tsx';
import { CreateClassModal } from './components/classes/CreateClassModal.tsx';
import { ForcedPasswordChange } from './components/auth/ForcedPasswordChange.tsx';
import { ClassItem, SectionItem } from './types/index.ts';
import { apiRequest } from './api/client.ts';

const MainApp: React.FC = () => {
  const { user, loading, dbConnected, dbError, checkAuth } = useAuth();
  const isAdmin = user?.role === 'master_admin' || user?.role === 'administrator';
  const isExpired = !isAdmin && !!user?.isExpired;

  const [viewMode, setViewMode] = useState<'app' | 'admin'>('app');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, SectionItem[]>>({});
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);
  const [createClassModalOpen, setCreateClassModalOpen] = useState(false);

  // Load teacher classes
  const loadClasses = async () => {
    if (!user || user.role === 'master_admin' || user.role === 'administrator') return;
    setClassesLoading(true);
    const res = await apiRequest<ClassItem[]>('/api/classes');
    setClassesLoading(false);
    if (res.success && res.data) {
      setClasses(res.data);
      // If current selected class is not in the list, or none selected, pick the first
      if (res.data.length > 0) {
        if (!selectedClassId || !res.data.some((c) => c.id === selectedClassId)) {
          setSelectedClassId(res.data[0].id);
        }
      } else {
        setSelectedClassId(null);
      }
    }
  };

  // Load sections for a class
  const loadSectionsForClass = async (classId: string) => {
    const res = await apiRequest<SectionItem[]>(`/api/classes/${classId}/sections`);
    if (res.success && res.data) {
      setSectionsByClass((prev) => ({
        ...prev,
        [classId]: res.data || [],
      }));
    }
  };

  useEffect(() => {
    if (user) {
      if (user.role === 'master_admin' || user.role === 'administrator') {
        setViewMode('admin');
      } else {
        setViewMode('app');
        loadClasses();
      }
    }
  }, [user]);

  useEffect(() => {
    if (selectedClassId && !isAdmin) {
      loadSectionsForClass(selectedClassId);
    }
  }, [selectedClassId, isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] dark:bg-[#0B0F19] flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-[#2B547E] rounded-2xl flex items-center justify-center text-white animate-pulse shadow-md">
            <GraduationCap className="w-7 h-7" />
          </div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Loading Student Tracker...</p>
        </div>
      </div>
    );
  }

  // Strict Fail-Fast: Show alert if MongoDB Atlas is not connected
  if (!dbConnected) {
    return <DatabaseAlert error={dbError} onRetry={checkAuth} />;
  }

  // Show Auth Page if not logged in
  if (!user) {
    return <AuthPage />;
  }

  // Mandatory password change flow
  if (user.mustChangePassword) {
    return <ForcedPasswordChange onSuccess={checkAuth} />;
  }

  const currentClass = classes.find((c) => c.id === selectedClassId) || null;
  const currentSections = selectedClassId ? sectionsByClass[selectedClassId] || [] : [];
  const currentSection = currentSections.find((s) => s.id === selectedSectionId) || null;

  return (
    <div className="min-h-screen bg-[#F4F6FA] dark:bg-[#0B0F19] flex flex-col font-sans text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
      />

      {/* Global Big Red Box for Expired Teacher Account */}
      {isExpired && (
        <div className="bg-red-600 dark:bg-red-700 text-white px-4 sm:px-6 py-4 shadow-lg border-b-2 border-red-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left z-30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl shrink-0">
              <AlertTriangle className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="font-extrabold text-sm sm:text-base tracking-wide uppercase">
                Account is Expired
              </div>
              <div className="text-xs sm:text-sm text-red-100 font-medium">
                Your account is expired, contact administrator to reactivate editing access. You may still view your students, sections, and marks.
              </div>
            </div>
          </div>
          <div className="px-3.5 py-1.5 bg-black/20 backdrop-blur-xs rounded-xl text-xs font-bold uppercase tracking-wider text-red-100 shrink-0">
            Read-Only Mode
          </div>
        </div>
      )}

      {/* Trial Account Warning (<= 3 days remaining) */}
      {!isAdmin && user && !isExpired && user.daysRemaining !== undefined && user.daysRemaining <= 3 && (
        <div className="bg-amber-500 dark:bg-amber-600 text-amber-950 px-4 sm:px-6 py-2.5 border-b border-amber-600 flex items-center justify-between gap-3 text-xs font-semibold z-20">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-950 shrink-0" />
            <span>
              Trial Account Warning: You have {user.daysRemaining} day{user.daysRemaining === 1 ? '' : 's'} remaining before your account expires.
            </span>
          </div>
        </div>
      )}

      {viewMode === 'admin' ? (
        <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1">
          <MasterAdminView />
        </main>
      ) : (
        <div className="flex-1 flex w-full">
          {/* Sidebar */}
          <Sidebar
            classes={classes}
            sectionsByClass={sectionsByClass}
            selectedClassId={selectedClassId}
            selectedSectionId={selectedSectionId}
            onSelectClass={(classId) => {
              setSelectedClassId(classId);
              setSelectedSectionId(null);
            }}
            onSelectSection={(classId, sectionId) => {
              setSelectedClassId(classId);
              setSelectedSectionId(sectionId);
            }}
            mobileOpen={mobileSidebarOpen}
            setMobileOpen={setMobileSidebarOpen}
            onOpenCreateClass={() => setCreateClassModalOpen(true)}
            onRefreshClasses={loadClasses}
            isExpired={isExpired}
          />

          {/* Main Content Area */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-6xl w-full">
            {/* Mobile Action Bar (< 1024px) */}
            <div className="lg:hidden mb-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 min-h-[42px] bg-white dark:bg-[#1A2232] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Menu className="w-4 h-4 text-[#2B547E] dark:text-blue-400" />
                <span>Classes &amp; Sections</span>
              </button>

              <button
                type="button"
                disabled={isExpired}
                onClick={() => setCreateClassModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-2xs cursor-pointer transition-colors"
                title={isExpired ? 'Account expired (read-only)' : 'New Class'}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Class</span>
              </button>
            </div>

            {classesLoading ? (
              <div className="py-20 text-center text-xs text-slate-400">Loading classes...</div>
            ) : currentSection && currentClass ? (
              <SectionDetailView
                currentClass={currentClass}
                section={currentSection}
                onBackToClass={() => setSelectedSectionId(null)}
                onRefreshSectionCount={async () => {
                  if (selectedClassId) {
                    await loadSectionsForClass(selectedClassId);
                  }
                }}
              />
            ) : currentClass ? (
              <ClassDetailView
                currentClass={currentClass}
                sections={currentSections}
                onRefreshClass={loadClasses}
                onRefreshSections={async () => {
                  if (selectedClassId) {
                    await loadSectionsForClass(selectedClassId);
                  }
                }}
                onSelectSection={(secId) => setSelectedSectionId(secId)}
                onClassDeleted={async () => {
                  setSelectedSectionId(null);
                  setSelectedClassId(null);
                  await loadClasses();
                }}
                onBack={() => {
                  setSelectedSectionId(null);
                  setSelectedClassId(null);
                }}
              />
            ) : (
              <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-8 sm:p-12 text-center text-slate-500 dark:text-slate-400 shadow-xs max-w-md mx-auto my-12 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-[#2B547E]/10 dark:bg-blue-500/10 flex items-center justify-center text-[#2B547E] dark:text-blue-400 mx-auto mb-3">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">No Class Selected</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Select an academic class from the sidebar, or create a new class to manage sections, students, and marks.
                </p>
                <button
                  type="button"
                  disabled={isExpired}
                  onClick={() => setCreateClassModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                  title={isExpired ? 'Account expired (read-only)' : 'Create New Class'}
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Class</span>
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Create Class Modal */}
      <CreateClassModal
        isOpen={createClassModalOpen}
        onClose={() => setCreateClassModalOpen(false)}
        onCreated={async (newClass) => {
          await loadClasses();
          setSelectedClassId(newClass.id);
          setSelectedSectionId(null);
        }}
      />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user } = useAuth();
  return <MainApp key={user?.id ?? 'guest'} />;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
