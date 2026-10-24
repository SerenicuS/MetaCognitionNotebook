import React, { useState } from 'react';
import {
  BookOpen,
  List,
  Feather,
  Compass,
  FileText,
  AlertCircle,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';
import {
  DocumentDetail,
  DocumentMetadata,
  ManuscriptMetadata,
  ManuscriptNode,
} from '../../types';
import {
  computeManuscriptStats,
  flattenManuscriptOutline,
} from '../../utils/manuscript';

interface ManuscriptPreviewProps {
  title: string;
  metadata: ManuscriptMetadata;
  outline: ManuscriptNode[];
  documents: Array<DocumentDetail | DocumentMetadata>;
}

export const ManuscriptPreview: React.FC<ManuscriptPreviewProps> = ({
  title,
  metadata,
  outline,
  documents,
}) => {
  const [showToc, setShowToc] = useState(true);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  const resolvedItems = React.useMemo(() => {
    return flattenManuscriptOutline(outline, documents);
  }, [outline, documents]);

  const stats = React.useMemo(() => {
    return computeManuscriptStats(resolvedItems);
  }, [resolvedItems]);

  const scrollToItem = (index: number) => {
    setActiveItemIndex(index);
    const element = document.getElementById(`reading-item-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top Reading Metrics Bar */}
      <div className="px-6 py-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            onClick={() => setShowToc((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              showToc
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                : 'hover:bg-zinc-800 text-zinc-300'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Table of Contents</span>
          </button>

          <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            {stats.totalWords.toLocaleString()} Words
          </span>

          <span className="flex items-center gap-1.5 text-zinc-400 hidden sm:flex">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            ~{stats.estimatedPages} Pages
          </span>

          <span className="flex items-center gap-1.5 text-zinc-400 hidden sm:flex">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            ~{stats.readingTimeMinutes} min read
          </span>
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <span>{resolvedItems.length} entries assembled</span>
        </div>
      </div>

      {/* Main Content Area: Split between TOC Sidebar and Continuous Reading Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table of Contents Drawer */}
        {showToc && (
          <aside className="w-64 sm:w-72 border-r border-zinc-800 bg-zinc-900/70 overflow-y-auto shrink-0 p-3 space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 px-2 py-1 mb-1">
              Contents
            </div>
            {resolvedItems.length === 0 ? (
              <p className="text-xs text-zinc-500 px-2">Outline is empty.</p>
            ) : (
              resolvedItems.map((item, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  onClick={() => scrollToItem(idx)}
                  style={{ paddingLeft: `${Math.max(8, (item.level - 1) * 14 + 8)}px` }}
                  className={`w-full text-left py-1.5 px-2 rounded text-xs transition-colors truncate flex items-center gap-1.5 ${
                    activeItemIndex === idx
                      ? 'bg-amber-600/25 text-amber-200 font-medium border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  {item.type === 'section' && <span className="text-amber-400 font-semibold">•</span>}
                  {item.type === 'linked_doc' && item.docType === 'poetry' && (
                    <Feather className="w-3 h-3 text-purple-400 shrink-0" />
                  )}
                  {item.type === 'linked_doc' && item.docType === 'philosophy' && (
                    <Compass className="w-3 h-3 text-amber-400 shrink-0" />
                  )}
                  {item.type === 'linked_doc' && item.docType === 'lorebook' && (
                    <BookOpen className="w-3 h-3 text-blue-400 shrink-0" />
                  )}
                  {item.type === 'original_text' && (
                    <FileText className="w-3 h-3 text-emerald-400 shrink-0" />
                  )}
                  {item.type === 'missing_doc' && (
                    <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate">{item.title}</span>
                </button>
              ))
            )}
          </aside>
        )}

        {/* Continuous Reading Canvas */}
        <main className="flex-1 overflow-y-auto px-6 py-12 md:px-16 lg:px-24 bg-zinc-950">
          <div className="max-w-2xl mx-auto space-y-16">
            {/* Title / Cover Header */}
            <header className="text-center border-b border-zinc-800 pb-12 pt-6 space-y-3">
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-zinc-100 tracking-tight">
                {title}
              </h1>
              {metadata.subtitle && (
                <p className="text-lg font-serif italic text-amber-200/80">
                  {metadata.subtitle}
                </p>
              )}
              {metadata.author && (
                <p className="text-sm font-sans uppercase tracking-widest text-zinc-400 pt-2">
                  By {metadata.author}
                </p>
              )}
            </header>

            {/* Resolved Content Sequence */}
            {resolvedItems.length === 0 ? (
              <div className="text-center py-20 text-zinc-500">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20 text-amber-400" />
                <p className="text-sm">Your manuscript outline has no entries yet.</p>
                <p className="text-xs mt-1 text-zinc-600">Switch to Outline & Editor to start organizing.</p>
              </div>
            ) : (
              resolvedItems.map((item, idx) => (
                <article
                  key={`${item.id}-${idx}`}
                  id={`reading-item-${idx}`}
                  className="scroll-mt-6 space-y-6"
                >
                  {/* Section Container Header */}
                  {item.type === 'section' && (
                    <div className="pt-8 border-t border-zinc-900 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/40">
                          Level {item.level} Section
                        </span>
                      </div>
                      <h2
                        className={`font-serif font-bold text-zinc-100 tracking-tight ${
                          item.level === 1
                            ? 'text-2xl sm:text-3xl'
                            : item.level === 2
                            ? 'text-xl sm:text-2xl'
                            : 'text-lg sm:text-xl'
                        }`}
                      >
                        {item.title}
                      </h2>
                      {item.description && (
                        <p className="text-sm font-serif italic text-zinc-400 pt-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Original Manuscript Prose */}
                  {item.type === 'original_text' && (
                    <div className="space-y-4">
                      <h3 className="text-lg sm:text-xl font-serif font-semibold text-zinc-100 border-b border-zinc-900 pb-2">
                        {item.title}
                      </h3>
                      <div className="font-serif text-sm sm:text-base leading-relaxed text-zinc-200 whitespace-pre-wrap">
                        {item.content || <span className="text-zinc-600 italic">No text provided.</span>}
                      </div>
                    </div>
                  )}

                  {/* Linked Studio Document */}
                  {item.type === 'linked_doc' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                        <h3 className="text-lg sm:text-xl font-serif font-semibold text-zinc-100">
                          {item.title}
                        </h3>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400">
                          {item.docType}
                        </span>
                      </div>

                      {/* Content Render Matched to Type */}
                      {item.docType === 'poetry' ? (
                        <div className="pl-6 border-l-2 border-purple-800/40 my-4 space-y-4 font-serif text-sm sm:text-base leading-relaxed text-zinc-200">
                          {item.content?.split(/\n\s*\n/).map((stanza, sIdx) => (
                            <div key={sIdx} className="space-y-1">
                              {stanza.split('\n').map((line, lIdx) => (
                                <p key={lIdx} className="leading-snug">
                                  {line || '\u00A0'}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="font-serif text-sm sm:text-base leading-relaxed text-zinc-200 space-y-4">
                          {item.content?.split(/\n\s*\n/).map((para, pIdx) => {
                            if (!para.trim()) return null;
                            return (
                              <p key={pIdx} className="leading-relaxed">
                                {para.trim()}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Missing Document Notice */}
                  {item.type === 'missing_doc' && (
                    <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-xl space-y-1">
                      <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{item.title}</span>
                      </div>
                      <p className="text-xs text-amber-400/80 pl-6">
                        Referenced document ID <code className="bg-black/30 px-1 py-0.5 rounded text-amber-200">{item.docId}</code> is missing from the active library.
                      </p>
                    </div>
                  )}
                </article>
              ))
            )}

            {/* End of Manuscript Marker */}
            {resolvedItems.length > 0 && (
              <div className="text-center py-16 border-t border-zinc-900 text-zinc-600 text-xs font-serif italic">
                — End of Manuscript —
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
