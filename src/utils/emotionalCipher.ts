/**
 * The Emotional Cipher — Core Engine
 * 
 * A playful, reversible, dictionary-based text substitution system for Poetry Studio.
 * Designed for creative expression, surreal wordplay, and poetic friction.
 * 
 * Features:
 * - Word frequency analysis (occurrence counts, case normalization)
 * - Single-pass, non-recursive substitution engine (prevents chain loops like love->hate->chicken)
 * - Longest-phrase matching first (multiword phrases take precedence over single words)
 * - Layout, stanza, whitespace, and punctuation preservation
 * - Case-preserving substitutions (Capitalized -> Capitalized, ALL CAPS -> ALL CAPS)
 * - Collision & ambiguity detection (duplicate targets, vocabulary overlap)
 * - Manifest-based and heuristic reversibility
 */

export type CipherMode = 'quick' | 'random' | 'manual';

export interface CipherMapping {
  original: string;
  replacement: string;
}

export interface CipherSubstitutionSpan {
  original: string;
  replacement: string;
  start: number;
  end: number;
}

export interface CipherManifest {
  version: 1;
  dictionary_id?: string;
  dictionary_name?: string;
  created_at: string;
  substitutions: CipherSubstitutionSpan[];
}

/**
 * First-class Cipher Key (.mckey / v1 JSON)
 * Represents the exact substitution mapping, manifest, and fingerprints required
 * to deterministically decode a ciphered poem.
 * Backwards-compatible with CipherDictionary.
 */
export interface CipherKey {
  version: 1;
  algorithm_version?: '1.0';
  id: string;
  name: string;
  description?: string;
  mode?: CipherMode;
  committed?: boolean;
  word_count?: number;
  created_at: string;
  updated_at: string;
  mappings: CipherMapping[];
  manifest?: CipherManifest;
  source_fingerprint?: string;
  encoded_fingerprint?: string;
  associated_poem_ids?: string[];
  associated_poem_titles?: string[];
  vocabulary_pool_id?: string;
}

export type CipherDictionary = CipherKey;

export interface WordFrequency {
  word: string;        // canonical normalized lowercase
  displayWord: string; // original casing encountered
  count: number;       // total occurrences in source text
}

export interface CollisionReport {
  hasCollisions: boolean;
  duplicateTargets: Array<{ replacement: string; originals: string[] }>;
  vocabularyOverlaps: Array<{ word: string; mappedFrom: string }>;
  warnings: string[];
}

export interface EncodeResult {
  encodedText: string;
  manifest: CipherManifest;
  collisionReport: CollisionReport;
  sourceFingerprint: string;
  encodedFingerprint: string;
}

export type DecodeFidelity = 'lossless' | 'ambiguous' | 'mismatch' | 'invalid_key';

export interface DecodeResult {
  decodedText: string;
  fidelity: 'lossless' | 'ambiguous';
  warnings: string[];
}

export type KeyMismatchReason = 'wrong_key' | 'text_modified' | 'missing_metadata';

export interface KeyDecodeResult {
  decodedText: string;
  fidelity: DecodeFidelity;
  statusLabel: string;
  warnings: string[];
  error?: string;
  mismatchReason?: KeyMismatchReason;
  keyId: string;
  keyName: string;
  sourceFingerprintMatched: boolean;
  encodedFingerprintMatched: boolean;
}

export interface QuickCipherResult {
  pairs: Array<[string, string]>;
  mappings: CipherMapping[];
  encodedText: string;
  manifest: CipherManifest;
  sourceFingerprint: string;
  encodedFingerprint: string;
  key: CipherKey;
  totalUnique: number;
  maxSwappable: number;
  swapCount: number;
}

export interface RandomCipherResult {
  pairs: Array<[string, string]>;
  mappings: CipherMapping[];
  encodedText: string;
  manifest: CipherManifest;
  sourceFingerprint: string;
  encodedFingerprint: string;
  key: CipherKey;
  totalUnique: number;
  transformCount: number;
}

// Regex to extract words while handling contractions and hyphenated words
const WORD_REGEX = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

/**
 * Normalize line endings to LF (\n) for platform-independent fingerprinting and span alignment.
 */
export function normalizeCipherText(text: string): string {
  return (text ?? '').replace(/\r\n/g, '\n');
}

/**
 * Compute a deterministic, case- and punctuation-sensitive fingerprint of text.
 * Uses 4 independent 32-bit FNV-1a/Murmur-mixed lanes (128-bit digest) plus byte/char length.
 */
export function computeTextFingerprint(text: string): string {
  const norm = normalizeCipherText(text);
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  let h3 = 0x85ebca6b >>> 0;
  let h4 = 0xc2b2ae35 >>> 0;

  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 5) | (c >>> 11)), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (c + i), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ ((c * 31) & 0xffff), 0x27d4eb2f) >>> 0;
  }

  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `mcfp1:${norm.length}:${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`;
}

/**
 * Create a deterministic seeded PRNG (Mulberry32) from a numeric or string seed.
 */
export function createSeededRng(seed: number | string): () => number {
  let state = 0;
  if (typeof seed === 'number') {
    state = seed >>> 0;
  } else {
    for (let i = 0; i < seed.length; i++) {
      state = (Math.imul(state ^ seed.charCodeAt(i), 0x01000193) >>> 0);
    }
  }
  if (state === 0) state = 0x6d2b79f5;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Perform frequency analysis on a poem or text snippet.
 * Returns sorted unique words (by count descending, then word ascending).
 */
export function analyzeWordFrequency(text: string): WordFrequency[] {
  if (!text || text.trim().length === 0) return [];

  const counts = new Map<string, { count: number; displayWord: string }>();
  const matches = text.matchAll(WORD_REGEX);

  for (const match of matches) {
    const raw = match[0];
    const lower = raw.toLowerCase();
    const existing = counts.get(lower);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(lower, { count: 1, displayWord: raw });
    }
  }

  const result: WordFrequency[] = [];
  for (const [word, data] of counts.entries()) {
    result.push({
      word,
      displayWord: data.displayWord,
      count: data.count,
    });
  }

  // Sort: frequency descending, then alphabetical
  result.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.word.localeCompare(b.word);
  });

  return result;
}

/**
 * Escape regular expression special characters.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build word-boundary lookbehind and lookahead assertions consistent with WORD_REGEX
 * so contractions (e.g. "it's", "don't") and hyphenated words (e.g. "moon-lit")
 * are never partially matched by shorter words ("it", "don", "moon", "s", "t").
 */
function buildWordBoundaryPattern(phrase: string): string {
  const escaped = escapeRegExp(phrase).replace(/\s+/g, '\\s+');
  const leading = /^[\p{L}\p{N}]/u.test(phrase)
    ? '(?<![\\p{L}\\p{N}])(?<![\\p{L}\\p{N}][\'’\\-])'
    : '';
  const trailing = /[\p{L}\p{N}]$/u.test(phrase)
    ? '(?![\\p{L}\\p{N}])(?![\'’\\-][\\p{L}\\p{N}])'
    : '';
  return `(?:${leading}${escaped}${trailing})`;
}

/**
 * Apply the casing pattern of the source word onto the replacement word.
 * Single-letter uppercase words ("I", "A", "O") are treated as Title Case rather than ALL CAPS,
 * ensuring exact case roundtripping when single-letter words are swapped with multi-letter words.
 */
