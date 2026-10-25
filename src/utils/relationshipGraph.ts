import { relationshipMeaning } from './relationships';
import { isGuidedRelationship, parseLoreMetadata } from './universe';
import type { Relationship } from './thought';
import type { DocumentMetadata, FactionPosition, FactionBranch } from '../types';

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  isFocus?: boolean;
}

export interface GraphEdge {
  id: string;
  path: string;
  labelX: number;
  labelY: number;
  source: string;
  target: string;
  groupCount?: number;
  groupIndex?: number;
}

export interface GroupedGraphEdge {
  id: string;
  source: string;
  target: string;
  path: string;
  labelX: number;
  labelY: number;
  relationships: Relationship[];
  count: number;
  labels: string[];
  isSymmetric: boolean;
  directed: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groupedEdges: GroupedGraphEdge[];
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface LayoutOptions {
  focusId?: string;
  groupEdges?: boolean;
}

/**
 * Filters relationships by semantic relationship kind, endpoint entity type, and Phase C3 category.
 * Backward compatible with existing 4-argument calls.
 */
export function filterGraph(
  rows: Relationship[],
  typeOf: (id: string) => string,
  relationshipType: string,
  entityType: string,
  category?: 'all' | 'guided' | 'custom'
): Relationship[] {
  return rows.filter((r) => {
    if (r.archived) return false;
    if (
      relationshipType &&
      (relationshipMeaning(r.label)?.kind || r.label) !==
        (relationshipMeaning(relationshipType)?.kind || relationshipType)
    ) {
      return false;
    }
    if (entityType && typeOf(r.source_id) !== entityType && typeOf(r.target_id) !== entityType) {
      return false;
    }
    if (category === 'guided' && !isGuidedRelationship(r)) {
      return false;
    }
    if (category === 'custom' && isGuidedRelationship(r)) {
      return false;
    }
    return true;
  });
}

/**
 * Returns the set of node IDs connected directly to the focus entity (including the focus entity itself).
 */
export function graphNeighbors(rows: Relationship[], focus: string): Set<string> {
  return new Set(
    rows
      .filter((r) => !r.archived && (r.source_id === focus || r.target_id === focus))
      .flatMap((r) => [r.source_id, r.target_id])
  );
}

/**
 * Extracts the 1-hop focused neighborhood:
 * - The focus entity
 * - All directly connected neighbor entities
 * - All active relationships where both endpoints belong to this visible set
 */
export function getFocusedNeighborhood(
  rows: Relationship[],
  focusId: string
): { neighborIds: Set<string>; relationships: Relationship[] } {
  if (!focusId) {
    return {
      neighborIds: new Set(),
      relationships: rows.filter((r) => !r.archived),
    };
  }
  const directRelationships = rows.filter(
    (r) => !r.archived && (r.source_id === focusId || r.target_id === focusId)
  );
  const neighborIds = new Set<string>([focusId]);
  for (const r of directRelationships) {
    neighborIds.add(r.source_id);
    neighborIds.add(r.target_id);
  }
  // Include relationships among visible neighborhood entities
  const relationships = rows.filter(
    (r) => !r.archived && neighborIds.has(r.source_id) && neighborIds.has(r.target_id)
  );

  return { neighborIds, relationships };
}

/**
 * Deterministic force placement followed by rectangle collision resolution.
 * Groups multiple parallel/reversed edges between same endpoints into groupedEdges.
 */
export function layoutRelationships(
  rows: Relationship[],
  options?: LayoutOptions
): GraphLayout {
  const ids = [...new Set(rows.flatMap((r) => [r.source_id, r.target_id]))].sort();
  if (ids.length === 0) {
    return { nodes: [], edges: [], groupedEdges: [], width: 300, height: 240, x: -70, y: -70 };
  }

  const focusId = options?.focusId && ids.includes(options.focusId) ? options.focusId : null;

  // Initial circular/focused placement
  const nodes: GraphNode[] = ids.map((id, i) => {
    if (focusId && id === focusId) {
      return { id, x: 0, y: 0, isFocus: true };
    }
    const angleIndex = focusId ? (id < focusId ? i : i - 1) : i;
    const totalOuter = focusId ? Math.max(1, ids.length - 1) : ids.length;
    const angle = (angleIndex * 2 * Math.PI) / totalOuter;
    const radiusX = Math.max(220, ids.length * 36);
    const radiusY = Math.max(190, ids.length * 32);
    return {
      id,
      x: Math.cos(angle) * radiusX,
      y: Math.sin(angle) * radiusY,
      isFocus: id === focusId,
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Force simulation passes
  for (let pass = 0; pass < 120; pass++) {
    const force = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x || 0.1;
        const dy = b.y - a.y || 0.1;
        const d = Math.max(1, Math.hypot(dx, dy));
        const push = 45000 / (d * d);
        force.get(a.id)!.x -= (dx / d) * push;
        force.get(a.id)!.y -= (dy / d) * push;
        force.get(b.id)!.x += (dx / d) * push;
        force.get(b.id)!.y += (dy / d) * push;
      }
    }

    // Attraction along active relationships
    for (const r of rows) {
      const a = byId.get(r.source_id);
      const b = byId.get(r.target_id);
      if (!a || !b || a.id === b.id) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const pull = (d - 300) * 0.008;
      force.get(a.id)!.x += (dx / d) * pull;
      force.get(a.id)!.y += (dy / d) * pull;
      force.get(b.id)!.x -= (dx / d) * pull;
      force.get(b.id)!.y -= (dy / d) * pull;
    }

    // Apply forces
    for (const n of nodes) {
      if (focusId && n.id === focusId) {
        // Keep focus node anchored near origin
        n.x = 0;
        n.y = 0;
        continue;
      }
      const f = force.get(n.id)!;
      n.x += Math.max(-20, Math.min(20, f.x));
      n.y += Math.max(-20, Math.min(20, f.y));
    }
  }

  // Rectangular collision resolution passes
  for (let pass = 0; pass < 80; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) < 238 && Math.abs(dy) < 126) {
          const move = (238 - Math.abs(dx)) / 2 + 1;
          if (!a.isFocus) a.x -= Math.sign(dx || 1) * move;
          if (!b.isFocus) b.x += Math.sign(dx || 1) * move;
        }
      }
    }
  }

  // Group edges between pairs
  const groups = new Map<string, Relationship[]>();
  for (const r of rows) {
    const key = JSON.stringify([r.source_id, r.target_id].sort());
    groups.set(key, [...(groups.get(key)) || [], r]);
  }

  const edges: GraphEdge[] = [];
  const groupedEdges: GroupedGraphEdge[] = [];
  const labels: { x: number; y: number }[] = [];

  for (const group of groups.values()) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    const firstRel = group[0];
    const a = byId.get(firstRel.source_id)!;
    const b = byId.get(firstRel.target_id)!;

    // 1. Compute Individual Edges
    group.forEach((r, index) => {
      const srcNode = byId.get(r.source_id)!;
      const tgtNode = byId.get(r.target_id)!;

      if (srcNode.id === tgtNode.id) {
        const lift = 105 + index * 60;
        const y = srcNode.y - lift;
        const edgePath = `M ${srcNode.x - 45} ${srcNode.y - 32} C ${srcNode.x - 170} ${y - 70}, ${srcNode.x + 170} ${y - 70}, ${srcNode.x + 45} ${srcNode.y - 32}`;
        const lx = srcNode.x;
        const ly = srcNode.y * 0.25 + y * 0.75 - 60.5;
        edges.push({
          id: r.id,
          path: edgePath,
          labelX: lx,
          labelY: ly,
          source: srcNode.id,
          target: tgtNode.id,
          groupCount: group.length,
          groupIndex: index,
        });
        labels.push({ x: lx, y: ly });
        return;
      }

      const left = srcNode.id < tgtNode.id ? srcNode : tgtNode;
      const right = srcNode.id < tgtNode.id ? tgtNode : srcNode;
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / d;
      const ny = dx / d;

      let lane = (index - (group.length - 1) / 2) * 100;
      let cx = 0, cy = 0, lx = 0, ly = 0;
      for (let attempt = 0; attempt < 45; attempt++) {
        cx = (srcNode.x + tgtNode.x) / 2 + nx * lane;
        cy = (srcNode.y + tgtNode.y) / 2 + ny * lane;
        lx = (srcNode.x + 2 * cx + tgtNode.x) / 4;
        ly = (srcNode.y + 2 * cy + tgtNode.y) / 4;
        const collision =
          nodes.some((n) => Math.abs(n.x - lx) < 195 && Math.abs(n.y - ly) < 59) ||
          labels.some((p) => Math.abs(p.x - lx) < 225 && Math.abs(p.y - ly) < 30);
        if (!collision) break;
        lane += (index % 2 ? -1 : 1) * 70;
      }

      const boundary = (n: GraphNode, cxVal: number, cyVal: number) => {
        const deltaX = cxVal - n.x;
        const deltaY = cyVal - n.y;
        const scale = Math.min(106 / Math.max(0.1, Math.abs(deltaX)), 34 / Math.max(0.1, Math.abs(deltaY)));
        return { x: n.x + deltaX * scale, y: n.y + deltaY * scale };
      };

      const start = boundary(srcNode, cx, cy);
      const end = boundary(tgtNode, cx, cy);
      lx = (start.x + 2 * cx + end.x) / 4;
      ly = (start.y + 2 * cy + end.y) / 4;

      edges.push({
        id: r.id,
        path: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,
        labelX: lx,
        labelY: ly,
        source: srcNode.id,
        target: tgtNode.id,
        groupCount: group.length,
        groupIndex: index,
      });
      labels.push({ x: lx, y: ly });
    });

    // 2. Compute Representative Grouped Edge (for grouped parallel edge view)
    if (a && b) {
      const midEdge = edges.find((e) => e.id === group[Math.floor(group.length / 2)].id) || edges[edges.length - 1];
      const allSymmetric = group.every((r) => relationshipMeaning(r.label)?.symmetric || !r.directed);
      groupedEdges.push({
        id: `grp:${[a.id, b.id].sort().join(':')}`,
        source: a.id,
        target: b.id,
        path: midEdge.path,
        labelX: midEdge.labelX,
        labelY: midEdge.labelY,
        relationships: group,
        count: group.length,
        labels: group.map((r) => r.label),
        isSymmetric: allSymmetric,
        directed: !allSymmetric,
      });
    }
  }

  // Calculate layout bounds with generous padding for curves and labels
  const xs = nodes.flatMap((n) => [n.x - 130, n.x + 130]);
  const ys = nodes.flatMap((n) => [n.y - 60, n.y + 60]);
  for (const label of labels) {
    xs.push(label.x - 140, label.x + 140);
    ys.push(label.y - 50, label.y + 50);
  }
  for (const e of edges) {
    const a = byId.get(e.source)!;
    const b = byId.get(e.target)!;
    xs.push(2 * e.labelX - (a.x + b.x) / 2);
    ys.push(2 * e.labelY - (a.y + b.y) / 2 - 80);
  }

  const minX = Math.min(0, ...xs) - 70;
  const minY = Math.min(0, ...ys) - 70;
  const width = Math.max(300, Math.max(0, ...xs) - minX + 70);
  const height = Math.max(240, Math.max(0, ...ys) - minY + 70);

  return { nodes, edges, groupedEdges, x: minX, y: minY, width, height };
}

