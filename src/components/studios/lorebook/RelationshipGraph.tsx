import { graphConnections, limitGraphPairs, toggleConnectionSelection } from '@/utils/graphConnections';
import { relationshipMeaning, relationshipPerspective } from '@/utils/relationships';
import React, { useId, useMemo, useRef, useState, useEffect } from 'react';
import {
  Users,
  Shield,
  MapPin,
  Sparkles,
  Sword,
  Calendar,
  BookOpen,
  Compass,
  Search,
  ExternalLink,
  List,
  Network,
  Layers,
  Eye,
  Briefcase,
} from 'lucide-react';
import type { DocumentMetadata } from '@/types';
import type { Relationship, Evidence } from '@/utils/thought';
import {
  filterGraph,
  layoutRelationships,
  zoomCamera,
  graphNeighbors,
  getFocusedNeighborhood,
  buildFactionHierarchyData,
  fitCameraToView,
  type GroupedGraphEdge,
  type FactionHierarchyPositionNode,
} from '@/utils/relationshipGraph';
import { isGuidedRelationship, parseLoreMetadata } from '@/utils/universe';

const styles = {
  character: { label: 'Character', Icon: Users, color: 'text-blue-700 dark:text-blue-300', shape: 'circle' },
  faction: { label: 'Faction / Nation', Icon: Shield, color: 'text-amber-700 dark:text-amber-300', shape: 'hexagon' },
  location: { label: 'Location', Icon: MapPin, color: 'text-emerald-700 dark:text-emerald-300', shape: 'rect' },
  artifact: { label: 'Artifact', Icon: Sword, color: 'text-cyan-700 dark:text-cyan-300', shape: 'diamond' },
  event: { label: 'Event', Icon: Calendar, color: 'text-rose-700 dark:text-rose-300', shape: 'rect' },
  concept: { label: 'Rule / System', Icon: Sparkles, color: 'text-violet-700 dark:text-violet-300', shape: 'hexagon' },
  culture: { label: 'Culture / History', Icon: Compass, color: 'text-orange-700 dark:text-orange-300', shape: 'diamond' },
  chapter: { label: 'Chapter', Icon: BookOpen, color: 'text-orange-700 dark:text-orange-300', shape: 'rect' },
  other: { label: 'Other / missing lore', Icon: Compass, color: 'text-primary', shape: 'rect' },
} as const;

export interface RelationshipGraphProps {
  rows: { relationship: Relationship; evidence: Evidence }[];
  name: (id: string) => string;
  documents?: DocumentMetadata[];
  onOpenEntity?: (id: string) => void;
  initialFocus?: string;
  universeId?: string;
  defaultMode?: 'focused' | 'full';
  historical?: boolean;
}