export function applyCase(source: string, replacement: string): string {
  if (!source || !replacement) return replacement;

  // Check if source contains letters
  const letters = source.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return replacement;

  // ALL CAPS check (only when source has more than 1 letter, so "I" and "A" are Title Case)
  const isAllCaps =
    letters.length > 1 &&
    source === source.toUpperCase() &&
    source !== source.toLowerCase();
  if (isAllCaps) {
    return replacement.toUpperCase();
  }

  // Multiword casing check (e.g. "Dark Night" -> "Gilded Sunrise")
  if (source.includes(' ') && replacement.includes(' ')) {
    const sWords = source.trim().split(/\s+/);
    const isTitleCase = sWords.every(
      w => w.charAt(0) === w.charAt(0).toUpperCase() && w.charAt(0) !== w.charAt(0).toLowerCase()
    );
    if (isTitleCase) {
      return replacement
        .split(/\s+/)
        .map(w => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
    }
  }

  // Single word Title Case check (First letter uppercase, rest lowercase)
  const first = source.charAt(0);
  const isFirstUpper = first === first.toUpperCase() && first !== first.toLowerCase();
  const rest = source.slice(1);
  const isRestLower = rest === rest.toLowerCase();

  if (isFirstUpper && (rest.length === 0 || isRestLower)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }

  return replacement;
}

/**
 * Detect collisions and potential reversibility ambiguities:
 * 1. Multiple original words mapping to the same replacement word.
 * 2. A replacement word that already exists in the unchanged vocabulary of the text.
 */
export function detectCollisions(text: string, mappings: CipherMapping[]): CollisionReport {
  const activeMappings = mappings.filter(
    m => m.original.trim().length > 0 && m.replacement.trim().length > 0
  );

  const targetMap = new Map<string, string[]>();
  for (const m of activeMappings) {
    const replLower = m.replacement.trim().toLowerCase();
    const origLower = m.original.trim().toLowerCase();
    const list = targetMap.get(replLower) || [];
    if (!list.includes(origLower)) {
      list.push(origLower);
    }
    targetMap.set(replLower, list);
  }

  const duplicateTargets: Array<{ replacement: string; originals: string[] }> = [];
  const warnings: string[] = [];

  for (const [repl, originals] of targetMap.entries()) {
    if (originals.length > 1) {
      duplicateTargets.push({ replacement: repl, originals });
      warnings.push(
        `Target collision: "${repl}" is assigned to multiple originals (${originals.map(o => `"${o}"`).join(', ')}). Decoding without a manifest will be ambiguous.`
      );
    }
  }

  // Vocabulary overlap: words in the poem that are NOT being substituted
  const substitutedOriginals = new Set(
    activeMappings.flatMap(m => m.original.trim().toLowerCase().split(/\s+/))
  );

  const originalFreqs = analyzeWordFrequency(text);
  const unchangedWords = new Set<string>();
  for (const freq of originalFreqs) {
    if (!substitutedOriginals.has(freq.word)) {
      unchangedWords.add(freq.word);
    }
  }

  const vocabularyOverlaps: Array<{ word: string; mappedFrom: string }> = [];
  for (const m of activeMappings) {
    const replWords = m.replacement.trim().toLowerCase().split(/\s+/);
    for (const rw of replWords) {
      if (unchangedWords.has(rw)) {
        vocabularyOverlaps.push({ word: rw, mappedFrom: m.original.trim() });
        warnings.push(
          `Vocabulary overlap: Replacement word "${rw}" (from "${m.original.trim()}") already appears in the original poem. Decoding without a manifest cannot distinguish original occurrences from substituted ones.`
        );
      }
    }
  }

  return {
    hasCollisions: duplicateTargets.length > 0 || vocabularyOverlaps.length > 0,
    duplicateTargets,
    vocabularyOverlaps,
    warnings,
  };
}

/**
 * Encode text using single-pass, longest-phrase first substitution.
 * Does not re-evaluate substituted tokens (avoiding chain substitution loops).
 * Preserves stanzas, line breaks, whitespace, and punctuation.
 */
export function encodeCipher(
  text: string,
  mappings: CipherMapping[],
  dictionaryInfo?: { id?: string; name?: string }
): EncodeResult {
  const activeMappings = mappings.filter(
    m => m.original.trim().length > 0 && m.replacement.trim().length > 0
  );

  const collisionReport = detectCollisions(text, activeMappings);
  const sourceFingerprint = computeTextFingerprint(text);

  if (activeMappings.length === 0 || !text) {
    return {
      encodedText: text,
      manifest: {
        version: 1,
        dictionary_id: dictionaryInfo?.id,
        dictionary_name: dictionaryInfo?.name,
        created_at: new Date().toISOString(),
        substitutions: [],
      },
      collisionReport,
      sourceFingerprint,
      encodedFingerprint: sourceFingerprint,
    };
  }

  // Sort mappings: longest word count first, then longest character count first
  const sortedMappings = [...activeMappings].sort((a, b) => {
    const countA = a.original.trim().split(/\s+/).length;
    const countB = b.original.trim().split(/\s+/).length;
    if (countB !== countA) return countB - countA;
    return b.original.trim().length - a.original.trim().length;
  });

  // Map normalized original -> replacement
  const mappingMap = new Map<string, string>();
  for (const m of sortedMappings) {
    const key = m.original.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!mappingMap.has(key)) {
      mappingMap.set(key, m.replacement.trim());
    }
  }

  // Construct combined regex with contraction-safe word boundaries
  const patterns: string[] = [];
  for (const m of sortedMappings) {
    const phrase = m.original.trim();
    patterns.push(buildWordBoundaryPattern(phrase));
  }

  const combinedRegex = new RegExp(patterns.join('|'), 'giu');

  const substitutions: CipherSubstitutionSpan[] = [];
  let currentOutputOffset = 0;
  let lastIndex = 0;
  let encodedText = '';

  for (const match of text.matchAll(combinedRegex)) {
    const matchIndex = match.index ?? 0;
    const matchedText = match[0];

    // Append literal text between previous match and this match
    if (matchIndex > lastIndex) {
      const slice = text.slice(lastIndex, matchIndex);
      encodedText += slice;
      currentOutputOffset += slice.length;
    }

    const key = matchedText.toLowerCase().replace(/\s+/g, ' ');
    const replacementPattern = mappingMap.get(key) ?? matchedText;
    const replacement = applyCase(matchedText, replacementPattern);

    const start = currentOutputOffset;
    encodedText += replacement;
    currentOutputOffset += replacement.length;
    const end = currentOutputOffset;

    substitutions.push({
      original: matchedText,
      replacement,
      start,
      end,
    });

    lastIndex = matchIndex + matchedText.length;
  }

  // Append remaining text
  if (lastIndex < text.length) {
    encodedText += text.slice(lastIndex);
  }

  const manifest: CipherManifest = {
    version: 1,
    dictionary_id: dictionaryInfo?.id,
    dictionary_name: dictionaryInfo?.name,
    created_at: new Date().toISOString(),
    substitutions,
  };

  const encodedFingerprint = computeTextFingerprint(encodedText);

  return {
    encodedText,
    manifest,
    collisionReport,
    sourceFingerprint,
    encodedFingerprint,
  };
}

/**
 * Helper to attempt manifest span reconstruction against a candidate text string.
 */
function tryManifestReconstruction(text: string, manifest: CipherManifest): string | null {
  if (!manifest || !Array.isArray(manifest.substitutions) || manifest.substitutions.length === 0) {
    return null;
  }

  for (const span of manifest.substitutions) {
    if (
      typeof span.start !== 'number' ||
      typeof span.end !== 'number' ||
      span.start < 0 ||
      span.end > text.length ||
      text.slice(span.start, span.end) !== span.replacement
    ) {
      return null;
    }
  }

  const sortedSpans = [...manifest.substitutions].sort((a, b) => b.start - a.start);
  let result = text;
  for (const span of sortedSpans) {
    result = result.slice(0, span.start) + span.original + result.slice(span.end);
  }
  return result;
}

/**
 * Decode transformed text back to original.
 * 
 * If a manifest is supplied, decoding is 100% deterministic and lossless by reconstructing
 * from exact recorded substitution spans.
 * 
 * If no manifest is supplied, decoding operates via reverse dictionary substitution
 * (longest replacement phrase first) and reports whether the decoding is lossless or ambiguous.
 */
