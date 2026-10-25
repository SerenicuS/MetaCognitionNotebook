import type { Plan, Universe } from '@/utils/thought';
import { isCatalogDoc } from './organization';
export { isCatalogDoc } from './organization';
import type { DocumentMetadata } from '@/types';
import React from 'react';
import {
  Castle,
  Landmark,
  Building,
  Scroll,
  Feather,
  Compass,
  BookOpen,
  Sparkles,
  Shield,
  Layers,
} from 'lucide-react';
import type { AuthoringStudio, HouseRecord } from '@/types';

export const DEFAULT_HOUSE_ID = 'house-default';

export interface HouseColorTheme {
  id: string;
  name: string;
  dot: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
  ring: string;
}

export const HOUSE_COLORS: Record<string, HouseColorTheme> = {
  amber: {
    id: 'amber',
    name: 'Warm Amber',
    dot: 'bg-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    ring: 'ring-amber-500/50',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Green',
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    ring: 'ring-emerald-500/50',
  },
  indigo: {
    id: 'indigo',
    name: 'Royal Indigo',
    dot: 'bg-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/40',
    text: 'text-indigo-400',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    ring: 'ring-indigo-500/50',
  },
  rose: {
    id: 'rose',
    name: 'Velvet Rose',
    dot: 'bg-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/40',
    text: 'text-rose-400',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    ring: 'ring-rose-500/50',
  },
  sky: {
    id: 'sky',
    name: 'Celestial Sky',
    dot: 'bg-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/40',
    text: 'text-sky-400',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    ring: 'ring-sky-500/50',
  },
  violet: {
    id: 'violet',
    name: 'Mystic Violet',
    dot: 'bg-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/40',
    text: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    ring: 'ring-violet-500/50',
  },
};

export const HOUSE_ICONS: Record<string, React.ElementType> = {
  castle: Castle,
  landmark: Landmark,
  building: Building,
  scroll: Scroll,
  feather: Feather,
  compass: Compass,
  book: BookOpen,
  sparkles: Sparkles,
  shield: Shield,
  layers: Layers,
};

export function getHouseColorTheme(color?: string): HouseColorTheme {
  const key = (color || 'amber').toLowerCase();
  return HOUSE_COLORS[key] || HOUSE_COLORS.amber;
}

export function getHouseIconComponent(icon?: string): React.ElementType {
  const key = (icon || 'castle').toLowerCase();
  return HOUSE_ICONS[key] || Castle;
}

export function isStudioEnabled(house: HouseRecord | null | undefined, studio: AuthoringStudio): boolean {
  if (!house) return true;
  return house.enabled_studios.includes(studio);
}

export function isManuscriptEnabled(house: HouseRecord | null | undefined): boolean {
  if (!house) return true;
  return house.manuscript_tools_enabled;
}

export interface StudioCounts {
  all: number;
  poetry: number;
  philosophy: number;
  lorebook: number;
  manuscript: number;
}

/**
 * Computes Studio document counts strictly scoped to the provided documents (e.g. active House documents),
 * correctly excluding internal planning documents like the Web of Thought catalog.
 */
export function computeStudioCounts(docs: DocumentMetadata[]): StudioCounts {
  let all = 0;
  let poetry = 0;
  let philosophy = 0;
  let lorebook = 0;
  let manuscript = 0;

  for (const doc of docs) {
    if (isCatalogDoc(doc)) continue;
    all++;
    if (doc.doc_type === 'poetry') poetry++;
    else if (doc.doc_type === 'philosophy') philosophy++;
    else if (doc.doc_type === 'lorebook') lorebook++;
    else if (doc.doc_type === 'manuscript') manuscript++;
  }

  return { all, poetry, philosophy, lorebook, manuscript };
}

/**
 * Resolves the owning House ID for a given Universe ID across known House records.
 * If the Universe ID is unassigned to any House, it maps to DEFAULT_HOUSE_ID ('house-default')
 * for backward compatibility with pre-House workspaces (Invariant L3).
 */
export function resolveUniverseHouseId(universeId: string, houses: HouseRecord[]): string {
  const trimmed = universeId.trim();
  for (const h of houses) {
    if (h.universe_ids && h.universe_ids.includes(trimmed)) {
      return h.id;
    }
  }
  return DEFAULT_HOUSE_ID;
}

/**
 * Returns all Universes in the plan that belong to the specified active House.
 * Universes unassigned to any House are treated as belonging to 'house-default'.
 */
export function getHouseUniverses(
  plan: Plan | null | undefined,
  activeHouse: HouseRecord | null | undefined,
  houses: HouseRecord[] = []
): Universe[] {
  if (!plan || !plan.universes) return [];
  const targetHouseId = activeHouse?.id || DEFAULT_HOUSE_ID;
  return plan.universes.filter((u) => {
    const owningHouse = resolveUniverseHouseId(u.id, houses);
    return owningHouse === targetHouseId;
  });
}
