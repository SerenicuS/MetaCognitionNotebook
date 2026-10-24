import React, { useState, useMemo } from 'react';
import { Search, X, Feather, Compass, BookOpen, Check } from 'lucide-react';
import { DocumentDetail, DocumentMetadata, DocumentType } from '../../types';

interface DocumentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (docId: string, docType: DocumentType, title: string) => void;
  documents: Array<DocumentDetail | DocumentMetadata>;
  alreadyLinkedIds?: Set<string>;
}

export const DocumentPickerModal: React.FC<DocumentPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  documents,
  alreadyLinkedIds = new Set(),
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudio, setSelectedStudio] = useState<DocumentType | 'all'>('all');

  const normalizedDocs = useMemo(() => {
    return documents.map((item) => {
      const isDetail = typeof item === 'object' && item !== null && 'metadata' in item && 'content' in item;
      const meta: DocumentMetadata = isDetail ? (item as DocumentDetail).metadata : (item as DocumentMetadata);
      const content: string = isDetail ? (item as DocumentDetail).content : '';
      return { metadata: meta, content };
    });
  }, [documents]);

  const eligibleDocuments = useMemo(() => {
    return normalizedDocs.filter((doc) => {
      if (doc.metadata.doc_type === 'manuscript') return false;
      if (selectedStudio !== 'all' && doc.metadata.doc_type !== selectedStudio) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const titleMatch = doc.metadata.title.toLowerCase().includes(q);
      const contentMatch = doc.content.toLowerCase().includes(q);
      const tagMatch = doc.metadata.tags.some((t: string) => t.toLowerCase().includes(q));
      return titleMatch || contentMatch || tagMatch;
    });
  }, [normalizedDocs, selectedStudio, searchQuery]);

  if (!isOpen) return null;

  const getStudioIcon = (type: DocumentType) => {
    switch (type) {
      case 'poetry':
        return <Feather className="w-4 h-4 text-purple-400" />;
      case 'philosophy':
        return <Compass className="w-4 h-4 text-amber-400" />;
      case 'lorebook':
        return <BookOpen className="w-4 h-4 text-blue-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-750 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Link Document into Manuscript</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Select an existing Poetry, Philosophy, or Lorebook document to include in your outline.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Studio Filters */}
        <div className="p-4 border-b border-zinc-800 space-y-3 bg-zinc-900/50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by title, tags, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-800/80 border border-zinc-700/80 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400">Filter studio:</span>
            {(['all', 'poetry', 'philosophy', 'lorebook'] as const).map((studio) => (
              <button
                key={studio}
                onClick={() => setSelectedStudio(studio)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedStudio === studio
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                    : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                {studio === 'all'
                  ? 'All Studios'
                  : studio.charAt(0).toUpperCase() + studio.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {eligibleDocuments.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No matching documents found.</p>
              <p className="text-xs mt-1 text-zinc-600">Try adjusting your search or studio filter.</p>
            </div>
          ) : (
            eligibleDocuments.map((doc) => {
              const isAlreadyLinked = alreadyLinkedIds.has(doc.metadata.id);
              return (
                <div
                  key={doc.metadata.id}
                  onClick={() => {
                    onSelect(doc.metadata.id, doc.metadata.doc_type, doc.metadata.title);
                    onClose();
                  }}
                  className={`group flex items-start justify-between p-3.5 rounded-lg border cursor-pointer transition-all ${
                    isAlreadyLinked
                      ? 'bg-zinc-800/30 border-zinc-800/80 opacity-75 hover:opacity-100'
                      : 'bg-zinc-800/60 hover:bg-zinc-800 border-zinc-750 hover:border-zinc-700'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      {getStudioIcon(doc.metadata.doc_type)}
                      <span className="font-medium text-sm text-zinc-100 truncate group-hover:text-amber-300 transition-colors">
                        {doc.metadata.title}
                      </span>
                      {isAlreadyLinked && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded">
                          <Check className="w-2.5 h-2.5 text-emerald-400" /> Linked
                        </span>
                      )}
                    </div>
                    {doc.content && (
                      <p className="text-xs text-zinc-400 line-clamp-2 font-mono">
                        {doc.content.slice(0, 140)}...
                      </p>
                    )}
                    {doc.metadata.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {doc.metadata.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-zinc-750/70 text-zinc-400 px-1.5 py-0.5 rounded"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="shrink-0 px-3 py-1.5 bg-amber-600/20 text-amber-300 hover:bg-amber-600 hover:text-white rounded text-xs font-medium border border-amber-500/30 transition-colors">
                    Link
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between text-xs text-zinc-400">
          <span>{eligibleDocuments.length} document{eligibleDocuments.length === 1 ? '' : 's'} available</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
