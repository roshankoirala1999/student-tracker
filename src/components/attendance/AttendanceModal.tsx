import { createPortal } from "react-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  History,
  Search,
  X,
  Save,
  RotateCcw,
  Users,
  FileDown,
} from "lucide-react";
import { apiRequest } from "../../api/client.ts";
import { StudentItem } from "../../types/index.ts";
import { useAuth } from "../../context/AuthContext.tsx";
interface Props {
  isOpen: boolean;
  sectionId: string;
  sectionName: string;
  className: string;
  onClose: () => void;
  onOpenReports?: () => void;
}
interface Day {
  id: string;
  dayNumber: number;
  submissionDate: string;
  comment?: string;
  presentCount: number;
  absentCount: number;
  totalStudents: number;
}
type Status = "present" | "absent";
export function AttendanceModal({
  isOpen,
  sectionId,
  sectionName,
  className,
  onClose,
  onOpenReports,
}: Props) {
  const { user } = useAuth();
  const readOnly = !!user?.isReadOnly || !!user?.isExpired;
  const [students, setStudents] = useState<StudentItem[]>([]),
    [history, setHistory] = useState<Day[]>([]),
    [map, setMap] = useState<Record<string, Status>>({}),
    [query, setQuery] = useState(""),
    [absentOnly, setAbsentOnly] = useState(false),
    [date, setDate] = useState(""),
    [day, setDay] = useState(1),
    [editing, setEditing] = useState<string | null>(null),
    [note, setNote] = useState(""),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false),
    [baseline, setBaseline] = useState<Record<string, Status>>({});
  const originalFocus = useRef<HTMLElement | null>(null),
    closeRef = useRef<HTMLButtonElement>(null),
    dialogRef = useRef<HTMLElement>(null),
    version = useRef(0),
    lock = useRef(false);
  const present = Object.values(map).filter((v) => v === "present").length,
    absent = Object.values(map).filter((v) => v === "absent").length;
  const active = students.filter((s) => map[s.id] !== undefined);
  const visible = useMemo(
    () =>
      active.filter(
        (s) =>
          (!absentOnly || map[s.id] === "absent") &&
          `${s.studentName} ${s.rollNumber} ${s.symbolNumber}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [students, map, query, absentOnly],
  );
  function close() {
    if (saving) return;
    if (dirty && !window.confirm("Discard your unsaved attendance changes?"))
      return;
    onClose();
  }
  async function edit(id: string, roster = students) {
    const v = ++version.current;
    setLoading(true);
    setError("");
    const res = await apiRequest<any>(`/api/attendance/${id}`);
    if (v !== version.current) return;
    setLoading(false);
    if (!res.success) {
      setError(res.message || "Unable to load this day.");
      return;
    }
    const next: Record<string, Status> = {};
    res.data.records.forEach((r: any) => {
      next[r.studentId] = r.status;
    });
    const known = new Set(roster.map((s) => s.id));
    setStudents([
      ...roster,
      ...res.data.records
        .filter((r: any) => !known.has(r.studentId))
        .map((r: any) => ({
          id: r.studentId,
          studentName: "Former student",
          rollNumber: 0,
          symbolNumber: r.studentId.slice(-6),
          sectionId,
          createdAt: "",
          teacherId: "",
          classId: "",
          contactNumber: "",
        })),
    ]);
    setMap(next);
    setBaseline(next);
    setEditing(id);
    setDay(res.data.dayNumber);
    setDate(res.data.submissionDate);
    setNote(res.data.comment || "");
    setDirty(false);
    setQuery("");
    setAbsentOnly(false);
  }
  async function load(preferredId?: string) {
    const v = ++version.current;
    setLoading(true);
    setError("");
    const [s, a] = await Promise.all([
      apiRequest<StudentItem[]>(`/api/sections/${sectionId}/students`),
      apiRequest<{ today: string; nextDayNumber: number; history: Day[] }>(
        `/api/sections/${sectionId}/attendance`,
      ),
    ]);
    if (v !== version.current) return;
    setLoading(false);
    if (!s.success || !a.success || !s.data || !a.data) {
      setError(s.message || a.message || "Unable to load attendance.");
      return;
    }
    setStudents(s.data);
    setHistory(a.data.history);
    const existing = a.data.history.find((d) =>
      preferredId ? d.id === preferredId : d.submissionDate === a.data!.today,
    );
    if (existing) {
      await edit(existing.id, s.data);
    } else {
      setEditing(null);
      setDay(a.data.nextDayNumber);
      setDate(a.data.today);
      const next = Object.fromEntries(
        s.data.map((student) => [student.id, "present" as Status]),
      );
      setMap(next);
      setBaseline(next);
      setNote("");
      setDirty(false);
    }
  }
  useEffect(() => {
    if (!isOpen) return;
    setNotice("");
    setQuery("");
    setAbsentOnly(false);
    setDirty(false);
    void load();
    originalFocus.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      version.current++;
      document.body.style.overflow = previous;
      originalFocus.current?.focus();
    };
  }, [isOpen, sectionId]);
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, dirty, saving]);
  async function save() {
    if (lock.current || loading || readOnly || !active.length) return;
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    const records = active.map((s) => ({ studentId: s.id, status: map[s.id] }));
    const res = await apiRequest(
      editing
        ? `/api/attendance/${editing}`
        : `/api/sections/${sectionId}/attendance`,
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          records,
          comment: note.trim(),
          targetDayNumber: day,
          submissionDate: date,
        }),
      },
    );
    setSaving(false);
    lock.current = false;
    if (!res.success) {
      setError(
        res.message ||
          "Attendance could not be saved. Your changes are still here.",
      );
      return;
    }
    setDirty(false);
    setNotice(`Day ${day} saved · ${present} present · ${absent} absent`);
    await load(editing || undefined);
  }
  if (!isOpen) return null;
  return createPortal(
    <div className="record-overlay">
      <section
        className="record-dialog attendance-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-title"
      >
        <header>
          <div>
            <span className="eyebrow">
              {className} / {sectionName}
            </span>
            <h2 id="attendance-title">Attendance</h2>
            <p>
              {editing
                ? "Review or update a recorded day."
                : "Everyone starts present. Just mark who is away."}
            </p>
          </div>
          <button
            ref={closeRef}
            aria-label="Close attendance"
            onClick={close}
            disabled={saving}
          >
            <X size={21} />
          </button>
        </header>
        <div className="record-body">
          <div className="attendance-day">
            <label>
              <History size={16} /> Day
              <select
                aria-label="Attendance day"
                value={editing || "new"}
                disabled={loading || saving}
                onChange={(e) => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Discard changes and switch attendance day?",
                    )
                  )
                    return;
                  if (e.target.value === "new") {
                    setEditing(null);
                    setDay(Math.max(0, ...history.map((h) => h.dayNumber)) + 1);
                    setDate(
                      new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Kathmandu",
                      }).format(new Date()),
                    );
                    const next = Object.fromEntries(
                      students
                        .filter((s) => s.studentName !== "Former student")
                        .map((s) => [s.id, "present" as Status]),
                    );
                    setMap(next);
                    setBaseline(next);
                    setNote("");
                    setDirty(false);
                  } else void edit(e.target.value);
                }}
              >
                <option value="new">
                  New day {Math.max(0, ...history.map((h) => h.dayNumber)) + 1}
                </option>
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    Day {h.dayNumber} · {h.submissionDate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                aria-label="Attendance date"
                type="date"
                value={date}
                disabled={!!editing || loading || saving || readOnly}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
          </div>
          {error && (
            <div role="alert" className="record-error">
              {error}{" "}
              {!students.length && <button onClick={() => void load()}>Retry</button>}
            </div>
          )}
          {notice && (
            <div role="status" className="record-success">
              <Check size={16} />
              {notice}
            </div>
          )}
          <div className="attendance-counts">
            <span>
              <Users size={17} />
              <b>{active.length}</b> students
            </span>
            <span className="present-count">
              <b>{present}</b> present
            </span>
            <span className="absent-count">
              <b>{absent}</b> absent
            </span>
          </div>
          <div className="attendance-toolbar">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search attendance roster"
                placeholder="Search name, roll or symbol…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className={`record-secondary ${absentOnly ? "is-selected" : ""}`}
              aria-pressed={absentOnly}
              onClick={() => setAbsentOnly(!absentOnly)}
            >
              Absent only
            </button>
            <button
              className="record-secondary"
              disabled={loading || saving || readOnly || !active.length}
              onClick={() => {
                setMap(
                  Object.fromEntries(active.map((s) => [s.id, "present"])),
                );
                setDirty(true);
              }}
            >
              <CheckCheck size={16} />
              All present
            </button>
          </div>
          <div className="attendance-roster" aria-busy={loading}>
            {loading ? (
              <div className="record-empty">Loading roster…</div>
            ) : !visible.length ? (
              <div className="record-empty">
                {active.length
                  ? "No students match this filter."
                  : "Add students to this section before taking attendance."}
              </div>
            ) : (
              visible.map((student) => (
                <div className="attendance-row" key={student.id}>
                  <span className="roll-badge">
                    {student.rollNumber || "—"}
                  </span>
                  <div className="attendance-student">
                    <strong>{student.studentName}</strong>
                    <small>{student.symbolNumber}</small>
                  </div>
                  <div
                    className="attendance-toggle"
                    role="group"
                    aria-label={`Attendance for ${student.studentName}`}
                  >
                    <button
                      aria-pressed={map[student.id] === "present"}
                      className={
                        map[student.id] === "present" ? "is-present" : ""
                      }
                      disabled={saving || readOnly}
                      onClick={() => {
                        setMap((prev) => ({
                          ...prev,
                          [student.id]: "present",
                        }));
                        setDirty(true);
                      }}
                    >
                      Present
                    </button>
                    <button
                      aria-pressed={map[student.id] === "absent"}
                      className={
                        map[student.id] === "absent" ? "is-absent" : ""
                      }
                      disabled={saving || readOnly}
                      onClick={() => {
                        setMap((prev) => ({ ...prev, [student.id]: "absent" }));
                        setDirty(true);
                      }}
                    >
                      Absent
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <label className="attendance-note">
            Note <span>optional</span>
            <input
              maxLength={1000}
              value={note}
              disabled={loading || saving || readOnly}
              onChange={(e) => {
                setNote(e.target.value);
                setDirty(true);
              }}
              placeholder="Anything to remember about this day?"
            />
          </label>
        </div>
        <footer>
          <div className="flex gap-2">
            <button
              className="record-secondary"
              disabled={saving || !dirty}
              onClick={() => {
                setMap(baseline);
                setDirty(true);
              }}
            >
              <RotateCcw size={14} />
              Reset statuses
            </button>
            {onOpenReports && (
              <button
                className="record-secondary"
                disabled={saving || dirty}
                onClick={onOpenReports}
              >
                <FileDown size={15} />
                Reports
              </button>
            )}
          </div>
          <button
            className="record-primary"
            disabled={saving || loading || readOnly || !active.length || !date}
            onClick={save}
          >
            <Save size={16} />
            {saving ? "Saving…" : `Save day ${day}`}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
