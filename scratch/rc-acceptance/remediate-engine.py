from pathlib import Path
p = Path('src/utils/emotionalCipher.ts')
s = p.read_text(encoding='utf-8')
a = s.index('  const cleanStanzas: StanzaCipherEntry[] | undefined = Array.isArray(d.stanzas)')
b = s.index('  // Validate rather than coerce stanza/recovery data', a)
s = s[:a] + s[b:]
s = s.replace('stanzas: validatedStanzas ?? cleanStanzas,', 'stanzas: validatedStanzas,')
a = s.index('/**\n * Reconcile parsed stanzas from text')
b = s.index('/**\n * Move a stanza entry', a)
s = s[:a] + '''/** Evidence must come from a coordinated editor operation or an exact saved text snapshot. */
export interface StanzaIdentityEvidence {
  stanzaIds: Array<string | null>;
}

/** Never infer identity from equal counts or proximity. Ambiguous rules remain recoverable. */
export function reconcileStanzaEntries(
  parsedStanzas: string[],
  currentEntries: StanzaCipherEntry[],
  evidence?: StanzaIdentityEvidence
): { reconciled: StanzaCipherEntry[]; unresolved: StanzaCipherEntry[] } {
  const assigned: Array<StanzaCipherEntry | undefined> = parsedStanzas.map(() => undefined);
  const used = new Set<StanzaCipherEntry>();
  const byId = new Map<string, StanzaCipherEntry[]>();
  const fingerprints = (entry: StanzaCipherEntry) => new Set(
    [entry.content_fingerprint, entry.encoded_fingerprint, entry.source_fingerprint].filter(Boolean));
  for (const entry of currentEntries) byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
  const assign = (index: number, entry: StanzaCipherEntry) => {
    assigned[index] = { ...cloneCipherValue(entry), index,
      content_fingerprint: computeTextFingerprint(parsedStanzas[index]),
      line_preview: extractLinePreview(parsedStanzas[index]) };
    used.add(entry);
  };
  // Explicit IDs resolve duplicate refrains and coordinated edits. Duplicated evidence is invalid.
  parsedStanzas.forEach((_, index) => {
    const id = evidence?.stanzaIds[index];
    const candidates = id ? byId.get(id) : undefined;
    if (id && candidates?.length === 1 && evidence!.stanzaIds.filter(x => x === id).length === 1) {
      assign(index, candidates[0]);
    }
  });
  // Both sides must be unique. Repeated identical verses cannot be distinguished without IDs.
  parsedStanzas.forEach((text, index) => {
    if (assigned[index]) return;
    const fp = computeTextFingerprint(text);
    const targets = parsedStanzas.filter((other, i) => !assigned[i] && computeTextFingerprint(other) === fp);
    const candidates = currentEntries.filter(entry => !used.has(entry) && fingerprints(entry).has(fp) &&
      byId.get(entry.id)?.length === 1);
    if (targets.length === 1 && candidates.length === 1) assign(index, candidates[0]);
  });
  return {
    reconciled: parsedStanzas.length ? parsedStanzas.map((text, index) => assigned[index] ?? {
      id: createStanzaId(), index, content_fingerprint: computeTextFingerprint(text),
      line_preview: extractLinePreview(text), mappings: [],
    }) : [{ id: createStanzaId(), index: 0, mappings: [] }],
    unresolved: currentEntries.filter(entry => !used.has(entry)).map(cloneCipherValue),
  };
}

/** Reopen a saved poem without dropping uncertain entries returned by reconciliation. */
export function reconcilePoemCipherMetadata(content: string, meta: PoemCipherMetadata): PoemCipherMetadata {
  const text = splitPoemStanzas(content);
  const entries = meta.stanzas ?? [];
  const evidence = meta.stanza_snapshot === computeTextFingerprint(content) && entries.length === text.length
    ? { stanzaIds: entries.map(e => e.id) } : undefined;
  const result = reconcileStanzaEntries(text, entries, evidence);
  return { ...cloneCipherValue(meta), stanzas: result.reconciled,
    stanza_snapshot: computeTextFingerprint(content),
    unresolved_stanzas: collectUnresolved(meta.unresolved_stanzas, result.unresolved) };
}

function collectUnresolved(...groups: Array<StanzaCipherEntry[] | undefined>): StanzaCipherEntry[] {
  const result: StanzaCipherEntry[] = [];
  for (const entry of groups.flatMap(group => group ?? [])) {
    if (!result.some(e => JSON.stringify(e) === JSON.stringify(entry))) result.push(cloneCipherValue(entry));
  }
  return result;
}

''' + s[b:]
a = s.index('/**\n * Merge two adjacent stanza entries')
b = s.index('/**\n * Reversibly switch', a)
s = s[:a] + '''export interface StanzaMergeResult {
  entries: StanzaCipherEntry[];
  unresolved: StanzaCipherEntry[];
  conflicts: StanzaConflictReport | null;
  merged: boolean;
}

/** A conflicting merge is a proposal: no authoritative merge occurs until every choice is explicit. */
export function mergeStanzaEntries(
  entries: StanzaCipherEntry[], firstIndex: number,
  choices?: Record<string, string>
): StanzaMergeResult {
  if (firstIndex < 0 || firstIndex >= entries.length - 1) {
    return { entries: cloneCipherValue(entries), unresolved: [], conflicts: null, merged: false };
  }
  const pair = entries.slice(firstIndex, firstIndex + 2);
  const meta: PoemCipherMetadata = { scope: 'per_stanza', stanzas: pair };
  const proposed = switchCipherScope(meta, 'whole_poem', []);
  const conflicts = proposed.conflicts;
  if (conflicts && !choices) {
    return { entries: cloneCipherValue(entries), unresolved: cloneCipherValue(pair), conflicts, merged: false };
  }
  const resolved = conflicts ? resolveScopeConflictsAndSwitch(meta, choices!) : proposed.nextMeta;
  const next = cloneCipherValue(entries);
  // Text fingerprints/manifests no longer describe the merged verse; the caller binds the new text.
  next.splice(firstIndex, 2, { id: pair[0].id, index: firstIndex, mappings: resolved.mappings ?? [] });
  return { entries: next.map((e, index) => ({ ...e, index })),
    unresolved: cloneCipherValue(pair), conflicts: null, merged: true };
}

''' + s[b:]
a = s.index('    const existingStanzaEntries = currentMeta?.stanzas || [];')
b = s.index('    const nextMeta: PoemCipherMetadata = {', a)
s = s[:a] + '''    // A persisted backup is authoritative, even when it contains empty mappings.
    const existing = currentMeta?.per_stanza_backup ?? currentMeta?.stanzas;
    const snapshotMatches = currentMeta?.stanza_snapshot === computeTextFingerprint(serializePoemStanzas(stanzas));
    const result = existing ? reconcileStanzaEntries(stanzas, existing,
      snapshotMatches && existing.length === stanzas.length ? { stanzaIds: existing.map(e => e.id) } : undefined) : null;
    const stanzaEntries = result?.reconciled ?? stanzas.map((text, index) => ({
      id: createStanzaId(), index, content_fingerprint: computeTextFingerprint(text),
      line_preview: extractLinePreview(text), mappings: cloneCipherValue(globalMappings),
    }));

''' + s[b:]
s = s.replace('      stanzas: stanzaEntries,\n      whole_poem_backup:', '''      stanzas: stanzaEntries,
      stanza_snapshot: computeTextFingerprint(serializePoemStanzas(stanzas)),
      unresolved_stanzas: collectUnresolved(currentMeta?.unresolved_stanzas, result?.unresolved),
      whole_poem_backup:''')
