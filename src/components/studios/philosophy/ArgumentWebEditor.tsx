import React, { useState, useMemo } from 'react';
import type {
  ArgumentRelationType,
  ArgumentSourceRef,
  ArgumentWeb,
  PhilosophyParagraph,
  SourceValidationResult,
} from '@/types';
import {
  setMainThesis,
  updateMainThesis,
  removeMainThesis,
  addArgumentNode,
  updateArgumentNode,
  removeArgumentNode,
  relinkArgumentNode,
  addArgumentRelationship,
  updateArgumentRelationship,
  removeArgumentRelationship,
  validateSourceLocation,
  computeStructuralInsights,
  dismissInsight,
  layoutArgumentWeb,
  RELATION_LABELS,
} from '@/utils/argumentWeb';
import { ArgumentWebGraph } from './ArgumentWebGraph';
import {
  ArrowLeft,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Trash2,
  Plus,
  Link2,
  FileText,
  ExternalLink,
  X,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface ArgumentWebEditorProps {
  web: ArgumentWeb;
  content: string;
  paragraphs?: PhilosophyParagraph[];
  onUpdateWeb: (next: ArgumentWeb) => void;
  onBackToWriting: () => void;
  onJumpToPassage?: (source?: ArgumentSourceRef | null, snapshot?: string) => void;
  currentSelectionText?: string;
  currentSelectionSource?: ArgumentSourceRef | null;
}

export const ArgumentWebEditor: React.FC<ArgumentWebEditorProps> = ({
  web,
  content,
  paragraphs = [],
  onUpdateWeb,
  onBackToWriting,
  onJumpToPassage,
  currentSelectionText = '',
  currentSelectionSource = null,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form states for adding relationship
  const [newRelTargetId, setNewRelTargetId] = useState('');
  const [newRelType, setNewRelType] = useState<ArgumentRelationType>('supports');
  const [newRelExplanation, setNewRelExplanation] = useState('');

  // Form states for creating thesis
  const [isEditingThesis, setIsEditingThesis] = useState(false);
  const [thesisTitleInput, setThesisTitleInput] = useState('');
  const [thesisContentInput, setThesisContentInput] = useState('');

  // Form states for creating node
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [nodeTitleInput, setNodeTitleInput] = useState('');
  const [nodeSnapshotInput, setNodeSnapshotInput] = useState('');

  // 1. Source Validation Map for all nodes
  const sourceValidationMap = useMemo(() => {
    const map = new Map<string, SourceValidationResult>();
    for (const node of web.nodes) {
      map.set(node.id, validateSourceLocation(content, node.snapshot, node.source, paragraphs));
    }
    return map;
  }, [web.nodes, content, paragraphs]);

  // 2. Structural Insights calculation
  const insights = useMemo(() => {
    return computeStructuralInsights(web, content, paragraphs);
  }, [web, content, paragraphs]);

  // 3. Layout calculation
  const layout = useMemo(() => {
    return layoutArgumentWeb(web);
  }, [web]);

  // 4. Resolve currently selected element (node, thesis, or relationship)
  const selectedNode = useMemo(() => {
    if (!selectedId) return null;
    return web.nodes.find((n) => n.id === selectedId) || null;
  }, [web.nodes, selectedId]);

  const isThesisSelected = useMemo(() => {
    return Boolean(web.main_thesis && selectedId === web.main_thesis.id);
  }, [web.main_thesis, selectedId]);

  const selectedRel = useMemo(() => {
    if (!selectedId) return null;
    return web.relationships.find((r) => r.id === selectedId) || null;
  }, [web.relationships, selectedId]);

  // Node Name lookup
  const getNodeName = (id: string) => {
    if (web.main_thesis && web.main_thesis.id === id) {
      return `[Thesis] ${web.main_thesis.title}`;
    }
    const node = web.nodes.find((n) => n.id === id);
    return node ? node.title : 'Unknown Argument';
  };

  // Actions
  const handleSaveThesis = () => {
    if (!thesisTitleInput.trim() && !thesisContentInput.trim()) return;
    const updated = setMainThesis(
      web,
      thesisTitleInput.trim() || 'Main Thesis',
      thesisContentInput.trim()
    );
    onUpdateWeb(updated);
    setIsEditingThesis(false);
    if (updated.main_thesis) {
      setSelectedId(updated.main_thesis.id);
    }
  };

  const handleSaveNode = () => {
    if (!nodeTitleInput.trim() && !nodeSnapshotInput.trim()) return;
    try {
      const { web: nextWeb, node } = addArgumentNode(
        web,
        nodeTitleInput.trim() || 'Argument Passage',
        nodeSnapshotInput.trim() || 'Argument claim',
        currentSelectionSource || null
      );
      onUpdateWeb(nextWeb);
      setIsCreatingNode(false);
      setNodeTitleInput('');
      setNodeSnapshotInput('');
      setSelectedId(node.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add argument node.');
    }
  };

  const handleCreateRelationship = (sourceId: string) => {
    if (!newRelTargetId) return;
    setErrorMsg('');
    try {
      const { web: nextWeb } = addArgumentRelationship(web, {
        source_id: sourceId,
        target_id: newRelTargetId,
        relation_type: newRelType,
        explanation: newRelExplanation,
      });
      onUpdateWeb(nextWeb);
      setNewRelTargetId('');
      setNewRelExplanation('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to establish relationship.');
    }
  };

  const handleRelinkNode = (nodeId: string, candidateSnapshot: string, candidateSource?: ArgumentSourceRef | null) => {
    const updated = relinkArgumentNode(web, nodeId, candidateSnapshot, candidateSource);
    onUpdateWeb(updated);
    setErrorMsg('');
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden select-none">
      {/* TOP HEADER CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-border/70 bg-card/40 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToWriting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Writing View</span>
          </button>
          <div className="h-4 w-px bg-border/60 mx-1" />
          <h2 className="font-serif font-bold text-sm tracking-wide text-foreground">
            Argument Web
          </h2>
          <span className="text-xs text-muted-foreground font-sans">
            ({web.nodes.length} argument{web.nodes.length === 1 ? '' : 's'}
            {web.main_thesis ? ' · Thesis established' : ' · No thesis yet'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setNodeTitleInput(
                currentSelectionText
                  ? currentSelectionText.length > 36
                    ? currentSelectionText.slice(0, 36) + '…'
                    : currentSelectionText
                  : ''
              );
              setNodeSnapshotInput(currentSelectionText || '');
              setIsCreatingNode(true);
              setIsEditingThesis(false);
              setSelectedId(null);
              setShowInsights(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Argument</span>
          </button>

          {!web.main_thesis && (
            <button
              type="button"
              onClick={() => {
                setThesisTitleInput('Main Thesis');
                setThesisContentInput(currentSelectionText || '');
                setIsEditingThesis(true);
                setIsCreatingNode(false);
                setSelectedId(null);
                setShowInsights(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-500 hover:bg-amber-500/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Set Main Thesis</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowInsights(!showInsights)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              insights.length > 0
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Structural Insights</span>
            {insights.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-amber-950 font-bold text-[10px]">
                {insights.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ERROR NOTICE BAR */}
      {errorMsg && (
        <div className="px-6 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="p-1 hover:text-destructive-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE: GRAPH + INSPECTION PANEL */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* GRAPH CANVAS */}
        <div className="flex-1 relative h-full">
          {web.nodes.length === 0 && !web.main_thesis ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-4">
              <div className="p-4 rounded-full bg-muted/30 border border-border">
                <Link2 className="w-8 h-8 text-primary/60" />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="font-serif text-lg font-bold text-foreground">
                  Your Argument Web is Empty
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Highlight passages in your reflection and click{' '}
                  <strong className="text-foreground">"Add to Argument Web"</strong> to capture
                  arguments. You can also establish a central claim with{' '}
                  <strong className="text-foreground">"Set Main Thesis"</strong>.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onBackToWriting}
                  className="px-4 py-2 text-xs rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  Return to Writing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNodeTitleInput(
                      currentSelectionText
                        ? currentSelectionText.length > 36
                          ? currentSelectionText.slice(0, 36) + '…'
                          : currentSelectionText
                        : ''
                    );
                    setNodeSnapshotInput(currentSelectionText || '');
                    setIsCreatingNode(true);
                    setIsEditingThesis(false);
                    setSelectedId(null);
                    setShowInsights(false);
                  }}
                  className="px-4 py-2 text-xs rounded-lg border border-border hover:bg-muted/40 transition-colors font-medium text-foreground"
                >
                  Add Argument
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setThesisTitleInput('Main Thesis');
                    setThesisContentInput(currentSelectionText || '');
                    setIsEditingThesis(true);
                    setIsCreatingNode(false);
                    setSelectedId(null);
                    setShowInsights(false);
                  }}
                  className="px-4 py-2 text-xs rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors font-semibold"
                >
                  Create Main Thesis
                </button>
              </div>
            </div>
          ) : (
            <ArgumentWebGraph
              layout={layout}
              web={web}
              selectedId={selectedId}
              onSelectNode={(id) => {
                setSelectedId(id);
                setErrorMsg('');
              }}
              onSelectEdge={(id) => {
                setSelectedId(id);
                setErrorMsg('');
              }}
              onClearSelection={() => {
                setSelectedId(null);
                setErrorMsg('');
              }}
              sourceValidationMap={sourceValidationMap}
            />
          )}
        </div>

        {/* SIDE INSPECTION PANEL */}
        {(selectedNode || isThesisSelected || selectedRel || showInsights || isEditingThesis || isCreatingNode) && (
          <aside className="w-84 sm:w-96 border-l border-border/80 bg-card/95 backdrop-blur-md flex flex-col h-full shadow-lg overflow-y-auto shrink-0 z-20 transition-all text-xs">
            {/* PANEL HEADER */}
            <div className="flex items-center justify-between p-3.5 border-b border-border/70 bg-muted/20">
              <span className="font-serif font-bold text-sm text-foreground">
                {isCreatingNode && 'Add Argument Node'}
                {!isCreatingNode && isEditingThesis && 'Set Main Thesis'}
                {!isCreatingNode && !isEditingThesis && isThesisSelected && 'Main Thesis Details'}
                {!isCreatingNode && !isEditingThesis && selectedNode && 'Argument Node Details'}
                {!isCreatingNode && !isEditingThesis && selectedRel && 'Relationship Details'}
                {!isCreatingNode &&
                  !isEditingThesis &&
                  !selectedNode &&
                  !isThesisSelected &&
                  !selectedRel &&
                  showInsights &&
                  'Structural Insights'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setShowInsights(false);
                  setIsEditingThesis(false);
                  setIsCreatingNode(false);
                  setErrorMsg('');
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-5 flex-1">
              {/* --- CREATING NODE FORM --- */}
              {isCreatingNode && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Argument Title
                    </label>
                    <input
                      type="text"
                      value={nodeTitleInput}
                      onChange={(e) => setNodeTitleInput(e.target.value)}
                      placeholder="e.g. Compatibilist Definition of Freedom"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif focus:outline-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Argument Passage / Snapshot
                    </label>
                    <textarea
                      rows={5}
                      value={nodeSnapshotInput}
                      onChange={(e) => setNodeSnapshotInput(e.target.value)}
                      placeholder="Quote or state the reasoning passage..."
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif focus:outline-primary resize-y"
                    />
                  </div>
                  {currentSelectionSource && (
                    <div className="p-2 rounded bg-muted/40 text-[11px] text-muted-foreground">
                      Linked to selected text in document (offset {currentSelectionSource.start_offset}–{currentSelectionSource.end_offset}).
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveNode}
                      className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-colors"
                    >
                      Save Argument Node
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNode(false)}
                      className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {/* --- EDITING / CREATING THESIS MODAL --- */}
              {!isCreatingNode && isEditingThesis && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Thesis Title
                    </label>
                    <input
                      type="text"
                      value={thesisTitleInput}
                      onChange={(e) => setThesisTitleInput(e.target.value)}
                      placeholder="e.g. Free Will is Compatible with Determinism"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif focus:outline-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Thesis Statement / Central Claim
                    </label>
                    <textarea
                      rows={4}
                      value={thesisContentInput}
                      onChange={(e) => setThesisContentInput(e.target.value)}
                      placeholder="State your overarching thesis clearly..."
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif focus:outline-primary resize-y"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveThesis}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold transition-colors"
                    >
                      Save Thesis
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingThesis(false)}
                      className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* --- MAIN THESIS VIEW --- */}
              {!isEditingThesis && isThesisSelected && web.main_thesis && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Thesis Title
                    </label>
                    <input
                      type="text"
                      value={web.main_thesis.title}
                      onChange={(e) =>
                        onUpdateWeb(updateMainThesis(web, { title: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif font-bold text-sm focus:outline-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Central Claim / Statement
                    </label>
                    <textarea
                      rows={4}
                      value={web.main_thesis.content}
                      onChange={(e) =>
                        onUpdateWeb(updateMainThesis(web, { content: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif focus:outline-primary resize-y"
                    />
                  </div>

                  {/* CONNECT THESIS TO ARGUMENT */}
                  <div className="pt-3 border-t border-border/60 space-y-2.5">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-primary" />
                      Connect to Argument
                    </span>
                    <select
                      value={newRelTargetId}
                      onChange={(e) => setNewRelTargetId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground"
                    >
                      <option value="">Select argument...</option>
                      {web.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-muted-foreground text-[10px] mb-1">Type</label>
                        <select
                          value={newRelType}
                          onChange={(e) => setNewRelType(e.target.value as ArgumentRelationType)}
                          className="w-full px-2 py-1 rounded bg-background border border-border text-foreground"
                        >
                          <option value="supports">Supports (→)</option>
                          <option value="challenges">Challenges (→)</option>
                          <option value="expands">Expands (→)</option>
                          <option value="related">Related (—)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-muted-foreground text-[10px] mb-1">
                          Explanation (optional)
                        </label>
                        <input
                          type="text"
                          value={newRelExplanation}
                          onChange={(e) => setNewRelExplanation(e.target.value)}
                          placeholder="e.g. foundational premise"
                          className="w-full px-2 py-1 rounded bg-background border border-border text-foreground"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!newRelTargetId}
                      onClick={() => handleCreateRelationship(web.main_thesis!.id)}
                      className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary font-semibold hover:bg-primary/20 disabled:opacity-40 transition-colors"
                    >
                      + Add Connection
                    </button>
                  </div>

                  {/* THESIS RELATIONSHIPS LIST */}
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <span className="font-semibold text-foreground">Active Connections</span>
                    {web.relationships.filter(
                      (r) =>
                        r.source_id === web.main_thesis!.id ||
                        r.target_id === web.main_thesis!.id
                    ).length > 0 ? (
                      <div className="space-y-1.5">
                        {web.relationships
                          .filter(
                            (r) =>
                              r.source_id === web.main_thesis!.id ||
                              r.target_id === web.main_thesis!.id
                          )
                          .map((r) => {
                            const isSource = r.source_id === web.main_thesis!.id;
                            const otherId = isSource ? r.target_id : r.source_id;
                            const otherName = getNodeName(otherId);
                            const info = RELATION_LABELS[r.relation_type];

                            return (
                              <div
                                key={r.id}
                                className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/60"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-medium">
                                    <span
                                      className={cn(
                                        'px-1.5 py-0.2 rounded text-[10px] font-semibold',
                                        r.relation_type === 'supports' &&
                                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                        r.relation_type === 'challenges' &&
                                          'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                                        r.relation_type === 'expands' &&
                                          'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                        r.relation_type === 'related' &&
                                          'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      )}
                                    >
                                      {info.label}
                                    </span>
                                    <span>
                                      {isSource ? `→ ${otherName}` : `← ${otherName}`}
                                    </span>
                                  </div>
                                  {r.explanation && (
                                    <p className="text-[11px] text-muted-foreground italic">
                                      {r.explanation}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onUpdateWeb(removeArgumentRelationship(web, r.id))}
                                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title="Remove relationship"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic text-[11px]">
                        No connections linked to thesis yet.
                      </p>
                    )}
                  </div>

                  {/* REMOVE THESIS BUTTON */}
                  <div className="pt-4 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Remove the Main Thesis? Connected relationships will also be unlinked.'
                          )
                        ) {
                          onUpdateWeb(removeMainThesis(web));
                          setSelectedId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Main Thesis</span>
                    </button>
                  </div>
                </div>
              )}

              {/* --- ARGUMENT NODE VIEW --- */}
              {!isEditingThesis && selectedNode && (
                <div className="space-y-4">
                  {/* EDITABLE TITLE */}
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Argument Title
                    </label>
                    <input
                      type="text"
                      value={selectedNode.title}
                      onChange={(e) =>
                        onUpdateWeb(
                          updateArgumentNode(web, selectedNode.id, { title: e.target.value })
                        )
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif font-semibold text-sm focus:outline-primary"
                    />
                  </div>

                  {/* VERBATIM PASSAGE SNAPSHOT */}
                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Captured Passage Snapshot
                    </label>
                    <blockquote className="p-2.5 rounded-lg bg-muted/40 border-l-2 border-primary/60 text-foreground font-serif italic text-xs leading-relaxed whitespace-pre-wrap">
                      “{selectedNode.snapshot}”
                    </blockquote>
                  </div>

                  {/* SOURCE LOCATION & VALIDATION */}
                  <div className="p-2.5 rounded-lg border border-border/80 bg-background/50 space-y-2">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      Document Source Verification
                    </span>

                    {(() => {
                      const val = sourceValidationMap.get(selectedNode.id);
                      if (val?.status === 'verified') {
                        return (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Source verified at recorded document position.</span>
                          </div>
                        );
                      }
                      if (val?.status === 'moved') {
                        return (
                          <div className="space-y-2">
                            <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>
                                Passage moved or modified in document. Found {val.occurrences.length}{' '}
                                candidate match(es):
                              </span>
                            </div>
                            <div className="space-y-1">
                              {val.occurrences.map((occ, i) => (
                                <div
                                  key={i}
                                  className="p-1.5 rounded bg-muted/60 text-[11px] flex items-center justify-between gap-2"
                                >
                                  <span className="truncate italic">{occ.preview}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRelinkNode(selectedNode.id, selectedNode.snapshot, {
                                        start_offset: occ.start_offset,
                                        end_offset: occ.end_offset,
                                        block_index: occ.block_index,
                                      })
                                    }
                                    className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold text-[10px] shrink-0"
                                  >
                                    Relink Here
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2">
                          <div className="flex items-start gap-1.5 text-rose-500 font-medium">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Original passage can no longer be located in document text.</span>
                          </div>
                          {currentSelectionText.trim() && (
                            <button
                              type="button"
                              onClick={() =>
                                handleRelinkNode(
                                  selectedNode.id,
                                  currentSelectionText,
                                  currentSelectionSource
                                )
                              }
                              className="px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Relink to Currently Selected Text
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {onJumpToPassage && (
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToPassage(selectedNode.source, selectedNode.snapshot)
                        }
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Inspect in Writing View</span>
                      </button>
                    )}
                  </div>

                  {/* CONNECT NODE TO ANOTHER ARGUMENT OR THESIS */}
                  <div className="pt-3 border-t border-border/60 space-y-2.5">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-primary" />
                      Establish Relationship
                    </span>
                    <select
                      value={newRelTargetId}
                      onChange={(e) => setNewRelTargetId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-foreground"
                    >
                      <option value="">Select target argument or thesis...</option>
                      {web.main_thesis && (
                        <option value={web.main_thesis.id}>
                          [Main Thesis] {web.main_thesis.title}
                        </option>
                      )}
                      {web.nodes
                        .filter((n) => n.id !== selectedNode.id)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                    </select>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-muted-foreground text-[10px] mb-1">Type</label>
                        <select
                          value={newRelType}
                          onChange={(e) => setNewRelType(e.target.value as ArgumentRelationType)}
                          className="w-full px-2 py-1 rounded bg-background border border-border text-foreground"
                        >
                          <option value="supports">Supports (→)</option>
                          <option value="challenges">Challenges (→)</option>
                          <option value="expands">Expands (→)</option>
                          <option value="related">Related (—)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-muted-foreground text-[10px] mb-1">
                          Explanation (optional)
                        </label>
                        <input
                          type="text"
                          value={newRelExplanation}
                          onChange={(e) => setNewRelExplanation(e.target.value)}
                          placeholder="e.g. premise for conclusion"
                          className="w-full px-2 py-1 rounded bg-background border border-border text-foreground"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!newRelTargetId}
                      onClick={() => handleCreateRelationship(selectedNode.id)}
                      className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary font-semibold hover:bg-primary/20 disabled:opacity-40 transition-colors"
                    >
                      + Connect
                    </button>
                  </div>

                  {/* ACTIVE RELATIONSHIPS LIST FOR THIS NODE */}
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <span className="font-semibold text-foreground">Connected Relationships</span>
                    {web.relationships.filter(
                      (r) => r.source_id === selectedNode.id || r.target_id === selectedNode.id
                    ).length > 0 ? (
                      <div className="space-y-1.5">
                        {web.relationships
                          .filter(
                            (r) => r.source_id === selectedNode.id || r.target_id === selectedNode.id
                          )
                          .map((r) => {
                            const isSource = r.source_id === selectedNode.id;
                            const otherId = isSource ? r.target_id : r.source_id;
                            const otherName = getNodeName(otherId);
                            const info = RELATION_LABELS[r.relation_type];

                            return (
                              <div
                                key={r.id}
                                className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/60"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-medium">
                                    <span
                                      className={cn(
                                        'px-1.5 py-0.2 rounded text-[10px] font-semibold',
                                        r.relation_type === 'supports' &&
                                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                        r.relation_type === 'challenges' &&
                                          'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                                        r.relation_type === 'expands' &&
                                          'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                        r.relation_type === 'related' &&
                                          'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      )}
                                    >
                                      {info.label}
                                    </span>
                                    <span>
                                      {isSource ? `→ ${otherName}` : `← ${otherName}`}
                                    </span>
                                  </div>
                                  {r.explanation && (
                                    <p className="text-[11px] text-muted-foreground italic">
                                      {r.explanation}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onUpdateWeb(removeArgumentRelationship(web, r.id))}
                                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title="Remove relationship"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic text-[11px]">
                        No connections linked to this argument yet.
                      </p>
                    )}
                  </div>

                  {/* DELETE ARGUMENT NODE */}
                  <div className="pt-4 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete argument node "${selectedNode.title}"? Connected relationships will also be removed. (Your original text in the document remains completely untouched).`
                          )
                        ) {
                          onUpdateWeb(removeArgumentNode(web, selectedNode.id));
                          setSelectedId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Argument Node</span>
                    </button>
                  </div>
                </div>
              )}

              {/* --- RELATIONSHIP DETAIL VIEW --- */}
              {!isEditingThesis && selectedRel && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>Relationship Endpoints</span>
                      <span>{selectedRel.relation_type !== 'related' ? 'Directed' : 'Non-directional'}</span>
                    </div>
                    <div className="font-serif font-bold text-sm text-foreground flex items-center gap-2">
                      <span>{getNodeName(selectedRel.source_id)}</span>
                      <span className="text-muted-foreground">
                        {selectedRel.relation_type !== 'related' ? '→' : '↔'}
                      </span>
                      <span>{getNodeName(selectedRel.target_id)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Relationship Type
                    </label>
                    <select
                      value={selectedRel.relation_type}
                      onChange={(e) =>
                        onUpdateWeb(
                          updateArgumentRelationship(web, selectedRel.id, {
                            relation_type: e.target.value as ArgumentRelationType,
                          })
                        )
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground"
                    >
                      <option value="supports">Supports (green solid →)</option>
                      <option value="challenges">Challenges (red dashed →)</option>
                      <option value="expands">Expands (blue dotted →)</option>
                      <option value="related">Related (gold plain —)</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {RELATION_LABELS[selectedRel.relation_type].description}
                    </p>
                  </div>

                  <div>
                    <label className="block text-muted-foreground font-medium mb-1">
                      Explanation (optional)
                    </label>
                    <textarea
                      rows={3}
                      value={selectedRel.explanation || ''}
                      onChange={(e) =>
                        onUpdateWeb(
                          updateArgumentRelationship(web, selectedRel.id, {
                            explanation: e.target.value,
                          })
                        )
                      }
                      placeholder="Why does this argument support or challenge the other?"
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground font-serif focus:outline-primary resize-y"
                    />
                  </div>

                  <div className="pt-4 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateWeb(removeArgumentRelationship(web, selectedRel.id));
                        setSelectedId(null);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Relationship</span>
                    </button>
                  </div>
                </div>
              )}

              {/* --- STRUCTURAL INSIGHTS DRAWER --- */}
              {!isEditingThesis &&
                !selectedNode &&
                !isThesisSelected &&
                !selectedRel &&
                showInsights && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        These observations describe observable graph structure to help you inspect
                        your reasoning. They do not evaluate philosophical validity, truth, or
                        soundness.
                      </p>
                    </div>

                    {insights.length > 0 ? (
                      <div className="space-y-2.5">
                        {insights.map((insight) => (
                          <div
                            key={insight.id}
                            className={cn(
                              'p-3 rounded-lg border space-y-2',
                              insight.kind === 'source_review'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                                : 'bg-muted/30 border-border/70 text-foreground'
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-xs flex items-center gap-1.5">
                                <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0" />
                                {insight.title}
                              </span>
                              {insight.dismissable && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateWeb(dismissInsight(web, insight.id))}
                                  className="text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted"
                                >
                                  Dismiss
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {insight.description}
                            </p>
                            {insight.targetNodeIds.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedId(insight.targetNodeIds[0])}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium pt-1"
                              >
                                Focus Argument in Graph →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-center space-y-1">
                        <CheckCircle2 className="w-5 h-5 mx-auto" />
                        <p className="font-medium">No structural anomalies detected.</p>
                        <p className="text-[11px] text-muted-foreground">
                          All recorded arguments are connected, have source references, and link to
                          the Main Thesis.
                        </p>
                      </div>
                    )}

                    {web.dismissed_insights && web.dismissed_insights.length > 0 && (
                      <div className="pt-3 border-t border-border/60">
                        <p className="text-[11px] text-muted-foreground mb-1.5">
                          {web.dismissed_insights.length} dismissed observation(s).
                        </p>
                        <button
                          type="button"
                          onClick={() => onUpdateWeb({ ...web, dismissed_insights: [] })}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Restore all dismissed observations
                        </button>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
