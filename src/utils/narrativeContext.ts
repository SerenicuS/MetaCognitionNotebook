import type { DocumentMetadata, HouseRecord } from '../types';
import { resolveUniverseHouseId } from './house';
import type { Book, Plan, StoryNode } from './thought';
import { parseLoreMetadata, resolveEntityUniverse, renameUniverseInPlan } from './universe';
import { getCompatibleMilestonesForBook, validateMilestoneAncestry } from './stateEngine';

/** Presentation of the existing description, not additional canonical fields. */
export function splitNarrative(description = '') {
  const text = description.trim();
  const separator = /\r?\n[ \t]*\r?\n/.exec(text);
  return separator ? { summary: text.slice(0, separator.index), account: text.slice(separator.index + separator[0].length) } : { summary: text, account: '' };
}
export function joinNarrative(summary: string, account: string) {
  return [summary.trim(), account.trim()].filter(Boolean).join('\n\n');
}
export function updateUniverseOverview(plan: Plan, universeId: string, name: string, description: string): Plan {
  if (!plan.universes.some(u => u.id === universeId)) throw new Error('Universe no longer exists.');
  return renameUniverseInPlan(plan, universeId, name, description);
}
export function updateMilestoneNarrative(plan: Plan, universeId: string, milestoneId: string, title: string, description: string): Plan {
  if (!title.trim()) throw new Error('Milestone title is required.');
  const node = plan.nodes.find(n => n.id === milestoneId && !n.archived && n.universe_id === universeId);
  if (!node) throw new Error('Milestone is missing, archived, or outside this Universe.');
  return { ...plan, nodes: plan.nodes.map(n => n.id === milestoneId ? { ...n, title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() } : n) };
}
export function compatibleChapter(plan: Plan, chapter: DocumentMetadata, milestone: StoryNode, houseId = 'house-default'): Book | null {
  const meta = parseLoreMetadata(chapter);
  if (chapter.doc_type !== 'lorebook' || meta.entry_type !== 'chapter' ||
      (chapter.house_id || 'house-default') !== houseId ||
      resolveEntityUniverse(chapter, plan.universes).universeId !== milestone.universe_id || milestone.archived || milestone.book_id !== null) return null;
  const raw = meta as Record<string, unknown>;
  if (raw.archived || raw.status === 'archived') return null;
  const book = plan.books.find(b => b.id === meta.book_id && compatibleBook(plan, b, milestone));
  return book || null;
}

/** Book identity and continuity are canonical; chapter count is not eligibility. */
export function compatibleBook(plan: Plan, book: Book, milestone: StoryNode): boolean {
  if (book.archived || book.universe_id !== milestone.universe_id || milestone.archived || milestone.book_id !== null ||
      !plan.universes.some(u => u.id === milestone.universe_id && !u.archived)) return false;
  if (book.branch_id && !plan.branches?.some(b => b.id === book.branch_id && b.universe_id === milestone.universe_id && !b.archived)) return false;
  if (!validateMilestoneAncestry(plan, milestone.id).valid) return false;
  const compatible = getCompatibleMilestonesForBook(plan, milestone.universe_id, book);
  return compatible.milestones.some(n => n.id === milestone.id) || compatible.divergenceMilestone?.id === milestone.id;
}

export function milestoneBookOptions(plan: Plan, milestone: StoryNode, houseId = 'house-default', houses: HouseRecord[] = []) {
  if (resolveUniverseHouseId(milestone.universe_id, houses) !== houseId) return [];
  return plan.books.filter(book => compatibleBook(plan, book, milestone));
}
export function milestoneChapterReferences(plan: Plan, documents: DocumentMetadata[], milestone: StoryNode, houseId = 'house-default') {
  return documents.flatMap(chapter => {
    const book = compatibleChapter(plan, chapter, milestone, houseId);
    return book && parseLoreMetadata(chapter).milestone_id === milestone.id ? [{ chapter, book }] : [];
  }).sort((a,b) => a.book.name.localeCompare(b.book.name) || a.chapter.title.localeCompare(b.chapter.title) || a.chapter.id.localeCompare(b.chapter.id));
}
export function chapterMilestoneMetadata(plan: Plan, chapter: DocumentMetadata, milestone: StoryNode, bind: boolean, houseId = 'house-default') {
  if (!compatibleChapter(plan, chapter, milestone, houseId)) throw new Error('Chapter, Book, House, Universe or continuity is incompatible with this milestone.');
  const meta = { ...parseLoreMetadata(chapter) };
  if (bind) meta.milestone_id = milestone.id;
  else {
    if (meta.milestone_id !== milestone.id) throw new Error('Chapter binding changed. Refresh before unlinking.');
    delete meta.milestone_id;
  }
  return JSON.stringify(meta);
}
