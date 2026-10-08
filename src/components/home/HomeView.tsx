import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LayoutGrid,
  List,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { ClassItem, SectionItem } from "../../types/index.ts";
import { useAuth } from "../../context/AuthContext.tsx";

interface Props {
  classes: ClassItem[];
  sectionsByClass: Record<string, SectionItem[]>;
  onSelectClass: (id: string) => void;
  onOpenCreateClass: () => void;
  isExpired?: boolean;
}
interface Task {
  id: string;
  title: string;
  done: boolean;
}
export const HomeView: React.FC<Props> = ({
  classes,
  sectionsByClass,
  onSelectClass,
  onOpenCreateClass,
  isExpired,
}) => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(
          e.target instanceof HTMLElement &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
            e.target.isContentEditable)
        )
      ) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Search classes"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState(false);
  const [draft, setDraft] = useState("");
  const [storageError, setStorageError] = useState(false);
  const taskKey = `student-tracker:tasks:${user?.id}`;
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const data = JSON.parse(localStorage.getItem(taskKey) || "[]");
      return Array.isArray(data)
        ? data.filter(
            (t) =>
              typeof t.id === "string" &&
              typeof t.title === "string" &&
              typeof t.done === "boolean",
          )
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(taskKey, JSON.stringify(tasks));
    } catch {
      setStorageError(true);
    }
  }, [tasks, taskKey]);
  const today = new Date();
  const [month, setMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const visible = useMemo(() => {
    const found = classes.filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase().trim()),
    );
    return sort
      ? [...found].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        )
      : found;
  }, [classes, query, sort]);
  const sections = classes.flatMap((c) => sectionsByClass[c.id] || []);
  const loaded = classes.every((c) => sectionsByClass[c.id] !== undefined);
  const students = sections.reduce((n, s) => n + (s.studentCount || 0), 0);
  const done = tasks.filter((t) => t.done).length;
  const firstDay = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <div className="dashboard animate-fade-in">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR TEACHING WORKSPACE</div>
          <h2>
            Overview<span className="heading-dot">.</span>
          </h2>
          <p>A little clarity. A lot more possibility.</p>
        </div>
        <div className="date-pill">
          {today.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </div>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="banner-label">
            <Sparkles size={14} /> EVERY STUDENT. EVERY STEP.
          </span>
          <h3>
            Great teaching starts
            <br />
            with a clear picture.
          </h3>
          <p>
            Welcome back, {user?.fullName?.split(" ")[0] || user?.username}.
            <br />
            Your classes, your students, all moving forward.
          </p>
          <button
            className="primary-button"
            disabled={isExpired}
            onClick={onOpenCreateClass}
          >
            <Plus size={17} /> Create a class <ArrowRight size={16} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-spark">✦</div>
          <div className="book book-back" />
          <div className="book book-middle" />
          <div className="book book-front">
            <GraduationCap size={58} strokeWidth={1.3} />
            <span>
              MAKE ROOM
              <br />
              FOR GROWTH.
            </span>
          </div>
          <div className="floating-note">
            <CheckCheck size={18} />
            <span>
              Small steps.
              <br />
              <b>Bright futures.</b>
            </span>
          </div>
        </div>
      </section>
      <div className="stats-grid">
        {[
          {
            label: "Active classes",
            value: classes.length,
            icon: BookOpen,
            tone: "teal",
            caption: "Your learning spaces",
          },
          {
            label: "Total students",
            value: loaded ? students : "—",
            icon: Users,
            tone: "violet",
            caption: loaded
              ? "Across all your classes"
              : "Loading class rosters",
          },
          {
            label: "Class sections",
            value: loaded ? sections.length : "—",
            icon: LayoutGrid,
            tone: "orange",
            caption: "Organized for focus",
          },
          {
            label: "Attendance enabled",
            value: classes.filter((c) => c.attendanceEnabled).length,
            icon: ClipboardCheck,
            tone: "blue",
            caption: "Classes ready to track",
          },
        ].map((stat, i) => (
          <div
            className="stat-card"
            key={stat.label}
            style={{ animationDelay: `${i * 65}ms` }}
          >
            <span className={`stat-icon ${stat.tone}`}>
              <stat.icon size={21} />
            </span>
            <div>
              <span className="stat-label">{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.caption}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <div className="classes-panel">
          <div className="section-heading">
            <div>
              <h3>
                Your classes{" "}
                <span className="count-pill">{classes.length}</span>
              </h3>
              <p>Good things happen in these spaces.</p>
            </div>
            <button
              className="text-button"
              disabled={isExpired}
              onClick={onOpenCreateClass}
            >
              <Plus size={16} /> New class
            </button>
          </div>
          <div className="class-toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Search classes"
                placeholder="Find a class…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <button
              className={`icon-button ${sort ? "selected" : ""}`}
              aria-label="Sort classes alphabetically"
              aria-pressed={sort}
              onClick={() => setSort(!sort)}
            >
              <ArrowDownAZ size={18} />
            </button>
            <div className="layout-switch">
              <button
                className={layout === "grid" ? "selected" : ""}
                aria-label="Grid view"
                aria-pressed={layout === "grid"}
                onClick={() => setLayout("grid")}
              >
                <LayoutGrid size={17} />
              </button>
              <button
                className={layout === "list" ? "selected" : ""}
                aria-label="List view"
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              >
                <List size={18} />
              </button>
            </div>
          </div>
          <div
            className={`class-grid ${layout === "list" ? "list-layout" : ""}`}
          >
            {visible.map((cls, i) => {
              const roster = sectionsByClass[cls.id];
              return (
                <button
                  key={cls.id}
                  className={`class-card tone-${i % 4}`}
                  onClick={() => onSelectClass(cls.id)}
                >
                  <div className="class-cover">
                    <BookOpen size={32} strokeWidth={1.4} />
                    <span className="cover-shape" />
                    <span className="class-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="class-body">
                    <span className="class-category">CLASSROOM</span>
                    <h4>{cls.name}</h4>
                    <div className="class-meta">
                      <span>
                        <Users size={14} />{" "}
                        {roster
                          ? roster.reduce(
                              (n, s) => n + (s.studentCount || 0),
                              0,
                            )
                          : "—"}{" "}
                        students
                      </span>
                      <span>{roster?.length ?? "—"} sections</span>
                    </div>
                    <div className="class-footer">
                      <span>
                        <i
                          className={
                            cls.attendanceEnabled
                              ? "status-dot"
                              : "status-dot inactive"
                          }
                        />
                        {cls.attendanceEnabled
                          ? "Attendance on"
                          : "Attendance off"}
                      </span>
                      <ArrowRight size={17} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {!visible.length && (
            <div className="empty-panel">
              <GraduationCap size={36} />
              <h4>
                {query ? "No classes found" : "Your next chapter starts here"}
              </h4>
              <p>
                {query
                  ? "Try another name or clear your search."
                  : "Create your first class, add sections, and invite possibility."}
              </p>
              <button
                className="text-button"
                disabled={!query && isExpired}
                onClick={query ? () => setQuery("") : onOpenCreateClass}
              >
                {query ? "Clear search" : "Create your first class"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <div className="workspace-tip">
            <Sparkles size={20} />
            <p>
              <b>A smoother school day</b>
              <br />
              Open a class to manage students, record attendance, and track
              marks in one place.
            </p>
          </div>
        </div>
        <aside className="dashboard-rail">
          <section className="rail-card calendar">
            <div className="section-heading">
              <h3>
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <div className="flex">
                <button
                  className="icon-button"
                  aria-label="Previous month"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div className="calendar-grid">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <small key={`day-${i}`}>{d}</small>
              ))}
              {Array.from({ length: firstDay }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => (
                <span
                  key={i}
                  aria-current={
                    today.getDate() === i + 1 &&
                    today.getMonth() === month.getMonth() &&
                    today.getFullYear() === month.getFullYear()
                      ? "date"
                      : undefined
                  }
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <button
              className="calendar-today"
              onClick={() =>
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
              }
            >
              Back to today
            </button>
          </section>
          <section className="rail-card">
            <div className="section-heading">
              <h3>Your checklist</h3>
              <span className="count-pill">
                {done}/{tasks.length}
              </span>
            </div>
            <p className="rail-caption">Small wins for your school day.</p>
            <div className="task-progress">
              <span
                style={{
                  width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="task-list">
              {tasks.map((task) => (
                <div className="task-row" key={task.id}>
                  <button
                    className={`task-check ${task.done ? "done" : ""}`}
                    aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`}
                    aria-pressed={task.done}
                    onClick={() =>
                      setTasks(
                        tasks.map((t) =>
                          t.id === task.id ? { ...t, done: !t.done } : t,
                        ),
                      )
                    }
                  >
                    {task.done && <Check size={13} />}
                  </button>
                  <span className={task.done ? "task-done" : ""}>
                    {task.title}
                  </span>
                  <button
                    className="task-delete"
                    aria-label={`Delete ${task.title}`}
                    onClick={() =>
                      setTasks(tasks.filter((t) => t.id !== task.id))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            {!tasks.length && (
              <p className="task-empty">
                A fresh start. What’s one thing you’d like to get done?
              </p>
            )}
            <form
              className="task-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                setTasks([
                  ...tasks,
                  { id: crypto.randomUUID(), title: draft.trim(), done: false },
                ]);
                setDraft("");
              }}
            >
              <input
                maxLength={160}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="New checklist item"
                placeholder="Add a little goal…"
              />
              <button aria-label="Add checklist item" disabled={!draft.trim()}>
                <Plus size={17} />
              </button>
            </form>
            <small className="local-note">
              {storageError
                ? "Storage unavailable. Changes last for this visit."
                : "Personal checklist · saved on this device"}
            </small>
          </section>
          <div className="quote-card">
            <span>“</span>
            <p>
              Education is the most powerful weapon which you can use to change
              the world.
            </p>
            <small>— NELSON MANDELA</small>
          </div>
        </aside>
      </div>
      <footer className="dashboard-footer">
        <span>
          Student Tracker <span> / </span> A little more organized. A lot more
          inspired.
        </span>
        <span>
          Made for educators <Sparkles size={12} />
        </span>
      </footer>
    </div>
  );
};
