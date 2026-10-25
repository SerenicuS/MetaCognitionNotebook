import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  echoEntitiesField,
  confirmedReferencesField,
  candidateMatchesField,
  echoClickPlugin,
  echoWritingTheme,
  confirmReferenceEffect,
  resetReferencesEffect,
} from './echoExtension';
import {
  MOCK_LORE_ENTITIES,
  MOCK_UNIVERSE_NAME,
} from './mockLore';
import type {
  EchoEntity,
  EchoConfirmedReference,
  EchoPopupState,
  EchoClarificationState,
  EchoCandidateMatch,
} from './types';
import { EchoDocumentationPopup } from './EchoDocumentationPopup';
import { EchoClarificationModal } from './EchoClarificationModal';
import {
  CheckCircle2,
  Clock,
  Save,
  RotateCcw,
  Sparkles,
  FileText,
  ShieldCheck,
  X,
} from 'lucide-react';

interface EchoEditorPrototypeProps {
  onClose?: () => void;
  initialText?: string;
}

const DEFAULT_SAMPLE_TEXT = `After years of exile, Laxus finally returned to Avalon.

The mist-shrouded citadel rose above the silent lakes, ancient banners fluttering from the ramparts.
Laxus looked towards the great gatehouse where the Northern Guard stood sentinel.`;

const AMBIGUOUS_SAMPLE_TEXT = `Laxus entered the Grand Library of Avalon.

There, Laxus was studying the ancient Silver Chronicles beneath the vaulted arches.
The Northern Guard stood watch outside the courtyard.`;

const UNICODE_SAMPLE_TEXT = `Under the cold twilight of Avalon, Éowyn scouted the outer perimeter.
Laxus watched from the northern ramparts as the outriders returned.`;

