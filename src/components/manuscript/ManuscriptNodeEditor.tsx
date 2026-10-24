import React, { useState } from 'react';
import {
  FileText,
  Folder,
  Link as LinkIcon,
  AlertCircle,
  ExternalLink,
  BookOpen,
  Feather,
  Compass,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  ManuscriptMetadata,
  ManuscriptNode,
  ManuscriptSectionNode,
} from '../../types';
import {
  updateNodeInOutline,
  removeNodeFromOutline,
  isDocumentDetail,
} from '../../utils/manuscript';
import { DocumentPickerModal } from './DocumentPickerModal';

const getDocId = (d: DocumentDetail | DocumentMetadata): string =>
  isDocumentDetail(d) ? d.metadata.id : d.id;

const getDocTitle = (d: DocumentDetail | DocumentMetadata): string =>
  isDocumentDetail(d) ? d.metadata.title : d.title;

const getDocType = (d: DocumentDetail | DocumentMetadata): DocumentType =>
  isDocumentDetail(d) ? d.metadata.doc_type : d.doc_type;

const getDocContent = (d: DocumentDetail | DocumentMetadata): string =>
  isDocumentDetail(d) ? d.content : '';

interface ManuscriptNodeEditorProps {
  selectedNode: ManuscriptNode | null;
  outline: ManuscriptNode[];
  onChangeOutline: (newOutline: ManuscriptNode[]) => void;
  onDeselect: () => void;
  documents: Array<DocumentDetail | DocumentMetadata>;
  onOpenDocumentInStudio?: (docId: string, docType: DocumentType) => void;
  manuscriptMetadata: ManuscriptMetadata;
  onChangeMetadata: (newMeta: ManuscriptMetadata) => void;
  manuscriptBody: string;
  onChangeBody: (newBody: string) => void;
}

