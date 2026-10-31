import { suppressTemplateProse } from '@/utils/loreTemplateProse';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EchoEntity, EchoCategory, EchoHistoricalContextData } from './types';
import type { EchoSection } from './explorationState';
import { api } from '@/services/api';
import { getStatusDescriptor, type ResolvedEntityState } from '@/utils/stateEngine';
import {
  User,
  MapPin,
  Shield,
  Sparkles,
  Sword,
  Calendar,
  Compass,
  X,
  ExternalLink,
  Briefcase,
  Layers,
  Tag,
  Clock,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface EchoDocumentationPopupProps {
  entity: EchoEntity;
  position: { top: number; left: number };
  onClose: (returnFocus?: boolean) => void;
  onNavigateEntity?: (entityId: string) => void;
  onOpenDocument?: (docId: string) => void;
  historicalContext?: EchoHistoricalContextData | null;
  body?: { status: 'loading' | 'ready' | 'error' | 'unavailable'; prose: string; retry: () => void };
  navigation?: React.ReactNode;
  chooser?: React.ReactNode;
  renderText?: (text: string) => React.ReactNode;
  visitKey?: string;
  section?: EchoSection;
  scrollTop?: number;
  onRemember?: (section: EchoSection, scrollTop: number, focusKey?: string) => void;
  onCancelChooser?: () => void;

}

const CATEGORY_CONFIG: Record<
  EchoCategory,
  { label: string; icon: React.FC<{ className?: string }>; color: string; bg: string }
> = {
  character: { label: 'Character', icon: User, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' },
  location: { label: 'Location', icon: MapPin, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  faction: { label: 'Faction', icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  rule: { label: 'Rule / System', icon: Sparkles, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  artifact: { label: 'Item / Artifact', icon: Sword, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  event: { label: 'Event', icon: Calendar, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  other: { label: 'Lore', icon: Compass, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30' },
};

/**
 * Safely parse inline markdown text into React nodes without dangerouslySetInnerHTML.
 */
export function renderInlineFormatting(text: string, renderText?: (text: string) => React.ReactNode): React.ReactNode {
  const leaf = renderText || ((value: string) => value);
  const tokens: React.ReactNode[] = [];
  const regex = renderText ? /(!?\[[^\]\n]*\]\([^\n]*?\)|<[^>]*>|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g : /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(leaf(text.slice(lastIndex, match.index)));
    }
    const raw = match[0];
    if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push(
        <code key={match.index} className="px-1 py-0.5 rounded bg-muted/40 font-mono text-[11px] text-primary">
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {renderText ? renderInlineFormatting(raw.slice(2, -2), renderText) : raw.slice(2, -2)}
        </strong>
      );
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push(
        <em key={match.index} className="italic text-foreground/90">
          {renderText ? renderInlineFormatting(raw.slice(1, -1), renderText) : raw.slice(1, -1)}
        </em>
      );
    }
    else { tokens.push(raw); }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(leaf(text.slice(lastIndex)));
  }

  return tokens.length > 0 ? tokens : leaf(text);
}

/**
 * Safely render markdown blocks with preserved paragraph breaks and structure.
 */
export function renderMarkdownBlocks(prose: string, renderText?: (text: string) => React.ReactNode): React.ReactNode {
  let cleanProse = prose.trim();
  if (cleanProse.startsWith('---json')) {
    const endIdx = cleanProse.indexOf('---', 7);
    if (endIdx !== -1) {
      cleanProse = cleanProse.slice(endIdx + 3).trim();
    }
  }

  if (!cleanProse) return null;
  if (renderText && cleanProse.includes('```')) {
    return cleanProse.split(/(```[\s\S]*?(?:```|$))/g).map((part, i) => part.startsWith('```')
      ? <p key={i}>{part}</p> : <React.Fragment key={i}>{renderMarkdownBlocks(part, renderText)}</React.Fragment>);
  }


  const rawBlocks = cleanProse.split(/\n\s*\n/);

  return rawBlocks.map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('```')) return <p key={index}>{trimmed}</p>;

    if (trimmed.startsWith('### ')) {
      return (
        <h5 key={index} className="font-serif font-bold text-foreground text-xs mt-2.5 mb-1 text-primary">
          {renderInlineFormatting(trimmed.slice(4), renderText)}
        </h5>
      );
    }
    if (trimmed.startsWith('## ')) {
      return (
        <h4 key={index} className="font-serif font-bold text-foreground text-[13px] mt-3 mb-1 text-primary">
          {renderInlineFormatting(trimmed.slice(3), renderText)}
        </h4>
      );
    }
    if (trimmed.startsWith('# ')) {
      return (
        <h3 key={index} className="font-serif font-bold text-foreground text-sm mt-3.5 mb-1.5 text-primary">
          {renderInlineFormatting(trimmed.slice(2), renderText)}
        </h3>
      );
    }

    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ');
      return (
        <blockquote key={index} className="border-l-2 border-primary/60 pl-2.5 my-2 italic text-muted-foreground bg-muted/10 py-1 rounded-r text-xs">
          {renderInlineFormatting(quoteText, renderText)}
        </blockquote>
      );
    }

    const lines = trimmed.split('\n');
    if (lines.length > 0 && lines.every((l) => l.trim().startsWith('- ') || l.trim().startsWith('* '))) {
      return (
        <ul key={index} className="list-disc list-inside space-y-1 my-2 text-foreground/90 pl-1 text-xs">
          {lines.map((l, li) => (
            <li key={li}>
              {renderInlineFormatting(l.trim().slice(2), renderText)}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={index} className="leading-relaxed text-foreground/90 my-2 text-xs font-sans">
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {renderInlineFormatting(line, renderText)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

export function renderHistoricalStatusBadge(state: ResolvedEntityState) {
  const desc = getStatusDescriptor(state.category, state.value);

  if (desc.isUnknown) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-mono bg-muted/40 text-muted-foreground border border-border/40">
        Unknown
      </span>
    );
  }

  if (desc.isNotIntroduced) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-blue-950/40 text-blue-300 border border-blue-800/40">
        Not Yet Introduced
      </span>
    );
  }

  const isTerminal = ['deceased', 'collapsed', 'ruined', 'shattered', 'extinct'].includes(desc.key || '');
  const isAlert = [
    'contested',
    'damaged',
    'weakened',
    'suppressed',
    'missing',
    'incapacitated',
    'declining',
    'underground',
  ].includes(desc.key || '');
  const isPositive = ['alive', 'active', 'intact', 'stored', 'flourishing', 'concluded', 'legendary'].includes(
    desc.key || ''
  );

  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-[10.5px] font-medium flex items-center gap-1 border',
        isTerminal && 'bg-rose-950/40 text-rose-300 border-rose-800/50',
        isAlert && 'bg-amber-950/40 text-amber-300 border-amber-800/50',
        isPositive && 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50',
        !isTerminal && !isAlert && !isPositive && 'bg-muted/50 text-foreground border-border/60'
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          isTerminal && 'bg-rose-400',
          isAlert && 'bg-amber-400',
          isPositive && 'bg-emerald-400',
          !isTerminal && !isAlert && !isPositive && 'bg-muted-foreground'
        )}
      />
      {desc.label}
    </span>
  );
}

export function renderHistoricalOriginProvenance(state: ResolvedEntityState) {
  switch (state.origin) {
    case 'explicit':
      return (
        <span className="text-[10px] font-semibold text-primary">
          Explicit at this milestone
        </span>
      );
    case 'inherited':
      return (
        <span
          className="text-[10px] text-muted-foreground truncate max-w-[170px] inline-block align-middle"
          title={`Inherited from: ${state.sourceMilestoneTitle || 'earlier milestone'}${state.sourceMilestoneEra ? ` (${state.sourceMilestoneEra})` : ''}`}
        >
          ↳ Inherited: {state.sourceMilestoneTitle || 'earlier milestone'}
        </span>
      );
    case 'unknown':
      return (
        <span className="text-[10px] text-amber-300 font-medium">
          ? Explicit Unknown
        </span>
      );
    case 'not_yet_introduced':
      return (
        <span className="text-[10px] text-blue-300 font-medium">
          Not Yet Introduced
        </span>
      );
    case 'unassigned':
    default:
      return (
        <span className="text-[10px] text-muted-foreground/60 italic font-mono">
          — Unassigned
        </span>
      );
  }
}

export const EchoDocumentationPopup: React.FC<EchoDocumentationPopupProps> = ({
  entity,
  position,
  onClose,
  onNavigateEntity,
  onOpenDocument,
  historicalContext,
  body, navigation, chooser, renderText, visitKey, section, scrollTop = 0, onRemember, onCancelChooser,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const [localTab, setActiveTab] = useState<EchoSection>('overview');
  const activeTab = section ?? localTab;
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restoringRef = useRef(false);
  const rememberRef = useRef(onRemember);
  rememberRef.current = onRemember;
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = scrollTop;
    if (visitKey) headingRef.current?.focus({ preventScroll: true });
  }, [visitKey]);
  useLayoutEffect(() => {
    restoringRef.current = true;
    if (body?.status === 'ready' && bodyRef.current) bodyRef.current.scrollTop = scrollTop;
    const frame = requestAnimationFrame(() => { restoringRef.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [body?.status, visitKey]);
  const [prose, setProse] = useState<string>(() => entity.description || '');
  const [readError, setReadError] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [loadingProse, setLoadingProse] = useState<boolean>(!entity.description);

  // Fetch fresh canonical document body on mount
  useEffect(() => {
    if (body) return;
    let isMounted = true;
    setReadError(false);
    setProse(entity.description || '');
    setLoadingProse(true);
    if (!entity.id) {
      setLoadingProse(false);
      return;
    }

    api.getDocument(entity.id)
      .then((detail) => {
        if (isMounted && detail) {
          const body = detail.content ? detail.content.trim() : '';
          setProse(body);
          setLoadingProse(false);
        }
      })
      .catch((err) => {
        console.warn('Echo dossier: could not load entity document', err);
        if (isMounted) {
          setReadError(true);
          setLoadingProse(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [entity.id, body !== undefined, retryGeneration]);

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (onCancelChooser) onCancelChooser(); else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onCancelChooser]);

  // Click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const cat = CATEGORY_CONFIG[entity.category] || CATEGORY_CONFIG.other;
  const CatIcon = cat.icon;

  // Viewport clamping for position
  const popupWidth = Math.min(384, viewport.width - 32);
  const safeLeft = Math.max(16, Math.min(position.left - 160, viewport.width - popupWidth - 16));
  const safeTop = Math.max(16, Math.min(position.top + 24, viewport.height - Math.min(680, viewport.height - 32)));
  const displayProse = suppressTemplateProse(body ? body.prose : prose, entity.templateEntryType || entity.category, entity.universe);

  const hasHeldOffices = !!(entity.heldOffices && entity.heldOffices.length > 0);
  const hasFactionStructure = !!(entity.factionStructure && entity.factionStructure.positions.length > 0);
  const hasOrganization = hasHeldOffices || hasFactionStructure;

  const totalAttributeCount =
    Object.keys(entity.guidedAttributes).length + entity.customAttributes.length;

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`Echo Lore Documentation: ${entity.name}`}
      className="fixed z-50 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden rounded-xl border border-primary/40 bg-card/95 p-4 shadow-2xl backdrop-blur-md select-text text-foreground font-sans animate-in fade-in zoom-in-95 duration-150"
      style={{ top: `${safeTop}px`, left: `${safeLeft}px`, maxHeight: `${Math.max(0, viewport.height - safeTop - 16)}px` }}
    >
      {navigation}
      {chooser}
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between pb-3 border-b border-border/70">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border',
                cat.bg,
                cat.color
              )}
            >
              <CatIcon className="w-3 h-3" />
              <span>{cat.label}</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-serif">
              {entity.universe}
            </span>
            {entity.status === 'archived' && (
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-rose-950/40 text-rose-400 border border-rose-800/50">
                Archived
              </span>
            )}
          </div>
          <h3 ref={headingRef} tabIndex={-1} className="outline-none text-xl font-serif font-bold tracking-wide text-foreground truncate">
            {entity.name}
          </h3>

          {/* Aliases pill (Phase C1) */}
          {entity.aliases && entity.aliases.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-0.5">
              <Tag className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span className="truncate italic">
                Aliases: {entity.aliases.join(', ')}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onClose()}
          aria-label="Close Documentation"
          className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Historical Context Section (Phase W4) */}
      {historicalContext && (
        <div className="shrink-0 my-2.5 p-2.5 rounded-xl border border-primary/40 bg-primary/5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground min-w-0">
              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="font-semibold text-primary">Historical Context</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground font-mono truncate max-w-[130px]">
                {historicalContext.continuityName}
              </span>
            </div>
            {historicalContext.onNavigateWebOfThought && (
              <button
                type="button"
                onClick={() => {
                  historicalContext.onNavigateWebOfThought?.(
                    historicalContext.universeId,
                    historicalContext.branchId || null,
                    historicalContext.milestoneId,
                    entity.id
                  );
                  onClose(false);
                }}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium shrink-0"
                title="Inspect in Web of Thought State Explorer"
              >
                <span>Inspect in Web of Thought</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-serif font-semibold text-foreground truncate">
              {historicalContext.milestoneTitle}
            </span>
            {historicalContext.milestoneEra && (
              <span className="px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground font-mono text-[10px] shrink-0">
                {historicalContext.milestoneEra}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">State:</span>
              {renderHistoricalStatusBadge(historicalContext.resolvedState)}
            </div>
            <div className="text-right">
              {renderHistoricalOriginProvenance(historicalContext.resolvedState)}
            </div>
          </div>

          {historicalContext.resolvedState.note && (
            <div className="p-1.5 rounded bg-card/60 border border-border/40 text-[10.5px] text-muted-foreground italic">
              <span className="font-semibold not-italic text-foreground/80">Note: </span>
              {historicalContext.resolvedState.note}
            </div>
          )}
        </div>
      )}

      {/* Native buttons retain Tab/Shift+Tab navigation; wrapping keeps every label visible. */}
      <nav aria-label="Echo preview sections" className="shrink-0 grid grid-cols-2 gap-1 pt-2.5 pb-2 text-xs border-b border-border/40">
        {([
          ['overview', 'Overview'],
          ['attributes', `Attributes (${totalAttributeCount})`],
          ['relationships', `Relationships (${entity.relationships.length})`],
          ...(hasOrganization ? [['organization', 'Offices']] : []),
        ] as [typeof activeTab, string][]).map(([tab, label]) => (
          <button key={tab} type="button" aria-pressed={activeTab === tab}
            className={cn('min-w-0 px-2 py-1.5 rounded-md font-medium text-left focus-visible:outline focus-visible:outline-primary', activeTab === tab ? 'bg-primary/20 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => { setActiveTab(tab); if (bodyRef.current) bodyRef.current.scrollTop = 0; onRemember?.(tab, 0); }}>{label}</button>
        ))}
      </nav>

      {historicalContext && <p className="text-[10px] text-muted-foreground">Historical badge: chapter context. Prose and relationships: canonical Lorebook information.</p>}
      {/* Tab Content */}
      <div ref={bodyRef} onScroll={() => { if (!restoringRef.current && (!body || body.status === 'ready')) rememberRef.current?.(activeTab, bodyRef.current?.scrollTop || 0); }} className="min-h-0 shrink overscroll-contain py-3 text-xs leading-relaxed h-64 max-h-[40vh] overflow-y-auto pr-1.5 scrollbar-thin">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {(body ? body.status === 'loading' : loadingProse) ? (
              <div className="py-6 text-center text-xs text-muted-foreground animate-pulse font-sans">
                Loading lore overview...
              </div>
            ) : body?.status === 'unavailable' ? (
              <p role="status">This entry is unavailable in the original writing context.</p>
            ) : (body?.status === 'error' || (!body && readError)) ? (
              <div role="alert">Could not read this entry. <button type="button" className="underline" onClick={body ? body.retry : () => setRetryGeneration(n => n + 1)}>Retry</button></div>
            ) : displayProse.trim() ? (
              <div className="prose-container space-y-1">
                {renderMarkdownBlocks(displayProse, renderText)}
                {onOpenDocument && displayProse.trim().length > 150 && (
                  <div className="pt-2 mt-2 border-t border-border/40 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenDocument(entity.id)}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Open full Lorebook document</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/10 border border-border/40 text-muted-foreground italic text-center text-xs">
                No descriptive lore prose written yet for this entity.
              </div>
            )}

            {/* Quick character profile facts (Phase C1) */}
            {entity.characterProfile && (
              <div className="p-2.5 rounded-lg bg-muted/20 border border-border/50 space-y-1.5">
                <div className="font-semibold text-foreground text-[11px] flex items-center gap-1 text-primary">
                  <User className="w-3 h-3" />
                  <span>Character Profile Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  {entity.characterProfile.age && (
                    <div><span className="text-muted-foreground">Age:</span> {entity.characterProfile.age}</div>
                  )}
                  {entity.characterProfile.species && (
                    <div><span className="text-muted-foreground">Species:</span> {entity.characterProfile.species}</div>
                  )}
                  {entity.characterProfile.gender && (
                    <div><span className="text-muted-foreground">Gender:</span> {entity.characterProfile.gender}</div>
                  )}
                  {entity.characterProfile.vitalStatus && (
                    <div><span className="text-muted-foreground">Status:</span> {entity.characterProfile.vitalStatus}</div>
                  )}
                  {entity.characterProfile.occupation && (
                    <div className="col-span-2"><span className="text-muted-foreground">Occupation:</span> {entity.characterProfile.occupation}</div>
                  )}
                  {entity.characterProfile.narrativeRole && (
                    <div className="col-span-2"><span className="text-muted-foreground">Role:</span> {entity.characterProfile.narrativeRole}</div>
                  )}
                </div>
              </div>
            )}

            {/* Quick guided fact pills */}
            {Object.keys(entity.guidedAttributes).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(entity.guidedAttributes).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/40 border border-border/60 text-[11px]"
                  >
                    <span className="text-muted-foreground">{k}:</span>
                    <span className="font-medium text-foreground">{v}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ATTRIBUTES TAB */}
        {activeTab === 'attributes' && (
          <div className="space-y-2">
            {/* Guided attributes */}
            {Object.entries(entity.guidedAttributes).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/40 text-xs"
              >
                <span className="text-muted-foreground font-medium">{k}</span>
                <span className="text-foreground font-semibold text-right">{v}</span>
              </div>
            ))}

            {/* Detailed appearance / attire / personality if character */}
            {entity.characterProfile?.physicalAppearance && (
              <div className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5">
                <span className="text-muted-foreground font-medium block">Physical Appearance:</span>
                <span className="text-foreground">{entity.characterProfile.physicalAppearance}</span>
              </div>
            )}
            {entity.characterProfile?.clothingAttire && (
              <div className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5">
                <span className="text-muted-foreground font-medium block">Signature Clothing:</span>
                <span className="text-foreground">{entity.characterProfile.clothingAttire}</span>
              </div>
            )}
            {entity.characterProfile?.personality && (
              <div className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5">
                <span className="text-muted-foreground font-medium block">Personality:</span>
                <span className="text-foreground">{entity.characterProfile.personality}</span>
              </div>
            )}

            {/* Custom attributes */}
            {entity.customAttributes.map((attr) => (
              <div
                key={attr.id}
                className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/40 text-xs"
              >
                <span className="text-muted-foreground">{attr.key}</span>
                <span className="text-foreground">{attr.value}</span>
              </div>
            ))}

            {totalAttributeCount === 0 && (
              <div className="text-muted-foreground italic text-center py-4">
                No attributes recorded for this entity.
              </div>
            )}
          </div>
        )}

        {/* RELATIONSHIPS TAB */}
        {activeTab === 'relationships' && (
          <div className="space-y-2">
            {entity.relationships.map((rel, idx) => (
              <div
                key={`${rel.targetId}-${idx}`}
                className="p-2 rounded-lg bg-muted/20 border border-border/50 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                      {rel.relationType}
                    </span>
                    {rel.categoryKind && (
                      <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border/40">
                        {rel.categoryKind}
                      </span>
                    )}
                  </div>

                  {onNavigateEntity ? (
                    <button
                      type="button"
                      onClick={() => onNavigateEntity(rel.targetId)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:underline"
                    >
                      <span>{rel.targetName}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-foreground">
                      {rel.targetName}
                    </span>
                  )}
                </div>
                {rel.description && (
                  <p className="text-[11px] text-muted-foreground italic">
                    {rel.description}
                  </p>
                )}
              </div>
            ))}

            {entity.relationships.length === 0 && (
              <div className="text-muted-foreground italic text-center py-4">
                No active relationships connected to this entity.
              </div>
            )}
          </div>
        )}

        {/* ORGANIZATION TAB (Phase C2 Offices & Hierarchy) */}
        {activeTab === 'organization' && (
          <div className="space-y-2.5">
            {/* Character held offices */}
            {hasHeldOffices && (
              <div className="space-y-1.5">
                <div className="font-semibold text-foreground text-[11px] flex items-center gap-1 text-amber-300">
                  <Briefcase className="w-3 h-3 text-amber-400" />
                  <span>Official Positions Held</span>
                </div>
                {entity.heldOffices!.map((office, i) => (
                  <div
                    key={`${office.factionId}-${i}`}
                    className="p-2 rounded bg-amber-950/20 border border-amber-500/30 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{office.positionTitle}</span>
                      <span className="text-[11px] text-amber-300">{office.factionTitle}</span>
                    </div>
                    {office.branchName && (
                      <div className="text-[10px] text-muted-foreground">Branch: {office.branchName}</div>
                    )}
                    {office.description && (
                      <div className="text-[10px] text-muted-foreground italic">{office.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Faction organization structure */}
            {hasFactionStructure && (
              <div className="space-y-1.5">
                <div className="font-semibold text-foreground text-[11px] flex items-center gap-1 text-amber-300">
                  <Layers className="w-3 h-3 text-amber-400" />
                  <span>Faction Offices &amp; Roster</span>
                </div>
                {entity.factionStructure!.positions.map((pos) => (
                  <div
                    key={pos.id}
                    className="p-2 rounded bg-muted/20 border border-border/40 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{pos.title}</span>
                      {pos.isVacant ? (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-rose-950/30 text-rose-300 border border-rose-600/30">
                          Vacant
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-300">{pos.holders.join(', ')}</span>
                      )}
                    </div>
                    {pos.branchName && (
                      <div className="text-[10px] text-muted-foreground">Branch: {pos.branchName}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer info & Navigation */}
      <div className="shrink-0 pt-2.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
        {onOpenDocument && entity.id ? (
          <button
            type="button"
            onClick={() => onOpenDocument(entity.id)}
            className="hover:underline text-primary flex items-center gap-1 font-medium"
          >
            <span>Open in Lorebook</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        ) : (
          <span>Web of Thought Canonical Record</span>
        )}

        <button type="button" onClick={() => onClose()} className="underline">Return to Editor</button>
        <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
          Esc to close
        </kbd>
      </div>
    </div>
  );
};