export const EchoEditorPrototype: React.FC<EchoEditorPrototypeProps> = ({
  onClose,
  initialText = DEFAULT_SAMPLE_TEXT,
}) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  // Serialized raw Markdown content
  const [serializedMarkdown, setSerializedMarkdown] = useState<string>(initialText);
  // Simulated save status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'editing' | 'unsaved'>('saved');
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string>('Just now');

  // Tracked references telemetry
  const [trackedReferences, setTrackedReferences] = useState<EchoConfirmedReference[]>([]);

  // Popups & modals state
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

  // 1. Mock Save action (Preserves exact raw text, zero Tauri calls)
  const handleMockSave = useCallback(() => {
    if (!editorViewRef.current) return;
    const currentText = editorViewRef.current.state.doc.toString();
    setSerializedMarkdown(currentText);
    setSaveStatus('saved');
    setLastSavedTimestamp(new Date().toLocaleTimeString());
  }, []);

  // 2. Click handler callbacks from CodeMirror extension
  const handleSelectReference = useCallback(
    (entityId: string, rect: DOMRect, from: number, to: number) => {
      const entity = MOCK_LORE_ENTITIES.find((e) => e.id === entityId);
      if (entity) {
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
      setClarificationState({
        isOpen: true,
        matchedText: candidate.matchedText,
        candidates: candidate.matchingEntities,
        from: candidate.from,
        to: candidate.to,
        position: { top: rect.bottom, left: rect.left },
      });
    },
    []
  );

  // 3. Confirm reference from Clarification Modal
  const handleConfirmReference = useCallback(
    (entity: EchoEntity) => {
      if (!editorViewRef.current) return;
      const { from, to, matchedText } = clarificationState;

      const newRef: EchoConfirmedReference = {
        id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        entityId: entity.id,
        from,
        to,
        matchedText,
      };

      editorViewRef.current.dispatch({
        effects: confirmReferenceEffect.of(newRef),
      });

      // Update telemetry
      const updatedRefs = editorViewRef.current.state.field(confirmedReferencesField).references;
      setTrackedReferences(updatedRefs);

      // Close clarification modal
      setClarificationState((prev) => ({ ...prev, isOpen: false }));
    },
    [clarificationState]
  );

  // 4. Dismiss clarification modal (prose remains 100% untouched)
  const handleDismissClarification = useCallback(() => {
    setClarificationState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // 5. Navigate to related entity from within documentation popup
  const handleNavigateRelatedEntity = useCallback((targetName: string) => {
    const targetEntity = MOCK_LORE_ENTITIES.find(
      (e) => e.name.toLowerCase() === targetName.toLowerCase()
    );
    if (targetEntity) {
      setPopupState((prev) => ({
        ...prev,
        entity: targetEntity,
      }));
    }
  }, []);

  // 6. Reset all confirmed references
  const handleResetReferences = useCallback(() => {
    if (!editorViewRef.current) return;
    editorViewRef.current.dispatch({
      effects: resetReferencesEffect.of(),
    });
    setTrackedReferences([]);
    setPopupState((prev) => ({ ...prev, isOpen: false }));
    setClarificationState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // 7. Load scenario text helper
  const handleLoadScenario = useCallback((text: string) => {
    if (!editorViewRef.current) return;
    const view = editorViewRef.current;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      effects: resetReferencesEffect.of(),
    });
    setSerializedMarkdown(text);
    setTrackedReferences([]);
    setSaveStatus('saved');
  }, []);

  // Initialize CodeMirror 6 View
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const startState = EditorState.create({
      doc: initialText,
      extensions: [
        markdown(),
        history(),
        keymap.of([
          ...historyKeymap,
          ...defaultKeymap,
          {
            key: 'Mod-s',
            run: () => {
              handleMockSave();
              return true;
            },
          },
        ]),
        echoEntitiesField.init(() => MOCK_LORE_ENTITIES),
        confirmedReferencesField,
        candidateMatchesField,
        echoClickPlugin({
          onSelectReference: handleSelectReference,
          onClarifyCandidate: handleClarifyCandidate,
        }),
        echoWritingTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newText = update.state.doc.toString();
            setSerializedMarkdown(newText);
            setSaveStatus('editing');

            // Sync confirmed references telemetry
            const refs = update.state.field(confirmedReferencesField).references;
            setTrackedReferences(refs);
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorContainerRef.current,
    });

    editorViewRef.current = view;

    // Initial telemetry
    setTrackedReferences(view.state.field(confirmedReferencesField).references);

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [handleMockSave, handleSelectReference, handleClarifyCandidate, initialText]);

  // Debounced simulated autosave
  useEffect(() => {
    if (saveStatus !== 'editing') return;
    const timer = setTimeout(() => {
      setSaveStatus('saved');
      setLastSavedTimestamp(new Date().toLocaleTimeString());
    }, 1500);
    return () => clearTimeout(timer);
  }, [saveStatus, serializedMarkdown]);

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground font-sans overflow-hidden select-none">
      {/* Top Banner Toolbar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/80 bg-card/70 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-serif font-bold text-foreground">
                  Echo Library E0: CodeMirror 6 Feasibility Prototype
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Isolated Lab
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Universe: <strong className="text-foreground">{MOCK_UNIVERSE_NAME}</strong> • Pure Markdown text preservation verification
              </p>
            </div>
          </div>
        </div>

        {/* SaveCoordinator Mock Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1 rounded bg-muted/30 border border-border/50">
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved ({lastSavedTimestamp})</span>
              </span>
            )}
            {saveStatus === 'editing' && (
              <span className="flex items-center gap-1 text-primary font-medium animate-pulse">
                <Clock className="w-3.5 h-3.5" />
                <span>Editing (autosaving...)</span>
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <span>Unsaved Changes</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleMockSave}
            title="Simulated Save (Ctrl+S)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Mock Save</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted/40 transition-colors"
              title="Close Prototype"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Scenario Launcher Bar */}
      <div className="flex items-center justify-between px-6 py-2 bg-muted/20 border-b border-border/50 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">Test Scenarios:</span>
          <button
            type="button"
            onClick={() => handleLoadScenario(DEFAULT_SAMPLE_TEXT)}
            className="px-2.5 py-1 rounded bg-card hover:bg-muted/60 border border-border text-[11px] font-medium transition-colors"
          >
            1. Standard Lore (Laxus, Avalon)
          </button>
          <button
            type="button"
            onClick={() => handleLoadScenario(AMBIGUOUS_SAMPLE_TEXT)}
            className="px-2.5 py-1 rounded bg-card hover:bg-muted/60 border border-border text-[11px] font-medium transition-colors"
          >
            2. Ambiguous Names (Duplicate Laxus)
          </button>
          <button
            type="button"
            onClick={() => handleLoadScenario(UNICODE_SAMPLE_TEXT)}
            className="px-2.5 py-1 rounded bg-card hover:bg-muted/60 border border-border text-[11px] font-medium transition-colors"
          >
            3. Unicode & Accents (Éowyn)
          </button>
          <button
            type="button"
            onClick={() => handleLoadScenario('')}
            className="px-2.5 py-1 rounded bg-card hover:bg-muted/60 border border-border text-[11px] text-muted-foreground transition-colors"
          >
            Clear Editor
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetReferences}
            className="text-[11px] text-muted-foreground hover:text-rose-400 flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset References</span>
          </button>
          <span className="text-muted-foreground/60">|</span>
          <span className="text-[11px] text-muted-foreground">
            {trackedReferences.length} Confirmed Reference{trackedReferences.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Main Split Workbench */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: CodeMirror 6 Editor Container */}
        <section
          aria-label="CodeMirror 6 Creative Writing Surface"
          className="flex-1 flex flex-col bg-background/50 border-r border-border/70 overflow-hidden relative"
        >
          <div className="px-5 py-2 border-b border-border/40 bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Interactive CodeMirror 6 Writing Surface</span>
            </span>
            <span className="text-[11px]">
              Dotted gold line = confirmed reference • Dashed line = unconfirmed candidate
            </span>
          </div>

          {/* Mount point for CodeMirror */}
          <div
            ref={editorContainerRef}
            className="flex-1 overflow-y-auto cursor-text select-text"
          />

          {/* Contextual Documentation Popup */}
          {popupState.isOpen && popupState.entity && (
            <EchoDocumentationPopup
              entity={popupState.entity}
              position={popupState.position}
              onClose={() => setPopupState((prev) => ({ ...prev, isOpen: false }))}
              onNavigateEntity={handleNavigateRelatedEntity}
            />
          )}

          {/* Clarification Modal for Unconfirmed Candidates */}
          {clarificationState.isOpen && (
            <EchoClarificationModal
              matchedText={clarificationState.matchedText}
              candidates={clarificationState.candidates}
              position={clarificationState.position}
              onConfirm={handleConfirmReference}
              onDismiss={handleDismissClarification}
            />
          )}
        </section>

        {/* RIGHT COLUMN: Live Telemetry, Markdown Inspection & Verification Checklist */}
        <aside
          aria-label="Echo Verification Telemetry"
          className="w-96 flex flex-col bg-card/40 border-l border-border/70 overflow-hidden shrink-0 select-none text-xs"
        >
          {/* Header */}
          <div className="p-3 border-b border-border/60 bg-muted/20 flex items-center justify-between">
            <span className="font-semibold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Telemetry &amp; Serialization</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {serializedMarkdown.length} chars
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 1. Exact Raw Markdown Serialization Output */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
                  Serialized Markdown Output
                </span>
                <span className="text-[10px] text-emerald-400 font-medium">
                  100% Pure Prose (No Tags)
                </span>
              </div>
              <pre className="p-3 rounded-lg bg-muted/30 border border-border/60 font-mono text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                {serializedMarkdown || '<Empty Document>'}
              </pre>
            </div>

            {/* 2. In-Memory Confirmed Reference Ranges */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
                  In-Memory Tracked References
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({trackedReferences.length})
                </span>
              </div>

              {trackedReferences.length === 0 ? (
                <div className="p-3 rounded-lg bg-muted/10 border border-border/40 text-muted-foreground italic text-[11px] text-center">
                  No references confirmed yet. Click any dashed candidate in the editor to confirm.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {trackedReferences.map((ref) => {
                    const ent = MOCK_LORE_ENTITIES.find((e) => e.id === ref.entityId);
                    return (
                      <div
                        key={ref.id}
                        className="p-2 rounded border border-border/60 bg-muted/20 flex items-center justify-between text-[11px]"
                      >
                        <div className="min-w-0 pr-2">
                          <strong className="text-foreground font-semibold">
                            "{ref.matchedText}"
                          </strong>{' '}
                          <span className="text-muted-foreground text-[10px]">
                            → {ent?.name} ({ent?.category})
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-primary shrink-0">
                          [{ref.from}:{ref.to}]
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Feasibility Verification Checklist */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
                Feasibility Behaviors
              </span>
              <ul className="space-y-1.5 text-[11px] text-muted-foreground">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Automatic Recognition:</strong> Identifies registered terms without syntax.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Ambiguity Handling:</strong> Disambiguates duplicate names without guessing.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Clickable Decorations:</strong> Clicking reference opens Web of Thought lore.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Zero Prose Corruption:</strong> Underline is visual only; Markdown stays clean.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Delta Mapping:</strong> References shift with text insertions and edits.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Save Safety:</strong> Mock adapter isolates prototype from real library.</span>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
