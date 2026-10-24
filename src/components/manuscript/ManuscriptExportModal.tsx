import React, { useState } from 'react';
import {
  X,
  FileDown,
  Printer,
  Check,
  AlertCircle,
  FileText,
  FileCode,
  Sliders,
} from 'lucide-react';
import {
  DocumentDetail,
  DocumentMetadata,
  ManuscriptExportSettings,
  ManuscriptMetadata,
  ManuscriptNode,
} from '../../types';
import {
  compileManuscriptToMarkdown,
  DEFAULT_MANUSCRIPT_EXPORT_SETTINGS,
  flattenManuscriptOutline,
  generateManuscriptPdf,
  saveExportFileToDisk,
} from '../../utils/manuscript';

interface ManuscriptExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  metadata: ManuscriptMetadata;
  outline: ManuscriptNode[];
  documents: Array<DocumentDetail | DocumentMetadata>;
}

export const ManuscriptExportModal: React.FC<ManuscriptExportModalProps> = ({
  isOpen,
  onClose,
  title,
  metadata,
  outline,
  documents,
}) => {
  const [format, setFormat] = useState<'md' | 'pdf'>('md');
  const [settings, setSettings] = useState<ManuscriptExportSettings>({
    ...DEFAULT_MANUSCRIPT_EXPORT_SETTINGS,
    ...(metadata.export_settings || {}),
  });

  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    path?: string;
    error?: string;
  } | null>(null);

  if (!isOpen) return null;

  const resolvedItems = flattenManuscriptOutline(outline, documents);

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const safeTitle = title.trim().replace(/[/\\?%*:|"<>]/g, '_') || 'Manuscript';

      if (format === 'md') {
        const mdContent = compileManuscriptToMarkdown(title, metadata, resolvedItems, settings);
        const res = await saveExportFileToDisk(
          `${safeTitle}.md`,
          { text: mdContent },
          'Markdown Document (*.md)',
          'md'
        );
        if (res.success && res.path) {
          setExportResult({ success: true, path: res.path });
        } else if (!res.cancelled) {
          setExportResult({ success: false, error: res.error || 'Export failed' });
        }
      } else {
        // PDF Export
        const pdfDoc = generateManuscriptPdf(title, metadata, resolvedItems, settings);
        const pdfArrayBuffer = pdfDoc.output('arraybuffer');
        const pdfBytes = new Uint8Array(pdfArrayBuffer);

        const res = await saveExportFileToDisk(
          `${safeTitle}.pdf`,
          { bytes: pdfBytes },
          'PDF Document (*.pdf)',
          'pdf'
        );
        if (res.success && res.path) {
          setExportResult({ success: true, path: res.path });
        } else if (!res.cancelled) {
          setExportResult({ success: false, error: res.error || 'Export failed' });
        }
      }
    } catch (err: any) {
      setExportResult({ success: false, error: err?.message || String(err) });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDirectPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-750 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-zinc-100">Export Manuscript</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="p-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Select Output Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('md')}
                className={`p-3 rounded-lg border flex items-center gap-3 transition-all ${
                  format === 'md'
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-200 font-medium'
                    : 'bg-zinc-800/40 border-zinc-750 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                <FileCode className="w-5 h-5 text-amber-400" />
                <div className="text-left">
                  <div className="text-sm font-semibold">Markdown (.md)</div>
                  <div className="text-[11px] text-zinc-400">Preserves raw structure & stanzas</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3 rounded-lg border flex items-center gap-3 transition-all ${
                  format === 'pdf'
                    ? 'bg-amber-600/20 border-amber-500/50 text-amber-200 font-medium'
                    : 'bg-zinc-800/40 border-zinc-750 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                <FileText className="w-5 h-5 text-amber-400" />
                <div className="text-left">
                  <div className="text-sm font-semibold">PDF Document (.pdf)</div>
                  <div className="text-[11px] text-zinc-400">Ready for reading & printing</div>
                </div>
              </button>
            </div>
          </div>

          {/* Compilation Settings */}
          <div className="space-y-3 bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Compilation Options</span>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.include_title_page}
                onChange={(e) =>
                  setSettings({ ...settings, include_title_page: e.target.checked })
                }
                className="rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0"
              />
              <span>Include Cover Page (Title, Subtitle, Author)</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.include_toc}
                onChange={(e) =>
                  setSettings({ ...settings, include_toc: e.target.checked })
                }
                className="rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0"
              />
              <span>Generate Table of Contents</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.page_breaks_between_sections}
                onChange={(e) =>
                  setSettings({ ...settings, page_breaks_between_sections: e.target.checked })
                }
                className="rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0"
              />
              <span>Page breaks between major sections / parts</span>
            </label>

            {format === 'pdf' && (
              <div className="pt-2 border-t border-zinc-800 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Paper Size</label>
                  <select
                    value={settings.page_size}
                    onChange={(e) =>
                      setSettings({ ...settings, page_size: e.target.value as 'a4' | 'letter' })
                    }
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200"
                  >
                    <option value="a4">A4 (Standard)</option>
                    <option value="letter">US Letter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Font Family</label>
                  <select
                    value={settings.font_family}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        font_family: e.target.value as 'serif' | 'sans' | 'mono',
                      })
                    }
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200"
                  >
                    <option value="serif">Times Serif</option>
                    <option value="sans">Helvetica Sans</option>
                    <option value="mono">Courier Mono</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Feedback banner */}
          {exportResult && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                exportResult.success
                  ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
                  : 'bg-red-950/40 border border-red-800/60 text-red-300'
              }`}
            >
              {exportResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                {exportResult.success ? (
                  <p>
                    <strong>Exported successfully!</strong>
                    {exportResult.path && (
                      <span className="block text-zinc-400 truncate mt-0.5 font-mono text-[11px]">
                        Saved to: {exportResult.path}
                      </span>
                    )}
                  </p>
                ) : (
                  <p>
                    <strong>Export Error:</strong> {exportResult.error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
          <button
            onClick={handleDirectPrint}
            title="Send directly to system printer"
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded text-xs font-medium border border-zinc-700 transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print...</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded text-xs font-medium transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold shadow-lg shadow-amber-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
