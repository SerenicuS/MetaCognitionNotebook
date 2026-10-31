from pathlib import Path
p=Path('src/components/studios/EmotionalCipherModal.tsx')
s=p.read_text(encoding='utf-8')
s=s.replace('  reconcileStanzaEntries,','  reconcileStanzaEntries,\n  reconcilePoemCipherMetadata,\n  cipherMetadataFromKey,\n  withCipherRecovery,')
a=s.index('  // Synchronize cipher metadata when poem metadata is provided or changes')
b=s.index('  // Frequency analysis on current poem',a)
s=s[:a]+'''  // Hydrate all editing state together; reconciliation must retain uncertain mappings.
  useEffect(() => {
    if (currentPoemCipherMeta) {
      const next = currentPoemCipherMeta.scope === 'per_stanza'
        ? reconcilePoemCipherMetadata(poemContent, currentPoemCipherMeta) : currentPoemCipherMeta;
      setCipherScope(next.scope ?? 'whole_poem');
      setStanzaEntries(next.stanzas ?? []);
      setUnresolvedStanzas(next.unresolved_stanzas ?? []);
      setWholePoemBackup(next.whole_poem_backup);
      setPerStanzaBackup(next.per_stanza_backup);
      if (next.mappings) setMappings(next.mappings);
    } else {
      setStanzaEntries(prev => {
        const result = reconcileStanzaEntries(poemStanzas, prev);
        if (result.unresolved.length) setUnresolvedStanzas(cur => [...cur,
          ...result.unresolved.filter(entry => !cur.some(old => old.id === entry.id))]);
        return result.reconciled;
      });
    }
  }, [currentPoemCipherMeta, poemContent, poemStanzas]);

''' + s[b:]
s=s.replace("  const effectiveManualKey = cipherScope === 'per_stanza' ? perStanzaManualKey : manualKeyAndResult.key;",'''  const effectiveManualKey = withCipherRecovery(
    cipherScope === 'per_stanza' ? perStanzaManualKey : { ...manualKeyAndResult.key, scope: 'whole_poem' },
    { recovery_version: 1, whole_poem_backup: wholePoemBackup, per_stanza_backup: perStanzaBackup,
      unresolved_stanzas: unresolvedStanzas, stanza_snapshot: computeTextFingerprint(poemContent) });''')
# Each stanza's exact manifest and fingerprints are necessary on new-file reopen and decoding collisions.
s=s.replace('      stanzas: stanzaEntries,\n    };\n  }, [','''      stanzas: stanzaEntries.map((entry, index) => ({ ...entry,
        manifest: stanzaEncodeResult.stanzaResults[index]?.manifest,
        source_fingerprint: stanzaEncodeResult.stanzaResults[index]?.sourceFingerprint,
        encoded_fingerprint: stanzaEncodeResult.stanzaResults[index]?.encodedFingerprint })),
    };
  }, [''',1)
s=s.replace('      if (!selectedDictId && list.length > 0) {','''      if (!selectedDictId && bestDecodeKey && currentPoemCipherMeta) {
        setSelectedDictId(bestDecodeKey.id);
        setDictName(bestDecodeKey.name);
        if (!currentPoemCipherMeta.mappings) setMappings(bestDecodeKey.mappings);
      } else if (!selectedDictId && !currentPoemCipherMeta && list.length > 0) {''')
# Explicit key selection imports its extension rather than flattening stanza-local rules.
s=s.replace('    setSelectedDictId(dict.id);\n    setDictName(dict.name);','''    setSelectedDictId(dict.id);
    setCipherScope(dict.scope ?? 'whole_poem');
    const next = cipherMetadataFromKey(dict, poemContent);
    // A reusable key is not evidence of identity in unrelated text.
    const reconciled = dict.scope === 'per_stanza'
      ? reconcilePoemCipherMetadata(poemContent, { ...next, stanza_snapshot: dict.encoded_fingerprint === computeTextFingerprint(poemContent)
        ? next.stanza_snapshot : undefined }) : next;
    setStanzaEntries(reconciled.stanzas ?? []);
    setWholePoemBackup(reconciled.whole_poem_backup);
    setPerStanzaBackup(reconciled.per_stanza_backup);
    setUnresolvedStanzas(reconciled.unresolved_stanzas ?? []);
    setDictName(dict.name);''')
# Preserve the entire supported extension in imported decoded and encoded documents.
s=s.replace("            cipher: {\n              mode: 'decoded',", "            cipher: {\n              ...cipherMetadataFromKey(savedKey, decodedPkg.decodeResult.decodedText),\n              mode: 'decoded',",1)
s=s.replace("            cipher: {\n              mode: savedKey.mode || 'quick',", "            cipher: {\n              ...cipherMetadataFromKey(savedKey, pkg.poem.encoded_text),\n              mode: savedKey.mode || 'quick',",1)
a=s.index('  // Import portable .mccipher package')
b=s.index('  const handleImportKeyFile',a)
s=s[:a]+s[a:b].replace("algorithm_version: '1.0',",'algorithm_version: pkg.algorithm_version,')+s[b:]
s=s.replace('    const backupEntry = perStanzaBackup?.find(s => s.id === curStz.id || s.index === curStz.index);','    const backupEntry = perStanzaBackup?.find(s => s.id === curStz.id);')
s=s.replace("          scope: 'whole_poem',\n          mappings,", "          scope: 'whole_poem',\n          stanza_snapshot: currentPoemCipherMeta?.stanza_snapshot,\n          unresolved_stanzas: unresolvedStanzas,\n          mappings,")
s=s.replace("      setCipherScope('per_stanza');\n      if (result.nextMeta.stanzas)","      setCipherScope('per_stanza');\n      setUnresolvedStanzas(result.nextMeta.unresolved_stanzas ?? []);\n      if (result.nextMeta.stanzas)")
s=s.replace("showToast('Switched to Per-Stanza mode. Global rules copied to all stanzas.');", "showToast('Switched to Per-Stanza mode. Saved stanza rules restored when available; uncertain rules retained for recovery.');")
s=s.replace("const keyToCommit = cipherScope === 'per_stanza' ? perStanzaManualKey : manualKeyAndResult.key;",'const keyToCommit = effectiveManualKey;')
a=s.index('        cipherMeta = {',s.index("} else if (mode === 'manual')"))
b=s.index('\n      } else {',a)
s=s[:a]+'''        cipherMeta = { ...cipherMetadataFromKey(committedKey, targetContent) };''' + s[b:]
# Decoded save keeps the matching key's recovery data too.
s=s.replace("        cipherMeta = {\n          mode: 'decoded',", "        cipherMeta = {\n          ...(selectedDecodeKey ? cipherMetadataFromKey(selectedDecodeKey, targetContent) : {}),\n          mode: 'decoded',")
p.write_text(s,encoding='utf-8')
