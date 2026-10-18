import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentDetail, DocumentMetadata, DocumentType, LibraryInfo, SaveStatus } from '@/types';
import { api, isTauri } from '@/services/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { CreateDocumentModal } from '@/components/common/CreateDocumentModal';
import { SearchModal } from '@/components/common/SearchModal';
import { SettingsModal } from '@/components/common/SettingsModal';
import { ToastProvider, useToast } from '@/components/common/Toast';

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

  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentDetail | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DocumentType | 'all'>('all');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [libraryInfo, setLibraryInfo] = useState<LibraryInfo | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDefaultType, setCreateDefaultType] = useState<DocumentType>('poetry');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Autosave revision and pending edit tracking
  const latestRevisionRef = useRef<number>(0);
  const savedRevisionRef = useRef<number>(0);
  const pendingEditRef = useRef<PendingEdit | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    return (localStorage.getItem('mc_theme') as 'dark' | 'light' | 'system') || 'dark';
  });

  // Apply theme to html element
  useEffect(() => {
    localStorage.setItem('mc_theme', theme);
    const root = document.documentElement;
    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', systemDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  // Load initial library data
  const loadLibrary = useCallback(async () => {
    try {
      const [docs, libInfo] = await Promise.all([
        api.listDocuments(),
        api.getLibraryInfo(),
      ]);
      setDocuments(docs);
      setLibraryInfo(libInfo);

      // Auto-open first document if none active
      if (docs.length > 0 && !activeDoc) {
        setIsLoadingDoc(true);
        try {
          const detail = await api.getDocument(docs[0].id);
          setActiveDoc(detail);
          latestRevisionRef.current = 0;
          savedRevisionRef.current = 0;
          pendingEditRef.current = null;
        } finally {
          setIsLoadingDoc(false);
        }
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }, [activeDoc]);

  useEffect(() => {
    loadLibrary();
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

      const pending = pendingEditRef.current;
      if (!pending) return true;
      if (targetDocId && pending.docId !== targetDocId) return true;
      if (pending.revision <= savedRevisionRef.current) return true;

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

        // Update document in metadata list
        setDocuments(prev => prev.map(d => (d.id === updatedMeta.id ? updatedMeta : d)));

        // Update activeDoc metadata, preserving any newer local content in memory
        setActiveDoc(prev => {
          if (!prev || prev.metadata.id !== docIdToSave) return prev;
          return {
            ...prev,
            metadata: updatedMeta,
            content:
              pendingEditRef.current?.docId === docIdToSave
                ? pendingEditRef.current.content
                : contentToSave,
          };
        });

        // Only mark 'saved' if no newer edits occurred while save was in-flight
        if (latestRevisionRef.current === revisionToSave) {
          setSaveStatus('saved');
        } else {
          // Newer edits exist; remain in editing state and schedule save for remaining changes
          setSaveStatus('editing');
          if (!saveTimerRef.current) {
            saveTimerRef.current = setTimeout(() => {
              flushSave(docIdToSave);
            }, 400);
          }
        }
        return true;
      } catch (err) {
        console.error('Failed to save document:', err);
        const errMsg = formatError(err);
        setSaveStatus('error');
        error('Save Failed', `${errMsg}. Your edits are retained locally. Press Ctrl+S to retry.`);
        return false;
      }
    },
    [error]
  );

  /**
   * Handle edits from studio components.
   * Records pending changes immediately and debounces disk write.
   */
  const handleSaveDocument = useCallback(
    (content: string, metadataJson?: string) => {
      if (!activeDoc) return;

      const docId = activeDoc.metadata.id;
      latestRevisionRef.current += 1;
      const revision = latestRevisionRef.current;

      pendingEditRef.current = {
        docId,
        content,
        metadataJson,
        revision,
      };

      setSaveStatus('editing');

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        flushSave(docId);
      }, 400);
    },
    [activeDoc, flushSave]
  );

  // Manual retry for save failure
  const handleRetrySave = useCallback(async (): Promise<boolean> => {
    return await flushSave(activeDoc?.metadata.id);
  }, [activeDoc?.metadata.id, flushSave]);

  // Select document with automatic flush of previous document's pending edits
  const handleSelectDocument = async (id: string, docType?: DocumentType) => {
    if (activeDoc?.metadata.id === id) return;

    // Flush any pending unsaved writing from current document before switching
    await flushSave();

    setIsLoadingDoc(true);
    try {
      const detail = await api.getDocument(id);

      // Reset revision counters for newly opened document
      latestRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      pendingEditRef.current = null;

      setActiveDoc(detail);
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

  // Switch category / studio with automatic flush of pending changes
  const handleSelectCategory = async (category: DocumentType | 'all') => {
    if (category === selectedCategory) return;

    // Flush pending changes first
    await flushSave();

    setSelectedCategory(category);

    if (category !== 'all') {
      // If current active doc is not in this studio, switch to most recent doc of this studio
      if (!activeDoc || activeDoc.metadata.doc_type !== category) {
        const matchingDoc = documents.find(d => d.doc_type === category);
        if (matchingDoc) {
          await handleSelectDocument(matchingDoc.id, category);
        } else {
          setActiveDoc(null);
        }
      }
    }
  };

  // Create document with automatic flush of previous document
  const handleCreateDocument = async (
    docType: DocumentType,
    title: string,
    initialContent?: string,
    metadataJson?: string,
    tags?: string[]
  ) => {
    await flushSave();

    try {
      const newDoc = await api.createDocument(
        docType,
        title,
        undefined,
        initialContent,
        metadataJson,
        tags
      );

      latestRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      pendingEditRef.current = null;

      setActiveDoc(newDoc);
      setSelectedCategory(docType);
      setSaveStatus('saved');
      await loadLibrary();
      success('Created Successfully', `Created "${newDoc.metadata.title}" in ${docType} studio.`);
    } catch (err) {
      error('Creation Failed', formatError(err));
      throw err;
    }
  };

  // Rename document with flush before renaming
  const handleRenameDocument = async (id: string, newTitle: string) => {
    // Flush pending content to disk before renaming so disk state is current
    await flushSave(id);

    try {
      const updatedMeta = await api.renameDocument(id, newTitle);
      setActiveDoc(prev => (prev && prev.metadata.id === id ? { ...prev, metadata: updatedMeta } : prev));
      setDocuments(prev => prev.map(d => (d.id === id ? updatedMeta : d)));
      success('Renamed', `Document renamed to "${newTitle}".`);
    } catch (err) {
      error('Rename Failed', formatError(err));
    }
  };

  // Delete document
  const handleDeleteDocument = async (id: string) => {
    // If pending edit is for this document, cancel it
    if (pendingEditRef.current?.docId === id) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingEditRef.current = null;
    }

    try {
      await api.deleteDocument(id);
      if (activeDoc?.metadata.id === id) {
        setActiveDoc(null);
      }
      await loadLibrary();
      info('Archived', 'Document moved to Backups folder.');
    } catch (err) {
      error('Delete Failed', formatError(err));
    }
  };

  // Global desktop keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl + F or Ctrl + K: Search
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      // Ctrl + N: New Document in current studio
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const targetType = selectedCategory === 'all'
          ? (activeDoc?.metadata.doc_type || 'poetry')
          : selectedCategory;
        setCreateDefaultType(targetType);
        setIsCreateOpen(true);
      }
      // Ctrl + S: Manual Immediate Save (flushes pending changes)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeDoc) {
          flushSave(activeDoc.metadata.id);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeDoc, selectedCategory, flushSave]);

  // Handle application close / unload to prevent discarding unsaved writing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingEditRef.current && pendingEditRef.current.revision > savedRevisionRef.current) {
        flushSave();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Tauri-specific window close listener
    let unlistenTauriClose: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => {
          getCurrentWindow().onCloseRequested(async () => {
            if (pendingEditRef.current && pendingEditRef.current.revision > savedRevisionRef.current) {
              await flushSave();
            }
          }).then(unlisten => {
            unlistenTauriClose = unlisten;
          });
        })
        .catch(err => {
          console.warn('Could not register Tauri window close handler:', err);
        });
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (unlistenTauriClose) {
        unlistenTauriClose();
      }
    };
  }, [flushSave]);

  return (
    <>
      <AppLayout
        documents={documents}
        activeDocument={activeDoc}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        onSelectDocument={handleSelectDocument}
        onOpenCreateModal={type => {
          setCreateDefaultType(type || 'poetry');
          setIsCreateOpen(true);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSaveDocument={handleSaveDocument}
        onRetrySave={handleRetrySave}
        onRenameDocument={handleRenameDocument}
        onDeleteDocument={handleDeleteDocument}
        saveStatus={saveStatus}
        libraryInfo={libraryInfo}
        isLoadingDoc={isLoadingDoc}
      />

      <CreateDocumentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        defaultType={createDefaultType}
        onCreate={handleCreateDocument}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectDocument={handleSelectDocument}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        libraryInfo={libraryInfo}
        onReindexed={loadLibrary}
        theme={theme}
        onThemeChange={setTheme}
      />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
