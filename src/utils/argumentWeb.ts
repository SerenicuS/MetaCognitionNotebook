import type {
  ArgumentNode,
  ArgumentRelationship,
  ArgumentRelationType,
  ArgumentSourceRef,
  ArgumentWeb,
  MainThesis,
  PhilosophyMetadata,
  PhilosophyParagraph,
  SourceValidationResult,
  SourceOccurrence,
} from '@/types';

export const RELATION_LABELS: Record<
  ArgumentRelationType,
  { label: string; description: string; directed: boolean; color: string; strokeStyle: string }
> = {
  supports: {
    label: 'Supports',
    description: 'Argument provides support or justification for the target claim.',
    directed: true,
    color: 'emerald',
    strokeStyle: 'solid',
  },
  challenges: {
    label: 'Challenges',
    description: 'Argument questions, objects to, or challenges the target claim.',
    directed: true,
    color: 'rose',
    strokeStyle: 'dashed',
  },
  expands: {
    label: 'Expands',
    description: 'Argument elaborates on, explains, or adds context to the target claim.',
    directed: true,
    color: 'blue',
    strokeStyle: 'dotted',
  },
  related: {
    label: 'Related',
    description: 'Arguments have a meaningful association without a directed dependency.',
    directed: false,
    color: 'amber',
    strokeStyle: 'solid',
  },
};

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `arg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Safely retrieves or initializes the ArgumentWeb structure from PhilosophyMetadata.
 */
export function getOrCreateArgumentWeb(metadata?: PhilosophyMetadata | null): ArgumentWeb {
  const existing = metadata?.argument_web;
  return {
    main_thesis: existing?.main_thesis ? { ...existing.main_thesis } : null,
    nodes: Array.isArray(existing?.nodes) ? existing.nodes.map((n) => ({ ...n })) : [],
    relationships: Array.isArray(existing?.relationships)
      ? existing.relationships.map((r) => ({ ...r }))
      : [],
    dismissed_insights: Array.isArray(existing?.dismissed_insights)
      ? [...existing.dismissed_insights]
      : [],
  };
}

/**
 * Creates or sets the Main Thesis.
 */
export function setMainThesis(
  web: ArgumentWeb,
  title: string,
  content: string,
  source?: ArgumentSourceRef | null
): ArgumentWeb {
  const trimmedTitle = title.trim() || 'Main Thesis';
  const trimmedContent = content.trim();
  const id = web.main_thesis?.id || `thesis-${uid()}`;

  return {
    ...web,
    main_thesis: {
      id,
      title: trimmedTitle,
      content: trimmedContent,
      passage_source: source || null,
      position: web.main_thesis?.position || { x: 0, y: 0 },
    },
  };
}

/**
 * Updates existing Main Thesis fields.
 */
export function updateMainThesis(web: ArgumentWeb, patch: Partial<MainThesis>): ArgumentWeb {
  if (!web.main_thesis) {
    return web;
  }
  return {
    ...web,
    main_thesis: {
      ...web.main_thesis,
      ...patch,
    },
  };
}

/**
 * Removes the Main Thesis and cleans up any relationships connected to it.
 */
export function removeMainThesis(web: ArgumentWeb): ArgumentWeb {
  if (!web.main_thesis) return web;
  const thesisId = web.main_thesis.id;
  return {
    ...web,
    main_thesis: null,
    relationships: web.relationships.filter(
      (r) => r.source_id !== thesisId && r.target_id !== thesisId
    ),
  };
}

/**
 * Adds an argument node originating from a selected passage.
 */
export function addArgumentNode(
  web: ArgumentWeb,
  title: string,
  snapshot: string,
  source?: ArgumentSourceRef | null
): { web: ArgumentWeb; node: ArgumentNode } {
  const id = uid();
  const trimmedTitle = title.trim() || 'Untitled Argument';
  const now = new Date().toISOString();

  const node: ArgumentNode = {
    id,
    title: trimmedTitle,
    snapshot: snapshot.trim(),
    source: source || null,
    created_at: now,
    updated_at: now,
  };

  return {
    web: {
      ...web,
      nodes: [...web.nodes, node],
    },
    node,
  };
}

/**
 * Updates an argument node's title, snapshot, or position.
 */
export function updateArgumentNode(
  web: ArgumentWeb,
  nodeId: string,
  patch: Partial<Pick<ArgumentNode, 'title' | 'snapshot' | 'position'>>
): ArgumentWeb {
  return {
    ...web,
    nodes: web.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            ...patch,
            updated_at: new Date().toISOString(),
          }
        : n
    ),
  };
}

/**
 * Removes an argument node and automatically cascades removal of connected relationships.
 */
export function removeArgumentNode(web: ArgumentWeb, nodeId: string): ArgumentWeb {
  return {
    ...web,
    nodes: web.nodes.filter((n) => n.id !== nodeId),
    relationships: web.relationships.filter(
      (r) => r.source_id !== nodeId && r.target_id !== nodeId
    ),
  };
}

/**
 * Relinks an existing argument node to a newly selected passage,
 * strictly preserving node ID and all existing relationships.
 */
export function relinkArgumentNode(
  web: ArgumentWeb,
  nodeId: string,
  newSnapshot: string,
  newSource?: ArgumentSourceRef | null
): ArgumentWeb {
  return {
    ...web,
    nodes: web.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            snapshot: newSnapshot.trim(),
            source: newSource || null,
            updated_at: new Date().toISOString(),
          }
        : n
    ),
  };
}

/**
 * Adds a manually defined relationship between two argument nodes (or a node and the Main Thesis).
 * Enforces:
 * 1. Self-connections are prohibited.
 * 2. Both endpoints must exist in the web.
 * 3. Exact duplicates (same endpoints and relation type) are prohibited.
 */
export function addArgumentRelationship(
  web: ArgumentWeb,
  params: {
    source_id: string;
    target_id: string;
    relation_type: ArgumentRelationType;
    explanation?: string;
  }
): { web: ArgumentWeb; relationship: ArgumentRelationship } {
  const { source_id, target_id, relation_type, explanation } = params;

  if (source_id === target_id) {
    throw new Error('An argument cannot connect to itself.');
  }

  const validIds = new Set<string>();
  if (web.main_thesis) {
    validIds.add(web.main_thesis.id);
  }
  for (const n of web.nodes) {
    validIds.add(n.id);
  }

  if (!validIds.has(source_id) || !validIds.has(target_id)) {
    throw new Error('Both relationship endpoints must exist in the Argument Web.');
  }

  // Duplicate check
  const isDuplicate = web.relationships.some((r) => {
    if (r.relation_type !== relation_type) return false;
    if (relation_type === 'related') {
      // Non-directional check (either order)
      return (
        (r.source_id === source_id && r.target_id === target_id) ||
        (r.source_id === target_id && r.target_id === source_id)
      );
    }
    // Directional check
    return r.source_id === source_id && r.target_id === target_id;
  });

  if (isDuplicate) {
    throw new Error(`A "${RELATION_LABELS[relation_type].label}" relationship already exists between these arguments.`);
  }

  const rel: ArgumentRelationship = {
    id: uid(),
    source_id,
    target_id,
    relation_type,
    explanation: explanation?.trim() || undefined,
  };

  return {
    web: {
      ...web,
      relationships: [...web.relationships, rel],
    },
    relationship: rel,
  };
}

/**
 * Updates relationship type or explanation.
 */
export function updateArgumentRelationship(
  web: ArgumentWeb,
  relId: string,
  patch: Partial<Pick<ArgumentRelationship, 'relation_type' | 'explanation'>>
): ArgumentWeb {
  return {
    ...web,
    relationships: web.relationships.map((r) => (r.id === relId ? { ...r, ...patch } : r)),
  };
}

/**
 * Removes a relationship by ID.
 */
export function removeArgumentRelationship(web: ArgumentWeb, relId: string): ArgumentWeb {
  return {
    ...web,
    relationships: web.relationships.filter((r) => r.id !== relId),
  };
}

/**
 * Validates whether the recorded source location matches the passage snapshot.
 * Verifies the recorded source location first. If it does not match, locates
 * candidate occurrences in the document content. Never silently relinks.
 */
export function validateSourceLocation(
  content: string,
  snapshot: string,
  source?: ArgumentSourceRef | null,
  paragraphs?: PhilosophyParagraph[]
): SourceValidationResult {
  const cleanSnapshot = (snapshot || '').trim();
  if (!cleanSnapshot) {
    return { status: 'unlocated', occurrences: [] };
  }

  // 1. Verify recorded location first
  if (source) {
    // Structured block verification
    if (
      source.block_index !== undefined &&
      paragraphs &&
      paragraphs[source.block_index] &&
      source.start_offset !== undefined &&
      source.end_offset !== undefined
    ) {
      const blockText = paragraphs[source.block_index].text;
      const slice = blockText.slice(source.start_offset, source.end_offset).trim();
      if (slice === cleanSnapshot) {
        return {
          status: 'verified',
          occurrences: [
            {
              block_index: source.block_index,
              start_offset: source.start_offset,
              end_offset: source.end_offset,
              preview: slice,
            },
          ],
        };
      }
    }

    // Whole document offset verification
    if (source.start_offset !== undefined && source.end_offset !== undefined) {
      const docSlice = content.slice(source.start_offset, source.end_offset).trim();
      if (docSlice === cleanSnapshot) {
        return {
          status: 'verified',
          occurrences: [
            {
              block_index: source.block_index,
              start_offset: source.start_offset,
              end_offset: source.end_offset,
              preview: docSlice,
            },
          ],
        };
      }
    }
  }

  // 2. Find all occurrences in content to report candidate locations
  const occurrences: SourceOccurrence[] = [];
  let index = 0;
  while (index < content.length) {
    const foundIdx = content.indexOf(cleanSnapshot, index);
    if (foundIdx === -1) break;

    const start = Math.max(0, foundIdx - 30);
    const end = Math.min(content.length, foundIdx + cleanSnapshot.length + 30);
    const preview = content.slice(start, end).replace(/\s+/g, ' ');

    occurrences.push({
      start_offset: foundIdx,
      end_offset: foundIdx + cleanSnapshot.length,
      preview: `…${preview}…`,
    });

    index = foundIdx + cleanSnapshot.length;
  }

  if (occurrences.length > 0) {
    return {
      status: 'moved',
      occurrences,
    };
  }

  return {
    status: 'unlocated',
    occurrences: [],
  };
}

export interface StructuralInsight {
  id: string;
  kind: 'disconnected' | 'no_incoming_support' | 'separate_cluster' | 'source_review';
  title: string;
  description: string;
  targetNodeIds: string[];
  dismissable: boolean;
}

/**
 * Computes deterministic structural observations about the Argument Web graph.
 * These are strictly descriptive, structural observations and NEVER evaluate
 * whether an argument is correct, logically sound, or persuasive.
 */
export function computeStructuralInsights(
  web: ArgumentWeb,
  content: string,
  paragraphs?: PhilosophyParagraph[]
): StructuralInsight[] {
  const insights: StructuralInsight[] = [];
  const dismissedSet = new Set(web.dismissed_insights || []);

  const allNodeIds = new Set(web.nodes.map((n) => n.id));
  if (web.main_thesis) {
    allNodeIds.add(web.main_thesis.id);
  }

  // Helper to check if node has relationships
  const connectedNodeIds = new Set<string>();
  for (const r of web.relationships) {
    connectedNodeIds.add(r.source_id);
    connectedNodeIds.add(r.target_id);
  }

  // 1. Disconnected arguments (nodes with 0 relationships)
  for (const node of web.nodes) {
    if (!connectedNodeIds.has(node.id)) {
      const id = `disconnected:${node.id}`;
      if (!dismissedSet.has(id)) {
        insights.push({
          id,
          kind: 'disconnected',
          title: 'Disconnected Argument',
          description: `"${node.title}" has no recorded relationships with the Main Thesis or other arguments.`,
          targetNodeIds: [node.id],
          dismissable: true,
        });
      }
    }
  }

  // 2. No incoming support
  // Identifies nodes that participate in supporting other arguments, but have no incoming Support relationships.
  // Main Thesis is also checked if arguments exist.
  const nodesWithIncomingSupport = new Set<string>();
  for (const r of web.relationships) {
    if (r.relation_type === 'supports') {
      nodesWithIncomingSupport.add(r.target_id);
    }
  }

  if (web.main_thesis && web.nodes.length > 0) {
    if (!nodesWithIncomingSupport.has(web.main_thesis.id)) {
      const id = `no_incoming_support:${web.main_thesis.id}`;
      if (!dismissedSet.has(id)) {
        insights.push({
          id,
          kind: 'no_incoming_support',
          title: 'Thesis Without Supporting Arguments',
          description: `The Main Thesis "${web.main_thesis.title}" does not currently have any incoming Support relationships recorded.`,
          targetNodeIds: [web.main_thesis.id],
          dismissable: true,
        });
      }
    }
  }

  for (const node of web.nodes) {
    // Only flag if the node acts as support/challenge/expansion for other arguments,
    // but has no incoming support recorded.
    const hasOutgoing = web.relationships.some((r) => r.source_id === node.id);
    if (hasOutgoing && !nodesWithIncomingSupport.has(node.id)) {
      const id = `no_incoming_support:${node.id}`;
      if (!dismissedSet.has(id)) {
        insights.push({
          id,
          kind: 'no_incoming_support',
          title: 'Unbacked Supporting Premise',
          description: `"${node.title}" provides justification or context for other arguments, but has no incoming Support relationships recorded.`,
          targetNodeIds: [node.id],
          dismissable: true,
        });
      }
    }
  }

  // 3. Separate clusters (components disconnected from Main Thesis)
  // Treat all relationships as undirected for reachability
  const adj = new Map<string, Set<string>>();
  for (const id of allNodeIds) {
    adj.set(id, new Set());
  }
  for (const r of web.relationships) {
    adj.get(r.source_id)?.add(r.target_id);
    adj.get(r.target_id)?.add(r.source_id);
  }

  const visited = new Set<string>();
  const thesisId = web.main_thesis?.id;

  for (const id of allNodeIds) {
    if (visited.has(id)) continue;

    // Run BFS to collect connected component
    const component: string[] = [];
    const queue = [id];
    visited.add(id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      const neighbors = adj.get(curr) || new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    // A separate cluster must have at least 2 nodes and NOT contain the main thesis
    if (component.length >= 2 && thesisId && !component.includes(thesisId)) {
      const sortedIds = [...component].sort();
      const clusterId = `separate_cluster:${sortedIds.join(':')}`;
      if (!dismissedSet.has(clusterId)) {
        insights.push({
          id: clusterId,
          kind: 'separate_cluster',
          title: 'Isolated Argument Cluster',
          description: `A cluster of ${component.length} interconnected arguments has no recorded connection to the Main Thesis.`,
          targetNodeIds: component,
          dismissable: true,
        });
      }
    }
  }

  // 4. Source reference review (unlocated or relocated passage)
  for (const node of web.nodes) {
    const val = validateSourceLocation(content, node.snapshot, node.source, paragraphs);
    if (val.status !== 'verified') {
      const id = `source_review:${node.id}`;
      if (!dismissedSet.has(id)) {
        const isMoved = val.status === 'moved';
        insights.push({
          id,
          kind: 'source_review',
          title: isMoved ? 'Source Passage Relocated' : 'Source Passage Unlocated',
          description: isMoved
            ? `The passage for "${node.title}" was moved or edited. ${val.occurrences.length} candidate match(es) exist in the document.`
            : `The recorded passage for "${node.title}" can no longer be found in the document text.`,
          targetNodeIds: [node.id],
          dismissable: false, // source drift requires review or relinking, not silent dismissal
        });
      }
    }
  }

  return insights;
}

/**
 * Acknowledges or dismisses a specific structural insight by stable ID.
 */
export function dismissInsight(web: ArgumentWeb, insightId: string): ArgumentWeb {
  const current = new Set(web.dismissed_insights || []);
  current.add(insightId);
  return {
    ...web,
    dismissed_insights: Array.from(current),
  };
}

/**
 * Restores a previously dismissed insight.
 */
export function restoreInsight(web: ArgumentWeb, insightId: string): ArgumentWeb {
  const current = new Set(web.dismissed_insights || []);
  current.delete(insightId);
  return {
    ...web,
    dismissed_insights: Array.from(current),
  };
}

// ==========================================
// DETERMINISTIC GRAPH LAYOUT (NO NODE CAP)
// ==========================================

export interface LayoutNode {
  id: string;
  isThesis: boolean;
  title: string;
  snapshot?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  relation_type: ArgumentRelationType;
  path: string;
  labelX: number;
  labelY: number;
  directed: boolean;
}

export interface ArgumentWebLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}

/**
 * Computes a deterministic layout for any number of argument nodes.
 * Features:
 * - Main Thesis positioned prominently at top-center.
 * - Connected nodes placed in structured vertical tiers based on graph depth.
 * - Disconnected arguments arranged cleanly in an orderly lower grid.
 * - Quadratic curves for distinct multi-edge routing.
 */
export function layoutArgumentWeb(web: ArgumentWeb): ArgumentWebLayout {
  const layoutNodes: LayoutNode[] = [];
  const nodeWidth = 220;
  const nodeHeight = 84;
  const thesisWidth = 280;
  const thesisHeight = 100;

  const nodeMap = new Map<string, LayoutNode>();

  // 1. Position Main Thesis at (0, 0) if present
  if (web.main_thesis) {
    const thesisNode: LayoutNode = {
      id: web.main_thesis.id,
      isThesis: true,
      title: web.main_thesis.title,
      snapshot: web.main_thesis.content,
      x: web.main_thesis.position?.x ?? 0,
      y: web.main_thesis.position?.y ?? 0,
      width: thesisWidth,
      height: thesisHeight,
    };
    layoutNodes.push(thesisNode);
    nodeMap.set(thesisNode.id, thesisNode);
  }

  // 2. Identify tiers from Thesis downwards using BFS
  const thesisId = web.main_thesis?.id;
  const connectedIds = new Set<string>();
  for (const r of web.relationships) {
    connectedIds.add(r.source_id);
    connectedIds.add(r.target_id);
  }

  const levels = new Map<string, number>();
  if (thesisId) {
    levels.set(thesisId, 0);
    const queue = [thesisId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLvl = levels.get(curr)!;
      for (const r of web.relationships) {
        if (r.target_id === curr && !levels.has(r.source_id)) {
          levels.set(r.source_id, currLvl + 1);
          queue.push(r.source_id);
        } else if (r.source_id === curr && !levels.has(r.target_id)) {
          levels.set(r.target_id, currLvl + 1);
          queue.push(r.target_id);
        }
      }
    }
  }

  // Group nodes by level
  const levelGroups = new Map<number, ArgumentNode[]>();
  const disconnectedNodes: ArgumentNode[] = [];

  for (const n of web.nodes) {
    if (levels.has(n.id)) {
      const lvl = levels.get(n.id)!;
      if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
      levelGroups.get(lvl)!.push(n);
    } else if (connectedIds.has(n.id)) {
      // In an isolated cluster, put at level 1 below
      const lvl = 1;
      if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
      levelGroups.get(lvl)!.push(n);
    } else {
      disconnectedNodes.push(n);
    }
  }

  // Assign coordinates for connected levels
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
  const tierYSpacing = 160;
  const nodeXSpacing = 260;

  for (const lvl of sortedLevels) {
    if (lvl === 0) continue; // Thesis is at 0
    const group = levelGroups.get(lvl)!;
    const totalWidth = (group.length - 1) * nodeXSpacing;
    const startX = -totalWidth / 2;

    group.forEach((node, idx) => {
      const x = node.position?.x ?? startX + idx * nodeXSpacing;
      const y = node.position?.y ?? lvl * tierYSpacing;

      const ln: LayoutNode = {
        id: node.id,
        isThesis: false,
        title: node.title,
        snapshot: node.snapshot,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      };
      layoutNodes.push(ln);
      nodeMap.set(node.id, ln);
    });
  }

  // Position disconnected nodes in an orderly grid
  if (disconnectedNodes.length > 0) {
    const maxLvl = sortedLevels.length > 0 ? Math.max(...sortedLevels) : 0;
    const startY = (maxLvl + 1) * tierYSpacing + 60;
    const cols = Math.max(1, Math.min(4, disconnectedNodes.length));
    const gridXSpacing = 250;
    const gridYSpacing = 120;

    disconnectedNodes.forEach((node, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const totalColWidth = (cols - 1) * gridXSpacing;
      const startX = -totalColWidth / 2;

      const x = node.position?.x ?? startX + col * gridXSpacing;
      const y = node.position?.y ?? startY + row * gridYSpacing;

      const ln: LayoutNode = {
        id: node.id,
        isThesis: false,
        title: node.title,
        snapshot: node.snapshot,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      };
      layoutNodes.push(ln);
      nodeMap.set(node.id, ln);
    });
  }

  // 3. Generate edges
  const layoutEdges: LayoutEdge[] = [];
  const edgeGroups = new Map<string, ArgumentRelationship[]>();

  for (const r of web.relationships) {
    const key = [r.source_id, r.target_id].sort().join('::');
    if (!edgeGroups.has(key)) edgeGroups.set(key, []);
    edgeGroups.get(key)!.push(r);
  }

  for (const group of edgeGroups.values()) {
    group.forEach((r, idx) => {
      const srcNode = nodeMap.get(r.source_id);
      const tgtNode = nodeMap.get(r.target_id);
      if (!srcNode || !tgtNode) return;

      const sx = srcNode.x;
      const sy = srcNode.y;
      const tx = tgtNode.x;
      const ty = tgtNode.y;

      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / dist;
      const ny = dx / dist;

      // Arc curvature for multiple edges between same nodes
      const curveOffset = (idx - (group.length - 1) / 2) * 50;
      const cx = (sx + tx) / 2 + nx * curveOffset;
      const cy = (sy + ty) / 2 + ny * curveOffset;

      const path =
        curveOffset === 0
          ? `M ${sx} ${sy} L ${tx} ${ty}`
          : `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;

      const labelX = (sx + 2 * cx + tx) / 4;
      const labelY = (sy + 2 * cy + ty) / 4;

      layoutEdges.push({
        id: r.id,
        source: r.source_id,
        target: r.target_id,
        relation_type: r.relation_type,
        path,
        labelX,
        labelY,
        directed: r.relation_type !== 'related',
      });
    });
  }

  // Calculate viewport bounds with padding
  const padding = 100;
  let minX = -400;
  let maxX = 400;
  let minY = -150;
  let maxY = 400;

  if (layoutNodes.length > 0) {
    minX = Math.min(...layoutNodes.map((n) => n.x - n.width / 2)) - padding;
    maxX = Math.max(...layoutNodes.map((n) => n.x + n.width / 2)) + padding;
    minY = Math.min(...layoutNodes.map((n) => n.y - n.height / 2)) - padding;
    maxY = Math.max(...layoutNodes.map((n) => n.y + n.height / 2)) + padding;
  }

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(800, maxX - minX),
      height: Math.max(600, maxY - minY),
    },
  };
}
