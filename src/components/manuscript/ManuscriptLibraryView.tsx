import React from 'react';
import { BookOpen, Plus, Clock, Tag as TagIcon, Sparkles } from 'lucide-react';
import type { DocumentMetadata, DocumentType } from '@/types';
import { StudioIcon } from '@/components/common/BrandIcon';

export interface ManuscriptLibraryViewProps {
  documents: DocumentMetadata[];
  onSelectDocument: (id: string, docType?: DocumentType) => void;
  onCreateManuscript: () => void;
}

export const ManuscriptLibraryView: React.FC<ManuscriptLibraryViewProps> = ({
  documents,
  onSelectDocument,
  onCreateManuscript,
}) => {
  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-y-auto">
      {/* Top Banner & Header */}
      <div className="border-b border-border/60 bg-card/40 p-6 sm:p-8 shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent text-gold-rich border border-gold-rich/30 text-xs font-medium">
              <Sparkles className="w-3 h-3 text-gold-rich" />
              <span>Cross-Studio Workspace</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground tracking-tight flex items-center gap-3">
              <StudioIcon type="manuscript" className="w-9 h-9 rounded-lg shrink-0" isActive={true} />
              Manuscript Tools & Assembler
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Organize your writings from Poetry Studio, Philosophy Studio, and Lorebook Studio into complete
              manuscripts, chapbooks, and anthologies. Structure hierarchies, preview continuous reading, and export to
              Markdown or printable PDF without altering source documents.
            </p>
          </div>

          <button
            onClick={onCreateManuscript}
            className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-lg shadow-primary/20 transition-all flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Manuscript</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 sm:p-8 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Existing Manuscripts ({documents.length})
          </h2>
        </div>

        {documents.length === 0 ? (
          <div className="py-16 px-6 text-center border border-dashed border-border/80 rounded-2xl bg-card/20 space-y-4">
            <BookOpen className="w-12 h-12 text-gold-rich/40 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-lg font-serif font-semibold text-foreground">No manuscripts assembled yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Create your first manuscript to begin gathering poems, philosophical reflections, and lore entries into
                a unified reading collection.
              </p>
            </div>
            <button
              onClick={onCreateManuscript}
              className="mt-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg shadow-md transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Manuscript</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => {
              let parsedMeta: any = {};
              try {
                if (doc.metadata_json) parsedMeta = JSON.parse(doc.metadata_json);
              } catch {
                parsedMeta = {};
              }
              const manuscriptData = parsedMeta.manuscript || {};
              const subtitle = manuscriptData.subtitle;
              const author = manuscriptData.author;
              const outlineItemsCount = Array.isArray(manuscriptData.outline) ? manuscriptData.outline.length : 0;

              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id, 'manuscript')}
                  className="group p-5 rounded-xl border border-border/80 bg-card hover:bg-accent/30 hover:border-gold-rich/60 hover:shadow-[0_0_16px_rgba(221,186,120,0.12)] cursor-pointer transition-all flex flex-col justify-between space-y-4 text-left"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-serif font-bold text-base text-foreground group-hover:text-gold-rich transition-colors line-clamp-2">
                        {doc.title}
                      </h3>
                      <StudioIcon type="manuscript" className="w-6 h-6 rounded-md shrink-0 opacity-80" isActive={true} />
                    </div>

                    {subtitle && (
                      <p className="text-xs font-serif italic text-muted-foreground line-clamp-1">{subtitle}</p>
                    )}

                    {author && (
                      <p className="text-[11px] font-sans uppercase tracking-wider text-muted-foreground/80">
                        By {author}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between text-[11px]">
                      <span>{outlineItemsCount} root outline items</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground/70" />
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </span>
                    </div>

                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {doc.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground"
                          >
                            <TagIcon className="w-2.5 h-2.5" />
                            {tag}
                          </span>
                        ))}
                        {doc.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground/70">+{doc.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div className="pt-1 flex items-center justify-end text-xs font-medium text-gold-rich group-hover:translate-x-0.5 transition-transform">
                      <span>Open in Assembler →</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