export function decodeCipher(
  encodedText: string,
  mappings: CipherMapping[],
  manifest?: CipherManifest
): DecodeResult {
  if (!encodedText) {
    return { decodedText: '', fidelity: 'lossless', warnings: [] };
  }

  // 1. Lossless path via Manifest (try exact text first, then LF-normalized text)
  if (manifest && Array.isArray(manifest.substitutions) && manifest.substitutions.length > 0) {
    const exactRestored = tryManifestReconstruction(encodedText, manifest);
    if (exactRestored !== null) {
      return {
        decodedText: exactRestored,
        fidelity: 'lossless',
        warnings: [],
      };
    }

    const normText = normalizeCipherText(encodedText);
    if (normText !== encodedText) {
      const normRestored = tryManifestReconstruction(normText, manifest);
      if (normRestored !== null) {
        return {
          decodedText: normRestored,
          fidelity: 'lossless',
          warnings: [],
        };
      }
    }
  }

  // 2. Reverse Dictionary substitution (heuristic / standalone decoding)
  const activeMappings = mappings.filter(
    m => m.original.trim().length > 0 && m.replacement.trim().length > 0
  );

  if (activeMappings.length === 0) {
    return {
      decodedText: encodedText,
      fidelity: 'lossless',
      warnings: [],
    };
  }

  // Check for ambiguity in reverse dictionary
  const reverseMap = new Map<string, string>();
  const reverseDuplicates = new Map<string, string[]>();
  const warnings: string[] = [];

  for (const m of activeMappings) {
    const key = m.replacement.trim().toLowerCase().replace(/\s+/g, ' ');
    const orig = m.original.trim();
    if (reverseMap.has(key)) {
      const existing = reverseDuplicates.get(key) || [reverseMap.get(key)!];
      if (!existing.includes(orig)) existing.push(orig);
      reverseDuplicates.set(key, existing);
    } else {
      reverseMap.set(key, orig);
    }
  }

  let fidelity: 'lossless' | 'ambiguous' = 'lossless';
  if (reverseDuplicates.size > 0) {
    fidelity = 'ambiguous';
    for (const [repl, origs] of reverseDuplicates.entries()) {
      warnings.push(
        `Ambiguous reversal: "${repl}" maps to multiple potential words (${origs.map(o => `"${o}"`).join(', ')}). First match chosen.`
      );
    }
  }

  // Longest replacement first
  const sortedReverse = [...activeMappings].sort((a, b) => {
    const countA = a.replacement.trim().split(/\s+/).length;
    const countB = b.replacement.trim().split(/\s+/).length;
    if (countB !== countA) return countB - countA;
    return b.replacement.trim().length - a.replacement.trim().length;
  });

  const patterns: string[] = [];
  const registeredKeys = new Set<string>();

  for (const m of sortedReverse) {
    const repl = m.replacement.trim();
    const key = repl.toLowerCase().replace(/\s+/g, ' ');
    if (registeredKeys.has(key)) continue;
    registeredKeys.add(key);

    patterns.push(buildWordBoundaryPattern(repl));
  }

  if (patterns.length === 0) {
    return { decodedText: encodedText, fidelity, warnings };
  }

  const combinedRegex = new RegExp(patterns.join('|'), 'giu');
  let decodedText = '';
  let lastIndex = 0;

  for (const match of encodedText.matchAll(combinedRegex)) {
    const matchIndex = match.index ?? 0;
    const matchedText = match[0];

    if (matchIndex > lastIndex) {
      decodedText += encodedText.slice(lastIndex, matchIndex);
    }

    const key = matchedText.toLowerCase().replace(/\s+/g, ' ');
    const originalPattern = reverseMap.get(key) ?? matchedText;
    const restored = applyCase(matchedText, originalPattern);

    decodedText += restored;
    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex < encodedText.length) {
    decodedText += encodedText.slice(lastIndex);
  }

  return {
    decodedText,
    fidelity,
    warnings,
  };
}

/**
 * Strip any previously generated cipher prefixes, suffixes, parentheticals, or timestamps
 * so that re-encoding or renaming never recursively nests poem titles or key names.
 */
