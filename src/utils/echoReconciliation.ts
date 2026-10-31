import type { EchoPersistentReference, EchoContextAnchor, EchoReferenceStatus } from '../components/echo/types';

export const DEFAULT_ANCHOR_LENGTH = 32;
export const BOUNDED_SEARCH_WINDOW = 250;

/**
 * Normalizes document body text to LF line endings (\n).
 * Required for Windows CRLF compatibility and UTF-16 coordinate stability.
 */
export function normalizeDocumentText(text: string): string {
  return (text ?? '').replace(/\r\n/g, '\n');
}

/**
 * Extracts context anchors (up to `length` UTF-16 code units before and after).
 */
export function createContextAnchor(
  docText: string,
  from: number,
  to: number,
  length = DEFAULT_ANCHOR_LENGTH
): EchoContextAnchor {
  const norm = normalizeDocumentText(docText);
  const safeFrom = Math.max(0, Math.min(from, norm.length));
  const safeTo = Math.max(safeFrom, Math.min(to, norm.length));
  return {
    before: norm.slice(Math.max(0, safeFrom - length), safeFrom),
    after: norm.slice(safeTo, Math.min(norm.length, safeTo + length)),
  };
}

/**
 * Checks if a character at an index is a Unicode letter or number.
 */
export function isWordChar(char: string | undefined): boolean {
  if (!char) return false;
  return /[\p{L}\p{N}]/u.test(char);
}

/**
 * Validates whether candidate boundaries within text represent complete tokens
 * (not slicing into the middle of a Unicode word).
 */
export function isValidTokenBoundary(text: string, from: number, to: number): boolean {
  if (from > 0 && isWordChar(text[from - 1]) && isWordChar(text[from])) {
    return false;
  }
  if (to < text.length && isWordChar(text[to - 1]) && isWordChar(text[to])) {
    return false;
  }
  return true;
}

/**
 * Calculates similarity score (0.0 to 1.0) between expected anchor and actual context.
 */
export function calculateAnchorScore(expected: string, actual: string): number {
  if (!expected && !actual) return 1.0;
  if (!expected || !actual) return 0.0;
  if (expected === actual) return 1.0;

  // Suffix matching for 'before' or prefix matching for 'after'
  let matches = 0;
  const len = Math.min(expected.length, actual.length);
  for (let i = 0; i < len; i++) {
    if (expected[expected.length - 1 - i] === actual[actual.length - 1 - i]) {
      matches++;
    } else {
      break;
    }
  }
  return matches / Math.max(expected.length, 1);
}

export interface ReconcileResult {
  references: EchoPersistentReference[];
  active: EchoPersistentReference[];
  detached: EchoPersistentReference[];
  hasRepairedOffsets: boolean;
  unresolvedCount: number;
  detachedCount: number;
}

/**
 * Reconciles and validates persistent references against normalized document text.
 * Strictly non-heuristic: only re-anchors if exactly one unambiguous candidate match exists.
 */
