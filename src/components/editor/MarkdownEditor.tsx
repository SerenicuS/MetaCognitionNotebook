import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { cn } from '@/utils/cn';
import { Code, AlignLeft, Check, Sparkles } from 'lucide-react';
import type { DocumentMetadata, HouseRecord } from '@/types';
import type { Plan } from '@/utils/thought';
import {
  echoEntitiesField,
  confirmedReferencesField,
  candidateMatchesField,
  echoClickPlugin,
  echoWritingTheme,
  confirmReferenceEffect,
  setEntitiesEffect,
} from '@/components/echo/echoExtension';
import type {
  EchoEntity,
  EchoConfirmedReference,
  EchoCandidateMatch,
  EchoPopupState,
  EchoClarificationState,
} from '@/components/echo/types';
import { AUTHOR_ECHO_POLICY, buildEchoCatalog, type EchoSourceContext } from '@/utils/echoContext';
import { classifyLoreDocument } from '@/utils/lorebookNavigation';
import { matchEchoText } from '@/utils/echoMatching';
import { EchoExploration } from '@/components/echo/EchoExploration';
import { EchoClarificationModal } from '@/components/echo/EchoClarificationModal';

const EMPTY_HOUSES: HouseRecord[] = [];
const EMPTY_DOCUMENTS: DocumentMetadata[] = [];

export type EditorEngine = 'codemirror' | 'textarea';

export interface MarkdownEditorProps {
  documentId: string;
  value: string;
  onChange: (value: string) => void;
  onManualSave?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  className?: string;
  engine?: EditorEngine;
  onToggleEngine?: (engine: EditorEngine) => void;
  showTelemetry?: boolean;
  // Phase E2/E2.5: Echo Library live recognition & contextual dossiers
  echoEnabled?: boolean;
  allDocuments?: DocumentMetadata[];
  plan?: Plan | null;
  universeId?: string;
  houseId?: string;
  houses?: HouseRecord[];
  notebookKey?: string;
  onOpenEntity?: (entityId: string) => void;
  chapterMilestoneId?: string | null;
  onNavigateWebOfThought?: (
    universeId: string,
    continuityId: string | null,
    milestoneId: string | null,
    entityId: string | null
  ) => void;
}