export function extractBasePoemTitle(rawTitle?: string): string {
  let clean = (rawTitle ?? '').trim();
  if (!clean) return 'Untitled Poem';

  let prev = '';
  while (clean !== prev) {
    prev = clean;
    // Strip leading "Quick Cipher Key — ", "Random Cipher Key — ", "Manual Cipher Key — "
    clean = clean.replace(/^(?:Quick|Random|Manual)\s+Cipher\s+Key\s*[—\-:]\s*/i, '');
    // Strip trailing "(Quick Cipher...)", "(Random Cipher...)", "(Cipher...)", "(Decoded...)", "(Imported...)"
    clean = clean.replace(/\s*\((?:Quick\s+|Random\s+|Manual\s+)?Cipher[^)]*\)\s*$/i, '');
    clean = clean.replace(/\s*\(Decoded(?:\s*#?\d+)?\)\s*$/i, '');
    clean = clean.replace(/\s*\(Imported(?:\s*#?\d+)?\)\s*$/i, '');
    // Strip trailing " — Quick #1", " — Random #2", " — Manual #1"
    clean = clean.replace(/\s*[—\-]\s*(?:Quick|Random|Manual)(?:\s+Cipher(?:\s+Key)?)?\s*#?\d*\s*$/i, '');
    // Strip trailing ISO/short timestamps like " — 2026-10-18 19:45"
    clean = clean.replace(/\s*[—\-]\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?Z?)?)?\s*$/i, '');
    clean = clean.trim();
  }

  return clean || 'Untitled Poem';
}

/**
 * Format a short, non-nesting automatic Cipher Key name:
 * e.g. "Women as Both Art and Craftswoman — Quick #1"
 */
export function formatDefaultCipherKeyName(
  mode: CipherMode,
  poemTitle?: string,
  sequenceOrTimestamp?: number | string
): string {
  const baseTitle = extractBasePoemTitle(poemTitle);
  const modeCap =
    mode === 'quick' ? 'Quick' : mode === 'random' ? 'Random' : 'Manual';
  const seq =
    typeof sequenceOrTimestamp === 'number' &&
    Number.isFinite(sequenceOrTimestamp) &&
    sequenceOrTimestamp >= 1
      ? Math.floor(sequenceOrTimestamp)
      : 1;
  return `${baseTitle} — ${modeCap} #${seq}`;
}

/**
 * Format a clean, non-nesting title for a newly saved ciphered or decoded poem.
 */
export function formatCipheredPoemTitle(
  poemTitle: string,
  mode: CipherMode | 'decoded',
  sequenceNumber: number = 1
): string {
  const baseTitle = extractBasePoemTitle(poemTitle);
  if (mode === 'decoded') {
    return `${baseTitle} (Decoded)`;
  }
  const modeCap =
    mode === 'quick' ? 'Quick' : mode === 'random' ? 'Random' : 'Manual';
  const seq = sequenceNumber > 1 ? ` #${Math.floor(sequenceNumber)}` : '';
  return `${baseTitle} (${modeCap} Cipher${seq})`;
}

/**
 * Ensure a poem title is unique among existing library titles so existing poems are never overwritten.
 */
export function resolveUniquePoemTitle(
  desiredTitle: string,
  existingTitles: string[]
): string {
  const base = (desiredTitle || 'Untitled Poem').trim() || 'Untitled Poem';
  const lowerSet = new Set(existingTitles.map(t => t.trim().toLowerCase()));
  if (!lowerSet.has(base.toLowerCase())) {
    return base;
  }
  let counter = 2;
  while (lowerSet.has(`${base} (${counter})`.toLowerCase())) {
    counter += 1;
  }
  return `${base} (${counter})`;
}

/**
 * Truncate long key or poem names cleanly for compact UI selectors while preserving readability.
 */
export function truncateDisplayLabel(text: string, maxLength: number = 48): string {
  const clean = (text ?? '').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(12, maxLength - 1)).trimEnd()}…`;
}

/**
 * Distinguish poem-bound Cipher Keys from reusable Manual Dictionaries.
 */
export function classifyCipherKey(
  key: CipherKey
): 'poem_key' | 'reusable_dictionary' {
  if (
    key.mode === 'quick' ||
    key.mode === 'random' ||
    Boolean(key.encoded_fingerprint) ||
    Boolean(key.source_fingerprint) ||
    Boolean(key.manifest && key.manifest.substitutions.length > 0) ||
    (key.associated_poem_ids && key.associated_poem_ids.length > 0) ||
    (key.associated_poem_titles && key.associated_poem_titles.length > 0)
  ) {
    return 'poem_key';
  }
  return 'reusable_dictionary';
}

/**
 * Create a first-class CipherKey object from a substitution pass.
 */
export function createCipherKey(params: {
  id?: string;
  name?: string;
  description?: string;
  mode: CipherMode;
  poemTitle?: string;
  poemId?: string;
  sourceText: string;
  mappings: CipherMapping[];
  committed?: boolean;
  vocabularyPoolId?: string;
  sequenceNumber?: number;
}): { key: CipherKey; encodeResult: EncodeResult } {
  const now = new Date().toISOString();
  const keyId =
    params.id ||
    `key-${params.mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanPoemTitle = params.poemTitle
    ? extractBasePoemTitle(params.poemTitle)
    : undefined;
  const keyName =
    params.name?.trim()
      ? formatDefaultCipherKeyName(
          params.mode,
          params.name.trim(),
          params.sequenceNumber ?? 1
        ) === `${extractBasePoemTitle(params.name.trim())} — ${params.mode === 'quick' ? 'Quick' : params.mode === 'random' ? 'Random' : 'Manual'} #${params.sequenceNumber ?? 1}` &&
        /Cipher\s+Key\s*[—\-]/i.test(params.name.trim())
        ? formatDefaultCipherKeyName(params.mode, cleanPoemTitle, params.sequenceNumber ?? 1)
        : params.name.trim()
      : formatDefaultCipherKeyName(params.mode, cleanPoemTitle, params.sequenceNumber ?? 1);

  const encodeResult = encodeCipher(params.sourceText, params.mappings, {
    id: keyId,
    name: keyName,
  });

  const activeMappings = params.mappings.filter(
    m => m.original.trim().length > 0 && m.replacement.trim().length > 0
  );

  const key: CipherKey = {
    version: 1,
    algorithm_version: '1.0',
    id: keyId,
    name: keyName,
    description:
      params.description ??
      `${params.mode.charAt(0).toUpperCase() + params.mode.slice(1)} cipher key (${activeMappings.length} mappings)`,
    mode: params.mode,
    committed: params.committed ?? false,
    word_count: activeMappings.length,
    created_at: now,
    updated_at: now,
    mappings: activeMappings.map(m => ({
      original: m.original.trim(),
      replacement: m.replacement.trim(),
    })),
    manifest: encodeResult.manifest,
    source_fingerprint: encodeResult.sourceFingerprint,
    encoded_fingerprint: encodeResult.encodedFingerprint,
    associated_poem_ids: params.poemId ? [params.poemId] : [],
    associated_poem_titles: cleanPoemTitle ? [cleanPoemTitle] : [],
    vocabulary_pool_id: params.vocabularyPoolId,
  };

  return { key, encodeResult };
}

const MAX_KEY_MAPPINGS = 50_000;
const MAX_PHRASE_LENGTH = 1_000;

/**
 * Validate that a loaded or imported Cipher Key / Dictionary object satisfies the v1 schema.
 * Rejects malformed data, unsupported versions/algorithms, duplicate originals, or oversized payloads.
 * Preserves compatibility with legacy dictionaries that lack optional fingerprint/manifest fields.
 */
export function validateCipherKey(
  data: unknown,
  options?: { disallowDuplicateOriginals?: boolean }
): CipherKey {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid Cipher Key: Expected a JSON object.');
  }

  const d = data as Record<string, unknown>;

  if (d.version !== undefined && d.version !== 1) {
    throw new Error(`Unsupported Cipher Key version: ${String(d.version)}. Expected version 1.`);
  }

  if (d.algorithm_version !== undefined && d.algorithm_version !== '1.0') {
    throw new Error(
      `Unsupported Cipher Key algorithm version: ${String(d.algorithm_version)}. Expected version 1.0.`
    );
  }

  if (typeof d.id !== 'string' || d.id.trim().length === 0) {
    throw new Error('Cipher Key missing required string field: "id".');
  }
  if (d.id.length > 256) {
    throw new Error('Cipher Key "id" exceeds maximum length of 256 characters.');
  }

  if (typeof d.name !== 'string' || d.name.trim().length === 0) {
    throw new Error('Cipher Key missing required string field: "name".');
  }
  if (d.name.length > 512) {
    throw new Error('Cipher Key "name" exceeds maximum length of 512 characters.');
  }

  if (
    d.mode !== undefined &&
    d.mode !== 'quick' &&
    d.mode !== 'random' &&
    d.mode !== 'manual'
  ) {
    throw new Error(`Invalid Cipher Key mode: "${String(d.mode)}". Expected quick, random, or manual.`);
  }

  if (!Array.isArray(d.mappings)) {
    throw new Error('Cipher Key missing required array field: "mappings".');
  }

  if (d.mappings.length > MAX_KEY_MAPPINGS) {
    throw new Error(
      `Cipher Key exceeds maximum mapping count (${d.mappings.length} > ${MAX_KEY_MAPPINGS}).`
    );
  }

  const cleanMappings: CipherMapping[] = [];
  const seenOriginals = new Map<string, string>();

  for (let i = 0; i < d.mappings.length; i++) {
    const item = d.mappings[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Mapping at index ${i} must be an object.`);
    }
    const orig = (item as Record<string, unknown>).original;
    const repl = (item as Record<string, unknown>).replacement;
    if (typeof orig !== 'string' || typeof repl !== 'string') {
      throw new Error(`Mapping at index ${i} requires string "original" and "replacement" fields.`);
    }
    const cleanOrig = orig.trim();
    const cleanRepl = repl.trim();
    if (cleanOrig.length > MAX_PHRASE_LENGTH || cleanRepl.length > MAX_PHRASE_LENGTH) {
      throw new Error(`Mapping at index ${i} exceeds maximum phrase length of ${MAX_PHRASE_LENGTH} characters.`);
    }
    if (cleanOrig.includes('\0') || cleanRepl.includes('\0')) {
      throw new Error(`Mapping at index ${i} contains invalid null characters.`);
    }

    if (options?.disallowDuplicateOriginals && cleanOrig.length > 0) {
      const normOrig = cleanOrig.toLowerCase().replace(/\s+/g, ' ');
      const prevRepl = seenOriginals.get(normOrig);
      if (prevRepl !== undefined && prevRepl.toLowerCase() !== cleanRepl.toLowerCase()) {
        throw new Error(
          `Corrupted Cipher Key: Duplicate original entry "${cleanOrig}" mapped to conflicting replacements ("${prevRepl}" and "${cleanRepl}").`
        );
      }
      seenOriginals.set(normOrig, cleanRepl);
    }

    cleanMappings.push({
      original: cleanOrig,
      replacement: cleanRepl,
    });
  }

  let validatedManifest: CipherManifest | undefined = undefined;
  if (d.manifest !== undefined && d.manifest !== null) {
    if (typeof d.manifest !== 'object' || Array.isArray(d.manifest)) {
      throw new Error('Invalid Cipher Key manifest: Expected an object.');
    }
    const m = d.manifest as Record<string, unknown>;
    if (m.version !== 1 || !Array.isArray(m.substitutions)) {
      throw new Error('Invalid Cipher Key manifest: Expected version 1 and substitutions array.');
    }
    const cleanSpans: CipherSubstitutionSpan[] = [];
    for (let i = 0; i < m.substitutions.length; i++) {
      const s = m.substitutions[i] as Record<string, unknown>;
      if (
        !s ||
        typeof s.original !== 'string' ||
        typeof s.replacement !== 'string' ||
        typeof s.start !== 'number' ||
        typeof s.end !== 'number' ||
        s.start < 0 ||
        s.end < s.start
      ) {
        throw new Error(`Invalid manifest substitution span at index ${i}.`);
      }
      cleanSpans.push({
        original: s.original,
        replacement: s.replacement,
        start: s.start,
        end: s.end,
      });
    }
    validatedManifest = {
      version: 1,
      dictionary_id: typeof m.dictionary_id === 'string' ? m.dictionary_id : d.id.trim(),
      dictionary_name: typeof m.dictionary_name === 'string' ? m.dictionary_name : d.name.trim(),
      created_at: typeof m.created_at === 'string' ? m.created_at : new Date().toISOString(),
      substitutions: cleanSpans,
    };
  }

  const now = new Date().toISOString();
  const mode: CipherMode =
    d.mode === 'quick' || d.mode === 'random' || d.mode === 'manual' ? d.mode : 'manual';

  return {
    version: 1,
    algorithm_version: '1.0',
    id: d.id.trim(),
    name: d.name.trim(),
    description: typeof d.description === 'string' ? d.description.trim() : undefined,
    mode,
    committed: typeof d.committed === 'boolean' ? d.committed : true,
    word_count: typeof d.word_count === 'number' ? d.word_count : cleanMappings.length,
    created_at: typeof d.created_at === 'string' ? d.created_at : now,
    updated_at: typeof d.updated_at === 'string' ? d.updated_at : now,
    mappings: cleanMappings,
    manifest: validatedManifest,
    source_fingerprint:
      typeof d.source_fingerprint === 'string' ? d.source_fingerprint : undefined,
    encoded_fingerprint:
      typeof d.encoded_fingerprint === 'string' ? d.encoded_fingerprint : undefined,
    associated_poem_ids: Array.isArray(d.associated_poem_ids)
      ? d.associated_poem_ids.filter((x): x is string => typeof x === 'string')
      : [],
    associated_poem_titles: Array.isArray(d.associated_poem_titles)
      ? d.associated_poem_titles.filter((x): x is string => typeof x === 'string')
      : [],
    vocabulary_pool_id:
      typeof d.vocabulary_pool_id === 'string' ? d.vocabulary_pool_id : undefined,
  };
}

export function validateCipherDictionary(data: unknown): CipherDictionary {
  return validateCipherKey(data);
}

/**
 * Mandatory Key Validation & Deterministic Decoding.
 *
 * 1. Validates the Cipher Key schema, version, and algorithm compatibility.
 * 2. Verifies key association (expectedKeyId) and encoded_fingerprint against the input text.
 * 3. Clearly distinguishes between:
 *    - Wrong key selected ('wrong_key')
 *    - Ciphered text modified since encoding ('text_modified')
 *    - Legacy/reusable dictionaries without fingerprints (decoded without false corruption warnings)
 * 4. Performs deterministic decoding using the key's manifest and mappings.
 * 5. Verifies the recovered text against source_fingerprint; never reports 'lossless' if
 *    the recovered text fingerprint differs from source_fingerprint.
 */
export function decodeWithCipherKey(
  encodedText: string,
  keyInput: unknown,
  options?: {
    expectedKeyId?: string;
    expectedEncodedFingerprint?: string;
    isMatchedKey?: boolean;
    poemManifest?: CipherManifest;
    allowBestEffortOnMismatch?: boolean;
  }
): KeyDecodeResult {
  // 1. Validate key structure & version compatibility
  let key: CipherKey;
  try {
    key = validateCipherKey(keyInput, { disallowDuplicateOriginals: true });
  } catch (err: any) {
    return {
      decodedText: encodedText,
      fidelity: 'invalid_key',
      statusLabel: 'Invalid or Incompatible Cipher Key',
      warnings: [],
      error: err?.message || 'Invalid Cipher Key.',
      keyId: (keyInput as any)?.id || 'unknown',
      keyName: (keyInput as any)?.name || 'Unknown Key',
      sourceFingerprintMatched: false,
      encodedFingerprintMatched: false,
    };
  }

  const inputFingerprint = computeTextFingerprint(encodedText);

  // 2. Check explicit poem key association mismatch (Wrong Key Selected)
  if (
    options?.expectedKeyId &&
    options.expectedKeyId !== key.id &&
    !options?.allowBestEffortOnMismatch
  ) {
    return {
      decodedText: encodedText,
      fidelity: 'mismatch',
      mismatchReason: 'wrong_key',
      statusLabel: 'Wrong Cipher Key Selected',
      warnings: [],
      error: 'This Cipher Key does not match the selected poem.',
      keyId: key.id,
      keyName: key.name,
      sourceFingerprintMatched: false,
      encodedFingerprintMatched: false,
    };
  }

  // 3. Check encoded_fingerprint if key is bound to a specific encoded text
  const encodedFingerprintMatched = key.encoded_fingerprint
    ? key.encoded_fingerprint === inputFingerprint
    : false;

  if (
    key.encoded_fingerprint &&
    !encodedFingerprintMatched &&
    !options?.allowBestEffortOnMismatch
  ) {
    const isPoemAssociatedKey =
      Boolean(options?.isMatchedKey) ||
      (Boolean(options?.expectedKeyId) && options?.expectedKeyId === key.id);

    if (isPoemAssociatedKey) {
      return {
        decodedText: encodedText,
        fidelity: 'mismatch',
        mismatchReason: 'text_modified',
        statusLabel: 'Ciphered Text Modified',
        warnings: [],
        error:
          'The ciphered poem text was modified after encoding. Its fingerprint no longer matches this Cipher Key.',
        keyId: key.id,
        keyName: key.name,
        sourceFingerprintMatched: false,
        encodedFingerprintMatched: false,
      };
    }

    return {
      decodedText: encodedText,
      fidelity: 'mismatch',
      mismatchReason: 'wrong_key',
      statusLabel: 'Key Mismatch',
      warnings: [],
      error: 'This Cipher Key does not match the selected poem.',
      keyId: key.id,
      keyName: key.name,
      sourceFingerprintMatched: false,
      encodedFingerprintMatched: false,
    };
  }

  // 4. For unbound manual / legacy keys (no encoded_fingerprint), check if the key has any replacement matches
  //    or if a manifest is provided for a different key
  const effectiveManifest =
    key.manifest ??
    (options?.poemManifest &&
    (!options.poemManifest.dictionary_id || options.poemManifest.dictionary_id === key.id)
      ? options.poemManifest
      : undefined);

  if (
    !key.encoded_fingerprint &&
    !effectiveManifest &&
    encodedText.trim().length > 0 &&
    key.mappings.length > 0
  ) {
    // Check if at least one replacement word from the key appears in the text
    const activeReplacements = key.mappings
      .map(m => m.replacement.trim())
      .filter(Boolean);
    if (activeReplacements.length > 0) {
      const checkPatterns = activeReplacements.map(r => buildWordBoundaryPattern(r));
      const checkRegex = new RegExp(checkPatterns.join('|'), 'giu');
      if (!checkRegex.test(encodedText) && !options?.allowBestEffortOnMismatch) {
        return {
          decodedText: encodedText,
          fidelity: 'mismatch',
          mismatchReason: 'wrong_key',
          statusLabel: 'Key Mismatch',
          warnings: [],
          error: 'This Cipher Key does not match the selected poem.',
          keyId: key.id,
          keyName: key.name,
          sourceFingerprintMatched: false,
          encodedFingerprintMatched: false,
        };
      }
    }
  }

  // 5. Perform deterministic decoding
  const decodeRes = decodeCipher(encodedText, key.mappings, effectiveManifest);
  const recoveredFingerprint = computeTextFingerprint(decodeRes.decodedText);

  // 6. Verify decoded output against source_fingerprint when available
  const hasSourceFingerprint = Boolean(key.source_fingerprint);
  const sourceFingerprintMatched = hasSourceFingerprint
    ? recoveredFingerprint === key.source_fingerprint
    : false;

  const warnings = [...decodeRes.warnings];

  if (hasSourceFingerprint && !sourceFingerprintMatched) {
    warnings.push(
      'Recovered text fingerprint differs from the original poem fingerprint. Some capitalization or overlapping words could not be restored losslessly.'
    );
    return {
      decodedText: decodeRes.decodedText,
      fidelity: 'ambiguous',
      statusLabel: 'Best-Effort Dictionary Reversal (Fingerprint Mismatch)',
      warnings,
      keyId: key.id,
      keyName: key.name,
      sourceFingerprintMatched: false,
      encodedFingerprintMatched,
    };
  }

  // Never report 'lossless' unless either source_fingerprint matched OR manifest spans matched with zero warnings
  const isVerifiedLossless =
    (hasSourceFingerprint && sourceFingerprintMatched) ||
    (!hasSourceFingerprint && decodeRes.fidelity === 'lossless' && Boolean(effectiveManifest));

  const finalFidelity: DecodeFidelity = isVerifiedLossless
    ? 'lossless'
    : decodeRes.fidelity === 'lossless' && !hasSourceFingerprint
    ? 'lossless'
    : 'ambiguous';

  const statusLabel = isVerifiedLossless
    ? 'Lossless Exact Recovery (Fingerprint Verified)'
    : finalFidelity === 'lossless'
    ? 'Dictionary Reversal (No Collisions Detected)'
    : 'Best-Effort Dictionary Reversal with Warnings';

  return {
    decodedText: decodeRes.decodedText,
    fidelity: finalFidelity,
    statusLabel,
    warnings,
    keyId: key.id,
    keyName: key.name,
    sourceFingerprintMatched,
    encodedFingerprintMatched,
  };
}

/**
 * Fisher-Yates array shuffle with optional deterministic PRNG
 */
function shuffleArray<T>(array: T[], rng: () => number = Math.random): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * Quick Cipher — Existing-Word Swaps
 * 
 * - Analyzes original poem, collects unique words and their frequencies.
 * - Enforces an even swap count from 0 to largest available even count.
 * - Randomly selects swapCount distinct words and partitions them into non-overlapping pairs (A <-> B).
 * - Applies substitutions simultaneously in a single pass without chained replacements.
 * - Automatically generates a bound CipherKey with source/encoded fingerprints and manifest.
 */
export function generateQuickCipher(
  poemText: string,
  swapCount: number,
  rng: () => number = Math.random,
  options?: { poemTitle?: string; poemId?: string; keyName?: string; sequenceNumber?: number }
): QuickCipherResult {
  const freqs = analyzeWordFrequency(poemText);
  const totalUnique = freqs.length;
  const maxSwappable = Math.floor(totalUnique / 2) * 2;

  if (swapCount < 0 || swapCount > maxSwappable) {
    throw new Error(
      `Invalid swap count: ${swapCount}. Expected an even integer between 0 and ${maxSwappable}.`
    );
  }

  if (swapCount % 2 !== 0) {
    throw new Error(
      `Swap count must be an even number. Received: ${swapCount}.`
    );
  }

  if (swapCount === 0 || totalUnique < 2) {
    const { key, encodeResult } = createCipherKey({
      name: options?.keyName,
      mode: 'quick',
      poemTitle: options?.poemTitle,
      poemId: options?.poemId,
      sourceText: poemText,
      mappings: [],
      committed: false,
      sequenceNumber: options?.sequenceNumber,
    });
    return {
      pairs: [],
      mappings: [],
      encodedText: poemText,
      manifest: encodeResult.manifest,
      sourceFingerprint: encodeResult.sourceFingerprint,
      encodedFingerprint: encodeResult.encodedFingerprint,
      key,
      totalUnique,
      maxSwappable,
      swapCount: 0,
    };
  }

  const allWords = freqs.map(f => f.word);
  const shuffled = shuffleArray(allWords, rng);
  const chosenWords = shuffled.slice(0, swapCount);

  const pairs: Array<[string, string]> = [];
  const mappings: CipherMapping[] = [];

  for (let i = 0; i < chosenWords.length; i += 2) {
    const a = chosenWords[i];
    const b = chosenWords[i + 1];
    pairs.push([a, b]);
    mappings.push({ original: a, replacement: b });
    mappings.push({ original: b, replacement: a });
  }

  const { key, encodeResult } = createCipherKey({
    name: options?.keyName,
    mode: 'quick',
    poemTitle: options?.poemTitle,
    poemId: options?.poemId,
    sourceText: poemText,
    mappings,
    committed: false,
    sequenceNumber: options?.sequenceNumber,
  });

  return {
    pairs,
    mappings,
    encodedText: encodeResult.encodedText,
    manifest: encodeResult.manifest,
    sourceFingerprint: encodeResult.sourceFingerprint,
    encodedFingerprint: encodeResult.encodedFingerprint,
    key,
    totalUnique,
    maxSwappable,
    swapCount,
  };
}

/**
 * Random Cipher — Offline Vocabulary-Based Substitution
 * 
 * - Selects user-specified number of unique words from poem (odd or even).
 * - Pulls candidate words from an offline vocabulary pool.
 * - Replacements must NOT appear anywhere in original poem (case-insensitive normalized).
 * - Guarantees unique, non-colliding replacements.
 * - Automatically generates a bound CipherKey with source/encoded fingerprints and manifest.
 */
export function generateRandomCipher(
  poemText: string,
  transformCount: number,
  candidatePool: string[],
  rng: () => number = Math.random,
  options?: {
    poemTitle?: string;
    poemId?: string;
    keyName?: string;
    vocabularyPoolId?: string;
    sequenceNumber?: number;
  }
): RandomCipherResult {
  const freqs = analyzeWordFrequency(poemText);
  const totalUnique = freqs.length;

  if (transformCount < 0 || transformCount > totalUnique) {
    throw new Error(
      `Invalid transform count: ${transformCount}. Expected integer between 0 and ${totalUnique}.`
    );
  }

  if (transformCount === 0 || totalUnique === 0) {
    const { key, encodeResult } = createCipherKey({
      name: options?.keyName,
      mode: 'random',
      poemTitle: options?.poemTitle,
      poemId: options?.poemId,
      sourceText: poemText,
      mappings: [],
      committed: false,
      vocabularyPoolId: options?.vocabularyPoolId,
      sequenceNumber: options?.sequenceNumber,
    });
    return {
      pairs: [],
      mappings: [],
      encodedText: poemText,
      manifest: encodeResult.manifest,
      sourceFingerprint: encodeResult.sourceFingerprint,
      encodedFingerprint: encodeResult.encodedFingerprint,
      key,
      totalUnique,
      transformCount: 0,
    };
  }

  // Build normalized set of poem words to strictly avoid collisions
  const poemWordsSet = new Set(freqs.map(f => f.word.toLowerCase()));

  // Filter candidates: non-empty, not in poem, unique
  const eligibleCandidates: string[] = [];
  const seenCandidates = new Set<string>();

  for (const raw of candidatePool) {
    const clean = raw.trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (!poemWordsSet.has(lower) && !seenCandidates.has(lower)) {
      seenCandidates.add(lower);
      eligibleCandidates.push(clean);
    }
  }

  if (eligibleCandidates.length < transformCount) {
    throw new Error(
      `Insufficient vocabulary words in pool: required ${transformCount} unique words, but only ${eligibleCandidates.length} eligible words found (excluding poem words).`
    );
  }

  // Shuffle poem words and candidate words
  const poemWords = freqs.map(f => f.word);
  const shuffledPoemWords = shuffleArray(poemWords, rng);
  const chosenPoemWords = shuffledPoemWords.slice(0, transformCount);

  const shuffledCandidates = shuffleArray(eligibleCandidates, rng);
  const chosenCandidates = shuffledCandidates.slice(0, transformCount);

  const pairs: Array<[string, string]> = [];
  const mappings: CipherMapping[] = [];

  for (let i = 0; i < transformCount; i++) {
    const orig = chosenPoemWords[i];
    const repl = chosenCandidates[i];
    pairs.push([orig, repl]);
    mappings.push({ original: orig, replacement: repl });
  }

  const { key, encodeResult } = createCipherKey({
    name: options?.keyName,
    mode: 'random',
    poemTitle: options?.poemTitle,
    poemId: options?.poemId,
    sourceText: poemText,
    mappings,
    committed: false,
    vocabularyPoolId: options?.vocabularyPoolId,
    sequenceNumber: options?.sequenceNumber,
  });

  return {
    pairs,
    mappings,
    encodedText: encodeResult.encodedText,
    manifest: encodeResult.manifest,
    sourceFingerprint: encodeResult.sourceFingerprint,
    encodedFingerprint: encodeResult.encodedFingerprint,
    key,
    totalUnique,
    transformCount,
  };
}

// ============================================================================
// PART 3 & 4 — POEM EXPORT & IMPORT (.txt, .md, .mcpoem)
// ============================================================================

export type PoemExportFormat = 'txt' | 'md' | 'mcpoem';

export interface McPoemPackage {
  version: 1;
  format: 'mcpoem';
  exported_at: string;
  poem: {
    title: string;
    content: string;
    stanzas: string[];
    poetic_form?: string;
    rhyme_scheme?: string;
    meter?: string;
    tags?: string[];
    cipher?: Record<string, unknown>;
  };
}

export interface ImportedPoemData {
  title: string;
  content: string;
  stanzas: string[];
  poetic_form: string;
  rhyme_scheme?: string;
  meter?: string;
  tags: string[];
  cipher?: Record<string, unknown>;
  metadataJson: string;
  sourceFormat: PoemExportFormat;
}

const MAX_POEM_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Sanitize a title into a safe portable filename stem (no path separators or traversal).
 */
export function sanitizePortableFilename(title: string, fallback = 'poem'): string {
  const clean = (title ?? '')
    .trim()
    .replace(/[\0\/\\:*?"<>|]+/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return clean || fallback;
}

/**
 * Split poem content into normalized stanzas while preserving line breaks inside each stanza.
 */
export function splitPoemStanzas(rawContent: string): string[] {
  const norm = normalizeCipherText(rawContent ?? '').trim();
  if (!norm) return [''];

  const list = norm
    .split(/\n\s*\n/)
    .map(s => s.replace(/^\n+|\n+$/g, ''));
  return list.length > 0 ? list : [''];
}

/**
 * Serialize a poem into .txt, .md, or .mcpoem export format without machine-specific paths.
 */
export function serializePoemExport(
  params: {
    title: string;
    content: string;
    poeticForm?: string;
    rhymeScheme?: string;
    meter?: string;
    tags?: string[];
    cipherMeta?: Record<string, unknown> | null;
  },
  format: PoemExportFormat
): { filename: string; mimeType: string; content: string } {
  const title = (params.title || 'Untitled Poem').trim() || 'Untitled Poem';
  const normContent = normalizeCipherText(params.content ?? '').replace(/\n+$/g, '');
  const stanzas = splitPoemStanzas(normContent);
  const safeStem = sanitizePortableFilename(title, 'poem');
  const cleanTags = (params.tags ?? []).map(t => t.trim()).filter(Boolean);
  const poeticForm = params.poeticForm?.trim() || 'Free Verse';

  if (format === 'txt') {
    return {
      filename: `${safeStem}.txt`,
      mimeType: 'text/plain;charset=utf-8',
      content: `${normContent}\n`,
    };
  }

  if (format === 'md') {
    const frontmatter: Record<string, unknown> = {
      title,
      doc_type: 'poetry',
      poetic_form: poeticForm,
    };
    if (params.rhymeScheme) frontmatter.rhyme_scheme = params.rhymeScheme;
    if (params.meter) frontmatter.meter = params.meter;
    if (cleanTags.length > 0) frontmatter.tags = cleanTags;
    if (params.cipherMeta) frontmatter.cipher = params.cipherMeta;

    const md = `---json\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${normContent}\n`;
    return {
      filename: `${safeStem}.md`,
      mimeType: 'text/markdown;charset=utf-8',
      content: md,
    };
  }

  if (format === 'mcpoem') {
    const pkg: McPoemPackage = {
      version: 1,
      format: 'mcpoem',
      exported_at: new Date().toISOString(),
      poem: {
        title,
        content: normContent,
        stanzas,
        poetic_form: poeticForm,
        ...(params.rhymeScheme ? { rhyme_scheme: params.rhymeScheme } : {}),
        ...(params.meter ? { meter: params.meter } : {}),
        ...(cleanTags.length > 0 ? { tags: cleanTags } : {}),
        ...(params.cipherMeta ? { cipher: params.cipherMeta } : {}),
      },
    };
    return {
      filename: `${safeStem}.mcpoem`,
      mimeType: 'application/json;charset=utf-8',
      content: JSON.stringify(pkg, null, 2),
    };
  }

  throw new Error(`Unsupported poem export format: "${String(format)}".`);
}

/**
 * Validate and parse an imported poem file (.txt, .md, or .mcpoem).
 * Rejects invalid file extensions, path traversal filenames, null bytes, oversized payloads,
 * or malformed schemas. Resolves duplicate titles so existing poems are never overwritten.
 */
export function parsePoemImport(
  fileName: string,
  rawContent: string,
  options?: { maxBytes?: number; existingTitles?: string[] }
): ImportedPoemData {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error('Invalid import file: Missing file name.');
  }
  if (fileName.includes('\0')) {
    throw new Error('Invalid import file: Filename contains null bytes.');
  }

  // Reject path traversal attempts in supplied filename
  const normalizedPath = fileName.replace(/\\/g, '/');
  if (
    normalizedPath.split('/').some(part => part === '..') ||
    /^[a-zA-Z]:\//.test(normalizedPath) ||
    normalizedPath.startsWith('/')
  ) {
    throw new Error('Invalid import file: Unsafe path or traversal sequence in filename.');
  }

  const baseFileName = normalizedPath.split('/').pop() || fileName.trim();
  const extMatch = baseFileName.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  if (ext !== 'txt' && ext !== 'md' && ext !== 'mcpoem') {
    throw new Error(
      `Unsupported poem import file type ".${ext || 'unknown'}". Supported formats are .txt, .md, and .mcpoem.`
    );
  }

  if (typeof rawContent !== 'string') {
    throw new Error('Invalid import file: Content must be UTF-8 text.');
  }
  if (rawContent.includes('\0')) {
    throw new Error('Invalid import file: Content contains binary null bytes.');
  }

  const maxBytes = options?.maxBytes ?? MAX_POEM_IMPORT_BYTES;
  const byteLength = new TextEncoder().encode(rawContent).length;
  if (byteLength > maxBytes) {
    throw new Error(
      `Poem file exceeds maximum allowed size (${byteLength} bytes > ${maxBytes} bytes).`
    );
  }

  const stemTitle =
    baseFileName
      .replace(/\.(txt|md|mcpoem)$/i, '')
      .replace(/[_]+/g, ' ')
      .trim() || 'Imported Poem';

  let parsedTitle = stemTitle;
  let parsedContent = '';
  let poeticForm = 'Free Verse';
  let rhymeScheme: string | undefined;
  let meter: string | undefined;
  let tags: string[] = [];
  let cipherMeta: Record<string, unknown> | undefined;

  if (ext === 'mcpoem') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error('Invalid .mcpoem file: Malformed JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid .mcpoem file: Expected a JSON object.');
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.format !== 'mcpoem') {
      throw new Error(`Invalid .mcpoem file: Expected format "mcpoem", received "${String(obj.format)}".`);
    }
    if (obj.version !== 1) {
      throw new Error(`Unsupported .mcpoem version: ${String(obj.version)}. Expected version 1.`);
    }
    if (!obj.poem || typeof obj.poem !== 'object' || Array.isArray(obj.poem)) {
      throw new Error('Invalid .mcpoem file: Missing "poem" object.');
    }
    const p = obj.poem as Record<string, unknown>;
    if (typeof p.title !== 'string' || !p.title.trim()) {
      throw new Error('Invalid .mcpoem file: Missing non-empty poem "title".');
    }
    if (p.title.length > 512) {
      throw new Error('Invalid .mcpoem file: Poem "title" exceeds 512 characters.');
    }
    if (typeof p.content !== 'string' && !Array.isArray(p.stanzas)) {
      throw new Error('Invalid .mcpoem file: Missing poem "content" or "stanzas".');
    }

    parsedTitle = p.title.trim();
    if (typeof p.content === 'string') {
      parsedContent = normalizeCipherText(p.content).replace(/\n+$/g, '');
    } else if (Array.isArray(p.stanzas)) {
      if (!p.stanzas.every(s => typeof s === 'string')) {
        throw new Error('Invalid .mcpoem file: "stanzas" must be an array of strings.');
      }
      parsedContent = (p.stanzas as string[]).join('\n\n');
    }

    if (typeof p.poetic_form === 'string' && p.poetic_form.trim()) {
      poeticForm = p.poetic_form.trim();
    }
    if (typeof p.rhyme_scheme === 'string' && p.rhyme_scheme.trim()) {
      rhymeScheme = p.rhyme_scheme.trim();
    }
    if (typeof p.meter === 'string' && p.meter.trim()) {
      meter = p.meter.trim();
    }
    if (Array.isArray(p.tags)) {
      tags = p.tags
        .filter((t): t is string => typeof t === 'string')
        .map(t => t.trim())
        .filter(Boolean);
    }
    if (p.cipher && typeof p.cipher === 'object' && !Array.isArray(p.cipher)) {
      cipherMeta = p.cipher as Record<string, unknown>;
    }
  } else if (ext === 'md') {
    const norm = normalizeCipherText(rawContent);
    const jsonFmMatch = norm.match(/^---json\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    const yamlFmMatch = !jsonFmMatch
      ? norm.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
      : null;

    if (jsonFmMatch) {
      let fm: Record<string, unknown>;
      try {
        fm = JSON.parse(jsonFmMatch[1]);
      } catch {
        throw new Error('Invalid Markdown poem frontmatter: Malformed ---json block.');
      }
      if (!fm || typeof fm !== 'object' || Array.isArray(fm)) {
        throw new Error('Invalid Markdown poem frontmatter: Expected JSON object.');
      }
      if (typeof fm.title === 'string' && fm.title.trim()) {
        parsedTitle = fm.title.trim();
      }
      if (typeof fm.poetic_form === 'string' && fm.poetic_form.trim()) {
        poeticForm = fm.poetic_form.trim();
      }
      if (typeof fm.rhyme_scheme === 'string' && fm.rhyme_scheme.trim()) {
        rhymeScheme = fm.rhyme_scheme.trim();
      }
      if (typeof fm.meter === 'string' && fm.meter.trim()) {
        meter = fm.meter.trim();
      }
      if (Array.isArray(fm.tags)) {
        tags = fm.tags
          .filter((t): t is string => typeof t === 'string')
          .map(t => t.trim())
          .filter(Boolean);
      }
      if (typeof fm.metadata_json === 'string' && fm.metadata_json.trim()) {
        try {
          const inner = JSON.parse(fm.metadata_json);
          if (inner && typeof inner === 'object') {
            if (typeof inner.poetic_form === 'string') poeticForm = inner.poetic_form;
            if (typeof inner.rhyme_scheme === 'string') rhymeScheme = inner.rhyme_scheme;
            if (typeof inner.meter === 'string') meter = inner.meter;
            if (inner.cipher && typeof inner.cipher === 'object') cipherMeta = inner.cipher;
          }
        } catch {
          // ignore non-critical inner metadata_json parse error
        }
      }
      if (fm.cipher && typeof fm.cipher === 'object' && !Array.isArray(fm.cipher)) {
        cipherMeta = fm.cipher as Record<string, unknown>;
      }
      parsedContent = jsonFmMatch[2].replace(/^\n+|\n+$/g, '');
    } else if (yamlFmMatch) {
      const yamlLines = yamlFmMatch[1].split('\n');
      for (const line of yamlLines) {
        const m = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.+)$/);
        if (m) {
          const k = m[1].trim().toLowerCase();
          const v = m[2].trim().replace(/^["']|["']$/g, '');
          if (k === 'title' && v) parsedTitle = v;
          if ((k === 'poetic_form' || k === 'form') && v) poeticForm = v;
        }
      }
      parsedContent = yamlFmMatch[2].replace(/^\n+|\n+$/g, '');
    } else {
      const headingMatch = norm.match(/^#\s+([^\n]+)\n+([\s\S]*)$/);
      if (headingMatch) {
        parsedTitle = headingMatch[1].trim();
        parsedContent = headingMatch[2].replace(/^\n+|\n+$/g, '');
      } else {
        parsedContent = norm.replace(/^\n+|\n+$/g, '');
      }
    }
  } else {
    // .txt
    parsedContent = normalizeCipherText(rawContent).replace(/^\n+|\n+$/g, '');
  }

  const finalTitle = resolveUniquePoemTitle(parsedTitle, options?.existingTitles ?? []);
  const stanzas = splitPoemStanzas(parsedContent);
  const metadataObj: Record<string, unknown> = {
    poetic_form: poeticForm,
  };
  if (rhymeScheme) metadataObj.rhyme_scheme = rhymeScheme;
  if (meter) metadataObj.meter = meter;
  if (cipherMeta) metadataObj.cipher = cipherMeta;

  return {
    title: finalTitle,
    content: parsedContent,
    stanzas,
    poetic_form: poeticForm,
    rhyme_scheme: rhymeScheme,
    meter,
    tags,
    cipher: cipherMeta,
    metadataJson: JSON.stringify(metadataObj),
    sourceFormat: ext as PoemExportFormat,
  };
}

// ============================================================================
// PART 5 — CIPHER PACKAGE SHARING (.mccipher)
// ============================================================================

export const MCCIPHER_DISCLOSURE =
  'Creative obfuscation for literary wordplay — not cryptographic encryption.';

export interface McCipherPackage {
  version: 1;
  format: 'mccipher';
  algorithm_version: '1.0';
  disclosure: string;
  created_at: string;
  poem: {
    title: string;
    encoded_text: string;
    poetic_form?: string;
    tags?: string[];
  };
  key: CipherKey;
  source_fingerprint: string;
  encoded_fingerprint: string;
}

/**
 * Create a self-contained portable .mccipher package bundling a ciphered poem and its exact Cipher Key.
 * Allows another MetaCognition Notebook user (or a fresh installation) to import and decode in one step.
 */
export function createCipherPackage(params: {
  poemTitle: string;
  encodedText: string;
  key: CipherKey;
  poeticForm?: string;
  tags?: string[];
}): McCipherPackage {
  const validatedKey = validateCipherKey(params.key, { disallowDuplicateOriginals: true });
  const normEncoded = normalizeCipherText(params.encodedText ?? '');
  if (!normEncoded.trim()) {
    throw new Error('Cannot create Cipher Package from empty poem text.');
  }

  const computedEncodedFp = computeTextFingerprint(normEncoded);
  if (
    validatedKey.encoded_fingerprint &&
    validatedKey.encoded_fingerprint !== computedEncodedFp
  ) {
    throw new Error(
      'Cannot create Cipher Package: The ciphered text fingerprint does not match the provided Cipher Key.'
    );
  }

  const baseTitle = extractBasePoemTitle(params.poemTitle);
  const sourceFp = validatedKey.source_fingerprint || '';

  const boundKey: CipherKey = {
    ...validatedKey,
    committed: true,
    encoded_fingerprint: computedEncodedFp,
    associated_poem_titles: Array.from(
      new Set([...(validatedKey.associated_poem_titles ?? []), baseTitle])
    ),
  };

  return {
    version: 1,
    format: 'mccipher',
    algorithm_version: '1.0',
    disclosure: MCCIPHER_DISCLOSURE,
    created_at: new Date().toISOString(),
    poem: {
      title: baseTitle,
      encoded_text: normEncoded,
      poetic_form: params.poeticForm?.trim() || 'Free Verse',
      tags: params.tags?.length ? params.tags : ['cipher'],
    },
    key: boundKey,
    source_fingerprint: sourceFp,
    encoded_fingerprint: computedEncodedFp,
  };
}

/**
 * Validate a loaded or imported .mccipher package (from JSON string or object).
 * Verifies schema, version, algorithm compatibility, key integrity, and encoded text fingerprint.
 */
export function validateCipherPackage(
  rawInput: unknown,
  options?: { maxBytes?: number }
): McCipherPackage {
  let data: unknown = rawInput;
  if (typeof rawInput === 'string') {
    if (rawInput.includes('\0')) {
      throw new Error('Invalid Cipher Package: File contains binary null bytes.');
    }
    const maxBytes = options?.maxBytes ?? MAX_POEM_IMPORT_BYTES;
    const byteLen = new TextEncoder().encode(rawInput).length;
    if (byteLen > maxBytes) {
      throw new Error(`Cipher Package exceeds maximum allowed size (${byteLen} > ${maxBytes} bytes).`);
    }
    try {
      data = JSON.parse(rawInput);
    } catch {
      throw new Error('Invalid Cipher Package (.mccipher): Malformed JSON.');
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid Cipher Package: Expected a JSON object.');
  }

  const pkg = data as Record<string, unknown>;
  if (pkg.format !== 'mccipher') {
    throw new Error(
      `Invalid Cipher Package format: "${String(pkg.format)}". Expected "mccipher".`
    );
  }
  if (pkg.version !== 1) {
    throw new Error(
      `Unsupported Cipher Package version: ${String(pkg.version)}. Expected version 1.`
    );
  }
  if (pkg.algorithm_version !== undefined && pkg.algorithm_version !== '1.0') {
    throw new Error(
      `Unsupported Cipher Package algorithm version: "${String(pkg.algorithm_version)}". Expected "1.0".`
    );
  }

  if (!pkg.poem || typeof pkg.poem !== 'object' || Array.isArray(pkg.poem)) {
    throw new Error('Invalid Cipher Package: Missing "poem" object.');
  }
  const poemObj = pkg.poem as Record<string, unknown>;
  if (typeof poemObj.title !== 'string' || !poemObj.title.trim()) {
    throw new Error('Invalid Cipher Package: Missing poem "title".');
  }
  if (poemObj.title.length > 512) {
    throw new Error('Invalid Cipher Package: Poem "title" exceeds 512 characters.');
  }
  if (typeof poemObj.encoded_text !== 'string' || !poemObj.encoded_text.trim()) {
    throw new Error('Invalid Cipher Package: Missing poem "encoded_text".');
  }
  if (poemObj.encoded_text.includes('\0')) {
    throw new Error('Invalid Cipher Package: Poem text contains invalid null bytes.');
  }

  const validatedKey = validateCipherKey(pkg.key, { disallowDuplicateOriginals: true });
  const normEncoded = normalizeCipherText(poemObj.encoded_text);
  const actualEncodedFp = computeTextFingerprint(normEncoded);

  if (
    typeof pkg.encoded_fingerprint === 'string' &&
    pkg.encoded_fingerprint &&
    pkg.encoded_fingerprint !== actualEncodedFp
  ) {
    throw new Error(
      'Cipher Package integrity check failed: The ciphered poem text was modified and no longer matches the package fingerprint.'
    );
  }

  if (
    validatedKey.encoded_fingerprint &&
    validatedKey.encoded_fingerprint !== actualEncodedFp
  ) {
    throw new Error(
      'Cipher Package integrity check failed: The embedded Cipher Key does not match the ciphered poem text.'
    );
  }

  const sourceFp =
    typeof pkg.source_fingerprint === 'string'
      ? pkg.source_fingerprint
      : validatedKey.source_fingerprint || '';

  return {
    version: 1,
    format: 'mccipher',
    algorithm_version: '1.0',
    disclosure:
      typeof pkg.disclosure === 'string' && pkg.disclosure.trim()
        ? pkg.disclosure.trim()
        : MCCIPHER_DISCLOSURE,
    created_at:
      typeof pkg.created_at === 'string' ? pkg.created_at : new Date().toISOString(),
    poem: {
      title: poemObj.title.trim(),
      encoded_text: normEncoded,
      poetic_form:
        typeof poemObj.poetic_form === 'string' && poemObj.poetic_form.trim()
          ? poemObj.poetic_form.trim()
          : 'Free Verse',
      tags: Array.isArray(poemObj.tags)
        ? poemObj.tags.filter((t): t is string => typeof t === 'string')
        : ['cipher'],
    },
    key: {
      ...validatedKey,
      encoded_fingerprint: actualEncodedFp,
      source_fingerprint: sourceFp || validatedKey.source_fingerprint,
    },
    source_fingerprint: sourceFp,
    encoded_fingerprint: actualEncodedFp,
  };
}

/**
 * Validate and immediately decode a portable .mccipher package in one step.
 * Can be executed in a completely fresh notebook without the sender's database.
 */
export function decodeCipherPackage(
  rawInput: unknown,
  options?: { existingTitles?: string[]; maxBytes?: number }
): {
  packageData: McCipherPackage;
  decodeResult: KeyDecodeResult;
  cipheredPoemTitle: string;
  recoveredPoemTitle: string;
} {
  const pkg = validateCipherPackage(rawInput, { maxBytes: options?.maxBytes });
  const decodeResult = decodeWithCipherKey(pkg.poem.encoded_text, pkg.key, {
    expectedKeyId: pkg.key.id,
    isMatchedKey: true,
    poemManifest: pkg.key.manifest,
  });

  if (decodeResult.fidelity === 'mismatch' || decodeResult.fidelity === 'invalid_key') {
    throw new Error(
      decodeResult.error || 'Failed to decode Cipher Package: Key mismatch.'
    );
  }

  const existing = options?.existingTitles ?? [];
  const baseTitle = extractBasePoemTitle(pkg.poem.title);
  const cipheredPoemTitle = resolveUniquePoemTitle(
    formatCipheredPoemTitle(baseTitle, pkg.key.mode || 'quick'),
    existing
  );
  const recoveredPoemTitle = resolveUniquePoemTitle(
    `${baseTitle} (Decoded)`,
    [...existing, cipheredPoemTitle]
  );

  return {
    packageData: pkg,
    decodeResult,
    cipheredPoemTitle,
    recoveredPoemTitle,
  };
}


