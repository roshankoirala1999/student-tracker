import React, { useState, useEffect } from 'react';
import { X, UploadCloud, AlertTriangle, CheckCircle2, FileText, Download } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';
import { parseCsv, downloadCsvFile, generateCsv } from '../../utils/csv.ts';

interface Props {
  isOpen: boolean;
  sectionId: string;
  sectionName: string;
  className: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const StudentCsvUploadModal: React.FC<Props> = ({
  isOpen,
  sectionId,
  sectionName,
  className,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [rowCount, setRowCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedErrors, setDetailedErrors] = useState<string[]>([]);
  const [successResult, setSuccessResult] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setCsvContent('');
      setRowCount(0);
      setError(null);
      setDetailedErrors([]);
      setSuccessResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelection = (selectedFile: File) => {
    setError(null);
    setDetailedErrors([]);
    setSuccessResult(null);

    const isCsv =
      selectedFile.name.toLowerCase().endsWith('.csv') ||
      selectedFile.type === 'text/csv' ||
      selectedFile.type === 'application/vnd.ms-excel';

    if (!isCsv) {
      setError('Please select a valid CSV (.csv) file. Excel (.xlsx) files are not supported.');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setCsvContent(text);
      try {
        const rows = parseCsv(text);
        setRowCount(Math.max(0, rows.length - 1));
      } catch {
        setRowCount(0);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelection(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDownloadSample = () => {
    const headers = ['Roll Number', 'Student Name', 'Symbol Number', 'Contact Number'];
    const sampleRows = [
      [1, 'John Doe', 'SYM-1001', '9841000001'],
      [2, 'Jane Smith', 'SYM-1002', '9841000002'],
      [3, 'Robert Wilson', 'SYM-1003', '9841000003'],
    ];
    const csv = generateCsv(headers, sampleRows);
    downloadCsvFile(`${className}_${sectionName}_Student_Info_Template.csv`, csv);
  };

  const handleUpload = async () => {
    if (!csvContent || csvContent.trim().length === 0) {
      setError('Please select a CSV student information file to upload.');
      return;
    }

    setLoading(true);
    setError(null);
    setDetailedErrors([]);
    setSuccessResult(null);

    const res = await apiRequest(`/api/sections/${sectionId}/students/csv-import`, {
      method: 'POST',
      body: JSON.stringify({ csvContent }),
    });

    setLoading(false);
    if (res.success) {
      setSuccessResult(res.message || 'Student information imported successfully.');
      await onSuccess();
    } else {
      if (res.message && res.message.toLowerCase().includes('limit')) {
        alert(res.message);
      }
      setError(res.message || 'Failed to upload student information.');
      if (res.errors && Array.isArray(res.errors)) {
        setDetailedErrors(res.errors);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-xl max-w-lg w-full border border-slate-200/80 dark:border-slate-700 max-h-[92vh] flex flex-col overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
            <UploadCloud className="w-5 h-5 text-[#2B547E] dark:text-blue-400" />
            <span>Upload Student Info (CSV) — {className} ({sectionName})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Rules info banner */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#2B547E] dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Student Information Only (4 Columns)
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                The CSV file must contain exactly 4 columns: <strong>Roll Number</strong>, <strong>Student Name</strong>, <strong>Symbol Number</strong>, and <strong>Contact Number</strong>. No marks or scores are modified here.
              </p>
            </div>
          </div>

          {/* Quick download sample template */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2B547E] dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Sample Template (CSV)</span>
            </button>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
              file
                ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                : 'border-slate-300 dark:border-slate-700 hover:border-[#2B547E] dark:hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/30'
            }`}
          >
            <input
              type="file"
              id="csv-students-file-input"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="csv-students-file-input"
              className="cursor-pointer flex flex-col items-center justify-center gap-2"
            >
              <FileText
                className={`w-10 h-10 ${
                  file ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              {file ? (
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{file.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {(file.size / 1024).toFixed(1)} KB • {rowCount} student row{rowCount === 1 ? '' : 's'} detected
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Click to select or drag &amp; drop student CSV
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Standard CSV format (.csv) only
                  </p>
                </div>
              )}
            </label>
          </div>

          {/* Success Banner */}
          {successResult && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successResult}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{error}</p>
                {detailedErrors.length > 0 && (
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 max-h-32 overflow-y-auto text-rose-800 dark:text-rose-300">
                    {detailedErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-[#F4F6FA] dark:bg-[#0F172A]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
          >
            {successResult ? 'Close' : 'Cancel'}
          </button>
          {!successResult && (
            <button
              type="button"
              disabled={!file || loading}
              onClick={handleUpload}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2B547E] hover:bg-[#355C7D] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer transition-colors"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{loading ? 'Validating & Uploading...' : 'Upload Student Info'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