export const RelationshipGraph: React.FC<RelationshipGraphProps> = ({
  rows,
  name,
  documents = [],
  onOpenEntity,
  initialFocus = '',
  defaultMode,
  universeId,
  historical = false,
}) => {
  // Exploration Modes: 'focused' (1-hop neighborhood) vs 'full' (complete universe graph)
  const [mode, setMode] = useState<'focused' | 'full'>(
    defaultMode || (initialFocus ? 'focused' : 'full')
  );
  // View Presentation: 'graph' (interactive SVG) vs 'table' (accessible list) vs 'hierarchy' (faction org)
  const [viewTab, setViewTab] = useState<'graph' | 'table' | 'hierarchy'>('graph');

  // Focus & Navigation History
  const [focus, setFocus] = useState<string>(initialFocus);
  const [focusHistory, setFocusHistory] = useState<string[]>([]);

  // Filtering State
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'guided' | 'custom'>('all');
  const [relType, setRelType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Graph Layout & Camera State
  const [groupEdges, setGroupEdges] = useState(true);
  const [selectedEdgeGroup, setSelectedEdgeGroup] = useState<GroupedGraphEdge | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });

  // Faction Hierarchy Selection
  const [selectedFactionId, setSelectedFactionId] = useState<string>('');

  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const markerId = `relationship-arrow-${useId().replace(/:/g, '')}`;

  // Helper to resolve entity type from document metadata
  const typeOf = (id: string): keyof typeof styles => {
    try {
      const doc = documents.find((d) => d.id === id);
      if (!doc) return 'other';
      let t = JSON.parse(doc.metadata_json || '{}').entry_type;
      if (t === 'rule') t = 'concept';
      if (t === 'nation') t = 'faction';
      return t in styles ? (t as keyof typeof styles) : 'other';
    } catch {
      return 'other';
    }
  };

  // 1. All active relationships
  const allActiveRelationships = useMemo(
    () => graphConnections(rows, documents, universeId, historical),
    [rows, documents, universeId, historical]
  );

  // 2. Available factions in scope
  const availableFactions = useMemo(() => {
    return documents.filter((d) => {
      const meta = parseLoreMetadata(d);
      return !historical && ['faction', 'nation'].includes(meta.entry_type || '');
    });
  }, [documents, historical]);

  // Sync initial focus or selected faction
  useEffect(() => {
    if (initialFocus && !focus) {
      setFocus(initialFocus);
    }
  }, [initialFocus]);

  useEffect(() => {
    if (focus && typeOf(focus) === 'faction') {
      setSelectedFactionId(focus);
    } else if (availableFactions.length > 0 && !selectedFactionId) {
      setSelectedFactionId(availableFactions[0].id);
    }
  }, [focus, availableFactions, selectedFactionId]);

  // Set focus with history tracking
  const handleSetFocus = (newFocusId: string) => {
    if (newFocusId === focus) return;
    if (focus) {
      setFocusHistory((prev) => [...prev.slice(-9), focus]);
    }
    setFocus(newFocusId);
    setMode('focused');
  };

  // Pop back to previous focus
  const handleBackFocus = () => {
    if (focusHistory.length === 0) {
      setFocus('');
      setMode('full');
      return;
    }
    const prev = focusHistory[focusHistory.length - 1];
    setFocusHistory((h) => h.slice(0, -1));
    setFocus(prev);
  };

  // 3. Category & type filtering
  const categoryFiltered = useMemo(() => {
    return filterGraph(allActiveRelationships, typeOf, relType, entityType, categoryFilter);
  }, [allActiveRelationships, documents, relType, entityType, categoryFilter]);

  // 4. Neighborhood extraction for Focus Mode
  const { visibleRelationships, activeFocus } = useMemo(() => {
    if (mode === 'focused' && focus) {
      const { relationships, neighborIds } = getFocusedNeighborhood(categoryFiltered, focus);
      return {
        visibleRelationships: relationships,
        activeFocus: neighborIds.has(focus) ? focus : '',
      };
    }
    return {
      visibleRelationships: categoryFiltered,
      activeFocus: focus,
    };
  }, [mode, focus, categoryFiltered]);

  // Bound visible pairs; never truncate the facts belonging to a displayed pair.
  const visible = useMemo(
    () => limitGraphPairs(visibleRelationships, 240),
    [visibleRelationships]
  );

  // 5. Layout computation
  const key = useMemo(
    () => `${mode}:${activeFocus}:${visible.map((r) => `${r.id}:${r.source_id}:${r.target_id}:${r.label}`).join('|')}`,
    [mode, activeFocus, visible]
  );

  const layout = useMemo(
    () => layoutRelationships(visible, { focusId: activeFocus || undefined }),
    [key, visible]
  );

  useEffect(() => {
    setSelectedEdgeGroup(current => current ? layout.groupedEdges.find(g => g.id === current.id) || null : null);
  }, [layout]);

  const neighborIds = useMemo(
    () => graphNeighbors(visible, activeFocus),
    [visible, activeFocus]
  );

  const resetCamera = () => setCamera({ x: 0, y: 0, scale: 1 });

  const fitView = () => {
    const fit = fitCameraToView(layout, svg.current?.clientWidth || 800, svg.current?.clientHeight || 500);
    setCamera(fit);
  };

  const changeFilter = (change: () => void) => {
    change();
    resetCamera();
  };

  const clearAllFilters = () => {
    setFocus('');
    setRelType('');
    setEntityType('');
    setCategoryFilter('all');
    setSearchQuery('');
    setMode('full');
    setSelectedEdgeGroup(null);
    resetCamera();
  };

  const w = layout.width / camera.scale;
  const h = layout.height / camera.scale;

  // Selected faction hierarchy data
  const factionHierarchyData = useMemo(() => {
    if (historical || !selectedFactionId) return null;
    const doc = documents.find((d) => d.id === selectedFactionId);
    if (!doc) return null;
    return buildFactionHierarchyData(doc, documents);
  }, [selectedFactionId, documents, historical]);

  // Tabular relationships list with searching
  const tableRows = useMemo(() => {
    let rowsToDisplay = mode === 'focused' && focus ? visibleRelationships : categoryFiltered;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rowsToDisplay = rowsToDisplay.filter((r) => {
        const srcTitle = name(r.source_id).toLowerCase();
        const tgtTitle = name(r.target_id).toLowerCase();
        const lbl = (r.label || '').toLowerCase();
        return srcTitle.includes(q) || tgtTitle.includes(q) || lbl.includes(q);
      });
    }
    return rowsToDisplay;
  }, [mode, focus, visibleRelationships, categoryFiltered, searchQuery, name]);

  return (
    <section aria-label="World Relationships Graph" className="relationship-graph space-y-3">
      {historical && <p className="text-xs text-muted-foreground">Current institutional offices are omitted: dated office history is unavailable. Unknown relationships remain marked as unrecorded.</p>}
      {/* TOP VIEW BAR & MODE CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-card/60 border border-border/80 text-xs">
        {/* Main Display Switcher: Graph | Table | Hierarchy */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40 border border-border/60">
          <button
            type="button"
            onClick={() => setViewTab('graph')}
            className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              viewTab === 'graph'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Network className="w-3.5 h-3.5 text-primary" />
            Spatial Graph
          </button>
          <button
            type="button"
            onClick={() => setViewTab('table')}
            className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              viewTab === 'table'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List className="w-3.5 h-3.5 text-primary" />
            Relationship Table ({categoryFiltered.length})
          </button>
          {availableFactions.length > 0 && (
            <button
              type="button"
              onClick={() => setViewTab('hierarchy')}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                viewTab === 'hierarchy'
                  ? 'bg-background text-amber-300 shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-amber-400" />
              Faction Hierarchy
            </button>
          )}
        </div>

        {/* Exploration Scope: Focused 1-Hop vs Full Universe */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40 border border-border/60">
            <button
              type="button"
              onClick={() => {
                if (focus) {
                  setMode('focused');
                } else if (visible.length > 0) {
                  handleSetFocus(visible[0].source_id);
                }
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                mode === 'focused'
                  ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="w-3 h-3" />
              Focused View
            </button>
            <button
              type="button"
              onClick={() => setMode('full')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                mode === 'full'
                  ? 'bg-primary/20 text-primary border border-primary/30 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-3 h-3" />
              Full Universe View
            </button>
          </div>

          {mode === 'focused' && focus && (
            <div className="flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/30 text-primary px-2.5 py-1 rounded-md font-medium">
              <span>Center: <strong>{name(focus)}</strong></span>
              {focusHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleBackFocus}
                  className="hover:underline ml-1 text-muted-foreground hover:text-foreground text-[11px]"
                  title="Back to previous focus"
                >
                  (Back)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FILTER & ZOOM TOOLBAR */}
      <div className="flex flex-wrap gap-2.5 text-xs items-end p-2.5 rounded-lg bg-card/40 border border-border/60">
        {/* Category Filter Pills (Phase C3 classifications) */}
        <div>
          <label className="block text-muted-foreground text-[11px] mb-1">Relationship Category</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeFilter(() => setCategoryFilter('all'))}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              All ({allActiveRelationships.length})
            </button>
            <button
              type="button"
              onClick={() => changeFilter(() => setCategoryFilter('guided'))}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                categoryFilter === 'guided'
                  ? 'bg-amber-500 text-amber-950 font-semibold border-amber-500'
                  : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              Guided Connections
            </button>
            <button
              type="button"
              onClick={() => changeFilter(() => setCategoryFilter('custom'))}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                categoryFilter === 'custom'
                  ? 'bg-blue-600 text-white font-semibold border-blue-600'
                  : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              Custom Lore
            </button>
          </div>
        </div>

        {/* Specific Relationship Type */}
        <label>
          Relationship type
          <select
            aria-label="Graph relationship type"
            className="help-input block mt-1"
            value={relType}
            onChange={(e) => changeFilter(() => setRelType(e.target.value))}
          >
            <option value="">All relationship types</option>
            {[
              ...new Map(
                allActiveRelationships.map((r) => [
                  relationshipMeaning(r.label)?.kind || r.label,
                  r.label,
                ])
              ).values(),
            ]
              .sort()
              .map((label) => (
                <option value={label} key={label}>
                  {relationshipMeaning(label)
                    ? `${relationshipMeaning(label)!.outgoing} / ${relationshipMeaning(label)!.incoming}`
                    : label}
                </option>
              ))}
          </select>
        </label>

        {/* Entity Type Filter */}
        <label>
          Entity type (either endpoint)
          <select
            aria-label="Graph entity type"
            className="help-input block mt-1"
            value={entityType}
            onChange={(e) => changeFilter(() => setEntityType(e.target.value))}
          >
            <option value="">All entity types</option>
            {Object.entries(styles).map(([value, s]) => (
              <option value={value} key={value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {/* Zoom & Fit Controls (Only in graph mode) */}
        {viewTab === 'graph' && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              className="help-button"
              aria-label="Zoom in graph"
              onClick={() => setCamera((c) => zoomCamera(c, 1.3))}
            >
              +
            </button>
            <button
              type="button"
              className="help-button"
              aria-label="Zoom out graph"
              onClick={() => setCamera((c) => zoomCamera(c, 1 / 1.3))}
            >
              −
            </button>
            <button
              type="button"
              className="help-button"
              onClick={fitView}
            >
              Fit to view
            </button>

            {/* Edge Grouping Toggle */}
            <button
              type="button"
              onClick={() => setGroupEdges(!groupEdges)}
              className={`help-button flex items-center gap-1 ${
                groupEdges ? 'border-primary/50 text-primary' : 'text-muted-foreground'
              }`}
              title="Visually group multiple relationships between same entity pair"
            >
              <Layers className="w-3 h-3" />
              {groupEdges ? 'Grouped Edges' : 'Expanded Lanes'}
            </button>
          </div>
        )}

        <button
          type="button"
          className="help-button"
          onClick={clearAllFilters}
        >
          Clear graph filters &amp; focus
        </button>
      </div>

      {/* ENTITY TYPE LEGEND */}
      <div
        aria-label="Entity type legend"
        className="flex flex-wrap gap-x-4 gap-y-2 text-xs py-1"
      >
        {Object.entries(styles).map(([id, { label, Icon, color }]) => (
          <span key={id} className={`inline-flex gap-1 items-center ${color}`}>
            <Icon size={14} />
            {label}
          </span>
        ))}
      </div>

      {/* EMPTY STATES */}
      {!allActiveRelationships.length ? (
        <div className="p-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/80">
          No active relationships. Add a real relationship to connect existing lore entities.
        </div>
      ) : !visible.length && viewTab === 'graph' ? (
        <div className="p-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/80 space-y-2">
          <p>No relationships match these graph filters.</p>
          <button type="button" className="help-button" onClick={clearAllFilters}>
            Clear graph filters &amp; focus to see all records
          </button>
        </div>
      ) : (
        <>
          {/* 1. SPATIAL SVG GRAPH VIEW */}
          {viewTab === 'graph' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <p>
                  {mode === 'focused' && activeFocus
                    ? `Showing 1-hop neighborhood for "${name(activeFocus)}" (${visible.length} connections). Click any node to refocus.`
                    : `${filteredRelationshipsCount(categoryFiltered.length, visible.length)} relationships in view. Click a node to focus its connections.`}
                </p>
                <span className="text-[11px] italic">
                  Drag space to pan; use + / − or scroll to zoom; Home to fit.
                </span>
              </div>

              <div className="relative border border-border rounded-lg bg-background overflow-hidden">
                <svg
                  ref={svg}
                  role="group"
                  tabIndex={0}
                  aria-label="Interactive lore relationship graph; arrow keys pan, plus and minus zoom, Home fits"
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const moves: Record<string, [number, number]> = {
                      ArrowLeft: [-60, 0],
                      ArrowRight: [60, 0],
                      ArrowUp: [0, -60],
                      ArrowDown: [0, 60],
                    };
                    if (moves[e.key]) {
                      e.preventDefault();
                      const [dx, dy] = moves[e.key];
                      setCamera((c) => ({ ...c, x: c.x + dx / c.scale, y: c.y + dy / c.scale }));
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      fitView();
                    } else if (['+', '-', '='].includes(e.key)) {
                      e.preventDefault();
                      setCamera((c) => zoomCamera(c, e.key === '-' ? 1 / 1.3 : 1.3));
                    }
                  }}
                  className="w-full h-[460px] sm:h-[540px] touch-none select-none"
                  viewBox={`${layout.x + (layout.width - w) / 2 + camera.x} ${layout.y + (layout.height - h) / 2 + camera.y} ${w} ${h}`}
                  onPointerDown={(e) => {
                    if ((e.target as Element).closest('[data-entity-node]') || (e.target as Element).closest('[data-edge-label]')) return;
                    drag.current = { x: e.clientX, y: e.clientY };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!drag.current || !svg.current) return;
                    const rect = svg.current.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) return;
                    const factor = Math.max(w / rect.width, h / rect.height);
                    const dx = (e.clientX - drag.current.x) * factor;
                    const dy = (e.clientY - drag.current.y) * factor;
                    drag.current = { x: e.clientX, y: e.clientY };
                    setCamera((c) => ({ ...c, x: c.x - dx, y: c.y - dy }));
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                >
                  <defs>
                    <marker id={markerId} markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                      <path d="M0 0 L8 4 L0 8" fill="currentColor" />
                    </marker>
                  </defs>

                  {/* EDGES: Either Grouped (clean) or Individual Lanes */}
                  {groupEdges
                    ? layout.groupedEdges.map((grp) => {
                        const isHighlighted =
                          !activeFocus || grp.source === activeFocus || grp.target === activeFocus;
                        const hasMultiple = grp.count > 1;
                        const firstRel = grp.relationships[0];
                        const displayLabel = `${firstRel?.label || 'Connected'}${hasMultiple ? ` (+${grp.count - 1})` : ''}`;

                        return (
                          <g
                            data-edge-label={grp.id}
                            role="button" tabIndex={0}
                            aria-label={`Inspect ${displayLabel}`}
                            aria-expanded={selectedEdgeGroup?.id === grp.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedEdgeGroup(toggleConnectionSelection(selectedEdgeGroup?.id || null, grp.id) ? grp : null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSelectedEdgeGroup(toggleConnectionSelection(selectedEdgeGroup?.id || null, grp.id) ? grp : null); } }}
                            key={grp.id}
                            className="text-primary transition-opacity"
                            opacity={isHighlighted ? 1 : 0.2}
                          >
                            <path d={grp.path} fill="none" stroke="transparent" strokeWidth={16} />
                            <path
                              d={grp.path}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={isHighlighted ? (hasMultiple ? 2.5 : 2) : 1}
                              markerEnd={grp.directed ? `url(#${markerId})` : undefined}
                            />

                            {/* Edge Label Badge */}
                            <g
                              data-edge-label={grp.id}
                              transform={`translate(${grp.labelX} ${grp.labelY})`}
                              className="cursor-pointer"

                            >
                              <title>{`${grp.labels.join(', ')} (Click to inspect all)`}</title>
                              <rect
                                x={-140}
                                y={-16}
                                width={280}
                                height={32}
                                rx={7}
                                fill="hsl(var(--card))"
                                stroke={hasMultiple ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                                strokeWidth={hasMultiple ? 1.5 : 1}
                              />
                              <text
                                textAnchor="middle"
                                y={5}
                                fontSize={13}
                                fontWeight={hasMultiple ? 600 : 400}
                                fill="hsl(var(--foreground))"
                              >
                                {firstRel.label.length > 29 ? `${firstRel.label.slice(0, 27)}…` : firstRel.label}
                                {hasMultiple && <tspan fontSize={10}> (+{grp.count - 1})</tspan>}
                              </text>
                            </g>
                          </g>
                        );
                      })
                    : layout.edges.map((edge) => {
                        const connection = allActiveRelationships.find(r => r.id === edge.id);
                        const row = connection ? { relationship: connection, evidence: connection.evidence } : undefined;
                        const isHighlighted =
                          !activeFocus || edge.source === activeFocus || edge.target === activeFocus;
                        const label = row?.evidence?.value ?? row?.relationship.label ?? 'Unknown relationship';
                        const isDirected =
                          row?.relationship.directed &&
                          !relationshipMeaning(row?.relationship.label || '')?.symmetric;

                        return (
                          <g
                            data-edge-label={edge.id}
                            role="button" tabIndex={0}
                            aria-label={`Inspect ${label}`}
                            onClick={(e) => { e.stopPropagation(); const group = layout.groupedEdges.find(g => g.relationships.some(r => r.id === edge.id)); if (group) setSelectedEdgeGroup(toggleConnectionSelection(selectedEdgeGroup?.id || null, group.id) ? group : null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const group = layout.groupedEdges.find(g => g.relationships.some(r => r.id === edge.id)); if (group) setSelectedEdgeGroup(toggleConnectionSelection(selectedEdgeGroup?.id || null, group.id) ? group : null); } }}
                            key={edge.id}
                            className="text-primary transition-opacity"
                            opacity={isHighlighted ? 1 : 0.18}
                          >
                            <path d={edge.path} fill="none" stroke="transparent" strokeWidth={16} />
                            <path
                              d={edge.path}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={isHighlighted ? 2 : 1}
                              strokeDasharray={row?.evidence?.value === null ? '6 5' : undefined}
                              markerEnd={isDirected ? `url(#${markerId})` : undefined}
                            />
                            <g transform={`translate(${edge.labelX} ${edge.labelY})`}>
                              <title>{label}</title>
                              <rect
                                x={-112}
                                y={-15}
                                width={224}
                                height={30}
                                rx={6}
                                fill="hsl(var(--card))"
                                stroke="hsl(var(--border))"
                              />
                              <text
                                textAnchor="middle"
                                y={5}
                                fontSize={14}
                                fill="hsl(var(--foreground))"
                              >
                                {label.length > 29 ? `${label.slice(0, 27)}…` : label}
                              </text>
                            </g>
                          </g>
                        );
                      })}

                  {/* NODES */}
                  {layout.nodes.map((n) => {
                    const { Icon, color, shape, label } = styles[typeOf(n.id)];
                    const isCentral = activeFocus === n.id;
                    const isNeighbor = neighborIds.has(n.id);
                    const opacity = !activeFocus || isCentral || isNeighbor ? 1 : 0.25;

                    const activate = () => {
                      if (activeFocus === n.id) {
                        setFocus('');
                        setMode('full');
                      } else {
                        handleSetFocus(n.id);
                      }
                    };

                    return (
                      <g
                        data-entity-node={n.id}
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Focus ${label}: ${name(n.id)}`}
                        aria-pressed={isCentral ? 'true' : 'false'}
                        className={`${color} cursor-pointer transition-transform`}
                        opacity={opacity}
                        transform={`translate(${n.x} ${n.y})`}
                        onClick={activate}
                        onKeyDown={(e) => {
                          if (['Enter', ' '].includes(e.key)) {
                            e.preventDefault();
                            activate();
                          }
                        }}
                      >
                        <title>{`${label}: ${name(n.id)}`}</title>

                        {/* Central Focus Ring Highlight */}
                        {isCentral && (
                          <ellipse
                            rx={118}
                            ry={44}
                            fill="none"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            strokeDasharray="4 3"
                            opacity={0.8}
                          />
                        )}

                        {/* Node Shape */}
                        {shape === 'circle' ? (
                          <ellipse
                            rx={108}
                            ry={35}
                            fill="hsl(var(--card))"
                            stroke={isCentral ? 'hsl(var(--primary))' : 'currentColor'}
                            strokeWidth={isCentral ? 4 : 2.5}
                          />
                        ) : shape === 'hexagon' ? (
                          <path
                            d="M-92 -34 L92 -34 L110 0 L92 34 L-92 34 L-110 0 Z"
                            fill="hsl(var(--card))"
                            stroke={isCentral ? 'hsl(var(--primary))' : 'currentColor'}
                            strokeWidth={isCentral ? 4 : 2.5}
                          />
                        ) : shape === 'diamond' ? (
                          <path
                            d="M0 -42 L112 0 L0 42 L-112 0 Z"
                            fill="hsl(var(--card))"
                            stroke={isCentral ? 'hsl(var(--primary))' : 'currentColor'}
                            strokeWidth={isCentral ? 4 : 2.5}
                          />
                        ) : (
                          <rect
                            x={-108}
                            y={-34}
                            width={216}
                            height={68}
                            rx={8}
                            fill="hsl(var(--card))"
                            stroke={isCentral ? 'hsl(var(--primary))' : 'currentColor'}
                            strokeWidth={isCentral ? 4 : 2.5}
                          />
                        )}

                        {/* Icon & Readable Text */}
                        <Icon x={-91} y={-10} width={20} height={20} />
                        <text
                          x={10}
                          y={-3}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight={isCentral ? 600 : 400}
                          fill="hsl(var(--foreground))"
                        >
                          {name(n.id).length > 21 ? `${name(n.id).slice(0, 19)}…` : name(n.id)}
                        </text>
                        <text
                          x={10}
                          y={17}
                          textAnchor="middle"
                          fontSize={11}
                          fill="currentColor"
                        >
                          {isCentral ? '★ FOCUSED' : label}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* MULTI-RELATIONSHIP INSPECTION POPOVER */}
                {selectedEdgeGroup && (
                  <div className="relative ml-auto max-w-sm w-full p-3.5 rounded-xl border border-primary/40 bg-card/95 shadow-xl text-xs space-y-2.5 z-20 backdrop-blur-sm">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>Connections:</span>
                        <span className="text-primary font-mono">
                          {selectedEdgeGroup.relationships.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedEdgeGroup(null)}
                        className="text-muted-foreground hover:text-foreground text-[11px]"
                      >
                        ✕ Close
                      </button>
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      Between <strong>{name(selectedEdgeGroup.source)}</strong> and{' '}
                      <strong>{name(selectedEdgeGroup.target)}</strong>
                    </div>

                    <div className="divide-y divide-border/40 max-h-56 overflow-y-auto space-y-1.5">
                      {selectedEdgeGroup.relationships.map((rel) => {
                        const isGuided = isGuidedRelationship(rel);
                        const perspective = relationshipPerspective(rel, selectedEdgeGroup.source);
                        return (
                          <div key={rel.id} className="pt-2 pb-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                                  isGuided
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : 'bg-muted/60 text-muted-foreground border border-border/60'
                                }`}
                              >
                                {rel.provenance === 'office' ? 'Derived office' : isGuided ? 'Authored / guided' : 'Authored'}
                              </span>
                              <span className="text-[11px] font-semibold text-foreground">
                                {rel.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {rel.directed ? 'Directed →' : 'Mutual ↔'}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground italic">
                              {name(rel.source_id)} {rel.directed ? '→' : '↔'} {name(rel.target_id)} / Perspective: {perspective}
                              {rel.positionTitle && <div>Position: {rel.positionTitle}{rel.branchName ? ` / Branch: ${rel.branchName}` : ''} / Source: faction organization</div>}
                              {rel.evidence && <div>Evidence: {rel.evidence.kind}{rel.evidence.source ? ` / ${name(rel.evidence.source)}` : ''}</div>}
                              {onOpenEntity && <div className="flex gap-2">{[rel.source_id, rel.target_id].map(id => <button key={id} type="button" onClick={() => onOpenEntity(id)}>Open {name(id)}{id === rel.target_id && rel.positionId ? ' / office' : ''}</button>)}</div>}
                            </div>
                            {rel.description && (
                              <p className="text-[10px] text-foreground/80 bg-muted/20 p-1.5 rounded">
                                {rel.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* FOCUSED ACTION STRIP */}
              {activeFocus && (
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    <span>
                      Focused: <strong>{name(activeFocus)}</strong> ({neighborIds.size - 1} connected entities)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onOpenEntity && (
                      <button
                        type="button"
                        className="help-button flex items-center gap-1"
                        onClick={() => onOpenEntity(activeFocus)}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open entity document
                      </button>
                    )}
                    <button
                      type="button"
                      className="help-button"
                      onClick={() => {
                        setFocus('');
                        setMode('full');
                      }}
                    >
                      Return to full graph
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. RELATIONSHIP TABLE / LIST ALTERNATIVE */}
          {viewTab === 'table' && (
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search entities or relationship labels..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="text-muted-foreground text-[11px]">
                  Showing {tableRows.length} of {categoryFiltered.length} relationships
                </div>
              </div>

              {tableRows.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground">
                  No relationships match your search query or filters.
                </div>
              ) : (
                <div className="overflow-x-auto border border-border/80 rounded-lg">
                  <table className="w-full text-left text-xs divide-y divide-border/60">
                    <thead className="bg-muted/30 font-medium text-muted-foreground">
                      <tr>
                        <th className="p-2.5">Source Entity</th>
                        <th className="p-2.5">Relationship</th>
                        <th className="p-2.5">Target Entity</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Semantics</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 bg-background/50">
                      {tableRows.map((rel) => {
                        const isGuided = isGuidedRelationship(rel);
                        const isSymmetric = relationshipMeaning(rel.label)?.symmetric || !rel.directed;

                        return (
                          <tr key={rel.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-2.5">
                              <button
                                type="button"
                                onClick={() => handleSetFocus(rel.source_id)}
                                className="font-serif font-medium text-foreground hover:text-primary underline text-left"
                                title="Focus in graph"
                              >
                                {name(rel.source_id)}
                              </button>
                            </td>
                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium inline-flex items-center gap-1">
                                {rel.label}
                                {isSymmetric ? '↔' : '→'}
                              </span>
                            </td>
                            <td className="p-2.5">
                              <button
                                type="button"
                                onClick={() => handleSetFocus(rel.target_id)}
                                className="font-serif font-medium text-foreground hover:text-primary underline text-left"
                                title="Focus in graph"
                              >
                                {name(rel.target_id)}
                              </button>
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                                  isGuided
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                    : 'bg-muted/60 text-muted-foreground border-border/60'
                                }`}
                              >
                                {rel.provenance === 'office' ? 'Derived office' : isGuided ? 'Authored / guided' : 'Authored'}
                              </span>
                            </td>
                            <td className="p-2.5 text-muted-foreground text-[11px]">
                              {isSymmetric ? 'Symmetric (Mutual)' : 'Directed (One-way)'}
                            </td>
                            <td className="p-2.5 text-right space-x-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSetFocus(rel.source_id);
                                  setViewTab('graph');
                                }}
                                className="px-2 py-0.5 rounded bg-muted/60 hover:bg-muted text-[11px] font-medium transition-colors"
                              >
                                Focus Graph
                              </button>
                              {onOpenEntity && (
                                <button
                                  type="button"
                                  onClick={() => onOpenEntity(rel.source_id)}
                                  className="px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-medium transition-colors"
                                >
                                  Open
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3. FACTION HIERARCHY TREE VIEW (PHASE C2 DERIVED) */}
          {viewTab === 'hierarchy' && (
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span className="font-serif font-semibold text-sm text-foreground">
                    Faction Organization &amp; Positions
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (Derived from canonical faction metadata; no synthetic graph edges)
                  </span>
                </div>

                {availableFactions.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <label className="text-muted-foreground text-[11px]">Select Faction:</label>
                    <select
                      value={selectedFactionId}
                      onChange={(e) => setSelectedFactionId(e.target.value)}
                      className="px-2.5 py-1 rounded-md bg-background border border-border text-foreground text-xs"
                    >
                      {availableFactions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {!factionHierarchyData || factionHierarchyData.totalPositions === 0 ? (
                <div className="py-8 text-center text-muted-foreground space-y-2">
                  <Briefcase className="w-8 h-8 mx-auto text-muted-foreground/40" />
                  <div className="font-medium text-foreground">No official positions defined yet</div>
                  <p className="max-w-md mx-auto text-[11px]">
                    This faction has not configured organizational positions or branches yet.
                    Use the Faction Organization editor in the Lorebook to define offices and reporting structures.
                  </p>
                  {onOpenEntity && selectedFactionId && (
                    <button
                      type="button"
                      onClick={() => onOpenEntity(selectedFactionId)}
                      className="help-button inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open Faction Editor
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Stats Ribbon */}
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-amber-950/20 border border-amber-500/20 text-center">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Total Offices</div>
                      <div className="text-base font-semibold text-foreground">
                        {factionHierarchyData.totalPositions}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Assigned Holders</div>
                      <div className="text-base font-semibold text-amber-300">
                        {factionHierarchyData.totalHolders}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Vacant Positions</div>
                      <div className="text-base font-semibold text-rose-300">
                        {factionHierarchyData.vacantCount}
                      </div>
                    </div>
                  </div>

                  {/* Hierarchical Position Tree */}
                  <div className="space-y-3">
                    <div className="font-semibold text-foreground flex items-center justify-between">
                      <span>Reporting Lines &amp; Official Positions:</span>
                      <span className="text-[11px] text-muted-foreground italic">
                        Supports multi-root structures &amp; multiple holders
                      </span>
                    </div>

                    <div className="space-y-2">
                      {factionHierarchyData.rootPositions.map((pos) => (
                        <PositionTreeNode
                          key={pos.id}
                          node={pos}
                          depth={0}
                          onOpenEntity={onOpenEntity}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Branch Breakdown (if branches exist) */}
                  {factionHierarchyData.branches.length > 0 && (
                    <div className="pt-3 border-t border-border/40 space-y-2">
                      <div className="font-semibold text-foreground">
                        Branches &amp; Operational Divisions:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {factionHierarchyData.branches.map((b) => (
                          <div
                            key={b.id}
                            className="p-2.5 rounded-lg bg-card border border-border text-xs space-y-1.5"
                          >
                            <div className="font-medium text-foreground flex items-center justify-between">
                              <span>{b.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {b.positions.length} positions
                              </span>
                            </div>
                            {b.description && (
                              <p className="text-[11px] text-muted-foreground italic">{b.description}</p>
                            )}
                            <div className="text-[11px] text-muted-foreground">
                              {b.positions.map((p) => p.title).join(', ') || 'No positions in this branch'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};

/**
 * Recursive Position Tree Node for Faction Organization View
 */
const PositionTreeNode: React.FC<{
  node: FactionHierarchyPositionNode;
  depth: number;
  onOpenEntity?: (id: string) => void;
}> = ({ node, depth, onOpenEntity }) => {
  return (
    <div className={`space-y-1.5 ${depth > 0 ? 'ml-6 pl-3 border-l-2 border-border/60' : ''}`}>
      <div className="p-2.5 rounded-lg bg-background border border-border/80 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground">{node.title}</span>

          {node.branchName && (
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-muted/60 text-muted-foreground border border-border/60">
              Branch: {node.branchName}
            </span>
          )}

          <span className="text-muted-foreground text-[11px]">Holder(s):</span>
          {node.isVacant ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950/30 text-rose-300 border border-rose-600/30 font-medium">
              Vacant
            </span>
          ) : (
            node.holders.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onOpenEntity?.(h.id)}
                className="font-serif text-amber-300 hover:underline flex items-center gap-1"
                title={`Open ${h.title}`}
              >
                {h.title}
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </button>
            ))
          )}
        </div>

        {node.description && (
          <span className="text-[11px] text-muted-foreground truncate max-w-xs">
            {node.description}
          </span>
        )}
      </div>

      {node.children.map((child) => (
        <PositionTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          onOpenEntity={onOpenEntity}
        />
      ))}
    </div>
  );
};

function filteredRelationshipsCount(totalMatching: number, visibleCount: number): string {
  if (totalMatching > visibleCount) {
    return `${visibleCount} of ${totalMatching}`;
  }
  return `${totalMatching}`;
}
