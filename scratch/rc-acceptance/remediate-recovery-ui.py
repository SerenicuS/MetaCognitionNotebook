from pathlib import Path
p=Path('src/components/studios/EmotionalCipherModal.tsx')
s=p.read_text(encoding='utf-8').replace('  withCipherRecovery,','  withCipherRecovery,\n  reassignUnresolvedMappings,')
a=s.index('  const handleReassignUnresolvedToActive = () => {')
b=s.index('  const handleToggleScope',a)
s=s[:a]+'''  const handleReassignUnresolvedToActive = () => {
    const target = cipherScope === 'per_stanza' ? stanzaEntries[activeStanzaIndex] : undefined;
    if (cipherScope === 'per_stanza' && !target) return;
    const result = reassignUnresolvedMappings(target?.mappings ?? mappings, unresolvedStanzas);
    if (target) {
      setStanzaEntries(prev => prev.map(entry => entry.id === target.id ? { ...entry, mappings: result.mappings } : entry));
    } else setMappings(result.mappings);
    setUnresolvedStanzas(result.unresolved);
    showToast(result.unresolved.length ? 'Non-conflicting rules reassigned. Conflicting rules remain in recovery.' : 'Recovered rules reassigned.');
  };

'''+s[b:]
p.write_text(s,encoding='utf-8')
