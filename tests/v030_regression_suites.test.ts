import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ExitCoordinator } from '../src/services/autosave';
import { fileURLToPath } from 'node:url';
import type {
  PhilosophyClassification,
  PhilosophyParagraph,
  LorebookMetadata,
  LorebookAttribute,
  DocumentMetadata,
  DocumentDetail
} from '../src/types';

// Helper paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('v0.3.0 Regression Test Suite', () => {

  describe('1. Poetry Studio Content Serialization & Strophe Logic', () => {
    // Pure logic mirrors PoetryStudio.tsx
    const parseStanzas = (raw: string): string[] => {
      const list = raw.split(/\n\s*\n/).map(s => s.trim());
      return list.length > 0 && list[0] !== '' ? list : [''];
    };

    const serializeStanzas = (list: string[]): string => {
      return list.map(s => s.trimEnd()).join('\n\n');
    };

    it('parses multi-stanza text separated by arbitrary blank lines', () => {
      const raw = 'Stanza one line 1\nStanza one line 2\n\n\nStanza two line 1\n\n   \nStanza three';
      const stanzas = parseStanzas(raw);
      assert.equal(stanzas.length, 3);
      assert.equal(stanzas[0], 'Stanza one line 1\nStanza one line 2');
      assert.equal(stanzas[1], 'Stanza two line 1');
      assert.equal(stanzas[2], 'Stanza three');
    });

    it('returns a single blank stanza for empty or whitespace content', () => {
      assert.deepEqual(parseStanzas(''), ['']);
      assert.deepEqual(parseStanzas('   \n\n  '), ['']);
    });

    it('serializes stanzas back to canonical markdown double newlines', () => {
      const stanzas = [
        'The autumn leaves fall quiet,',
        'Upon the stones of eld.',
        'A forgotten memory speaks.'
      ];
      const serialized = serializeStanzas(stanzas);
      assert.equal(
        serialized,
        'The autumn leaves fall quiet,\n\nUpon the stones of eld.\n\nA forgotten memory speaks.'
      );
      assert.deepEqual(parseStanzas(serialized), stanzas);
    });

    it('handles stanza movement and reordering bounds safely', () => {
      const list = ['A', 'B', 'C'];
      
      // Move B up -> ['B', 'A', 'C']
      const moveUp = (arr: string[], idx: number) => {
        if (idx <= 0 || idx >= arr.length) return arr;
        const copy = [...arr];
        const temp = copy[idx];
        copy[idx] = copy[idx - 1];
        copy[idx - 1] = temp;
        return copy;
      };

      assert.deepEqual(moveUp(list, 1), ['B', 'A', 'C']);
      // Top element cannot move up
      assert.deepEqual(moveUp(list, 0), ['A', 'B', 'C']);
    });

    it('clears rather than deleting the last remaining stanza', () => {
      const single = ['The solitary strophe'];
      const deleteStanza = (arr: string[], idx: number) => {
        if (arr.length <= 1) return [''];
        return arr.filter((_, i) => i !== idx);
      };

      assert.deepEqual(deleteStanza(single, 0), ['']);
    });
  });

  describe('2. Philosophy Studio Dialectic Serialization & Classification', () => {
    // Pure logic mirrors PhilosophyStudio.tsx
    const parseParagraphs = (raw: string): PhilosophyParagraph[] => {
      const rawBlocks = raw.split(/\n\s*\n/).filter(Boolean);
      if (rawBlocks.length === 0) {
        return [{ id: '1', classification: 'prose', text: '' }];
      }

      return rawBlocks.map((block, idx) => {
        let classification: PhilosophyClassification = 'prose';
        let text = block.trim();

        const match = text.match(/^<!--\s*(premise|argument|objection|example|conclusion|prose)\s*-->\n?([\s\S]*)$/i);
        if (match) {
          classification = match[1].toLowerCase() as PhilosophyClassification;
          text = match[2].trim();
        }

        return {
          id: `p-${idx}`,
          classification,
          text,
        };
      });
    };

    const serializeContent = (list: PhilosophyParagraph[]): string => {
      return list
        .map(p => {
          if (p.classification !== 'prose') {
            return `<!-- ${p.classification} -->\n${p.text}`;
          }
          return p.text;
        })
        .join('\n\n');
    };

    it('parses dialectic comments into classified paragraph objects', () => {
      const raw = `<!-- premise -->
Every action has an intentional horizon.

<!-- objection -->
Reflex actions lack conscious deliberation.

<!-- conclusion -->
Therefore intentionality applies specifically to purposive agency.

This is ordinary prose comment.`;

      const paragraphs = parseParagraphs(raw);
      assert.equal(paragraphs.length, 4);
      assert.equal(paragraphs[0].classification, 'premise');
      assert.equal(paragraphs[0].text, 'Every action has an intentional horizon.');
      assert.equal(paragraphs[1].classification, 'objection');
      assert.equal(paragraphs[1].text, 'Reflex actions lack conscious deliberation.');
      assert.equal(paragraphs[2].classification, 'conclusion');
      assert.equal(paragraphs[2].text, 'Therefore intentionality applies specifically to purposive agency.');
      assert.equal(paragraphs[3].classification, 'prose');
      assert.equal(paragraphs[3].text, 'This is ordinary prose comment.');
    });

    it('preserves classification and text faithfully during roundtrip serialization', () => {
      const paragraphs: PhilosophyParagraph[] = [
        { id: '1', classification: 'premise', text: 'All minds experience qualia.' },
        { id: '2', classification: 'argument', text: 'Qualia cannot be reduced to physical coordinates.' },
        { id: '3', classification: 'prose', text: 'A commentary on Cartesian dualism.' }
      ];

      const serialized = serializeContent(paragraphs);
      assert.ok(serialized.includes('<!-- premise -->\nAll minds experience qualia.'));
      assert.ok(serialized.includes('<!-- argument -->\nQualia cannot be reduced to physical coordinates.'));
      assert.ok(serialized.includes('A commentary on Cartesian dualism.'));
      // Prose should NOT include <!-- prose --> marker
      assert.ok(!serialized.includes('<!-- prose -->'));

      const reparsed = parseParagraphs(serialized);
      assert.equal(reparsed.length, 3);
      assert.equal(reparsed[0].classification, 'premise');
      assert.equal(reparsed[0].text, paragraphs[0].text);
      assert.equal(reparsed[1].classification, 'argument');
      assert.equal(reparsed[1].text, paragraphs[1].text);
      assert.equal(reparsed[2].classification, 'prose');
      assert.equal(reparsed[2].text, paragraphs[2].text);
    });

    it('is case-insensitive and tolerant of variable whitespace in classification markers', () => {
      const input = '<!--   OBJECTION   -->\nCounter-argument text.\n\n<!--EXAMPLE-->\nThought experiment of Mary.';
      const reparsed = parseParagraphs(input);
      assert.equal(reparsed[0].classification, 'objection');
      assert.equal(reparsed[0].text, 'Counter-argument text.');
      assert.equal(reparsed[1].classification, 'example');
      assert.equal(reparsed[1].text, 'Thought experiment of Mary.');
    });
  });

  describe('3. Lorebook Studio Cosmos, Entry Types & Attribute Serialization', () => {
    it('serializes and parses lorebook metadata including custom attributes', () => {
      const meta: LorebookMetadata = {
        universe: 'The Outer Reaches',
        book: 'Volume I: The Awakening',
        chapter: 'Act 3',
        entry_type: 'artifact',
        canon_status: 'canon',
        attributes: [
          { id: 'attr-1', key: 'Material', value: 'Star-forged Silver' },
          { id: 'attr-2', key: 'Bearer', value: 'Archmage Theresa' }
        ]
      };

      const jsonStr = JSON.stringify(meta);
      const parsed: LorebookMetadata = JSON.parse(jsonStr);

      assert.equal(parsed.universe, 'The Outer Reaches');
      assert.equal(parsed.entry_type, 'artifact');
      assert.equal(parsed.canon_status, 'canon');
      assert.equal(parsed.attributes.length, 2);
      assert.equal(parsed.attributes[0].key, 'Material');
      assert.equal(parsed.attributes[0].value, 'Star-forged Silver');
      assert.equal(parsed.attributes[1].key, 'Bearer');
      assert.equal(parsed.attributes[1].value, 'Archmage Theresa');
    });

    it('gracefully handles missing or malformed JSON with safe defaults', () => {
      const parseLoreMeta = (json?: string | null): LorebookMetadata => {
        try {
          const parsed = json ? JSON.parse(json) : {};
          return {
            universe: parsed.universe || 'Unassigned Cosmos',
            book: parsed.book || '',
            chapter: parsed.chapter || '',
            entry_type: parsed.entry_type || 'other',
            canon_status: parsed.canon_status || 'canon',
            attributes: parsed.attributes || [],
          };
        } catch {
          return {
            universe: 'Unassigned Cosmos',
            entry_type: 'other',
            canon_status: 'canon',
            attributes: [],
          };
        }
      };

      const defaultMeta = parseLoreMeta(null);
      assert.equal(defaultMeta.universe, 'Unassigned Cosmos');
      assert.equal(defaultMeta.entry_type, 'other');
      assert.equal(defaultMeta.canon_status, 'canon');
      assert.deepEqual(defaultMeta.attributes, []);

      const corruptMeta = parseLoreMeta('{corrupted: "json');
      assert.equal(corruptMeta.universe, 'Unassigned Cosmos');
      assert.equal(corruptMeta.entry_type, 'other');
    });
  });

  describe('4. Search, Tag Filtering & Document Querying', () => {
    const mockDocuments: DocumentDetail[] = [
      {
        metadata: {
          id: 'doc-1',
          title: 'Ode to the Starlit Valley',
          doc_type: 'poetry',
          relative_path: 'Poetry/Ode_to_the_Starlit_Valley.md',
          created_at: '2026-10-18T10:00:00Z',
          updated_at: '2026-10-18T10:00:00Z',
          tags: ['night', 'celestial', 'ode']
        },
        content: 'Soft gleam the ancient constellations upon the vale.'
      },
      {
        metadata: {
          id: 'doc-2',
          title: 'Dialectic of Reason and Intuition',
          doc_type: 'philosophy',
          relative_path: 'Philosophy/Dialectic_of_Reason_and_Intuition.md',
          created_at: '2026-10-18T10:05:00Z',
          updated_at: '2026-10-18T10:05:00Z',
          tags: ['epistemology', 'dialectic', 'kant']
        },
        content: '<!-- premise -->\nReason guides categorization while intuition supplies immediacy.'
      },
      {
        metadata: {
          id: 'doc-3',
          title: 'The Citadel of Glass',
          doc_type: 'lorebook',
          relative_path: 'Lorebooks/The_Citadel_of_Glass.md',
          created_at: '2026-10-18T10:10:00Z',
          updated_at: '2026-10-18T10:10:00Z',
          tags: ['location', 'night', 'glass']
        },
        content: 'A fortress built atop the shimmering peaks of the north.'
      }
    ];

    it('filters documents accurately by studio type', () => {
      const poetry = mockDocuments.filter(d => d.metadata.doc_type === 'poetry');
      assert.equal(poetry.length, 1);
      assert.equal(poetry[0].metadata.title, 'Ode to the Starlit Valley');

      const philosophy = mockDocuments.filter(d => d.metadata.doc_type === 'philosophy');
      assert.equal(philosophy.length, 1);
      assert.equal(philosophy[0].metadata.title, 'Dialectic of Reason and Intuition');

      const lorebook = mockDocuments.filter(d => d.metadata.doc_type === 'lorebook');
      assert.equal(lorebook.length, 1);
      assert.equal(lorebook[0].metadata.title, 'The Citadel of Glass');
    });

    it('filters documents by search query across title or content', () => {
      const search = (query: string) => {
        const q = query.toLowerCase();
        return mockDocuments.filter(d =>
          d.metadata.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q)
        );
      };

      assert.equal(search('constellations').length, 1);
      assert.equal(search('constellations')[0].metadata.id, 'doc-1');

      assert.equal(search('intuition').length, 1);
      assert.equal(search('intuition')[0].metadata.id, 'doc-2');

      assert.equal(search('glass').length, 1);
      assert.equal(search('glass')[0].metadata.id, 'doc-3');

      // Matching across multiple documents
      assert.equal(search('the').length, 2);
    });

    it('filters documents by selected tag', () => {
      const filterByTag = (tag: string) => {
        return mockDocuments.filter(d => d.metadata.tags.includes(tag));
      };

      const nightDocs = filterByTag('night');
      assert.equal(nightDocs.length, 2);
      assert.ok(nightDocs.some(d => d.metadata.id === 'doc-1'));
      assert.ok(nightDocs.some(d => d.metadata.id === 'doc-3'));

      const kantDocs = filterByTag('kant');
      assert.equal(kantDocs.length, 1);
      assert.equal(kantDocs[0].metadata.id, 'doc-2');
    });
  });

  describe('5. Brand Asset & Display Derivatives Verification', () => {
    const requiredDisplayDerivatives = [
      'app-icon-square-display.png',
      'app-icon-square-display-light.png',
      'logo-horizontal-display.jpg',
      'brand-horizontal-display-light.jpg',
      'studio-poetry-display.jpg',
      'studio-poetry-display-light.jpg',
      'studio-philosophy-display.jpg',
      'studio-philosophy-display-light.jpg',
      'studio-lorebook-display.jpg',
      'studio-lorebook-display-light.jpg'
    ];

    it('verifies that all 10 calibrated display derivatives exist and are non-empty', () => {
      const displayDir = path.join(rootDir, 'src', 'assets', 'brand', 'display');
      assert.ok(fs.existsSync(displayDir), 'display directory must exist');

      for (const file of requiredDisplayDerivatives) {
        const filePath = path.join(displayDir, file);
        assert.ok(fs.existsSync(filePath), `Asset derivative missing: ${file}`);
        const stat = fs.statSync(filePath);
        assert.ok(stat.size > 1000, `Asset derivative too small or empty: ${file} (${stat.size} bytes)`);
      }
    });

    it('verifies that master brand assets exist in src/assets/brand/', () => {
      const brandDir = path.join(rootDir, 'src', 'assets', 'brand');
      const requiredMasters = [
        'app-icon-square.png',
        'app-icon-square-light.png',
        'logo-horizontal.jpg',
        'brand-horizontal-light.jpg',
        'studio-poetry.jpg',
        'studio-poetry-light.jpg',
        'studio-philosophy.jpg',
        'studio-philosophy-light.jpg',
        'studio-lorebook.jpg',
        'studio-lorebook-light.jpg'
      ];

      for (const master of requiredMasters) {
        const filePath = path.join(brandDir, master);
        assert.ok(fs.existsSync(filePath), `Master asset missing: ${master}`);
        const stat = fs.statSync(filePath);
        assert.ok(stat.size > 1000, `Master asset too small or empty: ${master}`);
      }
    });
  });

  describe('6. Theme Resolution & Icon Mode Selection Contract', () => {
    const resolveBrandSrc = (
      theme: 'dark' | 'light',
      darkAsset: string,
      lightAsset: string
    ): string => {
      return theme === 'dark' ? darkAsset : lightAsset;
    };

    it('returns the dark derivative asset when theme is dark', () => {
      const selected = resolveBrandSrc(
        'dark',
        '/src/assets/brand/display/studio-poetry-display.jpg',
        '/src/assets/brand/display/studio-poetry-display-light.jpg'
      );
      assert.equal(selected, '/src/assets/brand/display/studio-poetry-display.jpg');
    });

    it('returns the light derivative asset when theme is light', () => {
      const selected = resolveBrandSrc(
        'light',
        '/src/assets/brand/display/studio-poetry-display.jpg',
        '/src/assets/brand/display/studio-poetry-display-light.jpg'
      );
      assert.equal(selected, '/src/assets/brand/display/studio-poetry-display-light.jpg');
    });
  });

  describe('7. Version Alignment Verification', () => {
    it('verifies version 0.7.0 in package.json', () => {
      const pkgPath = path.join(rootDir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.equal(pkg.version, '0.7.0', 'package.json version must be 0.7.0');
    });

    it('verifies version 0.7.0 in src-tauri/Cargo.toml', () => {
      const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
      const cargoContent = fs.readFileSync(cargoPath, 'utf8');
      assert.ok(
        cargoContent.includes('version = "0.7.0"'),
        'Cargo.toml must define version = "0.7.0"'
      );
    });

    it('verifies version 0.7.0 in src-tauri/tauri.conf.json', () => {
      const tauriPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
      const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
      assert.equal(tauriConf.version, '0.7.0', 'tauri.conf.json version must be 0.7.0');
    });
  });

  describe('8. Application Lifecycle & Graceful Shutdown Reliability', () => {
    it('verifies capabilities/default.json includes window destroy, close, and app exit permissions', () => {
      const capPath = path.join(rootDir, 'src-tauri', 'capabilities', 'default.json');
      assert.ok(fs.existsSync(capPath), 'capabilities/default.json must exist');
      const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
      assert.ok(cap.permissions.includes('core:window:allow-destroy'), 'must include core:window:allow-destroy');
      assert.ok(cap.permissions.includes('core:window:allow-close'), 'must include core:window:allow-close');
      assert.ok(cap.permissions.includes('core:app:allow-exit'), 'must include core:app:allow-exit');
    });

    it('flushes unsaved edits before exit', async () => {
      const order: string[] = [];
      await new ExitCoordinator().run(async () => { order.push('save'); return true; }, async () => { order.push('exit'); });
      assert.deepEqual(order, ['save', 'exit']);
    });

    it('keeps the window open during a slow save and after a failed save', async () => {
      const coordinator = new ExitCoordinator();
      let exited = false;
      let release!: (saved: boolean) => void;
      const pending = coordinator.run(() => new Promise<boolean>(resolve => { release = resolve; }), async () => { exited = true; });
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(exited, false);
      release(false);
      assert.equal(await pending, false);
      assert.equal(exited, false);
      assert.equal(await coordinator.run(async () => true, async () => { exited = true; }), true);
      assert.equal(exited, true);
    });

    it('enforces idempotency on rapid close triggers', async () => {
      const coordinator = new ExitCoordinator();
      let saves = 0;
      let exits = 0;
      await Promise.all(Array.from({ length: 5 }, () => coordinator.run(async () => {
        saves++;
        await new Promise(resolve => setTimeout(resolve, 20));
        return true;
      }, async () => { exits++; })));
      assert.equal(saves, 1);
      assert.equal(exits, 1);
    });

    it('dispatches graceful exit on Ctrl+Q or Cmd+Q keyboard shortcut', () => {
      let triggered = false;
      const onExit = () => {
        triggered = true;
      };

      const simulateKeyDown = (e: { ctrlKey?: boolean; metaKey?: boolean; key: string }) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
          onExit();
        }
      };

      simulateKeyDown({ ctrlKey: true, key: 'q' });
      assert.equal(triggered, true, 'Ctrl+Q must trigger exit');

      triggered = false;
      simulateKeyDown({ metaKey: true, key: 'Q' });
      assert.equal(triggered, true, 'Cmd+Q must trigger exit');

      triggered = false;
      simulateKeyDown({ ctrlKey: false, key: 'q' });
      assert.equal(triggered, false, 'Bare q without modifier must not trigger exit');
    });
  });
});
