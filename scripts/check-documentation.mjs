// Local documentation audit only; no network access or notebook operations.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const files = ['README.md', 'SYSTEM_DESIGN.md', ...readdirSync(resolve(root, 'docs'))
  .filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
const prose = text => text.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
function anchors(text) {
  const counts = new Map();
  return new Set([...prose(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map(([, heading]) => {
    const slug = heading.toLowerCase().replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  }));
}
let links = 0;
const errors = [];
for (const file of files) {
  const text = prose(read(file));
  if (/file:\/\/\//i.test(text)) errors.push(`${file}: machine-specific file URI`);
  for (const [, raw] of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = raw.replace(/^<|>$/g, '');
    if (/^(https?:|mailto:)/i.test(target)) continue;
    links++;
    const [path, fragment] = target.split('#');
    const destination = path ? resolve(root, dirname(file), decodeURIComponent(path)) : resolve(root, file);
    if (!existsSync(destination)) {
      errors.push(`${file}: missing ${target}`);
    } else if (fragment && extname(destination) === '.md' &&
        !anchors(readFileSync(destination, 'utf8')).has(decodeURIComponent(fragment))) {
      errors.push(`${file}: missing heading ${target}`);
    }
    if (!relative(root, destination).startsWith('..')) continue;
    errors.push(`${file}: link escapes repository: ${target}`);
  }
}
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargoVersion = read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1];
const cargoLockVersion = read('Cargo.lock')
  .match(/name = "meta-cognition-notebook"\r?\nversion = "([^"]+)"/)?.[1];
const footer = read('src/components/common/SettingsModal.tsx');
const footerMatch = footer.match(/MetaCognition Notebook v([\d.]+) Beta (\d+)/);
const footerVersion = footerMatch ? `${footerMatch[1]}-beta.${footerMatch[2]}` : undefined;
for (const version of [pkg.version, lock.version, lock.packages[''].version, tauri.version,
  cargoVersion, cargoLockVersion, footerVersion]) assert.equal(version, '0.8.0-beta.4');
for (const path of ['README.md', 'SYSTEM_DESIGN.md', 'docs/ROADMAP.md']) {
  assert.ok(read(path).includes('v0.8.0-beta.4'), path);
}
const testFiles = readdirSync(resolve(root, 'tests')).filter(name => name.endsWith('.test.ts'));
const listedTests = [...pkg.scripts.test.matchAll(/tests\/([^ ]+\.test\.ts)/g)].map(match => match[1]);
assert.equal(new Set(listedTests).size, listedTests.length, 'duplicate test inventory entry');
assert.deepEqual([...listedTests].sort(), testFiles.sort(), 'explicit npm test inventory must discover every test file');
assert.equal(pkg.scripts.dev, 'vite');
assert.equal(pkg.scripts.build, 'tsc && vite build');
assert.equal(pkg.scripts.tauri, 'tauri');
assert.ok(pkg.scripts.test.startsWith('tsx --test '));
assert.ok(read('LICENSE').startsWith('MIT License'));
if (errors.length) {
  errors.forEach(error => console.error(error));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${files.length} Markdown files, ${links} local links/anchors, 7 version locations, package commands and MIT license.`);
  console.log('External URLs and native/manual interaction were not checked.');
}
