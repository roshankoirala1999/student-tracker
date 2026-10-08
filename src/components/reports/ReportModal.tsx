import { createPortal } from "react-dom";
import React, { useEffect, useRef, useState } from "react";
import { Download, FileText, Upload, X, CheckCircle2 } from "lucide-react";
import { apiRequest } from "../../api/client.ts";
import { SectionItem } from "../../types/index.ts";
import { RecordReport } from "../../types/reports.ts";
import { exportReportCsv, exportReportPdf } from "../../utils/reports.ts";
import { useAuth } from "../../context/AuthContext.tsx";
interface Props {
  classId: string;
  className: string;
  sectionId?: string;
  initialKind?: "attendance" | "marks";
  onClose: () => void;
  onImported?: () => void;
}
export function ReportModal({
  classId,
  className,
  sectionId = "",
  initialKind = "attendance",
  onClose,
  onImported,
}: Props) {
  const { user } = useAuth();
  const readOnly = !!user?.isExpired || !!user?.isReadOnly;
  const [kind, setKind] = useState(initialKind),
    [section, setSection] = useState(sectionId),
    [sections, setSections] = useState<SectionItem[]>([]),
    [assessments, setAssessments] = useState<any[]>([]),
    [assessment, setAssessment] = useState("examination");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [report, setReport] = useState<RecordReport | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [csv, setCsv] = useState(""),
    [fileName, setFileName] = useState("");
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, []);
  const version = useRef(0);
  const url = () =>
    `/api/classes/${classId}/reports/${kind}?${new URLSearchParams({ sectionId: section, assessment, from, to })}`;
  async function load() {
    const v = ++version.current;
    setLoading(true);
    setError("");
    setReport(null);
    const result = await apiRequest<RecordReport>(url());
    if (v !== version.current) return;
    setLoading(false);
    if (result.success && result.data) setReport(result.data);
    else setError(result.message || "Unable to load report.");
  }
  useEffect(() => {
    void Promise.all([
      apiRequest<SectionItem[]>(`/api/classes/${classId}/sections`),
      apiRequest<any[]>("/api/assessments"),
    ]).then(([s, a]) => {
      if (s.success) setSections(s.data || []);
      if (a.success)
        setAssessments((a.data || []).filter((x) => x.classId === classId));
    });
  }, [classId]);
  useEffect(() => {
    setCsv("");
    setFileName("");
    setNotice("");
    void load();
    return () => {
      version.current++;
    };
  }, [kind, section, assessment, from, to, classId]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy, onClose]);
  async function download(format: "pdf" | "csv", template = false) {
    setBusy(true);
    setError("");
    try {
      let data = report;
      if (template) {
        const response = await apiRequest<RecordReport>(
          url() + "&template=true",
        );
        if (!response.success || !response.data)
          throw new Error(response.message);
        data = response.data;
      }
      if (!data?.rows.length)
        throw new Error("No records match this selection.");
      if (format === "pdf") await exportReportPdf(data);
      else exportReportCsv(data);
    } catch (e: any) {
      setError(e.message || "Download failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!csv || busy) return;
    setBusy(true);
    setError("");
    const result = await apiRequest(
      `/api/classes/${classId}/reports/${kind}/csv`,
      {
        method: "POST",
        body: JSON.stringify({ csvContent: csv, sectionId: section }),
      },
    );
    setBusy(false);
    if (result.success) {
      setNotice(result.message || "CSV imported.");
      setCsv("");
      setFileName("");
      onImported?.();
      void load();
    } else setError([result.message, ...(result.errors || [])].join("\n"));
  }
  return createPortal(
    <div className="record-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="record-dialog report-dialog"
      >
        <header>
          <div>
            <span className="eyebrow">EXPORT & IMPORT</span>
            <h2 id="report-title">Classroom reports</h2>
            <p>{className}</p>
          </div>
          <button aria-label="Close reports" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="record-body">
          <div className="report-filters">
            <label>
              Records
              <select
                value={kind}
                disabled={busy}
                onChange={(e) => setKind(e.target.value as any)}
              >
                <option value="attendance">Attendance</option>
                <option value="marks">Exam & assignment marks</option>
              </select>
            </label>
            <label>
              Sections
              <select
                value={section}
                disabled={busy}
                onChange={(e) => setSection(e.target.value)}
              >
                <option value="">All sections in this class</option>
                {sections.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {kind === "marks" ? (
              <label>
                Assessment
                <select
                  value={assessment}
                  disabled={busy}
                  onChange={(e) => setAssessment(e.target.value)}
                >
                  <option value="examination">All examinations</option>
                  <option value="assignment">All assignments</option>
                  <option value="all">Examinations & assignments</option>
                  {assessments.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name} · {a.type}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  From date
                  <input
                    type="date"
                    value={from}
                    disabled={busy}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  To date
                  <input
                    type="date"
                    value={to}
                    disabled={busy}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          {error && (
            <div className="record-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="record-success" role="status">
              <CheckCircle2 size={16} />
              {notice}
            </div>
          )}
          <div className="report-summary">
            <div>
              <h3>
                {loading
                  ? "Preparing your report…"
                  : `${report?.rows.length || 0} records`}
              </h3>
              <p>
                {kind === "attendance"
                  ? "One row per student and recorded day."
                  : "Blank scores mean ungraded, never zero."}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="record-secondary"
                disabled={busy || loading || !report?.rows.length}
                onClick={() => download("csv")}
              >
                <Download size={16} />
                CSV
              </button>
              <button
                className="record-primary"
                disabled={busy || loading || !report?.rows.length}
                onClick={() => download("pdf")}
              >
                <FileText size={16} />
                PDF table
              </button>
            </div>
          </div>
          <div className="report-preview">
            {report?.rows.length ? (
              <table>
                <thead>
                  <tr>
                    {report.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, 15).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell === "" ? "—" : cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="record-empty">
                {loading
                  ? "Loading…"
                  : "No records yet. Start taking attendance or add an assessment to your class."}
              </div>
            )}
          </div>
          {!!report?.rows.length && (
            <small className="record-caption">
              Previewing up to 15 rows. Downloads include every matching record.
            </small>
          )}
          {!readOnly && (
            <div className="csv-import-panel">
              <h3>
                <Upload size={17} /> Update from CSV
              </h3>
              <p>
                {kind === "attendance"
                  ? "Download a template, fill every student’s status with present or absent, then upload it. Existing section/day records are updated; new days are added."
                  : "Edit the Marks column in a downloaded CSV. Existing student/assessment scores are updated; blank scores clear a mark."}{" "}
                Keep names, section names, roll numbers, and symbols unchanged.
              </p>
              {kind === "attendance" && (
                <button
                  className="text-button"
                  disabled={busy || loading}
                  onClick={() => download("csv", true)}
                >
                  Download next-day CSV template <Download size={14} />
                </button>
              )}
              <label className="csv-picker">
                CSV file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy || loading}
                  onChange={async (e) => {
                    setCsv("");
                    setFileName("");
                    setError("");
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      !file.name.toLowerCase().endsWith(".csv") ||
                      file.size > 5 * 1024 * 1024
                    ) {
                      setError("Choose a CSV file smaller than 5 MB.");
                      return;
                    }
                    try {
                      setCsv(await file.text());
                      setFileName(file.name);
                    } catch {
                      setError("Unable to read the file.");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {fileName && (
                <div className="report-summary">
                  <span>{fileName}</span>
                  <button
                    className="record-primary"
                    disabled={busy || loading || !csv}
                    onClick={upload}
                  >
                    {busy ? "Working…" : "Validate & import CSV"}
                  </button>
                </div>
              )}
              <small className="record-caption">
                Only CSV uploads are accepted. All rows are validated before
                changes are written.
              </small>
            </div>
          )}
        </div>
        <footer>
          <span>{busy ? "Working…" : "PDF for sharing · CSV for editing"}</span>
          <button
            className="record-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
