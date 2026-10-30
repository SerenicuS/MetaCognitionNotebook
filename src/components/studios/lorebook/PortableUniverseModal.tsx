import { houseUniverses } from '@/utils/lorebookNavigation';
import React, { useState, useEffect, useCallback } from 'react';
import type { DocumentMetadata, HouseRecord } from '@/types';
import type { Plan } from '@/utils/thought';
import {
  api,
} from '@/services/api';
import {
  exportPortableAfterSave,
  type ImportCommitResult,
  type ImportIdentityPolicy,
  type ImportPreview,
  type ImportRecoveryReport,
  type PortableInspection,
} from '@/services/portable';
import {
  Package,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Shield,
  FileCheck,
  X,
  BookOpen,
  Info,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export interface PortableUniverseModalProps {
  isOpen: boolean;
  onClose: () => void;
  universeId?: string | null;
  activeHouse?: HouseRecord | null;
  houses?: HouseRecord[];
  plan: Plan | null;
  documents: DocumentMetadata[];
  onSelectUniverse: (universeId: string) => void;
  onFlushSave?: () => Promise<boolean>;
  onRefreshLibrary?: () => Promise<void>;
  onOpenImportedUniverse?: (id: string, houseId: string) => Promise<void>;
  initialTab?: 'export' | 'import';
}

export const PortableUniverseModal: React.FC<PortableUniverseModalProps> = ({
  isOpen,
  onClose,
  universeId,
  activeHouse,
  houses = [],
  plan,
  documents,
  onSelectUniverse,
  onFlushSave,
  onRefreshLibrary,
  onOpenImportedUniverse,
  initialTab = 'export',
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);

  // Synchronize initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // =========================================================================
  // RECOVERY STATUS CHECK
  // =========================================================================
  const [hasPendingJournal, setHasPendingJournal] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryReport, setRecoveryReport] = useState<ImportRecoveryReport | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const checkPendingJournals = useCallback(async () => {
    try {
      const pending = await api.portableUniverseHasPendingJournal();
      setHasPendingJournal(pending);
    } catch {
      // In browser mock or if not supported, ignore silently
      setHasPendingJournal(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      checkPendingJournals();
    }
  }, [isOpen, checkPendingJournals]);

  const handleExecuteRecovery = async () => {
    try {
      setIsRecovering(true);
      setRecoveryError(null);
      const report = await api.portableUniverseRecoverImports();
      setRecoveryReport(report);
      setHasPendingJournal(false);
      if (onRefreshLibrary) {
        await onRefreshLibrary();
      }
    } catch (err: any) {
      setRecoveryError(err?.message || 'Import recovery failed.');
    } finally {
      setIsRecovering(false);
    }
  };

  // =========================================================================
  // EXPORT STATE
  // =========================================================================
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>(
    universeId || (plan?.universes[0]?.id ?? '')
  );

  useEffect(() => {
    if (universeId) {
      setSelectedUniverseId(universeId);
    } else if (plan?.universes.length) {
      setSelectedUniverseId(plan.universes[0].id);
    }
  }, [universeId, plan?.universes]);

  const activeUniverse = plan?.universes.find((u) => u.id === selectedUniverseId);
  const universeBooks = plan?.books.filter((b) => b.universe_id === selectedUniverseId && !b.archived) || [];

  // Map of chapter IDs per book
  const bookChaptersMap = React.useMemo(() => {
    const map = new Map<string, DocumentMetadata[]>();
    for (const b of universeBooks) {
      const chs = documents.filter((d) => {
        if (d.doc_type !== 'lorebook') return false;
        try {
          const meta = d.metadata_json ? JSON.parse(d.metadata_json) : {};
          return meta.book_id === b.id && meta.entry_type === 'chapter';
        } catch {
          return false;
        }
      });
      map.set(b.id, chs);
    }
    return map;
  }, [universeBooks, documents]);

  // Selected books and chapters state
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [exportDestination, setExportDestination] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<PortableInspection | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Initialize all books & chapters selected by default for current universe
  useEffect(() => {
    const bIds = new Set(universeBooks.map((b) => b.id));
    const chIds = new Set<string>();
    for (const b of universeBooks) {
      const chs = bookChaptersMap.get(b.id) || [];
      for (const ch of chs) {
        chIds.add(ch.id);
      }
    }
    setSelectedBookIds(bIds);
    setSelectedChapterIds(chIds);
  }, [selectedUniverseId, universeBooks.length]);

  const handleToggleBook = (bookId: string) => {
    const newBookIds = new Set(selectedBookIds);
    const newChapterIds = new Set(selectedChapterIds);
    const chs = bookChaptersMap.get(bookId) || [];

    if (newBookIds.has(bookId)) {
      newBookIds.delete(bookId);
      for (const ch of chs) {
        newChapterIds.delete(ch.id);
      }
    } else {
      newBookIds.add(bookId);
      for (const ch of chs) {
        newChapterIds.add(ch.id);
      }
    }
    setSelectedBookIds(newBookIds);
    setSelectedChapterIds(newChapterIds);
  };

  const handleToggleChapter = (bookId: string, chapterId: string) => {
    const newChapterIds = new Set(selectedChapterIds);
    const newBookIds = new Set(selectedBookIds);

    if (newChapterIds.has(chapterId)) {
      newChapterIds.delete(chapterId);
    } else {
      newChapterIds.add(chapterId);
      newBookIds.add(bookId);
    }
    setSelectedChapterIds(newChapterIds);
    setSelectedBookIds(newBookIds);
  };

  const handleSelectAllContent = () => {
    const bIds = new Set(universeBooks.map((b) => b.id));
    const chIds = new Set<string>();
    for (const b of universeBooks) {
      for (const ch of bookChaptersMap.get(b.id) || []) {
        chIds.add(ch.id);
      }
    }
    setSelectedBookIds(bIds);
    setSelectedChapterIds(chIds);
  };

  const handleWorldbuildingOnly = () => {
    setSelectedBookIds(new Set());
    setSelectedChapterIds(new Set());
  };

  const handleBrowseExportDestination = async () => {
    const safeName = (activeUniverse?.name || 'Universe').replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      const path = await api.pickSaveDialog({
        title: 'Save Portable Universe Package',
        suggestedName: `${safeName}.mcuniverse`,
        filterName: 'Portable Universe Package (*.mcuniverse)',
        filterExt: 'mcuniverse',
      });
      if (path) {
        setExportDestination(path.endsWith('.mcuniverse') ? path : `${path}.mcuniverse`);
      }
    } catch {
      // Browser fallback or dialog canceled
    }
  };

  const handleExecuteExport = async () => {
    if (!selectedUniverseId) {
      setExportError('Please select a Universe to export.');
      return;
    }
    let dest = exportDestination.trim();
    if (!dest) {
      setExportError('Please specify an export destination path.');
      return;
    }
    if (!dest.toLowerCase().endsWith('.mcuniverse')) {
      dest = `${dest}.mcuniverse`;
      setExportDestination(dest);
    }

    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const doExport = async () => {
        return await api.portableUniverseExport(
          {
            universe_id: selectedUniverseId,
            snapshot_basis: 'last_saved_state',
            book_ids: Array.from(selectedBookIds),
            chapter_ids: Array.from(selectedChapterIds),
          },
          dest
        );
      };

      const result = onFlushSave
        ? await exportPortableAfterSave(onFlushSave, doExport)
        : await doExport();

      setExportSuccess(result);
    } catch (err: any) {
      setExportError(err?.message || 'Failed to export Portable Universe package.');
    } finally {
      setIsExporting(false);
    }
  };

  // =========================================================================
  // IMPORT STATE & 9-STEP GUIDED WORKFLOW
  // =========================================================================
  const [importPackagePath, setImportPackagePath] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<PortableInspection | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [targetHouseId, setTargetHouseId] = useState<string>(
    activeHouse?.id || (houses[0]?.id ?? 'house-central-1')
  );

  const [identityPolicy, setIdentityPolicy] = useState<ImportIdentityPolicy>('separate_copy');

  // Stable operation identity generated once per package import session
  const [operationId, setOperationId] = useState<string>(() => {
    return `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  });

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isCommitting, setIsCommitting] = useState(false);
  const [importRefreshed, setImportRefreshed] = useState(false);
  const [isOpeningImport, setIsOpeningImport] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const handleBrowseImportFile = async () => {
    try {
      const path = await api.pickFileDialog({
        title: 'Choose a Portable Universe (.mcuniverse) Package',
        filterName: 'Portable Universe Package (*.mcuniverse)',
        filterExt: 'mcuniverse',
      });
      if (path) {
        setImportPackagePath(path);
        await inspectPackage(path);
      }
    } catch {
      // Browser fallback or dialog canceled
    }
  };

  const inspectPackage = async (path: string) => {
    if (!path.trim()) return;
    setIsInspecting(true);
    setInspectError(null);
    setInspection(null);
    setPreview(null);
    setCommitResult(null);
    setImportRefreshed(false);

    // Assign a fresh stable operation ID for this package import session
    const newOpId = `import-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    setOperationId(newOpId);

    try {
      const insp = await api.portableUniverseInspect(path.trim());
      setInspection(insp);
      // Automatically request initial preview with stable operation ID
      await runPreview(path.trim(), targetHouseId, identityPolicy, newOpId);
    } catch (err: any) {
      setInspectError(err?.message || 'Package verification failed. File may be corrupt or incompatible.');
    } finally {
      setIsInspecting(false);
    }
  };

  const runPreview = async (
    pkgPath: string,
    houseId: string,
    policy: ImportIdentityPolicy,
    opId: string
  ) => {
    if (!pkgPath.trim() || !houseId) return;
    setIsPreviewing(true);
    setPreviewError(null);
    setCommitError(null);

    try {
      const prev = await api.portableUniverseImportPreview({
        package_path: pkgPath.trim(),
        target_house_id: houseId,
        policy,
        operation_id: opId,
      });
      setPreview(prev);
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to generate import preview.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePolicyChange = (newPolicy: ImportIdentityPolicy) => {
    setIdentityPolicy(newPolicy);
    if (inspection && importPackagePath) {
      runPreview(importPackagePath, targetHouseId, newPolicy, operationId);
    }
  };

  const handleHouseChange = (newHouseId: string) => {
    setTargetHouseId(newHouseId);
    if (inspection && importPackagePath) {
      runPreview(importPackagePath, newHouseId, identityPolicy, operationId);
    }
  };

  const handleRefreshPreview = () => {
    if (inspection && importPackagePath) {
      runPreview(importPackagePath, targetHouseId, identityPolicy, operationId);
    }
  };

  const handleCommitImport = async () => {
    if (!preview || !importPackagePath) {
      setCommitError('A validated import preview is required before committing.');
      return;
    }
    if (!preview.is_valid && identityPolicy === 'preserve') {
      setCommitError('Cannot commit: identity collisions detected under Preserve Identities mode.');
      return;
    }

    setIsCommitting(true);
    setImportRefreshed(false);
    setCommitError(null);
    let committed = false;

    try {
      const result = await api.portableUniverseImportCommit({
        operation_id: preview.operation_id,
        package_path: preview.package_path,
        target_house_id: preview.target_house_id,
        policy: preview.policy,
        expected_destination_fingerprint: preview.destination_fingerprint,
      });

      setCommitResult(result);
      committed = true;
      if (!onRefreshLibrary) throw new Error('Library refresh is unavailable. Reopen the notebook before navigating to the saved import.');
      await onRefreshLibrary();
      setImportRefreshed(true);
    } catch (err: any) {
      setCommitError(`${committed ? 'Import is saved, but refresh failed: ' : ''}${err?.message || 'Import commit failed. Source or destination may have changed.'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-foreground">
                Portable Universe Archive (.mcuniverse)
              </h2>
              <p className="text-xs text-muted-foreground">
                Full-fidelity archive for backup, moving, and sharing universes across Houses.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* DISTINCTION NOTICE */}
        <div className="px-6 py-2.5 bg-primary/5 border-b border-primary/20 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <span>
              <strong>Note:</strong> A <code>.mcuniverse</code> package contains complete planning, Web of Thought, and entity data. It is distinct from reader-facing <strong>Lorebook Publication (.md/.pdf)</strong>.
            </span>
          </div>
        </div>

        {/* PENDING JOURNAL RECOVERY BANNER */}
        {hasPendingJournal && (
          <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <strong>Interrupted Import Recovery Needed:</strong> A previous import was interrupted. To ensure notebook consistency, run recovery before proceeding.
              </div>
            </div>
            <button
              type="button"
              disabled={isRecovering}
              onClick={handleExecuteRecovery}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isRecovering && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Execute Recovery
            </button>
          </div>
        )}

        {/* RECOVERY SUCCESS/ERROR REPORT */}
        {recoveryReport && (
          <div className="px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Recovery complete: Recovered {recoveryReport.recovered_operations.length} pending operation(s).
            </span>
          </div>
        )}
        {recoveryError && (
          <div className="px-6 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{recoveryError}</span>
          </div>
        )}

        {/* TABS SELECTOR */}
        <div className="flex border-b border-border px-6 pt-3 gap-4 bg-muted/10">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={cn(
              'pb-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === 'export'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Export Universe (.mcuniverse)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={cn(
              'pb-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === 'import'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Upload className="w-3.5 h-3.5" />
            Import Universe (.mcuniverse)
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* =============================================================== */}
          {/* EXPORT WORKFLOW */}
          {/* =============================================================== */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              {/* 1. Universe Selection */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Select Universe to Export
                </label>
                <select
                  value={selectedUniverseId}
                  onChange={(e) => setSelectedUniverseId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {plan?.universes.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.archived ? '(Archived)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Scope & Inclusion Tree */}
              <div className="border border-border/80 rounded-xl p-4 bg-card/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                      Books &amp; Chapter Inclusion
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Worldbuilding lore documents are always exported completely. You can explicitly choose which Books and chapter prose to include.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllContent}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-muted-foreground">|</span>
                    <button
                      type="button"
                      onClick={handleWorldbuildingOnly}
                      className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
                    >
                      Worldbuilding Only
                    </button>
                  </div>
                </div>

                {universeBooks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    No books in this universe. All lore documents and planning records will be exported.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {universeBooks.map((b) => {
                      const chs = bookChaptersMap.get(b.id) || [];
                      const isBookChecked = selectedBookIds.has(b.id);

                      return (
                        <div key={b.id} className="border border-border/50 rounded-lg p-2.5 bg-background/50 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isBookChecked}
                                onChange={() => handleToggleBook(b.id)}
                                className="rounded border-border text-primary focus:ring-primary"
                              />
                              <span>{b.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono uppercase bg-muted/60 px-1.5 py-0.5 rounded">
                                {b.continuity}
                              </span>
                            </label>
                            <span className="text-[11px] text-muted-foreground">
                              {chs.length} chapter{chs.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          {/* Nested Chapters */}
                          {chs.length > 0 && isBookChecked && (
                            <div className="pl-6 pt-1 space-y-1.5 border-t border-border/30">
                              {chs.map((ch) => (
                                <label
                                  key={ch.id}
                                  className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedChapterIds.has(ch.id)}
                                    onChange={() => handleToggleChapter(b.id, ch.id)}
                                    className="rounded border-border text-primary focus:ring-primary"
                                  />
                                  <span>{ch.title}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Scope Summary */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Selected: <strong>{selectedBookIds.size}</strong> book(s), <strong>{selectedChapterIds.size}</strong> chapter(s).
                  </span>
                  <span>Unselected chapters retain structural outline without prose.</span>
                </div>
              </div>

              {/* 3. Destination Picker */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Package Destination Path (.mcuniverse)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={exportDestination}
                    onChange={(e) => setExportDestination(e.target.value)}
                    placeholder="C:/Backups/MyUniverse.mcuniverse"
                    className="flex-1 px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseExportDestination}
                    className="px-3.5 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Browse...
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Destination cannot overwrite an existing file. A distinct filename is required.
                </p>
              </div>

              {/* Error feedback */}
              {exportError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}

              {/* Success feedback */}
              {exportSuccess && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Universe Package Exported Successfully!</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <span className="block font-semibold text-foreground">Documents</span>
                      {exportSuccess.document_count} included
                    </div>
                    <div>
                      <span className="block font-semibold text-foreground">Books</span>
                      {exportSuccess.book_count} included
                    </div>
                    <div>
                      <span className="block font-semibold text-foreground">Size</span>
                      {(exportSuccess.size / 1024).toFixed(1)} KB
                    </div>
                    <div>
                      <span className="block font-semibold text-foreground">Package ID</span>
                      <span className="font-mono">{exportSuccess.manifest.package_id.slice(0, 8)}...</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground break-all">
                    SHA-256: <span className="font-mono">{exportSuccess.archive_sha256}</span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isExporting || !selectedUniverseId || !exportDestination}
                  onClick={handleExecuteExport}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-gold-hover transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving &amp; Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Export Package
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* IMPORT WORKFLOW (9-STEP GUIDED WORKFLOW) */}
          {/* =============================================================== */}
          {activeTab === 'import' && (
            <div className="space-y-6">
              {/* Step 1: Package Selection */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  1. Select .mcuniverse Package File
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importPackagePath}
                    onChange={(e) => setImportPackagePath(e.target.value)}
                    placeholder="C:/Packages/Aetheria.mcuniverse"
                    className="flex-1 px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseImportFile}
                    className="px-3.5 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Browse...
                  </button>
                  <button
                    type="button"
                    disabled={isInspecting || !importPackagePath.trim()}
                    onClick={() => inspectPackage(importPackagePath)}
                    className="px-3.5 py-2 rounded-xl bg-muted text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isInspecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Inspect'}
                  </button>
                </div>
              </div>

              {/* Inspection Failure feedback */}
              {inspectError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{inspectError}</span>
                </div>
              )}

              {/* Step 2: Inspection Package Card */}
              {inspection && (
                <div className="border border-border/80 rounded-xl p-4 bg-card/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Verified Package: {inspection.universe.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Source House: {inspection.manifest.source_house.name} • Created: {new Date(inspection.manifest.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Format v{inspection.manifest.format_version} Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Documents</span>
                      <span className="font-semibold">{inspection.document_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Books</span>
                      <span className="font-semibold">{inspection.book_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Milestones</span>
                      <span className="font-semibold">{inspection.milestone_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Relationships</span>
                      <span className="font-semibold">{inspection.relationship_count}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Destination House Selection */}
              {inspection && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      2. Destination House
                    </label>
                    <select
                      value={targetHouseId}
                      onChange={(e) => handleHouseChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {houses.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} {h.id === activeHouse?.id ? '(Active)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Step 4: Identity Policy Selection */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      3. Identity Policy
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 p-2 rounded-lg border border-border/60 bg-background/50 cursor-pointer">
                        <input
                          type="radio"
                          name="identity_policy"
                          value="separate_copy"
                          checked={identityPolicy === 'separate_copy'}
                          onChange={() => handlePolicyChange('separate_copy')}
                          className="mt-0.5 text-primary focus:ring-primary"
                        />
                        <div>
                          <div className="text-xs font-medium text-foreground">Separate Copy (Remap IDs)</div>
                          <div className="text-[11px] text-muted-foreground">
                            Assigns clean, unique IDs. Guaranteed collision-free import into the target House.
                          </div>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 rounded-lg border border-border/60 bg-background/50 cursor-pointer">
                        <input
                          type="radio"
                          name="identity_policy"
                          value="preserve"
                          checked={identityPolicy === 'preserve'}
                          onChange={() => handlePolicyChange('preserve')}
                          className="mt-0.5 text-primary focus:ring-primary"
                        />
                        <div>
                          <div className="text-xs font-medium text-foreground">Preserve Original IDs</div>
                          <div className="text-[11px] text-muted-foreground">
                            Retains source UUIDs. Rejects import if any document or entity ID already exists.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Import Preview & Diagnostics */}
              {preview && (
                <div className="border border-border/80 rounded-xl p-4 bg-card/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        4. Import Plan Preview &amp; Collision Diagnostics
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Target: {preview.proposed_universe_name} in {preview.target_house_name}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPreviewing}
                      onClick={handleRefreshPreview}
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
                    >
                      <RefreshCw className={cn('w-3.5 h-3.5', isPreviewing && 'animate-spin')} />
                      Refresh Preview
                    </button>
                  </div>

                  {/* Summary grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-background border border-border/40">
                      <span className="text-[10px] text-muted-foreground block">Documents</span>
                      <span className="font-semibold">{preview.summary.documents_count}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border/40">
                      <span className="text-[10px] text-muted-foreground block">Books</span>
                      <span className="font-semibold">{preview.summary.books_count}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border/40">
                      <span className="text-[10px] text-muted-foreground block">ID Remappings</span>
                      <span className="font-semibold">{Object.keys(preview.id_mappings).length}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border/40">
                      <span className="text-[10px] text-muted-foreground block">Collisions</span>
                      <span className={cn('font-semibold', preview.collisions.length > 0 ? 'text-destructive' : 'text-emerald-400')}>
                        {preview.collisions.length}
                      </span>
                    </div>
                  </div>

                  {/* Collisions list if any */}
                  {preview.collisions.length > 0 && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
                      <div className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Identity Collisions ({preview.collisions.length})
                      </div>
                      <div className="space-y-1 max-h-36 overflow-y-auto text-[11px] text-destructive">
                        {preview.collisions.map((col, idx) => (
                          <div key={idx} className="flex items-start gap-1">
                            <span>•</span>
                            <span>{col.message} ({col.destination_location})</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        Switch to <strong>Separate Copy (Remap IDs)</strong> to import without collisions.
                      </div>
                    </div>
                  )}

                  {/* Proposed Universe ID notice */}
                  <div className="text-[11px] text-muted-foreground">
                    Operation ID: <span className="font-mono">{preview.operation_id}</span> • Policy: <strong>{preview.policy}</strong>
                  </div>
                </div>
              )}

              {/* Preview error feedback */}
              {previewError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {/* Commit error feedback */}
              {commitError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{commitError}</span>
                </div>
              )}

              {/* Step 6: Commit Success Card */}
              {commitResult && (
                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-3">
                  <div className="flex items-center gap-2 font-semibold text-emerald-400 text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Universe Imported Successfully!</span>
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    <strong>{commitResult.universe_name}</strong> was published to House <strong>{commitResult.house_name}</strong>.
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Documents</span>
                      <span className="font-semibold">{commitResult.documents_imported}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Archived</span>
                      <span className="font-semibold">{commitResult.archived_documents_imported}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Assets</span>
                      <span className="font-semibold">{commitResult.assets_imported}</span>
                    </div>
                  </div>

                  {!importRefreshed && <button type="button" disabled={isOpeningImport} className="text-primary underline text-xs" onClick={async () => {
                    setIsOpeningImport(true);
                    try { if (!onRefreshLibrary) throw new Error('Library refresh is unavailable. Reopen the notebook.'); await onRefreshLibrary(); setImportRefreshed(true); setCommitError(null); }
                    catch (err) { setCommitError(err instanceof Error ? err.message : String(err)); }
                    finally { setIsOpeningImport(false); }
                  }}>Retry library refresh</button>}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={!importRefreshed || isOpeningImport}
                      onClick={async () => {
                        setIsOpeningImport(true); setCommitError(null);
                        try {
                          if (onOpenImportedUniverse) await onOpenImportedUniverse(commitResult.universe_id, commitResult.house_id);
                          else {
                            if (commitResult.house_id !== (activeHouse?.id || 'house-default') || !houseUniverses(plan, commitResult.house_id, houses).some(u => u.id === commitResult.universe_id)) throw new Error('Destination navigation is unavailable. The import is saved; refresh and open its House.');
                            onSelectUniverse(commitResult.universe_id);
                          }
                          onClose();
                        } catch (err) { setCommitError(err instanceof Error ? err.message : String(err)); }
                        finally { setIsOpeningImport(false); }
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <span>Open Imported Universe</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!commitResult && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={
                      isCommitting ||
                      !preview ||
                      (!preview.is_valid && identityPolicy === 'preserve')
                    }
                    onClick={handleCommitImport}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-gold-hover transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  >
                    {isCommitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Committing Import...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        Commit Universe Import
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
