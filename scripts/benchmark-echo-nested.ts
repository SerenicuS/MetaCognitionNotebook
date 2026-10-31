import { performance } from 'node:perf_hooks';
import { buildEchoCatalog } from '../src/utils/echoContext';
import { matchEchoText } from '../src/utils/echoMatching';
import { emptyPlan } from '../src/utils/thought';
import { loreDoc, house } from '../tests/fixtures/lorebookNavigation';

// In-memory only. No canonical notebooks, persistence, timing assertions, or neighbor reads.
const rows = [];
for (const size of [100, 1000, 10000]) {
  const plan = emptyPlan(); plan.universes = [{ id: 'u', name: 'Benchmark' }];
  const documents = Array.from({ length: size }, (_, i) => loreDoc(`e-${i}`, { universe_id: 'u', entry_type: 'character', character_fields: { aliases: [`Long alias for entity number ${i}`] } }, { title: `Entity ${i}` }));
  plan.entities = documents.map(d => ({ id: d.id, universe_id: 'u' }));
  const begin = performance.now();
  const catalog = buildEchoCatalog(documents, 'u', 'house-default', plan, [house('house-default', 'Benchmark', ['u'])]);
  const built = performance.now();
  console.log(`${size}: index built in ${(built - begin).toFixed(2)}ms`);
  const prose = (`Entity 0 met Entity ${size - 1} and Long alias for entity number ${Math.floor(size / 2)}. Ordinary prose continues here.\n`).repeat(2500);
  const matches = matchEchoText(prose, catalog.index);
  const cold = performance.now();
  console.log(`${size}: cold scan ${(cold - built).toFixed(2)}ms`);
  matchEchoText(prose, catalog.index);
  const warm = performance.now();
  console.log(`Benchmarking ${size} entities complete`);
  rows.push({ entities: size, words: prose.trim().split(/\s+/).length, characters: prose.length, matches: matches.length, catalogMs: +(built - begin).toFixed(2), coldMatchMs: +(cold - built).toFixed(2), warmMatchMs: +(warm - cold).toFixed(2) });
}
console.table(rows);
