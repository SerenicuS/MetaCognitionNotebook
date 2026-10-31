from pathlib import Path
import json
records=[json.loads(line) for line in Path('scratch/rc-acceptance/remediation-discovery.jsonl').read_text(encoding='utf-8-sig').splitlines()]
summary=next(row['summary'] for row in records if 'summary' in row)
assert summary['success'] and summary['counts']['tests']==815
assert sum(row.get('tests',0) for row in records)==815
inventory='\n'.join(f"| `{row['file'].replace(chr(92), '/').split('/')[-1]}` | {row['tests']} | {row['suites']} |" for row in records if 'file' in row)
p=Path('docs/v0.8.0-release-candidate-acceptance.md');s=p.read_text(encoding='utf-8')
s=s.replace('812','815').replace('**27 counted tests**','**30 counted tests**').replace('**27 tests**','**30 tests**').replace('**110/110**','**113/113**').replace('297 top-level entries','300 top-level entries')
s=s.replace('Poetry Studio reopens metadata with unresolved records intact and uses known editor order for add/delete/up/down operations.', 'Poetry Studio reopens metadata with unresolved records intact and uses known editor order for add/delete/up/down operations in both scopes, updating the authoritative per-stanza backup during Whole Poem edits. The modal receives the latest local editor metadata rather than an older acknowledged document snapshot. Exact metadata snapshots retain inserted empty stanza slots without prose markers, and reconciliation/package decoding preserve verse indentation.')
s=s.replace('conflict-safe reassignment.', 'conflict-safe reassignment, Whole Poem duplicate-refrain reordering, empty-slot package/restart identity and verse indentation.')
s=s.replace('| NPM_EXIT | NPM_RESULT;', '| 0 | **815/815**, 48 suites;')
s=s.replace('| DOC_EXIT | DOC_RESULT;', '| 0 | **Local Markdown links/anchors, seven version locations and full explicit test inventory verified**;')
a=s.index('| Test file (under `tests/`) | Tests | Suites |')
b=s.index('\n## 7.',a)
s=s[:a]+'| Test file (under `tests/`) | Tests | Suites |\n| --- | ---: | ---: |\n'+inventory+'\n'+s[b:]
p.write_text(s,encoding='utf-8')
p=Path('docs/living-entity-states-acceptance-report.md');s=p.read_text(encoding='utf-8').replace('812 frontend tests','815 frontend tests');p.write_text(s,encoding='utf-8')
