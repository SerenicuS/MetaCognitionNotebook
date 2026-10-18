import React, { useState, useEffect, useCallback } from 'react';
import { DocumentDetail, LorebookMetadata, LorebookEntryType, CanonStatus, LorebookAttribute, SaveStatus } from '@/types';
import {
  FileDown,
  Compass,
  Plus,
  Trash2,
  Shield,
  MapPin,
  Users,
  Calendar,
  Sparkles,
  Sword,
  Sliders,
  Eye,
  Edit3,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface LorebookStudioProps {
  document: DocumentDetail;
  onSave: (content: string, metadataJson?: string) => Promise<void> | void;
  saveStatus: SaveStatus;
}

const ENTRY_TYPE_CONFIG: Record<LorebookEntryType, { label: string; icon: React.ElementType; color: string }> = {
  character: { label: 'Character', icon: Users, color: 'text-blue-400' },
  location: { label: 'Location', icon: MapPin, color: 'text-emerald-400' },
  faction: { label: 'Faction', icon: Shield, color: 'text-amber-400' },
  event: { label: 'Event', icon: Calendar, color: 'text-rose-400' },
  concept: { label: 'Concept / Magic', icon: Sparkles, color: 'text-violet-400' },
  artifact: { label: 'Artifact', icon: Sword, color: 'text-cyan-400' },
  other: { label: 'Lore Entry', icon: Compass, color: 'text-muted-foreground' },
};

const CANON_STATUS_CONFIG: Record<CanonStatus, { label: string; bg: string; text: string; border: string }> = {
  canon: { label: 'Canon', bg: 'bg-emerald-950/30', text: 'text-emerald-400', border: 'border-emerald-700/60' },
  draft: { label: 'Draft', bg: 'bg-amber-950/30', text: 'text-amber-400', border: 'border-amber-700/60' },
  speculative: { label: 'Speculative', bg: 'bg-violet-950/30', text: 'text-violet-400', border: 'border-violet-700/60' },
};

export const LorebookStudio: React.FC<LorebookStudioProps> = ({ document, onSave }) => {
  const [content, setContent] = useState<string>(document.content);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [metadata, setMetadata] = useState<LorebookMetadata>(() => {
    try {
      const parsed = document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json) : {};
      return {
        universe: parsed.universe || 'Unassigned Cosmos',
        book: parsed.book || '',
        chapter: parsed.chapter || '',
        entry_type: parsed.entry_type || 'other',
        canon_status: parsed.canon_status || 'canon',
        attributes: parsed.attributes || [],
      };
    } catch {
      return {
        universe: 'Unassigned Cosmos',
        entry_type: 'other',
        canon_status: 'canon',
        attributes: [],
      };
    }
  });

  useEffect(() => {
    setContent(document.content);
    try {
      const parsed = document.metadata.metadata_json ? JSON.parse(document.metadata.metadata_json) : {};
      setMetadata({
        universe: parsed.universe || 'Unassigned Cosmos',
        book: parsed.book || '',
        chapter: parsed.chapter || '',
        entry_type: parsed.entry_type || 'other',
        canon_status: parsed.canon_status || 'canon',
        attributes: parsed.attributes || [],
      });
    } catch {
      setMetadata({
        universe: 'Unassigned Cosmos',
        entry_type: 'other',
        canon_status: 'canon',
        attributes: [],
      });
    }
  }, [document.metadata.id]);

  const triggerSave = useCallback(
    (newContent: string, newMeta: LorebookMetadata) => {
      const metaJson = JSON.stringify(newMeta);
      onSave(newContent, metaJson);
    },
    [onSave]
  );

  const handleContentChange = (text: string) => {
    setContent(text);
    triggerSave(text, metadata);
  };

  const handleMetaFieldChange = <K extends keyof LorebookMetadata>(field: K, value: LorebookMetadata[K]) => {
    const updated = { ...metadata, [field]: value };
    setMetadata(updated);
    triggerSave(content, updated);
  };

  const handleAddAttribute = () => {
    const newAttr: LorebookAttribute = {
      id: Math.random().toString(36).substring(2, 9),
      key: '',
      value: '',
    };
    const updatedAttrs = [...(metadata.attributes || []), newAttr];
    handleMetaFieldChange('attributes', updatedAttrs);
  };

  const handleUpdateAttribute = (id: string, key: string, value: string) => {
    const updatedAttrs = (metadata.attributes || []).map(a => (a.id === id ? { ...a, key, value } : a));
    handleMetaFieldChange('attributes', updatedAttrs);
  };

  const handleDeleteAttribute = (id: string) => {
    const updatedAttrs = (metadata.attributes || []).filter(a => a.id !== id);
    handleMetaFieldChange('attributes', updatedAttrs);
  };

  const handleExportMarkdown = () => {
    let md = `# ${document.metadata.title}\n\n`;
    md += `**Universe:** ${metadata.universe || 'None'}\n`;
    md += `**Entry Type:** ${metadata.entry_type}\n`;
    md += `**Canon Status:** ${metadata.canon_status}\n\n`;

    if (metadata.attributes && metadata.attributes.length > 0) {
      md += `### Attributes\n\n`;
      metadata.attributes.forEach(a => {
        if (a.key.trim()) {
          md += `- **${a.key}:** ${a.value}\n`;
        }
      });
      md += `\n`;
    }

    md += `---\n\n${content}\n`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.metadata.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TypeIcon = ENTRY_TYPE_CONFIG[metadata.entry_type]?.icon || Compass;
  const canonStyle = CANON_STATUS_CONFIG[metadata.canon_status] || CANON_STATUS_CONFIG.canon;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Studio Header Toolbar */}
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-border/60 bg-muted/10 shrink-0">
        <div className="flex items-center gap-4">
          {/* Breadcrumb Hierarchy */}
          <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">{metadata.universe || 'Universe'}</span>
            {metadata.book && (
              <>
                <span>/</span>
                <span>{metadata.book}</span>
              </>
            )}
            {metadata.chapter && (
              <>
                <span>/</span>
                <span>{metadata.chapter}</span>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Entry Type Selector */}
          <div className="flex items-center gap-2">
            <TypeIcon className={cn('w-4 h-4', ENTRY_TYPE_CONFIG[metadata.entry_type]?.color)} />
            <select
              value={metadata.entry_type}
              onChange={e => handleMetaFieldChange('entry_type', e.target.value as LorebookEntryType)}
              className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border/80 text-xs text-foreground focus:outline-none"
            >
              <option value="character">Character</option>
              <option value="location">Location</option>
              <option value="faction">Faction</option>
              <option value="event">Event</option>
              <option value="concept">Concept</option>
              <option value="artifact">Artifact</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Canon Status Selector */}
          <div className="flex items-center gap-1.5">
            <select
              value={metadata.canon_status}
              onChange={e => handleMetaFieldChange('canon_status', e.target.value as CanonStatus)}
              className={cn(
                'px-2.5 py-1 rounded-lg border text-xs font-semibold focus:outline-none',
                canonStyle.bg,
                canonStyle.text,
                canonStyle.border
              )}
            >
              <option value="canon">Canon</option>
              <option value="draft">Draft</option>
              <option value="speculative">Speculative</option>
            </select>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/20">
            <button
              onClick={() => setActiveTab('write')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                activeTab === 'write' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Write
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                activeTab === 'preview' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
          </div>

          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <FileDown className="w-4 h-4 text-muted-foreground" />
            Export Lore
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Entry Title & Universe Details */}
          <div className="pb-5 border-b border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded', canonStyle.bg, canonStyle.text)}>
                {metadata.canon_status}
              </span>
              <span className="text-xs text-muted-foreground font-serif">
                {metadata.universe} • {ENTRY_TYPE_CONFIG[metadata.entry_type]?.label}
              </span>
            </div>
            <h1 className="text-3xl font-serif font-bold tracking-wide text-foreground">
              {document.metadata.title}
            </h1>
          </div>

          {/* Quick Facts / Attributes Panel */}
          <div className="rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Entity Attributes & Index Parameters
              </span>
              <button
                onClick={handleAddAttribute}
                className="flex items-center gap-1 text-xs text-primary font-medium hover:text-gold-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Field
              </button>
            </div>

            {(!metadata.attributes || metadata.attributes.length === 0) ? (
              <p className="text-xs text-muted-foreground/60 italic">
                No custom parameters defined yet. Add attributes like Region, Allegiance, Power, or Epoch.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {metadata.attributes.map(attr => (
                  <div key={attr.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-background border border-border/50">
                    <input
                      type="text"
                      value={attr.key}
                      onChange={e => handleUpdateAttribute(attr.id, e.target.value, attr.value)}
                      placeholder="Property (e.g. Leader)"
                      className="w-1/3 bg-transparent text-xs font-medium text-muted-foreground focus:outline-none"
                    />
                    <span className="text-border">:</span>
                    <input
                      type="text"
                      value={attr.value}
                      onChange={e => handleUpdateAttribute(attr.id, attr.key, e.target.value)}
                      placeholder="Value"
                      className="flex-1 bg-transparent text-xs text-foreground focus:outline-none"
                    />
                    <button
                      onClick={() => handleDeleteAttribute(attr.id)}
                      className="text-muted-foreground hover:text-rose-400 p-1 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Editor or Preview */}
          {activeTab === 'write' ? (
            <div className="rounded-xl border border-border/60 bg-card/40 p-5 focus-within:border-border">
              <textarea
                value={content}
                onChange={e => handleContentChange(e.target.value)}
                placeholder="Write worldbuilding lore, descriptions, chronology, and connections in Markdown..."
                rows={18}
                className="w-full bg-transparent resize-y focus:outline-none text-[16px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 font-mono"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card p-6 prose prose-invert max-w-none text-[15.5px] leading-relaxed text-foreground">
              {content ? (
                <div className="whitespace-pre-wrap">{content}</div>
              ) : (
                <div className="text-muted-foreground italic">No lore content written yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