export interface GraphCamera {
  x: number;
  y: number;
  scale: number;
}

export function zoomCamera(camera: GraphCamera, factor: number): GraphCamera {
  return { ...camera, scale: Math.max(0.15, Math.min(4, camera.scale * factor)) };
}

/**
 * Calculates a camera transform that fits the entire layout into the viewport cleanly.
 */
export function fitCameraToView(
  layout: GraphLayout,
  viewportWidth = 800,
  viewportHeight = 500
): GraphCamera {
  if (layout.width <= 0 || layout.height <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }
  const padding = 40;
  const availW = Math.max(100, viewportWidth - padding * 2);
  const availH = Math.max(100, viewportHeight - padding * 2);
  const scale = Math.max(0.15, Math.min(1.5, Math.min(availW / layout.width, availH / layout.height)));
  return { x: 0, y: 0, scale };
}

// ============================================================================
// Phase C4: Faction Organization Hierarchy Visualization (Read-Only)
// ============================================================================

export interface FactionHierarchyPositionNode {
  id: string;
  title: string;
  description?: string;
  branchId: string | null;
  branchName?: string;
  parentPositionId: string | null;
  holderIds: string[];
  holders: { id: string; title: string }[];
  isVacant: boolean;
  isMultiHolder: boolean;
  children: FactionHierarchyPositionNode[];
}

