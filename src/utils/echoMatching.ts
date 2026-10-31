import type { EchoCandidateMatch, EchoConfirmedReference, EchoEntity } from '../components/echo/types';

export interface EchoSearchIndex {
  termMap: Map<string, { entity: EchoEntity; isAlias: boolean }[]>;
  sortedTerms: string[];
  lengths: number[];
}

/** Shared lexical discovery only: no document, editor, navigation or storage operations. */
export function buildEchoSearchIndex(entities: EchoEntity[]): EchoSearchIndex {
  const termMap: EchoSearchIndex['termMap'] = new Map();
  const ordered = [...entities].sort((a, b) => compare(a.category, b.category) || compare(a.name, b.name) || compare(a.id, b.id));
  for (const entity of ordered) {
    if (entity.status === 'archived') continue;
    const name = entity.name.toLowerCase().trim();
    for (const [term, isAlias] of [[name, false], ...(entity.aliases || []).map(a => [a.toLowerCase().trim(), true])] as [string, boolean][]) {
      if (term.length < 2 || (isAlias && term === name)) continue;
      const entries = termMap.get(term) || [];
      if (!entries.some(e => e.entity.id === entity.id)) entries.push({ entity, isAlias });
      termMap.set(term, entries);
    }
  }
  const sortedTerms = [...termMap.keys()].sort((a, b) => b.length - a.length || compare(a, b));
  return { termMap, sortedTerms, lengths: [...new Set(sortedTerms.map(term => term.length))].sort((a, b) => b - a) };
}

function compare(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }

export function matchEchoText(text: string, index: EchoSearchIndex, confirmed: EchoConfirmedReference[] = []): EchoCandidateMatch[] {
  if (!text || !index.lengths.length) return [];
  const matches: EchoCandidateMatch[] = [];
  let consumedUntil = 0;
  // A large /giu alternation becomes very expensive for thousands of shared-prefix aliases.
  // Check distinct term lengths at the same Unicode boundaries instead. Longest wins, and
  // consuming an overlapping confirmed match retains the CodeMirror scanner's semantics.
  for (const boundary of text.matchAll(/(?<![\p{L}\p{N}])(?=[\s\S])/gu)) {
    const from = boundary.index!;
    if (from < consumedUntil) continue;
    for (const length of index.lengths) {
      const to = from + length;
      if (to > text.length || /^[\p{L}\p{N}]/u.test(text.slice(to, to + 2))) continue;
      const word = text.slice(from, to);
      const entries = index.termMap.get(word.toLowerCase());
      if (!entries?.length) continue;
      consumedUntil = to;
      if (!confirmed.some(r => from < r.to && to > r.from)) {
        matches.push({ from, to, matchedText: word, matchingEntities: entries.map(e => e.entity), isAmbiguous: entries.length > 1, isAliasMatch: entries.some(e => e.isAlias) });
      }
      break;
    }
  }
  return matches;
}
