from pathlib import Path
p=Path('src/components/studios/PoetryStudio.tsx');s=p.read_text(encoding='utf-8')
s=s.replace("if (parsed.cipher?.scope === 'per_stanza') {", "if (parsed.cipher?.scope === 'per_stanza' || Array.isArray(parsed.cipher?.per_stanza_backup)) {")
s=s.replace('  const [metadata, setMetadata]', '  const [metadata, setMetadata]',1)
marker='  // Keep stanzas synced when switching document'
s=s.replace(marker,"  const cipherEntryField = metadata.cipher?.scope === 'per_stanza' ? 'stanzas' : 'per_stanza_backup';\n  const cipherEntries = metadata.cipher?.[cipherEntryField];\n\n"+marker)
s=s.replace("if (newMeta.cipher?.scope === 'per_stanza') {", "if (newMeta.cipher?.scope === 'per_stanza' || Array.isArray(newMeta.cipher?.per_stanza_backup)) {\n        const field = newMeta.cipher.scope === 'per_stanza' ? 'stanzas' : 'per_stanza_backup';")
s=s.replace('newMeta.cipher.stanzas?.length === newStanzas.length;', 'newMeta.cipher[field]?.length === newStanzas.length;')
s=s.replace("if (metadata.cipher?.scope === 'per_stanza' && Array.isArray(metadata.cipher?.stanzas)) {", 'if (Array.isArray(cipherEntries)) {')
s=s.replace('[...metadata.cipher.stanzas]', '[...cipherEntries]')
for operation in ['insertStanzaEntry','deleteStanzaEntry','moveStanzaEntry']:
    s=s.replace(operation+'(metadata.cipher.stanzas,',operation+'(cipherEntries,')
for variable in ['nextCipherStanzas','insertedCipherStanzas','deletedCipherStanzas','movedCipherStanzas']:
    s=s.replace('stanzas: '+variable, '[cipherEntryField]: '+variable)
s=s.replace('poemMetadataJson={document.metadata.metadata_json}', 'poemMetadataJson={JSON.stringify(metadata)}')
p.write_text(s,encoding='utf-8')
p=Path('src/components/studios/EmotionalCipherModal.tsx');s=p.read_text(encoding='utf-8')
s=s.replace("const next = currentPoemCipherMeta.scope === 'per_stanza'", "const next = currentPoemCipherMeta.scope === 'per_stanza' || Array.isArray(currentPoemCipherMeta.per_stanza_backup)")
p.write_text(s,encoding='utf-8')