export const ManuscriptNodeEditor: React.FC<ManuscriptNodeEditorProps> = ({
  selectedNode,
  outline,
  onChangeOutline,
  onDeselect,
  documents,
  onOpenDocumentInStudio,
  manuscriptMetadata,
  onChangeMetadata,
  manuscriptBody,
  onChangeBody,
}) => {
  const [isRelinkModalOpen, setIsRelinkModalOpen] = useState(false);

  const docMap = React.useMemo(() => {
    return new Map(documents.map((d) => [getDocId(d), d]));
  }, [documents]);

  // Case 0: No node selected -> Show Manuscript Project Overview & Metadata Editor
  if (!selectedNode) {
    return (
      <div className="h-full flex flex-col bg-zinc-950 p-6 overflow-y-auto text-zinc-100">
        <div className="max-w-2xl mx-auto w-full space-y-6">
          <div className="border-b border-zinc-800 pb-4">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              Manuscript Project Overview
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Select any item in the outline on the left to edit its contents, or customize book-level metadata and project synopsis below.
            </p>
          </div>

          <div className="space-y-4 bg-zinc-900/60 p-5 rounded-xl border border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              Book & Anthology Metadata
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Subtitle / Tagline</label>
                <input
                  type="text"
                  placeholder="e.g. Selected Verse and Contemplations"
                  value={manuscriptMetadata.subtitle || ''}
                  onChange={(e) =>
                    onChangeMetadata({
                      ...manuscriptMetadata,
                      subtitle: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Author / Editor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Eleanor Vance"
                  value={manuscriptMetadata.author || ''}
                  onChange={(e) =>
                    onChangeMetadata({
                      ...manuscriptMetadata,
                      author: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500/60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Target Word Count (Optional)</label>
              <input
                type="number"
                placeholder="e.g. 50000"
                value={manuscriptMetadata.target_word_count || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChangeMetadata({
                    ...manuscriptMetadata,
                    target_word_count: isNaN(val) ? undefined : val,
                  });
                }}
                className="w-48 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <div className="space-y-2 bg-zinc-900/60 p-5 rounded-xl border border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              Project Synopsis & Working Notes
            </h3>
            <p className="text-xs text-zinc-400">
              Internal notes and planning for this manuscript. These notes are saved in the manuscript markdown body and can be excluded from published exports.
            </p>
            <textarea
              rows={8}
              placeholder="Write your synopsis, collection themes, or editorial notes here..."
              value={manuscriptBody}
              onChange={(e) => onChangeBody(e.target.value)}
              className="w-full p-3 bg-zinc-800/80 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-sans focus:outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>
        </div>
      </div>
    );
  }

  // Case 1: Section Node
  if (selectedNode.type === 'section') {
    const section = selectedNode as ManuscriptSectionNode;
    return (
      <div className="h-full flex flex-col bg-zinc-950 p-6 overflow-y-auto text-zinc-100">
        <div className="max-w-2xl mx-auto w-full space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Folder className="w-5 h-5 text-amber-400" />
              <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
                Section / Structural Unit
              </span>
            </div>
            <button
              onClick={onDeselect}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Done
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Section Title</label>
              <input
                type="text"
                value={section.title}
                onChange={(e) =>
                  onChangeOutline(updateNodeInOutline(outline, section.id, { title: e.target.value }))
                }
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-750 rounded-lg text-base font-semibold text-zinc-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Description / Epigraph (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. In which the journey through the mist begins..."
                value={section.description || ''}
                onChange={(e) =>
                  onChangeOutline(updateNodeInOutline(outline, section.id, { description: e.target.value }))
                }
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-750 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 text-xs text-zinc-400">
              <p>
                <strong>Child Items:</strong> {section.children?.length || 0} direct entries
              </p>
              <p className="mt-1 text-zinc-500">
                Use the outline on the left to add chapters, sub-sections, poem links, or prose entries into this section.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Original Text Node (Preface, Dedication, Interlude)
  if (selectedNode.type === 'original_text') {
    const textNode = selectedNode;
    const wordCount = (textNode.content || '').trim().split(/\s+/).filter(Boolean).length;
    const charCount = (textNode.content || '').length;

    return (
      <div className="h-full flex flex-col bg-zinc-950 text-zinc-100">
        {/* Header */}
        <div className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
              Original Manuscript Prose / Entry
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>{wordCount} words</span>
            <span>{charCount} characters</span>
            <button
              onClick={onDeselect}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>

        {/* Title & Editor */}
        <div className="flex-1 flex flex-col p-6 max-w-4xl w-full mx-auto space-y-4">
          <div>
            <input
              type="text"
              placeholder="Title (e.g. Preface, Dedication, Chapter Interlude)"
              value={textNode.title}
              onChange={(e) =>
                onChangeOutline(updateNodeInOutline(outline, textNode.id, { title: e.target.value }))
              }
              className="w-full text-xl font-bold bg-transparent border-b border-zinc-800 pb-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div className="flex-1 flex flex-col min-h-[300px]">
            <textarea
              placeholder="Write manuscript-specific prose, commentary, or connecting text here..."
              value={textNode.content || ''}
              onChange={(e) =>
                onChangeOutline(updateNodeInOutline(outline, textNode.id, { content: e.target.value }))
              }
              className="w-full flex-1 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-zinc-200 font-serif leading-relaxed resize-none focus:outline-none focus:border-amber-500/40 focus:bg-zinc-900/80 transition-all"
            />
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Linked Document Node (Poetry, Philosophy, or Lorebook)
  if (selectedNode.type === 'linked_doc') {
    const linkedNode = selectedNode;
    const sourceDoc = docMap.get(linkedNode.doc_id);

    if (!sourceDoc) {
      // Document is genuinely missing or deleted
      return (
        <div className="h-full flex flex-col bg-zinc-950 p-6 overflow-y-auto text-zinc-100">
          <div className="max-w-2xl mx-auto w-full space-y-5">
            <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-300">
                    Referenced Document Missing or Deleted
                  </h3>
                  <p className="text-xs text-amber-400/80 mt-1">
                    This manuscript entry refers to source document ID: <code className="bg-black/30 px-1 py-0.5 rounded text-amber-200">{linkedNode.doc_id}</code>. The document could not be found in your active library.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setIsRelinkModalOpen(true)}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-500 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-link to Existing Document
                </button>
                <button
                  onClick={() => {
                    onChangeOutline(removeNodeFromOutline(outline, linkedNode.id));
                    onDeselect();
                  }}
                  className="px-3 py-1.5 bg-zinc-800 text-zinc-300 hover:text-red-400 hover:bg-zinc-750 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove from Outline
                </button>
              </div>
            </div>
          </div>

          <DocumentPickerModal
            isOpen={isRelinkModalOpen}
            onClose={() => setIsRelinkModalOpen(false)}
            onSelect={(newDocId, newDocType) => {
              onChangeOutline(
                updateNodeInOutline(outline, linkedNode.id, {
                  doc_id: newDocId,
                  doc_type: newDocType,
                })
              );
            }}
            documents={documents}
          />
        </div>
      );
    }

    // Source document exists!
    const sourceDocId = getDocId(sourceDoc);
    const sourceDocTitle = getDocTitle(sourceDoc);
    const sourceDocType = getDocType(sourceDoc);
    const sourceDocContent = getDocContent(sourceDoc);

    const getStudioBadge = (type: DocumentType) => {
      switch (type) {
        case 'poetry':
          return (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
              <Feather className="w-3 h-3" /> Poetry Studio
            </span>
          );
        case 'philosophy':
          return (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
              <Compass className="w-3 h-3" /> Philosophy Studio
            </span>
          );
        case 'lorebook':
          return (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/60">
              <BookOpen className="w-3 h-3" /> Lorebook Studio
            </span>
          );
        default:
          return null;
      }
    };

    return (
      <div className="h-full flex flex-col bg-zinc-950 p-6 overflow-y-auto text-zinc-100">
        <div className="max-w-2xl mx-auto w-full space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-amber-400" />
              <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
                Linked Studio Document
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onOpenDocumentInStudio && (
                <button
                  onClick={() =>
                    onOpenDocumentInStudio(sourceDocId, sourceDocType)
                  }
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 hover:text-white rounded text-xs border border-zinc-700 transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Edit in Studio
                </button>
              )}
              <button
                onClick={onDeselect}
                className="text-xs text-zinc-400 hover:text-zinc-200 ml-2"
              >
                Done
              </button>
            </div>
          </div>

          {/* Document Identity & Custom Title */}
          <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 font-mono">Stable Source ID: {sourceDocId}</span>
                <h3 className="text-base font-semibold text-zinc-100">{sourceDocTitle}</h3>
              </div>
              {getStudioBadge(sourceDocType)}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Custom Title in this Manuscript (Optional)
              </label>
              <input
                type="text"
                placeholder={`Default: ${sourceDocTitle}`}
                value={linkedNode.custom_title || ''}
                onChange={(e) =>
                  onChangeOutline(
                    updateNodeInOutline(outline, linkedNode.id, {
                      custom_title: e.target.value.trim() ? e.target.value : undefined,
                    })
                  )
                }
                className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500/60"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Override how this piece is titled within the book outline and export, without changing the source document.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setIsRelinkModalOpen(true)}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Change Linked Document...
              </button>
            </div>
          </div>

          {/* Read-Only Source Content Preview */}
          <div className="bg-zinc-900/40 p-5 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Source Document Content (Live Read-Only)
              </span>
              <span className="text-[11px] text-zinc-500">
                Reflects saved state from {sourceDocType}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 bg-zinc-950/60 rounded border border-zinc-800/80 text-xs font-serif leading-relaxed text-zinc-300 whitespace-pre-wrap">
              {sourceDocContent || <span className="text-zinc-600 italic">No content in source document.</span>}
            </div>
          </div>
        </div>

        <DocumentPickerModal
          isOpen={isRelinkModalOpen}
          onClose={() => setIsRelinkModalOpen(false)}
          onSelect={(newDocId, newDocType) => {
            onChangeOutline(
              updateNodeInOutline(outline, linkedNode.id, {
                doc_id: newDocId,
                doc_type: newDocType,
              })
            );
          }}
          documents={documents}
        />
      </div>
    );
  }

  return null;
};
