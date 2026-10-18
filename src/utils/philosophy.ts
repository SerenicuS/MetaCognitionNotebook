import type { PhilosophyClassification, PhilosophyMetadata, PhilosophyParagraph } from '../types';

export const CLASSIFICATIONS: Record<PhilosophyClassification, { label: string; description: string }> = {
  premise: { label: 'Premise / Axiom', description: 'A statement offered as a reason or starting assumption.' },
  argument: { label: 'Argument / Dialectic', description: 'Reasoning that supports a position.' },
  objection: { label: 'Objection / Counterpoint', description: 'A challenge or counterargument.' },
  example: { label: 'Example / Thought Experiment', description: 'A concrete illustration or thought experiment.' },
  conclusion: { label: 'Conclusion / Corollary', description: 'The position reached through reasoning.' },
  prose: { label: 'General Prose', description: 'Writing without a specific argumentative role.' },
};

export function readPhilosophyMetadata(raw?: string | null): PhilosophyMetadata {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function compositionMode(metadata: PhilosophyMetadata): 'freeform' | 'structured' {
  // Absence means an existing document, including legacy unclassified prose.
  return metadata.composition_mode === 'freeform' ? 'freeform' : 'structured';
}

export function switchPhilosophyMode(metadata: PhilosophyMetadata, mode: 'freeform' | 'structured'): PhilosophyMetadata {
  return {
    ...metadata,
    // Record how to interpret the unchanged body, independently from its view.
    philosophy_representation: metadata.philosophy_representation ?? (compositionMode(metadata) === 'freeform' ? 'plain' : 'legacy'),
    composition_mode: mode,
  };
}

const header = (classification: PhilosophyClassification) =>
  classification === 'prose' ? '' : `<!-- ${classification} -->\n`;
const paragraph = (text: string, classification: PhilosophyClassification = 'prose', index = 0): PhilosophyParagraph =>
  ({ id: `p-${index}`, text, classification });

export function parsePhilosophy(content: string, metadata: PhilosophyMetadata): PhilosophyParagraph[] {
  // Lengths describe boundaries in the ONE canonical body; no duplicate text is stored.
  // This also keeps blank paragraphs and literal marker comments inside a block unambiguous.
  if (Array.isArray(metadata.philosophy_blocks) && metadata.philosophy_blocks.length) {
    let offset = 0;
    const blocks: PhilosophyParagraph[] = [];
    let valid = true;
    for (const [index, entry] of metadata.philosophy_blocks.entries()) {
      if (!entry || !Object.prototype.hasOwnProperty.call(CLASSIFICATIONS, entry.classification) || !Number.isSafeInteger(entry.length) || entry.length < 0) {
        valid = false; break;
      }
      const prefix = header(entry.classification);
      if (!content.startsWith(prefix, offset)) { valid = false; break; }
      offset += prefix.length;
      blocks.push(paragraph(content.slice(offset, offset + entry.length), entry.classification, index));
      offset += entry.length;
      if (index < metadata.philosophy_blocks.length - 1) {
        if (content.slice(offset, offset + 2) !== '\n\n') { valid = false; break; }
        offset += 2;
      }
    }
    if (valid && offset === content.length) return blocks;
  }
  if (!metadata.philosophy_blocks && (metadata.philosophy_representation === 'plain' ||
    (metadata.philosophy_representation !== 'legacy' && compositionMode(metadata) === 'freeform'))) return [paragraph(content)];
  // Preserve the pre-v0.3.1 paragraph interpretation, without trimming user whitespace.
  const blocks = content.split(/\r?\n\s*\r?\n/).filter(Boolean);
  return blocks.length ? blocks.map((block, index) => {
    const match = block.match(/^(\s*)<!--\s*(premise|argument|objection|example|conclusion|prose)\s*-->\r?\n?([\s\S]*)$/i);
    return match ? paragraph(match[1] + match[3], match[2].toLowerCase() as PhilosophyClassification, index) : paragraph(block, 'prose', index);
  }) : [paragraph(content)];
}

export function philosophyEdit(blocks: PhilosophyParagraph[], metadata: PhilosophyMetadata) {
  return {
    content: blocks.map(block => header(block.classification) + block.text).join('\n\n'),
    metadata: { ...metadata, philosophy_blocks: blocks.map(({ classification, text }) => ({ classification, length: text.length })) },
  };
}