export interface FactionHierarchyBranchNode {
  id: string;
  name: string;
  description?: string;
  parentBranchId: string | null;
  subBranches: FactionHierarchyBranchNode[];
  positions: FactionHierarchyPositionNode[];
}

export interface FactionHierarchyData {
  factionId: string;
  factionTitle: string;
  branches: FactionHierarchyBranchNode[];
  rootPositions: FactionHierarchyPositionNode[];
  allPositions: FactionHierarchyPositionNode[];
  totalPositions: number;
  totalHolders: number;
  vacantCount: number;
}

/**
 * Parses canonical faction metadata and constructs a read-only hierarchy tree.
 * Enforces strictly: reads from metadata only; NEVER creates synthetic graph edges in Plan.relationships.
 */
export function buildFactionHierarchyData(
  factionDoc: DocumentMetadata,
  allDocuments: DocumentMetadata[]
): FactionHierarchyData {
  const meta = parseLoreMetadata(factionDoc);
  const rawPositions: FactionPosition[] = meta.faction_fields?.positions || [];
  const rawBranches: FactionBranch[] = meta.faction_fields?.branches || [];

  const branchMap = new Map<string, FactionBranch>(rawBranches.map((b) => [b.id, b]));

  // Build position nodes
  const positionNodes: FactionHierarchyPositionNode[] = rawPositions.map((p) => {
    const branch = p.branch_id ? branchMap.get(p.branch_id) : undefined;
    const holderIds = Array.isArray(p.holder_ids) ? p.holder_ids : [];
    const holders = holderIds.map((hId) => {
      const doc = allDocuments.find((d) => d.id === hId);
      return { id: hId, title: doc?.title || `Character #${hId.slice(0, 6)}` };
    });

    return {
      id: p.id,
      title: p.title,
      description: p.description,
      branchId: p.branch_id || null,
      branchName: branch ? branch.name : undefined,
      parentPositionId: p.parent_position_id || null,
      holderIds,
      holders,
      isVacant: holderIds.length === 0,
      isMultiHolder: holderIds.length > 1,
      children: [],
    };
  });

  const posMap = new Map<string, FactionHierarchyPositionNode>(positionNodes.map((p) => [p.id, p]));

  // Connect child positions to parent positions (reporting lines)
  const rootPositions: FactionHierarchyPositionNode[] = [];

  for (const pos of positionNodes) {
    if (pos.parentPositionId && posMap.has(pos.parentPositionId)) {
      const parent = posMap.get(pos.parentPositionId)!;
      // Prevent trivial cycle
      if (parent.id !== pos.id) {
        parent.children.push(pos);
      } else {
        rootPositions.push(pos);
      }
    } else {
      rootPositions.push(pos);
    }
  }

  // Build branch tree
  const branchNodesMap = new Map<string, FactionHierarchyBranchNode>();
  for (const b of rawBranches) {
    branchNodesMap.set(b.id, {
      id: b.id,
      name: b.name,
      description: b.description,
      parentBranchId: b.parent_branch_id || null,
      subBranches: [],
      positions: positionNodes.filter((p) => p.branchId === b.id),
    });
  }

  const rootBranches: FactionHierarchyBranchNode[] = [];
  for (const bNode of branchNodesMap.values()) {
    if (bNode.parentBranchId && branchNodesMap.has(bNode.parentBranchId)) {
      const parentB = branchNodesMap.get(bNode.parentBranchId)!;
      if (parentB.id !== bNode.id) {
        parentB.subBranches.push(bNode);
      } else {
        rootBranches.push(bNode);
      }
    } else {
      rootBranches.push(bNode);
    }
  }

  const vacantCount = positionNodes.filter((p) => p.isVacant).length;
  const uniqueHolders = new Set(positionNodes.flatMap((p) => p.holderIds));

  return {
    factionId: factionDoc.id,
    factionTitle: factionDoc.title,
    branches: rootBranches,
    rootPositions,
    allPositions: positionNodes,
    totalPositions: positionNodes.length,
    totalHolders: uniqueHolders.size,
    vacantCount,
  };
}
