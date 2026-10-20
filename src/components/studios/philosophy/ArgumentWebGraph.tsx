import React, { useRef, useState, useId } from 'react';
import type { ArgumentWeb, SourceValidationResult } from '@/types';
import type { ArgumentWebLayout } from '@/utils/argumentWeb';
import { RELATION_LABELS } from '@/utils/argumentWeb';
import { ZoomIn, ZoomOut, Maximize2, Crosshair } from 'lucide-react';

interface ArgumentWebGraphProps {
  layout: ArgumentWebLayout;
  web: ArgumentWeb;
  selectedId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (relId: string) => void;
  onClearSelection: () => void;
  sourceValidationMap: Map<string, SourceValidationResult>;
}

export const ArgumentWebGraph: React.FC<ArgumentWebGraphProps> = ({
  layout,
  web,
  selectedId,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  sourceValidationMap,
}) => {
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const uidPrefix = useId().replace(/:/g, '');

  const markerSupports = `marker-supports-${uidPrefix}`;
  const markerChallenges = `marker-challenges-${uidPrefix}`;
  const markerExpands = `marker-expands-${uidPrefix}`;

  // Viewport calculation
  const w = layout.bounds.width / camera.scale;
  const h = layout.bounds.height / camera.scale;
  const vx = layout.bounds.x + (layout.bounds.width - w) / 2 + camera.x;
  const vy = layout.bounds.y + (layout.bounds.height - h) / 2 + camera.y;

  const handleZoom = (factor: number) => {
    setCamera((c) => ({
      ...c,
      scale: Math.max(0.2, Math.min(3.5, c.scale * factor)),
    }));
  };

  const handleFit = () => {
    setCamera({ x: 0, y: 0, scale: 1 });
  };

  const handleFocusThesis = () => {
    if (web.main_thesis) {
      setCamera({ x: 0, y: 0, scale: 1.1 });
      onSelectNode(web.main_thesis.id);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-background select-none overflow-hidden">
      {/* FLOATING CONTROLS BAR */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-card/90 backdrop-blur-sm border border-border/80 rounded-lg p-1.5 shadow-sm">
        {web.main_thesis && (
          <button
            type="button"
            onClick={handleFocusThesis}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-500 hover:bg-amber-500/10 rounded transition-colors"
            title="Focus Main Thesis"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Focus Thesis</span>
          </button>
        )}
        <div className="h-4 w-px bg-border/60 mx-0.5" />
        <button
          type="button"
          onClick={() => handleZoom(1.25)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-colors"
          title="Zoom In (+)"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(1 / 1.25)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-colors"
          title="Zoom Out (-)"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleFit}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-colors"
          title="Fit to View (Home)"
          aria-label="Fit to view"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* INTERACTIVE SVG GRAPH CANVAS */}
      <svg
        ref={svgRef}
        role="region"
        tabIndex={0}
        aria-label="Interactive Argument Web Graph. Use arrow keys to pan, plus and minus to zoom, Home to reset."
        viewBox={`${vx} ${vy} ${w} ${h}`}
        className="w-full h-full cursor-grab active:cursor-grabbing outline-none"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-50, 0],
            ArrowRight: [50, 0],
            ArrowUp: [0, -50],
            ArrowDown: [0, 50],
          };
          if (moves[e.key]) {
            e.preventDefault();
            const [dx, dy] = moves[e.key];
            setCamera((c) => ({ ...c, x: c.x + dx / c.scale, y: c.y + dy / c.scale }));
          } else if (e.key === 'Home') {
            e.preventDefault();
            handleFit();
          } else if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            handleZoom(1.2);
          } else if (e.key === '-') {
            e.preventDefault();
            handleZoom(1 / 1.2);
          }
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('[data-graph-element]')) return;
          dragRef.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
          onClearSelection();
        }}
        onPointerMove={(e) => {
          if (!dragRef.current || !svgRef.current) return;
          const rect = svgRef.current.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          const factorX = w / rect.width;
          const factorY = h / rect.height;
          const dx = (e.clientX - dragRef.current.x) * factorX;
          const dy = (e.clientY - dragRef.current.y) * factorY;
          dragRef.current = { x: e.clientX, y: e.clientY };
          setCamera((c) => ({ ...c, x: c.x - dx, y: c.y - dy }));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <defs>
          {/* Arrowhead markers */}
          <marker
            id={markerSupports}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 Z" fill="#10b981" />
          </marker>
          <marker
            id={markerChallenges}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 Z" fill="#f43f5e" />
          </marker>
          <marker
            id={markerExpands}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 Z" fill="#3b82f6" />
          </marker>
        </defs>

        {/* 1. EDGES */}
        {layout.edges.map((edge) => {
          const isSelected = selectedId === edge.id;
          let strokeColor = '#94a3b8';
          let strokeDash: string | undefined = undefined;
          let markerEnd: string | undefined = undefined;

          if (edge.relation_type === 'supports') {
            strokeColor = '#10b981';
            markerEnd = `url(#${markerSupports})`;
          } else if (edge.relation_type === 'challenges') {
            strokeColor = '#f43f5e';
            strokeDash = '6 4';
            markerEnd = `url(#${markerChallenges})`;
          } else if (edge.relation_type === 'expands') {
            strokeColor = '#3b82f6';
            strokeDash = '3 3';
            markerEnd = `url(#${markerExpands})`;
          } else if (edge.relation_type === 'related') {
            strokeColor = '#f59e0b';
          }

          const labelInfo = RELATION_LABELS[edge.relation_type];

          return (
            <g
              key={edge.id}
              data-graph-element="edge"
              className="cursor-pointer group"
              onClick={(e) => {
                e.stopPropagation();
                onSelectEdge(edge.id);
              }}
            >
              {/* Invisible wider hit target */}
              <path
                d={edge.path}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                strokeLinecap="round"
              />
              {/* Visible edge line */}
              <path
                d={edge.path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={strokeDash}
                markerEnd={markerEnd}
                className="transition-all"
                opacity={selectedId && !isSelected ? 0.3 : 1}
              />
              {/* Midpoint Label Badge */}
              <g
                transform={`translate(${edge.labelX}, ${edge.labelY})`}
                className="transition-transform group-hover:scale-105"
              >
                <rect
                  x="-38"
                  y="-11"
                  width="76"
                  height="22"
                  rx="6"
                  fill="hsl(var(--card))"
                  stroke={isSelected ? strokeColor : 'hsl(var(--border))'}
                  strokeWidth={isSelected ? 2 : 1}
                  className="shadow-sm"
                />
                <text
                  textAnchor="middle"
                  y="4"
                  fontSize="11"
                  fontWeight="600"
                  fill={strokeColor}
                  className="font-sans"
                >
                  {labelInfo.label}
                </text>
              </g>
            </g>
          );
        })}

        {/* 2. NODES */}
        {layout.nodes.map((node) => {
          const isSelected = selectedId === node.id;
          const validation = sourceValidationMap.get(node.id);

          return (
            <g
              key={node.id}
              data-graph-element="node"
              role="button"
              tabIndex={0}
              aria-label={`${node.isThesis ? 'Main Thesis' : 'Argument'}: ${node.title}`}
              aria-pressed={isSelected}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer group outline-none"
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectNode(node.id);
                }
              }}
            >
              {node.isThesis ? (
                /* MAIN THESIS PROMINENT VISUAL */
                <g>
                  {/* Subtle golden halo glow */}
                  <rect
                    x={-node.width / 2 - 4}
                    y={-node.height / 2 - 4}
                    width={node.width + 8}
                    height={node.height + 8}
                    rx="16"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={isSelected ? 3 : 1.5}
                    strokeOpacity={isSelected ? 0.8 : 0.3}
                  />
                  {/* Body container */}
                  <rect
                    x={-node.width / 2}
                    y={-node.height / 2}
                    width={node.width}
                    height={node.height}
                    rx="12"
                    fill="hsl(var(--card))"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    className="shadow-md"
                  />
                  {/* Thesis Header Badge */}
                  <rect
                    x={-node.width / 2 + 12}
                    y={-node.height / 2 + 10}
                    width="92"
                    height="18"
                    rx="4"
                    fill="#f59e0b"
                    fillOpacity="0.18"
                  />
                  <text
                    x={-node.width / 2 + 16}
                    y={-node.height / 2 + 23}
                    fontSize="10"
                    fontWeight="700"
                    fill="#d97706"
                    letterSpacing="0.06em"
                    className="font-sans"
                  >
                    MAIN THESIS
                  </text>

                  {/* Thesis Title */}
                  <text
                    x={-node.width / 2 + 14}
                    y={-node.height / 2 + 48}
                    fontSize="14"
                    fontWeight="700"
                    fill="hsl(var(--foreground))"
                    className="font-serif"
                  >
                    {node.title.length > 26 ? `${node.title.slice(0, 24)}…` : node.title}
                  </text>

                  {/* Thesis Content Snippet */}
                  {node.snapshot && (
                    <text
                      x={-node.width / 2 + 14}
                      y={-node.height / 2 + 70}
                      fontSize="11"
                      fill="hsl(var(--muted-foreground))"
                      className="font-serif italic"
                    >
                      {node.snapshot.length > 34
                        ? `“${node.snapshot.slice(0, 32)}…”`
                        : `“${node.snapshot}”`}
                    </text>
                  )}
                </g>
              ) : (
                /* STANDARD ARGUMENT NODE */
                <g opacity={selectedId && !isSelected ? 0.45 : 1} className="transition-opacity">
                  <rect
                    x={-node.width / 2}
                    y={-node.height / 2}
                    width={node.width}
                    height={node.height}
                    rx="10"
                    fill="hsl(var(--card))"
                    stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                    strokeWidth={isSelected ? 2.5 : 1}
                    className="shadow-sm transition-colors group-hover:stroke-primary/60"
                  />

                  {/* Source status indicator icon/dot */}
                  {validation?.status === 'verified' && (
                    <circle
                      cx={node.width / 2 - 14}
                      cy={-node.height / 2 + 14}
                      r="4"
                      fill="#10b981"
                    >
                      <title>Source verified in text</title>
                    </circle>
                  )}
                  {validation?.status === 'moved' && (
                    <circle
                      cx={node.width / 2 - 14}
                      cy={-node.height / 2 + 14}
                      r="4.5"
                      fill="#f59e0b"
                    >
                      <title>Source moved in text (needs review)</title>
                    </circle>
                  )}
                  {validation?.status === 'unlocated' && (
                    <circle
                      cx={node.width / 2 - 14}
                      cy={-node.height / 2 + 14}
                      r="4.5"
                      fill="#ef4444"
                    >
                      <title>Source unlocated in text</title>
                    </circle>
                  )}

                  {/* Node Title */}
                  <text
                    x={-node.width / 2 + 12}
                    y={-node.height / 2 + 28}
                    fontSize="13"
                    fontWeight="600"
                    fill="hsl(var(--foreground))"
                    className="font-serif"
                  >
                    {node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title}
                  </text>

                  {/* Passage Snapshot snippet */}
                  {node.snapshot && (
                    <text
                      x={-node.width / 2 + 12}
                      y={-node.height / 2 + 52}
                      fontSize="11"
                      fill="hsl(var(--muted-foreground))"
                      className="font-serif italic"
                    >
                      {node.snapshot.length > 28
                        ? `“${node.snapshot.slice(0, 26)}…”`
                        : `“${node.snapshot}”`}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* FOOTER LEGEND */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-card/85 backdrop-blur-sm border border-border/80 rounded-lg px-3 py-1.5 text-xs shadow-xs text-muted-foreground">
        <span className="font-semibold text-foreground mr-1">Legend:</span>
        <span className="inline-flex items-center gap-1.5 text-amber-500 font-medium">
          <span className="w-2.5 h-2.5 rounded-full border border-amber-500 bg-amber-500/20" />
          Main Thesis
        </span>
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <span className="w-3 h-0.5 bg-emerald-500" />
          Supports (→)
        </span>
        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
          <span className="w-3 h-0.5 border-t border-dashed border-rose-500" />
          Challenges (→)
        </span>
        <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <span className="w-3 h-0.5 border-t border-dotted border-blue-500" />
          Expands (→)
        </span>
        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <span className="w-3 h-0.5 bg-amber-400" />
          Related (—)
        </span>
      </div>
    </div>
  );
};