s = s.replace('      per_stanza_backup: stanzaEntries,', '      per_stanza_backup: cloneCipherValue(stanzaEntries),')
s = s.replace('    per_stanza_backup: stanzaEntries,', '    per_stanza_backup: cloneCipherValue(stanzaEntries),')
a = s.index('  const stanzaEntries = currentMeta?.stanzas || [];', s.index('export function resolveScopeConflictsAndSwitch'))
s = s[:a] + '''  const proposal = switchCipherScope(currentMeta, 'whole_poem', _stanzas ?? []);
  for (const conflict of proposal.conflicts?.conflictingWords ?? []) {
    const choice = authorChoices[conflict.original];
    if (!choice?.trim() || !conflict.replacements.some(r => r.replacement === choice.trim())) {
      throw new Error(`Explicit resolution required for "${conflict.original}".`);
    }
  }
''' + s[a:]
# Only the package validator's return previously hardcoded algorithm 1.0.
a = s.index('export function validateCipherPackage')
b = s.index('export function decodeCipherPackage', a)
piece = s[a:b].replace("algorithm_version: '1.0',", "algorithm_version: pkg.algorithm_version === '2.0' || (pkg.algorithm_version === undefined && validatedKey.algorithm_version === '2.0') ? '2.0' : '1.0',")
s = s[:a] + piece + s[b:]
p.write_text(s, encoding='utf-8')
