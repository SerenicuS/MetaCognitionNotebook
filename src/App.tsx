import { DEFAULT_HOUSE_ID, isManuscriptEnabled, getEnabledStudios } from '@/utils/house';
import {EntityArchivePreview} from '@/components/common/EntityArchivePreview';
import {entityArchiveOperation} from '@/services/entityArchive';
import {entityDeletionImpact} from '@/utils/relationships';
import {isCatalog} from '@/utils/thought';
import {preparePlanMutation, type PlanMutation} from '@/utils/relationships';
import { HelpProvider, useHelp } from '@/components/common/HelpCenter';
import { guideForStudio } from '@/help/content';
import type { Continuity, Plan, Thought } from '@/utils/thought';
import { createBookInPlan, resolveBasePlan, resolveEntityUniverse } from '@/utils/universe';
import { bindTheme } from '@/utils/theme';
import { VaultCoordinator, reconcileActivation, type ActivationStatus, type VaultPhase, type RunVault } from '@/services/vault';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DocumentDetail, DocumentMetadata, DocumentType, LibraryInfo, LorebookEntryType, PlanStatus, SaveStatus, SavePreferences } from '@/types';
import { loadSavePreferences, persistSavePreferences } from '@/utils/savePreferences';
import { api, isTauri } from '@/services/api';
import { CommandQueue, ExitCoordinator, MutationQueue, SaveCoordinator, flushWorkspace, coordinateDocumentMove, coordinateUniverseMove } from '@/services/autosave';
import { preserveWorkshop, reconcileDocumentMetadata, type OrganizationPatch } from '@/utils/organization';
import { AppLayout } from '@/components/layout/AppLayout';
import { CreateDocumentModal } from '@/components/common/CreateDocumentModal';
import { CreateManuscriptModal } from '@/components/manuscript/CreateManuscriptModal';
import { SearchModal } from '@/components/common/SearchModal';
import { SettingsModal } from '@/components/common/SettingsModal';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { HouseManagementModal } from '@/components/house/HouseManagementModal';
import { MoveDocumentModal } from '@/components/house/MoveDocumentModal';
import { MoveUniverseModal } from '@/components/house/MoveUniverseModal';
import { WritingAtmospherePlayer } from '@/components/atmosphere/WritingAtmospherePlayer';
import type { HouseRecord } from '@/types';
import type { Universe } from '@/utils/thought';
import { ToastProvider, useToast } from '@/components/common/Toast';

export interface CreateModalOptions {
  universeId?: string;
  universeName?: string;
  entryType?: LorebookEntryType | 'book';
  action?: 'create_universe' | 'add_to_universe';
  initialTitle?: string;
}

const formatError = (err: unknown): string => {
  if (!err) return 'An unknown error occurred';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message;
  }
  return String(err);
};

interface PendingEdit {
  docId: string;
  content: string;
  metadataJson?: string;
  revision: number;
}