export function reconcileReferences(
  rawDocText: string,
  persisted: unknown[],
  eligibleEntityIds?: Set<string>
): ReconcileResult {
  const normText = normalizeDocumentText(rawDocText);
  let hasRepairedOffsets = false;
  let unresolvedCount = 0;
  let detachedCount = 0;

  if (!Array.isArray(persisted) || !persisted.length) {
    return {
      references: [],
      active: [],
      detached: [],
      hasRepairedOffsets: false,
      unresolvedCount: 0,
      detachedCount: 0,
    };
  }

  const validRefs: EchoPersistentReference[] = [];

  for (const item of persisted) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;

    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
    const targetId = (typeof raw.targetId === 'string' && raw.targetId.trim())
      ? raw.targetId.trim()
      : (typeof raw.entityId === 'string' && raw.entityId.trim() ? raw.entityId.trim() : null);
    const matchedText = typeof raw.matchedText === 'string' ? raw.matchedText : '';

    if (!id || !targetId || !matchedText) {
      continue;
    }

    const from = typeof raw.from === 'number' && Number.isFinite(raw.from) ? Math.floor(raw.from) : 0;
    const to = typeof raw.to === 'number' && Number.isFinite(raw.to) ? Math.floor(raw.to) : from + matchedText.length;

    const rawAnchor = raw.anchor && typeof raw.anchor === 'object' ? (raw.anchor as Record<string, unknown>) : null;
    const anchor: EchoContextAnchor = {
      before: typeof rawAnchor?.before === 'string' ? rawAnchor.before : '',
      after: typeof rawAnchor?.after === 'string' ? rawAnchor.after : '',
    };

    let status: EchoReferenceStatus = (raw.status === 'unresolved' || raw.status === 'detached') ? raw.status : 'active';
    const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
    const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt;
    const version = typeof raw.version === 'number' ? raw.version : 1;

    // Check entity eligibility in active House/Universe catalog
    const isTargetEligible = !eligibleEntityIds || eligibleEntityIds.has(targetId);
    if (!isTargetEligible && status !== 'detached') {
      status = 'unresolved';
    }

    // If status is already detached, we preserve coordinates and anchor as-is for manual repair
    if (status === 'detached') {
      detachedCount++;
      validRefs.push({
        id,
        targetId,
        entityId: targetId,
        from,
        to,
        matchedText,
        anchor: anchor.before || anchor.after ? anchor : createContextAnchor(normText, from, to),
        status: 'detached',
        createdAt,
        updatedAt,
        version,
      });
      continue;
    }

    // Step 1: Exact offset verification
    let verified = false;
    if (from >= 0 && to <= normText.length && from < to) {
      const slice = normText.slice(from, to);
      if (slice.toLowerCase() === matchedText.toLowerCase()) {
        const curBefore = normText.slice(Math.max(0, from - anchor.before.length), from);
        const curAfter = normText.slice(to, Math.min(normText.length, to + anchor.after.length));

        // If context anchor is empty or matches closely:
        if (!anchor.before || !anchor.after || (curBefore === anchor.before && curAfter === anchor.after)) {
          verified = true;
          const currentRef: EchoPersistentReference = {
            id,
            targetId,
            entityId: targetId,
            from,
            to,
            matchedText: slice,
            anchor: createContextAnchor(normText, from, to),
            status: isTargetEligible ? 'active' : 'unresolved',
            createdAt,
            updatedAt,
            version,
          };
          if (!isTargetEligible) unresolvedCount++;
          validRefs.push(currentRef);
        }
      }
    }

    if (verified) continue;

    // Step 2: Bounded Local Window Search
    const windowStart = Math.max(0, from - BOUNDED_SEARCH_WINDOW);
    const windowEnd = Math.min(normText.length, to + BOUNDED_SEARCH_WINDOW);
    const windowText = normText.slice(windowStart, windowEnd);

    const candidates: { cFrom: number; cTo: number; score: number }[] = [];
    const searchTarget = matchedText.toLowerCase();

    let idx = windowText.toLowerCase().indexOf(searchTarget);
    while (idx !== -1) {
      const absFrom = windowStart + idx;
      const absTo = absFrom + matchedText.length;

      if (isValidTokenBoundary(normText, absFrom, absTo)) {
        const cBefore = normText.slice(Math.max(0, absFrom - anchor.before.length), absFrom);
        const cAfter = normText.slice(absTo, Math.min(normText.length, absTo + anchor.after.length));

        const scoreBefore = anchor.before ? calculateAnchorScore(anchor.before, cBefore) : 1.0;
        const scoreAfter = anchor.after ? (anchor.after === cAfter ? 1.0 : (cAfter.startsWith(anchor.after.slice(0, 8)) ? 0.8 : 0.0)) : 1.0;
        const totalScore = (scoreBefore + scoreAfter) / 2;

        if (totalScore >= 0.75) {
          candidates.push({ cFrom: absFrom, cTo: absTo, score: totalScore });
        }
      }

      idx = windowText.toLowerCase().indexOf(searchTarget, idx + 1);
    }

    // Re-anchor ONLY if exactly one unambiguous candidate match exists
    if (candidates.length === 1 && candidates[0].score >= 0.75) {
      const match = candidates[0];
      hasRepairedOffsets = true;
      const repairedRef: EchoPersistentReference = {
        id,
        targetId,
        entityId: targetId,
        from: match.cFrom,
        to: match.cTo,
        matchedText: normText.slice(match.cFrom, match.cTo),
        anchor: createContextAnchor(normText, match.cFrom, match.cTo),
        status: isTargetEligible ? 'active' : 'unresolved',
        createdAt,
        updatedAt: new Date().toISOString(),
        version,
      };
      if (!isTargetEligible) unresolvedCount++;
      validRefs.push(repairedRef);
    } else {
      // 0 matches OR >1 ambiguous matches:
      // STRICT NON-INFERENCE INVARIANT: DO NOT GUESS!
      detachedCount++;
      validRefs.push({
        id,
        targetId,
        entityId: targetId,
        from,
        to,
        matchedText,
        anchor: anchor.before || anchor.after ? anchor : createContextAnchor(normText, from, to),
        status: 'detached',
        createdAt,
        updatedAt,
        version,
      });
    }
  }

  // Sort references ascending by `from`, then `to` for CodeMirror RangeSetBuilder
  validRefs.sort((a, b) => a.from - b.from || a.to - b.to);

  const active = validRefs.filter((r) => r.status !== 'detached');
  const detached = validRefs.filter((r) => r.status === 'detached');

  return {
    references: validRefs,
    active,
    detached,
    hasRepairedOffsets,
    unresolvedCount,
    detachedCount,
  };
}
