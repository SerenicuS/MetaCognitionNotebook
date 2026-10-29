import rules from '../../resources/lore-template-prose.json';

/** Same exact, heading-specific factory rules consumed by Rust publication. Projection only. */
export function suppressTemplateProse(prose: string, entryType: string, universe: string): string {
  const singular = (rules.singular as Record<string, string>)[entryType] || entryType;
  const names = [singular, ...((rules.singular_aliases as Record<string, string[]>)[entryType] || [])];
  const overview = names.flatMap(name => rules.overview_patterns.map(pattern => pattern.replace('{entry_type}', entryType).replace('{singular}', name).replace('{universe}', universe)));
  const output: string[] = [];
  let section: string[] = [];
  const flush = () => {
    if (!section.length) return;
    const heading = section[0].trim();
    const body = section.slice(1).join('\n').trim();
    const placeholder = (heading === '### Overview' && overview.includes(body)) ||
      (heading === '### Historical Lore' && body === rules.historical_lore);
    if (!['### Overview', '### Historical Lore'].includes(heading) || (body && !placeholder)) output.push(section.join('\n'));
    section = [];
  };
  for (const line of prose.split(/\r?\n/)) {
    if (line.startsWith('#') && section.length) flush();
    section.push(line);
  }
  flush();
  return output.join('\n').trim();
}
