import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen,
  Layout,
  Eye,
  FileDown,
  Check,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  ManuscriptMetadata,
  ManuscriptNode,
  SaveStatus,
} from '../../types';
import { ManuscriptOutlineTree } from './ManuscriptOutlineTree';
import { ManuscriptNodeEditor } from './ManuscriptNodeEditor';
import { ManuscriptPreview } from './ManuscriptPreview';
import { ManuscriptExportModal } from './ManuscriptExportModal';
import {
  computeManuscriptStats,
  DEFAULT_MANUSCRIPT_EXPORT_SETTINGS,
  findNodeById,
  flattenManuscriptOutline,
} from '../../utils/manuscript';

interface ManuscriptAssemblerProps {
  document: DocumentDetail;
  onSaveDocument: (
    id: string,
    content: string,
    title?: string,
    tags?: string[],
    metadataJson?: string
  ) => Promise<void>;
  saveStatus: SaveStatus;
  documents: Array<DocumentDetail | DocumentMetadata>;
  onOpenDocumentInStudio?: (docId: string, docType: DocumentType) => void;
}

export const ManuscriptAssembler: React.FC<ManuscriptAssemblerProps> = ({
  document,
  onSaveDocument,
  saveStatus,
  documents,
  onOpenDocumentInStudio,
}) => {
  const [activeView, setActiveView] = useState<'editor' | 'preview'>('editor');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Parse document metadata.manuscript
  const initialMetadata = React.useMemo<ManuscriptMetadata>(() => {
    let parsed: any = {};
    if (document.metadata.metadata_json) {
      try {
        parsed = JSON.parse(document.metadata.metadata_json);
      } catch {
        parsed = {};
      }
    }
    const ms = parsed.manuscript || {};
    return {
      version: 1,
      subtitle: ms.subtitle || '',
      author: ms.author || '',
      target_word_count: ms.target_word_count,
      export_settings: { ...DEFAULT_MANUSCRIPT_EXPORT_SETTINGS, ...(ms.export_settings || {}) },
      outline: Array.isArray(ms.outline) ? ms.outline : [],
    };
  }, [document.metadata.id, document.metadata.metadata_json]);

  const [title, setTitle] = useState(document.metadata.title);
  const [tags, setTags] = useState<string[]>(document.metadata.tags || []);
  const [body, setBody] = useState(document.content || '');
  const [metadata, setMetadata] = useState<ManuscriptMetadata>(initialMetadata);

  // Sync state if a different document is opened
  useEffect(() => {
    setTitle(document.metadata.title);
    setTags(document.metadata.tags || []);
    setBody(document.content || '');
    setMetadata(initialMetadata);
    setSelectedNodeId(null);
  }, [document.metadata.id]);

  // Dirty state tracking & debounced save through SaveCoordinator
  const isDirtyRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSave = useCallback(
    (
      newTitle: string,
      newTags: string[],
      newBody: string,
      newMeta: ManuscriptMetadata
    ) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const fullMetadata = {
            manuscript: newMeta,
          };
          await onSaveDocument(
            document.metadata.id,
            newBody,
            newTitle,
            newTags,
            JSON.stringify(fullMetadata)
          );
          isDirtyRef.current = false;
        } catch (err) {
          console.error('Failed to save manuscript:', err);
        }
      }, 800);
    },
    [document.metadata.id, onSaveDocument]
  );

  // Update handlers
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    isDirtyRef.current = true;
    triggerSave(newTitle, tags, body, metadata);
  };

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    isDirtyRef.current = true;
    triggerSave(title, tags, newBody, metadata);
  };

  const handleMetadataChange = (newMeta: ManuscriptMetadata) => {
    setMetadata(newMeta);
    isDirtyRef.current = true;
    triggerSave(title, tags, body, newMeta);
  };

  const handleOutlineChange = (newOutline: ManuscriptNode[]) => {
    const updatedMeta: ManuscriptMetadata = {
      ...metadata,
      outline: newOutline,
    };
    setMetadata(updatedMeta);
    isDirtyRef.current = true;
    triggerSave(title, tags, body, updatedMeta);
  };

  // Compute live stats
  const resolvedItems = React.useMemo(() => {
    return flattenManuscriptOutline(metadata.outline, documents);
  }, [metadata.outline, documents]);

  const stats = React.useMemo(() => {
    return computeManuscriptStats(resolvedItems);
  }, [resolvedItems]);

  const selectedNode = selectedNodeId
    ? findNodeById(metadata.outline, selectedNodeId)?.node || null
    : null;

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top Main Toolbar */}
      <header className="px-5 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-4 shrink-0">
        {/* Left: Document Title & Manuscript Badge */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Manuscript Title..."
              className="text-base sm:text-lg font-bold bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-amber-500/60 text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors w-full truncate"
            />
          </div>
        </div>

        {/* Center: View Switcher (Outline & Editor vs Continuous Reading Preview) */}
        <div className="flex items-center bg-zinc-800/80 p-0.5 rounded-lg border border-zinc-750 shrink-0">
          <button
            onClick={() => setActiveView('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeView === 'editor'
                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>Outline & Editor</span>
          </button>
          <button
            onClick={() => setActiveView('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeView === 'preview'
                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Reading Preview</span>
          </button>
        </div>

        {/* Right: Stats, Export, and Save Status */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950/60 px-2.5 py-1 rounded-md border border-zinc-800">
            <span className="font-semibold text-zinc-300">{stats.totalWords.toLocaleString()}</span> words
            {metadata.target_word_count && (
              <span className="text-zinc-500">
                / {metadata.target_word_count.toLocaleString()} (
                {Math.round((stats.totalWords / metadata.target_word_count) * 100)}%)
              </span>
            )}
          </div>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-amber-600/20 transition-all"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Export...</span>
          </button>

          {/* Save Status */}
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-400" title="Saved">
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Saved</span>
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-amber-400 animate-pulse" title="Saving...">
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Saving...</span>
              </span>
            )}
            {saveStatus === 'editing' && (
              <span className="text-zinc-500 hidden sm:inline" title="Unsaved edits">
                Editing
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-red-400" title="Save error">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Error</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'editor' ? (
          <div className="h-full grid grid-cols-1 md:grid-cols-12 overflow-hidden">
            {/* Left 4-5 cols: Outline Tree */}
            <div className="md:col-span-5 lg:col-span-4 h-full overflow-hidden">
              <ManuscriptOutlineTree
                outline={metadata.outline}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onChangeOutline={handleOutlineChange}
                documents={documents}
              />
            </div>

            {/* Right 7-8 cols: Node Editor or Project Overview */}
            <div className="md:col-span-7 lg:col-span-8 h-full overflow-hidden border-t md:border-t-0 md:border-l border-zinc-800">
              <ManuscriptNodeEditor
                selectedNode={selectedNode}
                outline={metadata.outline}
                onChangeOutline={handleOutlineChange}
                onDeselect={() => setSelectedNodeId(null)}
                documents={documents}
                onOpenDocumentInStudio={onOpenDocumentInStudio}
                manuscriptMetadata={metadata}
                onChangeMetadata={handleMetadataChange}
                manuscriptBody={body}
                onChangeBody={handleBodyChange}
              />
            </div>
          </div>
        ) : (
          <ManuscriptPreview
            title={title}
            metadata={metadata}
            outline={metadata.outline}
            documents={documents}
          />
        )}
      </div>

      {/* Export Modal */}
      <ManuscriptExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title={title}
        metadata={metadata}
        outline={metadata.outline}
        documents={documents}
      />
    </div>
  );
};
