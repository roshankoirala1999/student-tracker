import React, { useState, useEffect } from 'react';
import { X, UploadCloud, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { apiRequest } from '../../api/client.ts';

interface Props {
  isOpen: boolean;
  sectionId: string;
  sectionName: string;
  className: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const ExcelUploadModal: React.FC<Props> = ({
  isOpen,
  sectionId,
  sectionName,
  className,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedErrors, setDetailedErrors] = useState<string[]>([]);
  const [successResult, setSuccessResult] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setBase64Data('');
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

    const isExcel =
      selectedFile.name.endsWith('.xlsx') ||
      selectedFile.name.endsWith('.xls') ||
      selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      selectedFile.type === 'application/vnd.ms-excel';

    if (!isExcel) {
      setError('Please select a valid Excel (.xlsx) spreadsheet.');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setBase64Data(result);
    };
    reader.readAsDataURL(selectedFile);
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

  const handleUpload = async () => {
    if (!base64Data) {
      setError('Please select an Excel file to upload.');
      return;
    }

    setLoading(true);
    setError(null);
    setDetailedErrors([]);
    setSuccessResult(null);

    const res = await apiRequest(`/api/sections/${sectionId}/excel/import`, {
      method: 'POST',
      body: JSON.stringify({ fileData: base64Data }),
    });

    setLoading(false);
    if (res.success) {
      setSuccessResult(res.message || 'Marks successfully imported from Excel.');
      await onSuccess();
    } else {
      setError(res.message || 'Failed to import Excel marks.');
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
            <span>Upload Excel Marks — {className} ({sectionName})</span>
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
          <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-3.5 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Strict Marks-Only Mode (.xlsx)</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                Excel import populates coursework assignments and examination scores for existing students. Student identities (Roll Number and Symbol Number) are verified strictly. Enrolled student records are never created or removed via import.
              </p>
            </div>
          </div>

          {/* File Picker with Drag and Drop */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-[#2B547E] dark:hover:border-blue-400 transition-colors bg-slate-50/50 dark:bg-[#0F172A]/50"
          >
            <FileSpreadsheet className="w-9 h-9 text-[#2B547E] dark:text-blue-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
              {file ? file.name : 'Select or drag & drop the populated Excel (.xlsx) file'}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
              Must match columns from &ldquo;Download Excel Template&rdquo;
            </p>
            <label className="inline-flex items-center justify-center px-4 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors shadow-2xs">
              Choose Excel File
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
              <p className="font-semibold mb-1">{error}</p>
              {detailedErrors.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-[11px] max-h-32 overflow-y-auto mt-2">
                  {detailedErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {successResult && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{successResult}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
            >
              {successResult ? 'Done' : 'Cancel'}
            </button>
            {!successResult && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={loading || !file}
                className="px-5 py-2.5 min-h-[42px] bg-[#2B547E] hover:bg-[#355C7D] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
              >
                {loading ? 'Validating & Importing...' : 'Import Excel Marks'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
