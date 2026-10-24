import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Feather,
  Compass,
  BookOpen,
  AlertCircle,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Link,
  Layers,
} from 'lucide-react';
import {
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  ManuscriptNode,
  ManuscriptSectionNode,
} from '../../types';
import {
  addLinkedDocToOutline,
  addOriginalTextToOutline,
  addSectionToOutline,
  indentNodeInOutline,
  outdentNodeInOutline,
  removeNodeFromOutline,
  reorderNodeInOutline,
} from '../../utils/manuscript';
import { DocumentPickerModal } from './DocumentPickerModal';

interface ManuscriptOutlineTreeProps {
  outline: ManuscriptNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onChangeOutline: (newOutline: ManuscriptNode[]) => void;
  documents: Array<DocumentDetail | DocumentMetadata>;
}

export const ManuscriptOutlineTree: React.FC<ManuscriptOutlineTreeProps> = ({
  outline,
  selectedNodeId,
  onSelectNode,
  onChangeOutline,
  documents,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [pickerTargetParentId, setPickerTargetParentId] = useState<string | null | undefined>(undefined);
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<{ id: string; title: string; hasChildren: boolean } | null>(null);

  const docMap = React.useMemo(() => {
    return new Map(
      documents.map((d) => {
        const id = 'metadata' in d ? d.metadata.id : d.id;
        const meta = 'metadata' in d ? d.metadata : d;
        return [id, meta];
      })
    );
  }, [documents]);

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddTopLevelSection = () => {
    const { outline: nextOutline, newNode } = addSectionToOutline(outline, null, 'New Section');
    onChangeOutline(nextOutline);
    onSelectNode(newNode.id);
  };

  const handleAddTopLevelOriginalText = () => {
    const { outline: nextOutline, newNode } = addOriginalTextToOutline(outline, null, 'New Prose Entry', '');
    onChangeOutline(nextOutline);
    onSelectNode(newNode.id);
  };

  const handleLinkDoc = (docId: string, docType: DocumentType) => {
    const targetParent = pickerTargetParentId === undefined ? null : pickerTargetParentId;
    const { outline: nextOutline, newNode } = addLinkedDocToOutline(outline, targetParent, docId, docType);
    onChangeOutline(nextOutline);
    onSelectNode(newNode.id);
    setPickerTargetParentId(undefined);
  };

  const handleDeleteConfirmed = (unwrap: boolean) => {
    if (!deleteConfirmNode) return;
    const nextOutline = removeNodeFromOutline(outline, deleteConfirmNode.id, unwrap);
    onChangeOutline(nextOutline);
    if (selectedNodeId === deleteConfirmNode.id) {
      onSelectNode(null);
    }
    setDeleteConfirmNode(null);
  };

  const getNodeIcon = (node: ManuscriptNode, isMissing: boolean, isOpen: boolean) => {
    if (isMissing) {
      return <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />;
    }
    if (node.type === 'section') {
      return isOpen ? (
        <FolderOpen className="w-4 h-4 text-amber-300 shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-amber-400/80 shrink-0" />
      );
    }
    if (node.type === 'original_text') {
      return <FileText className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (node.type === 'linked_doc') {
      switch (node.doc_type) {
        case 'poetry':
          return <Feather className="w-4 h-4 text-purple-400 shrink-0" />;
        case 'philosophy':
          return <Compass className="w-4 h-4 text-amber-400 shrink-0" />;
        case 'lorebook':
          return <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />;
        default:
          return <Link className="w-4 h-4 text-zinc-400 shrink-0" />;
      }
    }
    return <FileText className="w-4 h-4 text-zinc-400 shrink-0" />;
  };

  const renderNode = (node: ManuscriptNode, depth = 0, isFirst = false, isLast = false) => {
    const isSection = node.type === 'section';
    const isSelected = selectedNodeId === node.id;
    const isCollapsed = isSection && collapsedSections.has(node.id);

    let isMissing = false;
    let displayTitle = node.type === 'section' || node.type === 'original_text' ? node.title : '';

    if (node.type === 'linked_doc') {
      const sourceDoc = docMap.get(node.doc_id);
      if (sourceDoc) {
        displayTitle = node.custom_title || sourceDoc.title;
      } else {
        isMissing = true;
        displayTitle = node.custom_title || `[Missing Document: ${node.doc_id}]`;
      }
    }

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => onSelectNode(node.id)}
          className={`group flex items-center justify-between py-1.5 px-2 rounded-lg text-sm cursor-pointer transition-all ${
            isSelected
              ? 'bg-amber-600/25 text-amber-200 border border-amber-500/40 font-medium'
              : 'hover:bg-zinc-800/60 text-zinc-300 hover:text-zinc-100 border border-transparent'
          }`}
          style={{ paddingLeft: `${Math.max(8, depth * 18 + 8)}px` }}
        >
          {/* Left: Expander & Icon & Title */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
            {isSection ? (
              <button
                onClick={(e) => toggleCollapse(node.id, e)}
                className="p-0.5 text-zinc-400 hover:text-zinc-200 rounded"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5" />
            )}

            {getNodeIcon(node, isMissing, !isCollapsed)}

            <span className="truncate text-xs sm:text-sm">{displayTitle}</span>

            {node.type === 'linked_doc' && (
              <span className="text-[10px] uppercase font-mono px-1 py-0.2 bg-zinc-800 text-zinc-400 rounded shrink-0">
                {node.doc_type}
              </span>
            )}

            {isMissing && (
              <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800 px-1 py-0.2 rounded shrink-0">
                Missing
              </span>
            )}
          </div>

          {/* Right: Action Buttons (Hover / Selected) */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              title="Move Up"
              disabled={isFirst}
              onClick={(e) => {
                e.stopPropagation();
                onChangeOutline(reorderNodeInOutline(outline, node.id, 'up'));
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 rounded disabled:opacity-20"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              title="Move Down"
              disabled={isLast}
              onClick={(e) => {
                e.stopPropagation();
                onChangeOutline(reorderNodeInOutline(outline, node.id, 'down'));
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 rounded disabled:opacity-20"
            >
              <ArrowDown className="w-3 h-3" />
            </button>

            <button
              title="Indent (make child of previous section)"
              disabled={isFirst}
              onClick={(e) => {
                e.stopPropagation();
                onChangeOutline(indentNodeInOutline(outline, node.id));
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 rounded disabled:opacity-20"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              title="Outdent (promote to outer level)"
              disabled={depth === 0}
              onClick={(e) => {
                e.stopPropagation();
                onChangeOutline(outdentNodeInOutline(outline, node.id));
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 rounded disabled:opacity-20"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>

            {isSection && (
              <>
                <button
                  title="Add Sub-section"
                  onClick={(e) => {
                    e.stopPropagation();
                    const { outline: nextOutline, newNode } = addSectionToOutline(outline, node.id, 'New Sub-section');
                    onChangeOutline(nextOutline);
                    onSelectNode(newNode.id);
                  }}
                  className="p-1 text-zinc-400 hover:text-amber-300 hover:bg-zinc-700/50 rounded"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  title="Link Document into this Section"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerTargetParentId(node.id);
                  }}
                  className="p-1 text-zinc-400 hover:text-amber-300 hover:bg-zinc-700/50 rounded"
                >
                  <Link className="w-3 h-3" />
                </button>
              </>
            )}

            <button
              title="Delete item"
              onClick={(e) => {
                e.stopPropagation();
                if (isSection && (node as ManuscriptSectionNode).children?.length) {
                  setDeleteConfirmNode({
                    id: node.id,
                    title: displayTitle,
                    hasChildren: true,
                  });
                } else {
                  onChangeOutline(removeNodeFromOutline(outline, node.id));
                  if (selectedNodeId === node.id) onSelectNode(null);
                }
              }}
              className="p-1 text-zinc-400 hover:text-red-400 hover:bg-red-950/40 rounded"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {isSection && !isCollapsed && (node as ManuscriptSectionNode).children?.length > 0 && (
          <div className="relative border-l border-zinc-800 ml-4 pl-0.5">
            {(node as ManuscriptSectionNode).children.map((child, idx, arr) =>
              renderNode(child, depth + 1, idx === 0, idx === arr.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-800">
      {/* Top Controls */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between gap-1 bg-zinc-900/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          Manuscript Outline
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleAddTopLevelSection}
            title="Add Section"
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 hover:text-white rounded text-xs border border-zinc-700 transition-colors"
          >
            <Plus className="w-3 h-3 text-amber-400" />
            Section
          </button>
          <button
            onClick={() => setPickerTargetParentId(null)}
            title="Link Document"
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 hover:text-white rounded text-xs border border-zinc-700 transition-colors"
          >
            <Link className="w-3 h-3 text-purple-400" />
            Link Doc
          </button>
          <button
            onClick={handleAddTopLevelOriginalText}
            title="Add Original Prose / Words"
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 hover:text-white rounded text-xs border border-zinc-700 transition-colors"
          >
            <FileText className="w-3 h-3 text-emerald-400" />
            Text
          </button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {outline.length === 0 ? (
          <div className="text-center py-12 px-4 text-zinc-500">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30 text-amber-400" />
            <p className="text-sm font-medium text-zinc-400">Empty Manuscript Outline</p>
            <p className="text-xs mt-1 text-zinc-500 max-w-xs mx-auto">
              Start structuring your book by creating sections, writing original prefaces, or linking existing documents.
            </p>
            <div className="mt-4 flex flex-col gap-2 max-w-xs mx-auto">
              <button
                onClick={handleAddTopLevelSection}
                className="w-full py-1.5 px-3 bg-amber-600/20 text-amber-300 hover:bg-amber-600 hover:text-white rounded text-xs font-medium border border-amber-500/30 transition-colors"
              >
                + Create Section / Part I
              </button>
              <button
                onClick={() => setPickerTargetParentId(null)}
                className="w-full py-1.5 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded text-xs font-medium border border-zinc-700 transition-colors"
              >
                + Link Studio Document
              </button>
              <button
                onClick={handleAddTopLevelOriginalText}
                className="w-full py-1.5 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded text-xs font-medium border border-zinc-700 transition-colors"
              >
                + Write Original Preface / Dedication
              </button>
            </div>
          </div>
        ) : (
          outline.map((node, idx, arr) => renderNode(node, 0, idx === 0, idx === arr.length - 1))
        )}
      </div>

      {/* Document Picker Modal */}
      {pickerTargetParentId !== undefined && (
        <DocumentPickerModal
          isOpen={true}
          onClose={() => setPickerTargetParentId(undefined)}
          onSelect={handleLinkDoc}
          documents={documents}
        />
      )}

      {/* Delete Section Confirm Modal */}
      {deleteConfirmNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-750 rounded-xl p-5 shadow-2xl max-w-md w-full text-zinc-100">
            <h3 className="text-base font-semibold text-zinc-100">
              Delete &quot;{deleteConfirmNode.title}&quot;?
            </h3>
            <p className="text-xs text-zinc-400 mt-2">
              This section contains nested chapters or document links. How would you like to handle them?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => handleDeleteConfirmed(true)}
                className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 rounded text-xs font-medium border border-zinc-700 transition-colors text-left flex flex-col"
              >
                <span className="font-semibold text-amber-300">Unwrap Children (Recommended)</span>
                <span className="text-[11px] text-zinc-400">
                  Delete only this section container and preserve all nested documents and chapters by promoting them.
                </span>
              </button>
              <button
                onClick={() => handleDeleteConfirmed(false)}
                className="w-full py-2 px-3 bg-red-950/30 hover:bg-red-900/40 text-red-300 rounded text-xs font-medium border border-red-800/40 transition-colors text-left flex flex-col"
              >
                <span className="font-semibold text-red-400">Cascade Delete All</span>
                <span className="text-[11px] text-zinc-400">
                  Delete this section and remove all nested items inside it from this manuscript outline.
                </span>
              </button>
              <button
                onClick={() => setDeleteConfirmNode(null)}
                className="w-full mt-1 py-1.5 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
