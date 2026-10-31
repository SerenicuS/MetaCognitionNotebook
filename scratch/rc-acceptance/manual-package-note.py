from pathlib import Path
p=Path('src/help/manual.ts');s=p.read_text(encoding='utf-8')
a=s.index("id:'poem-files'");b=s.index('\n',a);line=s[a:b];pos=line.index('tags:')
line=line[:pos]+"notes:[{title:'Package responsibilities',text:'The optional recovery-version-1 key extension preserves supported cipher scope backups and unresolved mappings across current TypeScript and Rust import/export. Unsupported recovery versions are rejected. A .mckey is decoding data, a .mccipher bundles encoded text and key, and .mcpoem preserves complete supported poem editing state. Portable Universe (.mcuniverse) exports Lorebook content and excludes Poetry and Philosophy even when they carry a Universe ID. Use Vault for whole-notebook recovery.'}],"+line[pos:]
s=s[:a]+line+s[b:];p.write_text(s,encoding='utf-8')