const AppContent: React.FC = () => {
  const { success, error, info } = useToast();
  const { helpOpen, openHelp, closeHelp } = useHelp();

  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentDetail | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DocumentType | 'all'>('all');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [libraryInfo, setLibraryInfo] = useState<LibraryInfo | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const [tagCatalog, setTagCatalog] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const latestPlanRef = useRef<Plan | null>(null);
  const houseSwitchGenerationRef = useRef(0);
  const libraryGeneration=useRef(0);
  const [planStatus, setPlanStatus] = useState<PlanStatus>('not_loaded');
  const [planError, setPlanError] = useState<string | null>(null);
  const [archiveTarget,setArchiveTarget]=useState<DocumentMetadata|null>(null);
  const [archivingEntity,setArchivingEntity]=useState(false);

  // House of Thoughts State
  const [houses, setHouses] = useState<HouseRecord[]>([]);
  const [isHousesLoading, setIsHousesLoading] = useState(true);
  const [activeHouseId, setActiveHouseId] = useState<string>(() => {
    return localStorage.getItem('mc_active_house_id') || 'house-default';
  });
  const [isHouseManagementOpen, setIsHouseManagementOpen] = useState(false);
  const [houseManagementTab, setHouseManagementTab] = useState<'active' | 'archived' | 'integrity'>('active');
  const [moveDocTarget, setMoveDocTarget] = useState<DocumentDetail | DocumentMetadata | null>(null);
  const [moveUniverseTarget, setMoveUniverseTarget] = useState<Universe | null>(null);

  // Save preferences (automatic vs manual, debounce delay)
  const [savePreferences, setSavePreferences] = useState<SavePreferences>(() => loadSavePreferences());
  const savePreferencesRef = useRef<SavePreferences>(savePreferences);
  useEffect(() => {
    savePreferencesRef.current = savePreferences;
  }, [savePreferences]);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateManuscriptOpen, setIsCreateManuscriptOpen] = useState(false);
  const [createDefaultType, setCreateDefaultType] = useState<DocumentType>('poetry');
  const [createModalOptions, setCreateModalOptions] = useState<CreateModalOptions | undefined>(undefined);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isUnsavedExiting, setIsUnsavedExiting] = useState(false);
  const pendingNavActionRef = useRef<(() => Promise<void> | void) | null>(null);

  // Autosave revision and pending edit tracking
  const latestRevisionRef = useRef<number>(0);
  const savedRevisionRef = useRef<number>(0);
  const pendingEditRef = useRef<PendingEdit | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveCoordinator = useRef(new SaveCoordinator());
  const mutationQueue = useRef(new MutationQueue());
  const commandQueue = useRef(new CommandQueue());

  const vaultCoordinator = useRef(new VaultCoordinator());
  const [activation, setActivation] = useState<ActivationStatus | null>(null);
  const [restartError, setRestartError] = useState('');
  const [vaultPhase, setVaultPhase] = useState<VaultPhase | null>(null);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    return (localStorage.getItem('mc_theme') as 'dark' | 'light' | 'system') || 'dark';
  });

  // Apply theme to html element
  useEffect(() => {
    localStorage.setItem('mc_theme', theme);
    return bindTheme(theme, document.documentElement, window.matchMedia('(prefers-color-scheme: dark)'));
  }, [theme]);

  // Load initial library data
  const loadLibrary = useCallback(async (openFirst = false) => {
    const generation=++libraryGeneration.current;
    try {
      setPlanStatus(prev => (prev === 'not_loaded' ? 'loading' : prev));
      const [docs, libInfo, tags, thoughtRes, houseList] = await Promise.all([
        api.listDocuments(),
        api.getLibraryInfo(),
        api.listTags(),
        api.thoughtGet().then(
          res => ({ ok: true as const, res }),
          err => ({ ok: false as const, err })
        ),
        api.listHouses().catch(() => []),
      ]);
      if(generation!==libraryGeneration.current)return;
      setDocuments(docs);
      setLibraryInfo(libInfo);
      setTagCatalog(tags);
      setHouses(houseList);
      setIsHousesLoading(false);
      if (thoughtRes.ok) {
        if (thoughtRes.res.plan) {
          latestPlanRef.current = thoughtRes.res.plan;
          setPlan(thoughtRes.res.plan);
          setPlanStatus('loaded');
          setPlanError(null);
        } else {
          latestPlanRef.current = null;
          setPlan(null);
          setPlanStatus('no_catalog');
          setPlanError(null);
        }
      } else {
        const errorMsg = formatError(thoughtRes.err);
        console.warn('Failed to load thought plan:', errorMsg);
        latestPlanRef.current = null;
        setPlan(null);
        setPlanStatus('error');
        setPlanError(errorMsg);
      }

      // Auto-open first document in active house if none active
      if (openFirst) {
        const curHouseId = localStorage.getItem('mc_active_house_id') || 'house-default';
        const houseDocs = docs.filter(d => (d.house_id || 'house-default') === curHouseId && !isCatalog(d));
        if (houseDocs.length > 0) {
          setIsLoadingDoc(true);
          try {
            const detail = await api.getDocument(houseDocs[0].id);
            setActiveDoc(detail);
            void recordOpened(detail.metadata.id);
            latestRevisionRef.current = 0;
            savedRevisionRef.current = 0;
            pendingEditRef.current = null;
          } finally {
            setIsLoadingDoc(false);
          }
        } else {
          setActiveDoc(null);
        }
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) { void loadLibrary(true); return; }
    api.vaultActivationStatus().then(status => {
      setActivation(status);
      if (status.restart_required) vaultCoordinator.current.requireRestart();
      else {
        void loadLibrary(true);
        if (status.preserved_backup) info('Notebook recovery', status.message);
      }
    }).catch(() => {
      vaultCoordinator.current.requireRestart();
      setRestartError('Notebook selection could not be checked. Close and reopen the app before editing.');
    });
  }, []);

  /**
   * Flush any pending unsaved changes immediately to disk and database.
   * Prevents race conditions by checking revisions.
   */
  const flushSave = useCallback(
    async (targetDocId?: string): Promise<boolean> => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const saved = await flushWorkspace(mutationQueue.current, () =>
        saveCoordinator.current.flush(() => commandQueue.current.run(async () => {
        const pending = pendingEditRef.current;
        if (!pending) { setSaveStatus(mutationQueue.current.hasFailure ? 'error' : mutationQueue.current.pendingCount ? 'saving' : 'saved'); return 'saved' as const; }
        if (targetDocId && pending.docId !== targetDocId) return 'saved' as const;
        if (pending.revision <= savedRevisionRef.current) { setSaveStatus(mutationQueue.current.hasFailure ? 'error' : mutationQueue.current.pendingCount ? 'saving' : 'saved'); return 'saved' as const; }

        const revisionToSave = pending.revision;
        const docIdToSave = pending.docId;
        const contentToSave = pending.content;
        const metadataJsonToSave = pending.metadataJson;

        setSaveStatus('saving');

        try {
          const updatedMeta = await api.saveDocument(
            docIdToSave,
            contentToSave,
            undefined,
            undefined,
            metadataJsonToSave
          );

          // Advance saved revision counter if this save is newer
          if (revisionToSave > savedRevisionRef.current) {
            savedRevisionRef.current = revisionToSave;
          }

          // Update document in metadata list.
          setDocuments(prev => prev.map(d => d.id === updatedMeta.id ? updatedMeta : d));

          // Update activeDoc metadata, preserving any newer local content in memory
          setActiveDoc(prev => {
            if (!prev || prev.metadata.id !== docIdToSave) return prev;
            return {
              ...prev,
              metadata: pendingEditRef.current?.docId === docIdToSave && pendingEditRef.current.metadataJson !== undefined
                ? { ...updatedMeta, metadata_json: preserveWorkshop(pendingEditRef.current.metadataJson, updatedMeta.metadata_json) }
                : updatedMeta,
              content:
                pendingEditRef.current?.docId === docIdToSave
                  ? pendingEditRef.current.content
                  : contentToSave,
            };
          });

          if (latestRevisionRef.current === revisionToSave) {
            setSaveStatus(mutationQueue.current.hasFailure ? 'error' : mutationQueue.current.pendingCount ? 'saving' : 'saved');
            return 'saved' as const;
          }
          setSaveStatus('editing');
          return 'more' as const;
        } catch (err) {
          console.error('Failed to save document:', err);
          const errMsg = formatError(err);
          setSaveStatus('error');
          error('Save Failed', `${errMsg}. Your edits remain in this window. Press Ctrl+S to retry.`);
          return 'error' as const;
        }
      })));
      setOrganizationBusy(mutationQueue.current.pendingCount > 0);
      if (!saved) setSaveStatus('error');
      return saved;
    },
    [error]
  );

  const activeHouse = useMemo(() => {
    return houses.find(h => h.id === activeHouseId && !h.archived)
      || houses.find(h => h.id === 'house-default')
      || (houses.length > 0 ? houses[0] : null);
  }, [houses, activeHouseId]);

  const houseDocuments = useMemo(() => {
    const curHouseId = activeHouse?.id || activeHouseId || 'house-default';
    return documents.filter(d => (d.house_id || 'house-default') === curHouseId);
  }, [documents, activeHouse?.id, activeHouseId]);

  const handleSwitchHouse = useCallback(async (targetHouseId: string) => {
    if (targetHouseId === activeHouseId) return;
    const target = houses.find(h => h.id === targetHouseId && !h.archived);
    if (!target) {
      error('Cannot Switch House', 'Selected House does not exist or is archived.');
      return;
    }

    const saved = await flushSave();
    if (!saved) {
      error('Switch Blocked', 'Unsaved changes could not be saved. Resolve errors before switching Houses.');
      return;
    }

    if (mutationQueue.current.pendingCount > 0) {
      setOrganizationBusy(true);
      await mutationQueue.current.flush();
      setOrganizationBusy(false);
    }
    await commandQueue.current.waitForIdle();

    houseSwitchGenerationRef.current++;
    localStorage.removeItem('mc_active_universe_id');
    localStorage.removeItem('mc_selected_book_id');
    setActiveHouseId(targetHouseId);
    localStorage.setItem('mc_active_house_id', targetHouseId);

    if (activeDoc && (activeDoc.metadata.house_id || 'house-default') !== targetHouseId) {
      setActiveDoc(null);
    }

    if (selectedCategory !== 'all') {
      if (selectedCategory === 'manuscript') {
        if (!target.manuscript_tools_enabled) {
          setSelectedCategory('all');
        }
      } else if (!target.enabled_studios.includes(selectedCategory)) {
        setSelectedCategory(target.enabled_studios[0] || 'all');
      }
    }

    await loadLibrary();
    success('Switched House', `Active workspace is now "${target.name}".`);
  }, [activeHouseId, houses, flushSave, activeDoc, selectedCategory, loadLibrary, error, success]);

  const handleOpenMoveUniverse = useCallback((universeId: string) => {
    const u = plan?.universes.find(u => u.id === universeId);
    if (u) setMoveUniverseTarget(u);
  }, [plan?.universes]);

  const handleCoordinateDocumentMove = useCallback((docId: string, targetHouseId: string) => {
    return coordinateDocumentMove(
      () => flushSave(docId),
      commandQueue.current,
      () => api.moveDocumentToHouse(docId, targetHouseId),
      (updatedMeta) => {
        setDocuments(prev => prev.map(d => d.id === updatedMeta.id ? updatedMeta : d));
        if (activeDoc?.metadata.id === updatedMeta.id) {
          setActiveDoc(prev => prev ? { ...prev, metadata: updatedMeta } : prev);
        }
      }
    );
  }, [flushSave, activeDoc?.metadata.id]);

  const handleCoordinateUniverseMove = useCallback((universeId: string, targetHouseId: string) => {
    return coordinateUniverseMove(
      () => flushSave(),
      commandQueue.current,
      () => api.moveUniverseToHouse(universeId, targetHouseId),
      async (res) => {
        await loadLibrary();
        return res;
      }
    );
  }, [flushSave, loadLibrary]);

  const handleSavePreferencesChange = useCallback((next: SavePreferences) => {
    const persisted = persistSavePreferences(next);
    setSavePreferences(persisted);
    savePreferencesRef.current = persisted;
    if (persisted.mode === 'manual' && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (pendingEditRef.current && latestRevisionRef.current > savedRevisionRef.current) {
        setSaveStatus('unsaved');
      }
    }
  }, []);

  /**
   * Handle edits from studio components.
   * In automatic mode: records pending changes and resets debounce timer.
   * In manual mode: records pending changes in memory and marks status as unsaved.
   */
  const handleSaveDocument = useCallback(
    (content: string, metadataJson?: string) => {
      if (!activeDoc || vaultCoordinator.current.restartRequired) return;

      const docId = activeDoc.metadata.id;
      if (content === docId || (docId && content.trim() === docId.trim())) {
        const err = new Error(`Refusing to save: document body matches document ID '${docId}'`);
        console.error(err.message);
        throw err;
      }
      latestRevisionRef.current += 1;
      const revision = latestRevisionRef.current;

      pendingEditRef.current = {
        docId,
        content,
        metadataJson,
        revision,
      };

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (savePreferencesRef.current.mode === 'manual') {
        setSaveStatus('unsaved');
        return;
      }

      setSaveStatus('editing');
      const delayMs = Math.max(1, Math.min(10, savePreferencesRef.current.debounceSeconds)) * 1000;
      saveTimerRef.current = setTimeout(() => {
        flushSave(docId);
      }, delayMs);
    },
    [activeDoc, flushSave]
  );

  const acceptOrganization = (updated: DocumentMetadata) => {
    setTagCatalog(previous => Array.from(new Set([...previous, ...updated.tags])));
    setDocuments(prev => prev.map(doc => doc.id === updated.id ? updated : doc));
    setActiveDoc(prev => reconcileDocumentMetadata(prev, updated, pendingEditRef.current));
  };

  const runOrganization = async (action: () => Promise<void>): Promise<boolean> => {
    if (vaultCoordinator.current.busy) return false;
    setOrganizationBusy(true);
    setSaveStatus('saving');
    const saved = await mutationQueue.current.enqueue(async () => {
      try { await commandQueue.current.run(action); }
      catch (err) {
        error('Organization Not Saved', `${formatError(err)}. Press Ctrl+S to retry. Changes remain queued in this window.`);
        throw err;
      }
    });
    setOrganizationBusy(mutationQueue.current.pendingCount > 0);
    setSaveStatus(saved ? latestRevisionRef.current > savedRevisionRef.current ? (savePreferencesRef.current.mode === 'manual' ? 'unsaved' : 'editing') : 'saved' : 'error');
    return saved;
  };

  const handleThoughtSave = (expected: () => number, edit: PlanMutation, acknowledge: (result: Thought) => void) => {
    if(mutationQueue.current.hasFailure){error('Changes still queued','Use Ctrl+S / Retry or explicitly cancel failed queued changes before submitting another edit.');return Promise.resolve(false);}
    const prepare=preparePlanMutation(()=>latestPlanRef.current,expected,edit);
    let acknowledged=false;
    return runOrganization(async () => {
      const previousUniverseIds = new Set(latestPlanRef.current?.universes.map(u => u.id) || []);
      const attempt=prepare();
      // External conflicts stay failures. Never overwrite a fresh disk plan with a stale snapshot.
      const newActive=attempt.plan.relationships.filter(r=>!r.archived&&!latestPlanRef.current?.relationships.some(old=>old.id===r.id&&!old.archived));
      if(newActive.length){
        const available=new Set((await api.listDocuments('lorebook')).filter(d=>!isCatalog(d)).map(d=>d.id));
        if(newActive.some(r=>!available.has(r.source_id)||!available.has(r.target_id)))throw new Error('An endpoint is missing or archived. Cancel this queued change and review the current entity list.');
      }
      const result=await api.thoughtSave(attempt.expected,attempt.plan);
      libraryGeneration.current++;
      latestPlanRef.current=result.plan;
      setPlan(result.plan);
      setPlanStatus(result.plan?'loaded':'no_catalog');setPlanError(null);

      // F-01: Assign any newly created universes to the active House with safe rollback on failure
      const newUniverses = (result.plan?.universes || []).filter(u => !previousUniverseIds.has(u.id));
      const targetHouseId = activeHouseId || DEFAULT_HOUSE_ID;
      for (const nu of newUniverses) {
        try {
          await api.assignUniverseToHouse(nu.id, targetHouseId);
        } catch (assignErr) {
          console.error(`Failed to assign universe '${nu.id}' to house '${targetHouseId}':`, assignErr);
          // Rollback plan revision to avoid orphaned records
          if (latestPlanRef.current) {
            try {
              await api.thoughtSave(result.plan!.revision, latestPlanRef.current);
            } catch (rbErr) {
              console.error('Plan rollback failed after house assignment failure:', rbErr);
            }
          }
          throw new Error(`Failed to register Universe '${nu.name || nu.id}' to House '${targetHouseId}': ${formatError(assignErr)}`);
        }
      }

      acknowledge(result);acknowledged=true;
      await loadLibrary();
    }).then(ok=>acknowledged||ok);
  };

  const handleOrganization = (id: string, patch: OrganizationPatch) => runOrganization(async () => {
    acceptOrganization(await api.updateOrganization(id, patch));
  });
  const recordOpened = (id: string) => handleOrganization(id, { opened: true });
  const handleManageTag = (oldName: string, newName?: string) => runOrganization(async () => {
    const report = await api.manageTag(oldName, newName);
    report.updated.forEach(acceptOrganization);
    setTagCatalog(await api.listTags());
    // Publish successes even on partial failure; retry only documents still carrying the old tag.
    if (report.errors.length) throw new Error(`${report.updated.length} documents updated; ${report.errors.join('; ')}`);
  });

  const runVault: RunVault = async (phase, action) => {
    if (vaultCoordinator.current.busy) throw new Error('A Vault operation is already running.');
    closeHelp();
    setVaultPhase(phase);
    try { return await vaultCoordinator.current.run(() => flushSave(), () => commandQueue.current.run(async () => {
      try { return await action(); }
      finally {
        if (phase === 'Activating' || phase === 'Returning') {
          try { setActivation(await reconcileActivation(vaultCoordinator.current, api.vaultActivationStatus)); }
          catch { setRestartError('Activation outcome could not be confirmed. Editing is blocked. Close and reopen the app; startup will validate the saved selection.'); }
        }
      }
    })); }
    finally { setVaultPhase(null); }
  };

  // Manual retry for save failure
  const handleRetrySave = useCallback(async (): Promise<boolean> => {
    return await flushSave(activeDoc?.metadata.id);
  }, [activeDoc?.metadata.id, flushSave]);

  // Manual save triggered via header button or Ctrl+S
  const handleManualSave = useCallback(async (): Promise<boolean> => {
    return await flushSave(activeDoc?.metadata.id);
  }, [activeDoc?.metadata.id, flushSave]);

  // Check if current document has unsaved edits in memory
  const hasUnsavedChanges = useCallback((): boolean => {
    return !!(
      pendingEditRef.current &&
      latestRevisionRef.current > savedRevisionRef.current
    );
  }, []);

  // Perform actual document selection after any needed save/confirm
  const performSelectDocument = async (id: string, docType?: DocumentType) => {
    if (!id) {
      if (!(await flushSave())) return;
      setActiveDoc(null);
      return;
    }
    if (activeDoc?.metadata.id === id) return;

    // Flush any pending unsaved writing from current document before switching
    if (!(await flushSave())) return;

    const loadGen = houseSwitchGenerationRef.current;
    setIsLoadingDoc(true);
    try {
      const detail = await api.getDocument(id);
      if (houseSwitchGenerationRef.current !== loadGen) {
        return;
      }

      // Reset revision counters for newly opened document
      latestRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      pendingEditRef.current = null;

      setActiveDoc(detail);
      void recordOpened(id);

      // Reconcile active house if opened document belongs to another house
      const docHouseId = detail.metadata.house_id || 'house-default';
      const curHouseId = activeHouse?.id || activeHouseId || 'house-default';
      if (docHouseId !== curHouseId) {
        setActiveHouseId(docHouseId);
        localStorage.setItem('mc_active_house_id', docHouseId);
      }

      if (docType && selectedCategory !== 'all' && selectedCategory !== docType) {
        setSelectedCategory(docType);
      }
      setSaveStatus('saved');
    } catch (err) {
      error('Failed to Open', formatError(err));
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Select document with unsaved changes interception in manual mode
  const handleSelectDocument = async (id: string, docType?: DocumentType) => {
    if (vaultCoordinator.current.busy) return;
    if (activeDoc?.metadata.id === id) return;

    if (
      savePreferencesRef.current.mode === 'manual' &&
      hasUnsavedChanges() &&
      activeDoc &&
      activeDoc.metadata.id !== id
    ) {
      pendingNavActionRef.current = () => performSelectDocument(id, docType);
      setIsUnsavedExiting(false);
      setShowUnsavedModal(true);
      return;
    }

    await performSelectDocument(id, docType);
  };

  const performSelectCategory = async (category: DocumentType | 'all') => {
    setSelectedCategory(category);
    if (category !== 'all') {
      if (!activeDoc || activeDoc.metadata.doc_type !== category) {
        if (category === 'lorebook') {
          setActiveDoc(null);
        } else {
          const matchingDoc = houseDocuments.find((d) => d.doc_type === category && !isCatalog(d));
          if (matchingDoc) {
            await performSelectDocument(matchingDoc.id, category);
          } else {
            setActiveDoc(null);
          }
        }
      }
    }
  };

  // Switch category / studio with automatic flush of pending changes or confirmation
  const handleSelectCategory = async (category: DocumentType | 'all') => {
    if (vaultCoordinator.current.busy) return;
    if (category === selectedCategory) return;

    if (
      savePreferencesRef.current.mode === 'manual' &&
      hasUnsavedChanges() &&
      activeDoc &&
      category !== activeDoc.metadata.doc_type
    ) {
      pendingNavActionRef.current = async () => {
        if (!(await flushSave())) return;
        await performSelectCategory(category);
      };
      setIsUnsavedExiting(false);
      setShowUnsavedModal(true);
      return;
    }

    if (!(await flushSave())) return;
    await performSelectCategory(category);
  };

  const handleUnsavedModalSave = async () => {
    const ok = await flushSave(activeDoc?.metadata.id);
    if (ok) {
      setShowUnsavedModal(false);
      const action = pendingNavActionRef.current;
      pendingNavActionRef.current = null;
      if (action) await action();
    }
  };

  const handleUnsavedModalDiscard = async () => {
    pendingEditRef.current = null;
    latestRevisionRef.current = 0;
    savedRevisionRef.current = 0;
    setSaveStatus('saved');
    setShowUnsavedModal(false);
    const action = pendingNavActionRef.current;
    pendingNavActionRef.current = null;
    if (action) await action();
  };

  const handleUnsavedModalCancel = () => {
    pendingNavActionRef.current = null;
    setShowUnsavedModal(false);
  };

  const handleSaveArbitraryDocument = async (
    id: string,
    content?: string,
    title?: string,
    tags?: string[],
    metadataJson?: string,
    options?: { isMetadataOnly?: boolean }
  ) => {
    // F-03 Guard: Document UUID can never be supplied as body
    if (content !== undefined && (content === id || (id && content.trim() === id.trim()))) {
      const err = new Error(`Refusing to save arbitrary document: body matches document ID '${id}'`);
      console.error(err.message);
      throw err;
    }

    const savedDoc = await api.saveDocument(id, content, title, tags, metadataJson, options);
    setActiveDoc(prev => (prev && prev.metadata.id === id ? { metadata: savedDoc, content: options?.isMetadataOnly ? prev.content : (content ?? prev.content) } : prev));
    await loadLibrary();
  };

  // Create document with automatic flush of previous document
  const handleCreateDocument = async (
    docType: DocumentType,
    title: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[]
  ) => {
    if (!(await flushSave())) throw new Error('Save the current document before creating another.');

    try {
      const newDoc = await api.createDocument(
        docType,
        title,
        undefined,
        initialContent,
        metadataJson,
        tags,
        activeHouse?.id || activeHouseId
      );

      latestRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      pendingEditRef.current = null;

      if (docType === 'lorebook' && metadataJson) {
        try {
          const parsed = JSON.parse(metadataJson);
          if (parsed.universe_id) {
            localStorage.setItem('mc_active_universe_id', parsed.universe_id);
          }
        } catch {
          // ignore
        }
      }

      setActiveDoc(newDoc);
      setSelectedCategory(docType);
      setSaveStatus('saved');
      await loadLibrary();
      void recordOpened(newDoc.metadata.id);
      success('Created Successfully', `Created "${newDoc.metadata.title}" in ${docType} studio.`);
    } catch (err) {
      error('Creation Failed', formatError(err));
      throw err;
    }
  };

  const handleOpenCreateModal = useCallback((
    type?: DocumentType,
    options?: CreateModalOptions
  ) => {
    if (type === 'manuscript' || (!type && selectedCategory === 'manuscript')) {
      if (!isManuscriptEnabled(activeHouse)) {
        error('Creation Blocked', 'Manuscript Tools are not enabled for this House.');
        return;
      }
      setIsCreateManuscriptOpen(true);
      return;
    }

    const enabled = getEnabledStudios(activeHouse);
    if (activeHouse && enabled.length === 0) {
      error('Creation Blocked', 'No writing studios are enabled for this House.');
      return;
    }

    let targetType: DocumentType;
    if (type && enabled.includes(type as any)) {
      targetType = type;
    } else if (selectedCategory !== 'all' && selectedCategory !== 'manuscript' && enabled.includes(selectedCategory as any)) {
      targetType = selectedCategory;
    } else if (activeDoc && enabled.includes(activeDoc.metadata.doc_type as any)) {
      targetType = activeDoc.metadata.doc_type;
    } else {
      targetType = (enabled[0] as DocumentType) || 'poetry';
    }

    setCreateDefaultType(targetType);
    setCreateModalOptions(options);
    setIsCreateOpen(true);
  }, [selectedCategory, activeDoc, activeHouse, error]);

  const handleCreateUniverse = async (name: string, description?: string): Promise<string | void> => {
    if (vaultCoordinator.current.busy) {
      throw new Error('A Vault operation is currently running. Please wait.');
    }

    const cleanName = name.trim();
    if (!cleanName) throw new Error('Universe name cannot be empty.');

    const targetHouseId = activeHouseId || DEFAULT_HOUSE_ID;
    let createdUniverseId = '';

    const saved = await runOrganization(async () => {
      let expectedRevision = 0;
      try {
        const res = await api.thoughtGet();
        const resolved = resolveBasePlan(res.plan, documents);
        expectedRevision = resolved.expectedRevision;
      } catch (err) {
        const errMsg = formatError(err);
        setPlanStatus('error');
        setPlanError(errMsg);
        throw new Error(`Cannot create Universe because planning data failed to load: ${errMsg}. Resolve this issue before editing.`);
      }

      const result = await api.createUniverseInHouse(
        expectedRevision,
        cleanName,
        description,
        targetHouseId
      );

      createdUniverseId = result.universe_id;
      if (result.thought.plan) {
        latestPlanRef.current = result.thought.plan;
        setPlan(result.thought.plan);
        setPlanStatus('loaded');
        setPlanError(null);
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mc_active_universe_id', result.universe_id);
        localStorage.removeItem('mc_selected_book_id');
      }
      setSelectedCategory('lorebook');
      setActiveDoc(null);
      await loadLibrary();
      success('Universe Created', `Created universe "${result.universe_name}".`);
    });

    if (!saved && !createdUniverseId) {
      throw new Error('Failed to create the new Universe.');
    }

    return createdUniverseId;
  };

  const handleCreateBook = async (
    universeId: string,
    title: string,
    continuity: Continuity = 'canonical',
    description?: string
  ): Promise<string | void> => {
    if (vaultCoordinator.current.busy) {
      throw new Error('A Vault operation is currently running. Please wait.');
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error('Book title cannot be empty.');

    let createdBookId = '';
    const saved = await runOrganization(async () => {
      let currentPlan: Plan;
      let expectedRevision = 0;

      try {
        const res = await api.thoughtGet();
        const resolved = resolveBasePlan(res.plan, documents);
        currentPlan = resolved.plan;
        expectedRevision = resolved.expectedRevision;
      } catch (err) {
        const errMsg = formatError(err);
        console.error('Failed to get plan before creating book:', errMsg);
        setPlanStatus('error');
        setPlanError(errMsg);
        throw new Error(`Cannot create Book because planning data failed to load: ${errMsg}. Resolve this issue before editing.`);
      }

      const { plan: updatedPlan, book } = createBookInPlan(currentPlan, universeId, cleanTitle, continuity, description);
      const result = await api.thoughtSave(expectedRevision, updatedPlan);

      setPlan(result.plan);
      setPlanStatus('loaded');
      setPlanError(null);
      createdBookId = book.id;

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mc_active_universe_id', universeId);
        localStorage.setItem('mc_selected_book_id', book.id);
      }
      setSelectedCategory('lorebook');
      setActiveDoc(null);
      await loadLibrary();
      success('Book Created', `Created book "${book.name}".`);
    });

    if (!saved && !createdBookId) {
      throw new Error('Failed to save the new Book.');
    }

    return createdBookId;
  };

  // Rename document with flush before renaming
  const handleRenameDocument = async (id: string, newTitle: string) => {
    // Flush pending content to disk before renaming so disk state is current
    if (!(await flushSave(id))) return;

    try {
      const updatedMeta = await api.renameDocument(id, newTitle);
      setActiveDoc(prev => (prev && prev.metadata.id === id ? { ...prev, metadata: updatedMeta } : prev));
      setDocuments(prev => prev.map(d => (d.id === id ? updatedMeta : d)));
      success('Renamed', `Document renamed to "${newTitle}".`);
    } catch (err) {
      error('Rename Failed', formatError(err));
    }
  };

  const handleDeleteDocument = async (id:string) => {
    const doc=documents.find(d=>d.id===id);if(!doc)return;
    if(isCatalog(doc)){error('Cannot archive planning catalog','The shared catalog contains all Universes. Archive individual records instead.');return;}
    if(doc.doc_type==='lorebook'){setArchiveTarget(doc);return;}
    if(!(await flushSave()))return;
    try{await commandQueue.current.run(()=>api.deleteDocument(id));if(activeDoc?.metadata.id===id)setActiveDoc(null);await loadLibrary();info('Archived','Document moved to Backups.');}
    catch(err){error('Archive failed',formatError(err));}
  };
  const confirmEntityArchive=async()=>{
    if(!archiveTarget||archivingEntity)return;
    const target=archiveTarget;
    // The preview is approved before draining. New links force a fresh review.
    const approved=entityDeletionImpact(latestPlanRef.current,target.id).relationships.map(r=>r.id);
    setArchivingEntity(true);
    try{
      if(!(await flushSave()))return;
      const operation=entityArchiveOperation(target.id,approved,{
        current:()=>latestPlanRef.current,save:api.thoughtSave,
        publish:result=>{libraryGeneration.current++;latestPlanRef.current=result.plan;setPlan(result.plan);},
        archiveDocument:api.deleteDocument,
      });
      const ok=await runOrganization(async()=>{
        await operation();
        if(pendingEditRef.current?.docId===target.id)pendingEditRef.current=null;
        setActiveDoc(prev=>prev?.metadata.id===target.id?null:prev);
        await loadLibrary();
        setArchiveTarget(null);
        info('Entity archived','Relationships archived first; Markdown retained in Backups. Historical references remain.');
      });
      if(!ok)error('Entity archive incomplete','No later stage will run until Retry succeeds. Preserve Backups. If interrupted after unlinking, the entity may still be visible.');
    }finally{setArchivingEntity(false);}
  };

  // Global desktop keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (vaultCoordinator.current.busy && !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q')) { if (!vaultCoordinator.current.restartRequired) e.preventDefault(); return; }
      if(archiveTarget&&!((e.ctrlKey||e.metaKey)&&['s','q'].includes(e.key.toLowerCase())))return;
      if(e.key==='F1'){e.preventDefault();openHelp(guideForStudio(activeDoc?.metadata.doc_type||null));return;}
      if(helpOpen && !((e.ctrlKey||e.metaKey)&&['s','q'].includes(e.key.toLowerCase()))){
        if((e.ctrlKey||e.metaKey)&&['f','k','n'].includes(e.key.toLowerCase()))e.preventDefault();
        return;
      }
      // Ctrl + F or Ctrl + K: Search
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      // Ctrl + N: New Document in current studio or workspace
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (selectedCategory === 'manuscript') {
          if (isManuscriptEnabled(activeHouse)) {
            setIsCreateManuscriptOpen(true);
          }
        } else {
          const enabled = getEnabledStudios(activeHouse);
          if (activeHouse && enabled.length === 0) return;

          let targetType: DocumentType;
          if (selectedCategory !== 'all' && enabled.includes(selectedCategory as any)) {
            targetType = selectedCategory;
          } else if (activeDoc && enabled.includes(activeDoc.metadata.doc_type as any)) {
            targetType = activeDoc.metadata.doc_type;
          } else {
            targetType = (enabled[0] as DocumentType) || 'poetry';
          }

          const activeUniId = targetType === 'lorebook'
            ? localStorage.getItem('mc_active_universe_id') || undefined
            : undefined;
          handleOpenCreateModal(
            targetType,
            targetType === 'lorebook' ? { universeId: activeUniId, action: 'add_to_universe' } : undefined
          );
        }
      }
      // Ctrl + S: Manual Immediate Save (flushes pending changes)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flushSave(activeDoc?.metadata.id);
      }
      // Ctrl + Q or Cmd + Q: Graceful Exit
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        handleGracefulExit();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeDoc, selectedCategory, flushSave, helpOpen, openHelp, archiveTarget]);

  // Stable ref for flushSave to avoid effect re-subscriptions
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  const exitCoordinator = useRef(new ExitCoordinator());

  // All close entry points share one flush-before-exit procedure.
  const handleGracefulExit = useCallback(async (force = false) => {
    setArchiveTarget(null);
    closeHelp();
    if (
      !force &&
      savePreferencesRef.current.mode === 'manual' &&
      hasUnsavedChanges()
    ) {
      pendingNavActionRef.current = () => handleGracefulExit(true);
      setIsUnsavedExiting(true);
      setShowUnsavedModal(true);
      return;
    }

    await exitCoordinator.current.run(() => vaultCoordinator.current.prepareExit(async () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return flushSaveRef.current();
    }), async () => {
      if (isTauri()) {
        try {
          await api.exitApp();
        } catch (err) {
          console.error('Failed to invoke exitApp, falling back to window destroy:', err);
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().destroy();
          } catch (destroyErr) {
            console.error('Fallback window destroy failed:', destroyErr);
          }
        }
      }
    });
  }, [hasUnsavedChanges, closeHelp]);

  // Handle application close / unload to prevent discarding unsaved writing
  useEffect(() => {
    let unlistenTauriClose: (() => void) | undefined;
    let isMounted = true;

    if (isTauri()) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => {
          if (!isMounted) return;
          getCurrentWindow()
            .onCloseRequested(async (event) => {
              // Prevent default close so we can flush pending edits and exit cleanly
              event.preventDefault();
              await handleGracefulExit();
            })
            .then(unlisten => {
              if (!isMounted) {
                unlisten();
              } else {
                unlistenTauriClose = unlisten;
              }
            })
            .catch(err => {
              console.warn('Could not register Tauri window close handler:', err);
            });
        })
        .catch(err => {
          console.warn('Failed to load Tauri window API:', err);
        });
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // In web browser preview only: prompt user about unsaved work
      if (!isTauri() && pendingEditRef.current && pendingEditRef.current.revision > savedRevisionRef.current) {
        flushSaveRef.current();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (unlistenTauriClose) {
        unlistenTauriClose();
      }
    };
  }, [handleGracefulExit]);

  return (
    <>
      <div className="contents" {...((vaultPhase || activation?.restart_required || restartError || archiveTarget) ? { inert: '' } : {})}>
      <AppLayout
        documents={houseDocuments}
        activeDocument={activeDoc}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        onSelectDocument={handleSelectDocument}
        onOpenCreateModal={handleOpenCreateModal}
        onOpenCreateManuscriptModal={() => setIsCreateManuscriptOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSaveDocument={handleSaveDocument}
        onRetrySave={handleRetrySave}
        onRenameDocument={handleRenameDocument}
        onDeleteDocument={handleDeleteDocument}
        onUpdateOrganization={handleOrganization}
        onManageTag={handleManageTag}
        onSaveThought={handleThoughtSave}
        organizationBusy={organizationBusy}
        tagCatalog={tagCatalog}
        onCancelOrganization={() => {
          if (mutationQueue.current.discard()) {
            setOrganizationBusy(false);
            setSaveStatus(hasUnsavedChanges() ? (savePreferences.mode === 'manual' ? 'unsaved' : 'editing') : 'saved');
            void flushSave().then(ok=>{if(ok)void loadLibrary();});
          }
        }}
        saveStatus={saveStatus}
        libraryInfo={libraryInfo}
        isLoadingDoc={isLoadingDoc}
        onCreateDocument={handleCreateDocument}
        onSaveDocumentById={handleSaveArbitraryDocument}
        plan={plan}
        onManualSave={handleManualSave}
        saveMode={savePreferences.mode}
        activeHouse={activeHouse}
        houses={houses}
        onSwitchHouse={handleSwitchHouse}
        onOpenHouseManagement={(tab) => {
          setHouseManagementTab(tab || 'active');
          setIsHouseManagementOpen(true);
        }}
        onCreateHouse={() => {
          setHouseManagementTab('active');
          setIsHouseManagementOpen(true);
        }}
        onMoveDocument={(doc) => setMoveDocTarget(doc)}
        onMoveUniverse={handleOpenMoveUniverse}
      />

      <CreateManuscriptModal
        isOpen={isCreateManuscriptOpen}
        onClose={() => setIsCreateManuscriptOpen(false)}
        onCreate={async (title, subtitle, author, tags) => {
          const metadataJson = JSON.stringify({
            manuscript: {
              version: 1,
              subtitle: subtitle || '',
              author: author || '',
              outline: [],
            },
          });
          await handleCreateDocument('manuscript', title, '', metadataJson, tags);
        }}
      />

      <CreateDocumentModal
        activeHouse={activeHouse}
        houses={houses}
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateModalOptions(undefined);
        }}
        defaultType={createDefaultType}
        initialUniverseId={createModalOptions?.universeId}
        initialUniverseName={createModalOptions?.universeName}
        initialEntryType={createModalOptions?.entryType}
        initialAction={createModalOptions?.action}
        initialTitle={createModalOptions?.initialTitle}
        plan={plan}
        planStatus={planStatus}
        planError={planError}
        enabledStudios={activeHouse?.enabled_studios}
        activeHouseName={activeHouse?.name}
        isLoadingHouse={isHousesLoading}
        onCreate={handleCreateDocument}
        onCreateUniverse={handleCreateUniverse}
        onCreateBook={handleCreateBook}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectDocument={async (id, docType, houseId) => {
          if (houseId && houseId !== (activeHouse?.id || activeHouseId)) {
            await handleSwitchHouse(houseId);
          }
          await handleSelectDocument(id, docType);
        }}
        activeHouseId={activeHouse?.id || activeHouseId}
        activeHouseName={activeHouse?.name}
        houses={houses}
        documents={documents}
      />

      <HouseManagementModal
        isOpen={isHouseManagementOpen}
        onClose={() => setIsHouseManagementOpen(false)}
        houses={houses}
        activeHouseId={activeHouse?.id || activeHouseId}
        onSwitchHouse={handleSwitchHouse}
        onRefreshHouses={async () => {
          const list = await api.listHouses().catch(() => []);
          setHouses(list);
        }}
        initialTab={houseManagementTab}
      />

      <MoveDocumentModal
        isOpen={!!moveDocTarget}
        onClose={() => setMoveDocTarget(null)}
        document={moveDocTarget}
        houses={houses}
        onCoordinateMove={handleCoordinateDocumentMove}
        onSwitchHouse={handleSwitchHouse}
      />

      <MoveUniverseModal
        isOpen={!!moveUniverseTarget}
        onClose={() => setMoveUniverseTarget(null)}
        universe={moveUniverseTarget}
        ownedDocumentCount={
          moveUniverseTarget
            ? documents.filter(d => {
                if (d.doc_type !== 'lorebook') return false;
                const res = resolveEntityUniverse(d, plan?.universes || []);
                return res.universeId === moveUniverseTarget.id;
              }).length
            : 0
        }
        houses={houses}
        onCoordinateMove={handleCoordinateUniverseMove}
        onSwitchHouse={handleSwitchHouse}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => { if (!vaultCoordinator.current.busy) setIsSettingsOpen(false); }}
        libraryInfo={libraryInfo}
        onReindexed={() => loadLibrary()}
        theme={theme}
        onThemeChange={setTheme}
        savePreferences={savePreferences}
        onSavePreferencesChange={handleSavePreferencesChange}
        onExit={() => handleGracefulExit()}
        runVault={runVault}
      />

      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        documentTitle={activeDoc?.metadata.title}
        isExiting={isUnsavedExiting}
        onSave={handleUnsavedModalSave}
        onDiscard={handleUnsavedModalDiscard}
        onCancel={handleUnsavedModalCancel}
      />
      <WritingAtmospherePlayer />
      </div>
      {archiveTarget&&<EntityArchivePreview document={archiveTarget} plan={plan} documents={documents} busy={archivingEntity} pending={organizationBusy} onRetry={()=>void handleRetrySave()} onCancelQueued={()=>{if(mutationQueue.current.discard()){setOrganizationBusy(false);setArchiveTarget(null);setSaveStatus(hasUnsavedChanges()?(savePreferencesRef.current.mode==='manual'?'unsaved':'editing'):'saved');void loadLibrary();}}} onConfirm={()=>void confirmEntityArchive()} onCancel={()=>setArchiveTarget(null)} onBackup={()=>{setArchiveTarget(null);setIsSettingsOpen(true);}}/>}
      {(activation?.restart_required || restartError) && <div className="fixed inset-0 z-[80] bg-background flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-label="Notebook restart required">
        <div className="max-w-xl space-y-4 text-foreground">
          <h2 className="font-serif text-2xl text-primary">Restart to activate the notebook</h2>
          <p className="text-sm">{restartError || activation?.message} The old notebook is still displayed underneath. Editing is blocked until restart.</p>
          {activation && <div className="text-xs space-y-2 break-all select-text"><p>Selected notebook: {activation.selected_path}</p><p>Previous notebook retained at: {activation.previous_path}</p><p>Verified pre-restore backup: {activation.preserved_backup}</p></div>}
          <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground" onClick={async () => { try { await api.vaultRestart(); } catch { setRestartError('Automatic restart failed. Close this window and reopen the app normally. The saved selection and previous notebook are retained.'); } }}>Restart &amp; open selected notebook</button>
          <button className="px-4 py-2 ml-2 rounded-lg border border-border" onClick={() => handleGracefulExit()}>Close safely</button>
          <p className="text-xs text-muted-foreground">If relaunch fails, reopen the app manually. Startup validates the selected notebook and falls back to the previous one when possible. Keep all recovery folders.</p>
        </div>
      </div>}
      {vaultPhase && <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center" role="status" aria-live="polite" aria-busy="true">
        <div className="text-center p-6"><p className="font-serif text-xl text-primary">{vaultPhase}...</p><p className="text-sm text-muted-foreground mt-2">Writing is paused while the Vault works. Closing waits for this operation.</p></div>
      </div>}

    </>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <HelpProvider><AppContent /></HelpProvider>
    </ToastProvider>
  );
};

export default App;