// Clean creative-writing theme for CodeMirror 6 with soft line wrapping
const creativeWritingTheme = EditorView.theme({
  '&': {
    height: '100%',
    width: '100%',
    maxWidth: '100%',
    fontSize: '16px',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  '.cm-scroller': {
    overflowY: 'auto',
    overflowX: 'hidden',
    fontFamily: 'inherit',
    minWidth: '0',
    maxWidth: '100%',
    width: '100%',
  },
  '.cm-content': {
    padding: '16px 14px',
    lineHeight: '1.75',
    caretColor: 'var(--primary, #d4af37)',
    minWidth: '0',
    maxWidth: '100%',
    width: '100%',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  '.cm-line': {
    padding: '0',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--primary, #d4af37)',
    borderLeftWidth: '2px',
  },
  '.cm-placeholder': {
    color: 'rgba(160, 160, 160, 0.45)',
    fontStyle: 'italic',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(212, 175, 55, 0.25) !important',
  },
});

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  documentId,
  value,
  onChange,
  onManualSave,
  placeholder = 'Write worldbuilding lore, descriptions, chronology, and connections in Markdown...',
  readOnly = false,
  minHeight = '360px',
  className,
  engine = 'codemirror',
  onToggleEngine,
  showTelemetry = true,
  echoEnabled = false,
  allDocuments = EMPTY_DOCUMENTS,
  plan = null,
  universeId,
  houseId,
  houses = EMPTY_HOUSES,
  notebookKey = 'browser-preview',
  onOpenEntity,
  chapterMilestoneId,
  onNavigateWebOfThought,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentDocIdRef = useRef<string>(documentId);

  // User-controlled Echo Recognition toggle
  const [echoUserEnabled, setEchoUserEnabled] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('mc_echo_recognition_active');
      return saved === null ? true : saved !== 'false';
    }
    return true;
  });

  const isEchoActive = echoEnabled && echoUserEnabled;

  const handleToggleEcho = useCallback(() => {
    setEchoUserEnabled((prev) => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mc_echo_recognition_active', String(next));
      }
      return next;
    });
  }, []);

  // Track the last value emitted so incoming `value` prop doesn't trigger circular updates or race conditions
  const lastEmittedValueRef = useRef<string>(value);

  // Latest callbacks stored in refs to avoid recreating EditorView on every render
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onManualSaveRef = useRef(onManualSave);
  onManualSaveRef.current = onManualSave;

  // Authorization is rooted in the source document, never the sidebar or preview target.
  const sourceUniverseId = useMemo(() => {
    const doc = allDocuments.find(d => d.id === documentId);
    if (!doc || !plan || !houseId || !universeId) return '';
    const ownership = classifyLoreDocument(doc, plan, houseId, houses);
    return ownership.kind === 'assigned' && ownership.universe?.id === universeId ? universeId : '';
  }, [allDocuments, documentId, plan, houseId, houses, universeId]);
  const catalog = useMemo(() => buildEchoCatalog(isEchoActive ? allDocuments : [], sourceUniverseId, houseId || 'house-default', plan, houses),
    [isEchoActive, allDocuments, sourceUniverseId, houseId, plan, houses]);
  const scopedEntities = catalog.entities;
  const scopedEntitiesRef = useRef<EchoEntity[]>(scopedEntities);
  scopedEntitiesRef.current = scopedEntities;
  // Catalog identity is the revision. Closing on refresh discards stale labels, bodies and history.
  const session = useMemo(() => Object.freeze({ notebookKey, documentId, houseId: houseId || 'house-default', universeId: sourceUniverseId,
    milestoneId: chapterMilestoneId || null, policy: AUTHOR_ECHO_POLICY, catalog, engine }),
    [notebookKey, documentId, houseId, sourceUniverseId, chapterMilestoneId, catalog, engine]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [openSession, setOpenSession] = useState<typeof session | null>(null);
  const [inspectionId, setInspectionId] = useState(0);
  const returnFocusRef = useRef<(() => void) | null>(null);
  const captureSource = useCallback(() => {
    const view = viewRef.current;
    const textarea = textareaRef.current;
    const originalSession = sessionRef.current;
    if (view) {
      const snapshot = { selection: view.state.selection, top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft };
      // Inspection never changes selection; live edits/caret movements remain authoritative.
      returnFocusRef.current = () => {
        if (viewRef.current !== view || sessionRef.current !== originalSession) return;
        // Preserve live writer changes; no selection transaction is necessary for inspection.
        const currentTop = view.scrollDOM.scrollTop, currentLeft = view.scrollDOM.scrollLeft;
        const unchanged = view.state.selection === snapshot.selection && currentTop === snapshot.top && currentLeft === snapshot.left;
        view.contentDOM.focus({ preventScroll: true });
        view.scrollDOM.scrollTop = unchanged ? snapshot.top : currentTop;
        view.scrollDOM.scrollLeft = unchanged ? snapshot.left : currentLeft;
      };
    } else if (textarea) {
      returnFocusRef.current = () => {
        if (textareaRef.current !== textarea || sessionRef.current !== originalSession) return;
        const top = textarea.scrollTop, left = textarea.scrollLeft;
        textarea.focus({ preventScroll: true }); textarea.scrollTop = top; textarea.scrollLeft = left;
      };
    }
    setOpenSession(originalSession);
    setInspectionId(id => id + 1);
  }, []);

  // Popups & clarification modal state
  const [popupState, setPopupState] = useState<EchoPopupState>({
    isOpen: false,
    entity: null,
    position: { top: 0, left: 0 },
    from: 0,
    to: 0,
  });

  const [clarificationState, setClarificationState] = useState<EchoClarificationState>({
    isOpen: false,
    matchedText: '',
    candidates: [],
    from: 0,
    to: 0,
    position: { top: 0, left: 0 },
  });

  // Reset open popups immediately on document switch to prevent stale context
  useEffect(() => {
    setPopupState({ isOpen: false, entity: null, position: { top: 0, left: 0 }, from: 0, to: 0 });
    setClarificationState({ isOpen: false, matchedText: '', candidates: [], from: 0, to: 0, position: { top: 0, left: 0 } });
    setOpenSession(null);
    returnFocusRef.current = null;
  }, [session]);

  const handleClosePopup = useCallback((returnFocus = true) => {
    setPopupState(prev => ({ ...prev, isOpen: false }));
    if (returnFocus) returnFocusRef.current?.();
    returnFocusRef.current = null;
  }, []);

  const handleDismissClarification = useCallback(() => {
    setClarificationState(prev => ({ ...prev, isOpen: false }));
    returnFocusRef.current?.();
  }, []);

  const handleSelectReference = useCallback(
    (entityId: string, rect: DOMRect, from: number, to: number) => {
      const entity = scopedEntitiesRef.current.find((e) => e.id === entityId);
      if (entity) {
        captureSource();
        setPopupState({
          isOpen: true,
          entity,
          position: { top: rect.bottom, left: rect.left },
          from,
          to,
        });
      }
    },
    []
  );

  const handleClarifyCandidate = useCallback(
    (candidate: EchoCandidateMatch, rect: DOMRect) => {
      const ids = new Set(scopedEntitiesRef.current.map(e => e.id));
      const matches = candidate.matchingEntities.filter(e => ids.has(e.id));
      if (!matches.length) return;
      candidate = { ...candidate, matchingEntities: matches, isAmbiguous: matches.length > 1 };
      captureSource();
      if (candidate.isAmbiguous) {
        setClarificationState({
          isOpen: true,
          matchedText: candidate.matchedText,
          candidates: candidate.matchingEntities,
          from: candidate.from,
          to: candidate.to,
          position: { top: rect.bottom, left: rect.left },
        });
      } else {
        const entity = candidate.matchingEntities[0];
        if (entity) {
          setPopupState({
            isOpen: true,
            entity,
            position: { top: rect.bottom, left: rect.left },
            from: candidate.from,
            to: candidate.to,
          });
        }
      }
    },
    []
  );

  // Keyboard navigation: Inspect recognized entity under/near cursor via Alt+E or Mod-Shift-E
  const handleInspectAtCursor = useCallback(
    (view: EditorView) => {
      const pos = view.state.selection.main.head;
      const candidates = view.state.field(candidateMatchesField, false)?.candidates || [];
      const match =
        candidates.find((c) => c.from <= pos && c.to >= pos) ||
        candidates.find((c) => Math.abs(c.from - pos) <= (c.matchedText?.length || 0) + 4);

      if (match) {
        const coords = view.coordsAtPos(match.from) || { bottom: 120, left: 120 };
        const rect = {
          bottom: coords.bottom,
          left: coords.left,
          top: coords.bottom - 16,
          right: coords.left + 60,
          width: 60,
          height: 16,
        } as DOMRect;
        handleClarifyCandidate(match, rect);
        return true;
      }

      const refs = view.state.field(confirmedReferencesField, false)?.references || [];
      const refMatch =
        refs.find((r) => r.from <= pos && r.to >= pos) ||
        refs.find((r) => Math.abs(r.from - pos) <= (r.matchedText?.length || 0) + 4);

      if (refMatch) {
        const coords = view.coordsAtPos(refMatch.from) || { bottom: 120, left: 120 };
        const rect = {
          bottom: coords.bottom,
          left: coords.left,
          top: coords.bottom - 16,
          right: coords.left + 60,
          width: 60,
          height: 16,
        } as DOMRect;
        handleSelectReference(refMatch.entityId, rect, refMatch.from, refMatch.to);
        return true;
      }

      return false;
    },
    [handleClarifyCandidate, handleSelectReference]
  );

  const handleConfirmReference = useCallback(
    (entity: EchoEntity) => {
      if (!scopedEntitiesRef.current.some(e => e.id === entity.id)) return;
      const { from, to, matchedText, position } = clarificationState;

      const newRef: EchoConfirmedReference = {
        id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        entityId: entity.id,
        from,
        to,
        matchedText,
      };

      const view = viewRef.current;
      if (view && to <= view.state.doc.length && view.state.doc.sliceString(from, to).toLowerCase() === matchedText.toLowerCase()) {
        view.dispatch({ effects: confirmReferenceEffect.of(newRef) });
      }

      setClarificationState((prev) => ({ ...prev, isOpen: false }));
      setPopupState({
        isOpen: true,
        entity,
        position,
        from,
        to,
      });
    },
    [clarificationState]
  );

  // Track telemetry
  const [stats, setStats] = useState<{ words: number; chars: number; lines: number }>(() => {
    const text = value || '';
    const trimmed = text.trim();
    return {
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      chars: text.length,
      lines: text ? text.split('\n').length : 1,
    };
  });

  // Recompute stats
  const updateStats = (text: string) => {
    const trimmed = text.trim();
    setStats({
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      chars: text.length,
      lines: text ? text.split('\n').length : 1,
    });
  };

  // 1. Initialize or Re-initialize CodeMirror 6 when engine is 'codemirror'
  useEffect(() => {
    if (engine !== 'codemirror' || !containerRef.current) return;

    currentDocIdRef.current = documentId;
    lastEmittedValueRef.current = value;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        history(),
        EditorView.lineWrapping,
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              if (onManualSaveRef.current) {
                void onManualSaveRef.current();
                return true;
              }
              return false;
            },
          },
          {
            key: 'Mod-Shift-e',
            run: (view) => handleInspectAtCursor(view),
          },
          {
            key: 'Alt-e',
            run: (view) => handleInspectAtCursor(view),
          },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        cmPlaceholder(placeholder),
        creativeWritingTheme,
        echoWritingTheme,
        EditorState.readOnly.of(readOnly),
        echoEntitiesField.init(() => scopedEntitiesRef.current),
        confirmedReferencesField,
        candidateMatchesField,
        echoClickPlugin({
          onSelectReference: handleSelectReference,
          onClarifyCandidate: handleClarifyCandidate,
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newText = update.state.doc.toString();
            lastEmittedValueRef.current = newText;
            updateStats(newText);
            onChangeRef.current(newText);
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;
    updateStats(value);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [engine, documentId, readOnly, placeholder]);

  // Dispatch updated scopedEntities when they change or when user toggles Echo recognition
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: setEntitiesEffect.of(isEchoActive ? scopedEntities : []),
    });
  }, [scopedEntities, isEchoActive]);

  // 2. Synchronize external content updates (e.g. from disk reloads, resets, or document switches)
  useEffect(() => {
    if (engine !== 'codemirror' || !viewRef.current) return;

    // If change was triggered internally by user typing, do not dispatch back
    if (value === lastEmittedValueRef.current) return;

    const view = viewRef.current;
    const currentText = view.state.doc.toString();

    // If external value changed (e.g. document switched or reverted)
    if (currentText !== value) {
      lastEmittedValueRef.current = value;
      view.dispatch({
        changes: { from: 0, to: currentText.length, insert: value },
      });
      updateStats(value);
    }
  }, [value, engine]);

  const inspectTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea || !isEchoActive) return;
    const candidate = matchEchoText(textarea.value, catalog.index).find(c => c.from <= textarea.selectionStart && c.to >= textarea.selectionStart);
    if (candidate) handleClarifyCandidate(candidate, textarea.getBoundingClientRect());
  };
  const surfaces = <>
    {openSession === session && popupState.isOpen && popupState.entity && plan && <EchoExploration
      key={inspectionId} entityId={popupState.entity.id} source={session as EchoSourceContext} catalog={catalog} plan={plan} houses={houses}
      position={popupState.position} onClose={handleClosePopup}
      onOpenDocument={id => { handleClosePopup(false); onOpenEntity?.(id); }}
      onNavigateWebOfThought={onNavigateWebOfThought}
    />}
    {openSession === session && clarificationState.isOpen && <EchoClarificationModal
      matchedText={clarificationState.matchedText} candidates={clarificationState.candidates} position={clarificationState.position}
      onConfirm={handleConfirmReference} onDismiss={handleDismissClarification} />}
  </>;
  // The application boundary is inside Vault's inert region, outside studio overflow containers.
  const portalHost = (containerRef.current || textareaRef.current)?.closest('[data-echo-boundary]') || (typeof document !== 'undefined' ? document.getElementById('root') : null);
  const overlay = portalHost ? createPortal(surfaces, portalHost) : surfaces;

  // Fallback Textarea Engine
  if (engine === 'textarea') {
    return (
      <div className={cn('relative flex flex-col rounded-xl border border-border/60 bg-card/40 p-4 focus-within:border-border transition-colors min-w-0 max-w-full w-full', className)}>
        {/* Engine Switcher Bar */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40 text-xs text-muted-foreground select-none">
          <div className="flex items-center gap-1.5 font-medium">
            <AlignLeft className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Standard Textarea (Fallback Engine)</span>
          </div>

          {onToggleEngine && (
            <button
              type="button"
              onClick={() => onToggleEngine('codemirror')}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/10 hover:bg-primary/20 text-[11px] font-semibold text-primary transition-colors"
              title="Switch to CodeMirror 6 Engine"
            >
              <Code className="w-3 h-3" />
              <span>Switch to CodeMirror 6</span>
            </button>
          )}
        </div>

        {echoEnabled && <button type="button" className="text-xs underline mb-2 text-primary self-start" onMouseDown={e => e.preventDefault()} onClick={inspectTextarea}>Inspect lore at cursor (Alt+E)</button>}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            lastEmittedValueRef.current = e.target.value;
            updateStats(e.target.value);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if ((e.altKey || ((e.ctrlKey || e.metaKey) && e.shiftKey)) && e.key.toLowerCase() === 'e') { e.preventDefault(); inspectTextarea(); return; }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault();
              if (onManualSaveRef.current) {
                void onManualSaveRef.current();
              }
            }
          }}
          placeholder={placeholder}
          readOnly={readOnly}
          rows={18}
          className="w-full min-w-0 max-w-full bg-transparent resize-y focus:outline-none text-[16px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 font-mono break-words whitespace-pre-wrap"
          style={{ minHeight }}
        />

        {overlay}
        {showTelemetry && (
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/30 text-[11px] text-muted-foreground select-none font-mono">
            <span>Fallback Engine active</span>
            <div className="flex items-center gap-3">
              <span>{stats.words} words</span>
              <span>•</span>
              <span>{stats.chars} chars</span>
              <span>•</span>
              <span>{stats.lines} lines</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // CodeMirror 6 Engine
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border border-border/60 bg-card/40 focus-within:border-border transition-colors overflow-hidden min-w-0 max-w-full w-full',
        className
      )}
      style={{ minHeight }}
    >
      {/* Engine & Echo Toolbar Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-b border-border/40 text-xs text-muted-foreground select-none">
        <div className="flex items-center gap-2 font-medium">
          <Code className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-foreground">CodeMirror 6</span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
            Production Foundation
          </span>
          {echoEnabled && (
            <button
              type="button"
              onClick={handleToggleEcho}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors border',
                isEchoActive
                  ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                  : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
              )}
              title={
                isEchoActive
                  ? 'Echo Live Lore Recognition is active. Click to pause (or press Alt+E to inspect lore at cursor).'
                  : 'Echo Live Lore Recognition is paused. Click to enable.'
              }
            >
              <Sparkles className="w-3 h-3" />
              <span>Echo {isEchoActive ? 'On' : 'Off'}</span>
            </button>
          )}
        </div>

        {onToggleEngine && (
          <button
            type="button"
            onClick={() => onToggleEngine('textarea')}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-border/60 bg-muted/20 hover:bg-muted/40 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            title="Switch to fallback native textarea"
          >
            <AlignLeft className="w-3 h-3" />
            <span>Use Fallback Textarea</span>
          </button>
        )}
      </div>

      {/* CodeMirror 6 Mount Point */}
      <div
        ref={containerRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Markdown Manuscript Content"
        className="flex-1 min-w-0 max-w-full w-full overflow-y-auto overflow-x-hidden cursor-text select-text"
        style={{ minHeight: 'calc(100% - 70px)' }}
      />

      {/* Telemetry Bar */}
      {showTelemetry && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-muted/10 border-t border-border/40 text-[11px] text-muted-foreground select-none font-mono">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Check className="w-3 h-3" />
              <span>Clean Markdown (0 synthetic tokens)</span>
            </span>
            {echoEnabled && (
              <span
                className={cn(
                  'flex items-center gap-1 text-[10px] font-sans font-medium px-1.5 py-0.5 rounded border',
                  isEchoActive
                    ? 'text-primary bg-primary/10 border-primary/20'
                    : 'text-muted-foreground bg-muted/20 border-border/40'
                )}
              >
                <Sparkles className="w-3 h-3" />
                <span>Echo {isEchoActive ? `Live (${scopedEntities.length} entities)` : 'Paused'}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span>{stats.words} words</span>
            <span>•</span>
            <span>{stats.chars} chars</span>
            <span>•</span>
            <span>{stats.lines} lines</span>
          </div>
        </div>
      )}

      {overlay}

    </div>
  );
};
