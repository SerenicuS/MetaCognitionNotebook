import { stateChangeText } from './statusPresentation';
import { jsPDF } from 'jspdf';
import type {
  PublicationDocument,
  PublicationHierarchyNode,
  PublicationWarning,
  TocItem,
} from '../services/publication';

export interface LorebookPdfOptions {
  pageSize?: 'a4' | 'letter';
  includeAuthorHeader?: boolean;
  includeTitlePage?: boolean;
  includeToc?: boolean;
  fontFamily?: 'times' | 'helvetica';
  customFont?: {
    fontFileName: string;
    fontName: string;
    base64Data: string;
  };
}

export interface LorebookPdfResult {
  pdfDoc: jsPDF;
  pdfBytes: Uint8Array;
  pageCount: number;
  diagnostics: PublicationWarning[];
}

/**
 * Checks whether text contains glyphs outside Windows-1252 / Latin-1 for standard PDF fonts.
 * Produces explicit diagnostics for unsupported characters (CJK, Cyrillic, emojis, etc.)
 * rather than allowing silent box replacement or encoding corruption.
 */
export function checkTextGlyphs(
  text: string,
  fontFamily = 'times',
  hasCustomFont = false
): { isSupported: boolean; unsupportedChars: string[]; warnings: PublicationWarning[] } {
  if (hasCustomFont) {
    return { isSupported: true, unsupportedChars: [], warnings: [] };
  }

  const unsupportedMap = new Map<string, string>();
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    // Standard ASCII
    if (cp >= 0x20 && cp <= 0x7e) continue;
    // Common whitespace
    if (char === '\n' || char === '\r' || char === '\t') continue;
    // Latin-1 Supplement (0xA0..=0xFF)
    if (cp >= 0xa0 && cp <= 0xff) continue;
    // Windows-1252 typographical characters supported by standard PDF fonts
    if ([0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026, 0x20ac, 0x0152, 0x0153, 0x017d, 0x017e, 0x0160, 0x0161, 0x0178].includes(cp)) {
      continue;
    }

    const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    if (!unsupportedMap.has(char)) {
      unsupportedMap.set(char, hex);
    }
  }

  const unsupportedChars = Array.from(unsupportedMap.keys());
  const warnings: PublicationWarning[] = unsupportedChars.map((char) => ({
    code: 'unsupported_glyphs',
    message: `Font '${fontFamily}' does not support glyph '${char}' (${unsupportedMap.get(char)}). CJK and non-Latin scripts require an author-configured Unicode font.`,
  }));

  return {
    isSupported: unsupportedChars.length === 0,
    unsupportedChars,
    warnings,
  };
}

/**
 * Generates an authoritative, reader-facing encyclopedia PDF from the shared PublicationDocument.
 * Uses a restrained editorial design prioritizing readability, paragraph wrapping, and consistent margins.
 */
export function generateLorebookPdf(
  doc: PublicationDocument,
  options?: LorebookPdfOptions
): LorebookPdfResult {
  const pageSize = options?.pageSize === 'letter' ? 'letter' : 'a4';
  const includeTitlePage = options?.includeTitlePage ?? true;
  const includeToc = options?.includeToc ?? true;
  const includeAuthorHeader = options?.includeAuthorHeader ?? true;
  const font = options?.fontFamily ?? 'times';
  const hasCustomFont = Boolean(options?.customFont);

  const diagnostics: PublicationWarning[] = [];
  const seenGlyphWarnings = new Set<string>();

  function recordGlyphs(text?: string | null) {
    if (!text) return;
    const res = checkTextGlyphs(text, font, hasCustomFont);
    for (const w of res.warnings) {
      if (!seenGlyphWarnings.has(w.message)) {
        seenGlyphWarnings.add(w.message);
        diagnostics.push(w);
      }
    }
  }

  // Pre-scan all text for explicit glyph diagnostics
  recordGlyphs(doc.title);
  recordGlyphs(doc.universe_name);
  recordGlyphs(doc.subtitle);
  recordGlyphs(doc.author);
  recordGlyphs(doc.universe_description);
  for (const s of (doc.sections || [])) {
    recordGlyphs(s.title);
    for (const e of (s.entries || [])) {
      recordGlyphs(e.title);
      recordGlyphs(e.prose);
      for (const f of [...(e.fields || []), ...(e.institutional_positions || [])]) {
        recordGlyphs(f.label);
        recordGlyphs(f.value);
      }
    }
  }
  for (const r of (doc.relationships || [])) {
    recordGlyphs(r.source_title);
    recordGlyphs(r.target_title);
    recordGlyphs(r.label);
    recordGlyphs(r.description);
    for (const c of r.connections || []) { recordGlyphs(c.source_title); recordGlyphs(c.target_title); recordGlyphs(c.label); recordGlyphs(c.description); }
  }
  if (doc.timeline) {
    recordGlyphs(doc.timeline.title);
    for (const m of (doc.timeline.milestones || [])) {
      recordGlyphs(m.title);
      recordGlyphs(m.era);
      recordGlyphs(m.description);
      for (const ref of m.references || []) { recordGlyphs(ref.chapter_title); recordGlyphs(ref.book_name); }
      for (const ch of (m.changes || [])) {
        recordGlyphs(ch.entity_title);
        recordGlyphs(ch.property_key);
        recordGlyphs(ch.previous_value);
        recordGlyphs(ch.new_value);
      }
    }
  }
  for (const b of (doc.alternate_continuities || [])) {
    recordGlyphs(b.name);
    recordGlyphs(b.description);
    for (const m of b.milestones || []) { recordGlyphs(m.title); recordGlyphs(m.era); recordGlyphs(m.description); for (const ref of m.references || []) { recordGlyphs(ref.chapter_title); recordGlyphs(ref.book_name); } for (const change of m.changes || []) { recordGlyphs(change.entity_title); recordGlyphs(change.property_key); recordGlyphs(change.previous_value); recordGlyphs(change.new_value); } }
  }
  for (const exc of (doc.excerpts || [])) {
    recordGlyphs(exc.heading);
    recordGlyphs(exc.chapter_title);
    recordGlyphs(exc.book_name);
    recordGlyphs(exc.excerpt_text);
  }

  // Initialize jsPDF instance
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: pageSize,
  });

  if (options?.customFont) {
    pdf.addFileToVFS(options.customFont.fontFileName, options.customFont.base64Data);
    pdf.addFont(options.customFont.fontFileName, options.customFont.fontName, 'normal');
    pdf.setFont(options.customFont.fontName);
  } else {
    pdf.setFont(font, 'normal');
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 54;
  const marginBottom = 54;
  const contentWidth = pageWidth - marginX * 2;
  const usableBottom = pageHeight - marginBottom;

  let y = marginTop;

  function ensureSpace(needed: number) {
    if (y + needed > usableBottom) {
      pdf.addPage();
      y = marginTop;
    }
  }

  // Helper to safely sanitize text for PDF stream
  function safeText(str?: string | null): string {
    if (!str) return '';
    if (hasCustomFont) return str;
    // For standard font, replace unsupported characters with visible mark [?]
    const res = checkTextGlyphs(str, font, false);
    if (res.isSupported) return str;
    let out = '';
    for (const char of str) {
      const cp = char.codePointAt(0) ?? 0;
      if (
        (cp >= 0x20 && cp <= 0x7e) ||
        char === '\n' || char === '\r' || char === '\t' ||
        (cp >= 0xa0 && cp <= 0xff) ||
        [0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x2026].includes(cp)
      ) {
        out += char;
      } else {
        out += '[?]';
      }
    }
    return out;
  }

  // 1. Title Page
  if (includeTitlePage) {
    y = pageHeight * 0.35;
    pdf.setFont(font, 'bold');
    pdf.setFontSize(26);
    const titleLines = pdf.splitTextToSize(safeText(doc.title), contentWidth);
    for (const tl of titleLines) {
      pdf.text(tl, pageWidth / 2, y, { align: 'center' });
      y += 32;
    }

    if (doc.subtitle) {
      pdf.setFont(font, 'italic');
      pdf.setFontSize(14);
      const subLines = pdf.splitTextToSize(safeText(doc.subtitle), contentWidth);
      for (const sl of subLines) {
        pdf.text(sl, pageWidth / 2, y, { align: 'center' });
        y += 20;
      }
    }

    if (doc.author) {
      y += 8;
      pdf.setFont(font, 'normal');
      pdf.setFontSize(11);
      pdf.text(`By ${safeText(doc.author)}`, pageWidth / 2, y, { align: 'center' });
      y += 24;
    }

    pdf.addPage();
    y = marginTop;
  }

  if (doc.universe_description) {
    ensureSpace(40);
    pdf.setFont(font, 'bold'); pdf.setFontSize(16);
    pdf.text('Universe Introduction', marginX, y); y += 22;
    pdf.setFontSize(12);
    for (const line of pdf.splitTextToSize(safeText(doc.universe_name), contentWidth)) { ensureSpace(16); pdf.text(line, marginX, y); y += 16; }
    pdf.setFont(font, 'normal'); pdf.setFontSize(10.5);
    for (const line of pdf.splitTextToSize(safeText(doc.universe_description), contentWidth)) { ensureSpace(15); pdf.text(line, marginX, y); y += 15; }
    y += 20;
  }

  // 2. Table of Contents
  const tocItems = doc.table_of_contents || [];
  if (includeToc && tocItems.length > 0) {
    pdf.setFont(font, 'bold');
    pdf.setFontSize(18);
    pdf.text('Table of Contents', marginX, y);
    y += 28;

    pdf.setFont(font, 'normal');
    pdf.setFontSize(10.5);

    function renderTocList(items: TocItem[], level: number) {
      for (const item of items) {
        ensureSpace(18);
        const indent = (level - 1) * 16;
        const prefix = level === 1 ? '• ' : '- ';
        const label = `${prefix}${safeText(item.title)}`;
        const split = pdf.splitTextToSize(label, contentWidth - indent);
        pdf.text(split, marginX + indent, y);
        y += split.length * 15;

        if (item.children && item.children.length > 0) {
          renderTocList(item.children, level + 1);
        }
      }
    }

    renderTocList(tocItems, 1);
    pdf.addPage();
    y = marginTop;
  }

  // 3. Category Sections and Entries
  const sections = doc.sections || [];
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    if (sIdx > 0 || (includeToc && tocItems.length > 0)) {
      pdf.addPage();
      y = marginTop;
    }

    ensureSpace(40);
    pdf.setFont(font, 'bold');
    pdf.setFontSize(18);
    pdf.text(safeText(section.title), marginX, y);
    y += 26;

    for (const entry of (section.entries || [])) {
      ensureSpace(36);
      pdf.setFont(font, 'bold');
      pdf.setFontSize(13);
      const entryTitleLines = pdf.splitTextToSize(safeText(entry.title), contentWidth);
      pdf.text(entryTitleLines, marginX, y);
      y += entryTitleLines.length * 16 + 4;

      // Fields
      pdf.setFont(font, 'normal');
      pdf.setFontSize(10);
      for (const f of (entry.fields || [])) {
        ensureSpace(15);
        const lineText = `* ${safeText(f.label)}: ${safeText(f.value)}`;
        const split = pdf.splitTextToSize(lineText, contentWidth - 10);
        pdf.text(split, marginX + 8, y);
        y += split.length * 14;
      }

      if (entry.institutional_positions?.length) {
        ensureSpace(24);
        pdf.setFont(font, 'bold');
        pdf.text('Institutional Positions', marginX + 8, y); y += 15;
        pdf.setFont(font, 'normal');
        for (const office of entry.institutional_positions) {
          const lines = pdf.splitTextToSize(`${safeText(office.label)}: ${safeText(office.value)}`, contentWidth - 20);
          for (const line of lines) { ensureSpace(14); pdf.text(line, marginX + 12, y); y += 14; }
        }
      }

      // Faction hierarchy
      if (entry.hierarchy) {
        ensureSpace(20);
        pdf.setFont(font, 'bold');
        pdf.text('* Organizational Structure:', marginX + 8, y);
        y += 15;
        pdf.setFont(font, 'normal');
        renderHierarchy(entry.hierarchy, 1);
      }

      // Prose
      if (entry.prose) {
        y += 4;
        pdf.setFont(font, 'normal');
        pdf.setFontSize(10);
        const paragraphs = entry.prose.split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (!p.trim()) continue;
          const pLines = pdf.splitTextToSize(safeText(p.trim()), contentWidth);
          ensureSpace(pLines.length * 14 + 6);
          pdf.text(pLines, marginX, y);
          y += pLines.length * 14 + 6;
        }
      }

      y += 12;
    }
  }

  function renderHierarchy(node: PublicationHierarchyNode, level: number) {
    ensureSpace(16);
    const indent = level * 12;
    const prefix = node.node_type === 'branch' ? 'Branch: ' : 'Position: ';
    const title = `* ${prefix}${safeText(node.title)}`;
    pdf.setFont(font, 'bold');
    pdf.setFontSize(9.5);
    pdf.text(title, marginX + 8 + indent, y);
    y += 13;

    if (node.description) {
      ensureSpace(13);
      pdf.setFont(font, 'normal');
      pdf.setFontSize(9);
      const desc = `Description: ${safeText(node.description)}`;
      const split = pdf.splitTextToSize(desc, contentWidth - indent - 16);
      pdf.text(split, marginX + 16 + indent, y);
      y += split.length * 12;
    }

    if (node.holders && node.holders.length > 0) {
      ensureSpace(13);
      pdf.setFont(font, 'italic');
      pdf.setFontSize(9);
      const holderNames = node.holders.map((h) => safeText(h.title)).join(', ');
      const hText = `Holders: ${holderNames}`;
      const split = pdf.splitTextToSize(hText, contentWidth - indent - 16);
      pdf.text(split, marginX + 16 + indent, y);
      y += split.length * 12;
    }

    pdf.setFont(font, 'normal');
    if (node.children) {
      for (const child of node.children) {
        renderHierarchy(child, level + 1);
      }
    }
  }

  // 4. Relationships Section
  const relationships = doc.relationships || [];
  if (relationships.length > 0) {
    pdf.addPage();
    y = marginTop;

    ensureSpace(40);
    pdf.setFont(font, 'bold');
    pdf.setFontSize(18);
    pdf.text('Relationships', marginX, y);
    y += 26;

    pdf.setFont(font, 'normal');
    pdf.setFontSize(10);
    for (const rel of relationships) {
      ensureSpace(24);
      const arrow = rel.directed ? '-->' : '<-->';
      const line = `* ${safeText(rel.source_title)} ${arrow} ${safeText(rel.label)} ${safeText(rel.target_title)}`;
      for (const summaryLine of pdf.splitTextToSize(line, contentWidth)) {
        ensureSpace(14); pdf.text(summaryLine, marginX, y); y += 14;
      }

      for (const connection of rel.connections || []) {
        const text = `${safeText(connection.source_title)} ${connection.directed ? '-->' : '<-->'} ${safeText(connection.label)} ${safeText(connection.target_title)} (${safeText(connection.provenance || 'authored')})`;
        const lines = pdf.splitTextToSize(text, contentWidth - 20);
        for (const line of lines) { ensureSpace(14); pdf.text(line, marginX + 10, y); y += 14; }
        if (connection.description) {
          const details = pdf.splitTextToSize(safeText(connection.description), contentWidth - 25);
          for (const line of details) { ensureSpace(14); pdf.text(line, marginX + 15, y); y += 14; }
        }
      }
      if (rel.description) {
        pdf.setFont(font, 'italic');
        pdf.setFontSize(9.5);
        const desc = `  * ${safeText(rel.description)}`;
        const split = pdf.splitTextToSize(desc, contentWidth - 12);
        ensureSpace(split.length * 13);
        pdf.text(split, marginX + 10, y);
        y += split.length * 13;
        pdf.setFont(font, 'normal');
        pdf.setFontSize(10);
      }
    }
  }

  // 5. Historical Timeline Section
  const milestones = doc.timeline?.milestones || [];
  if (doc.timeline && milestones.length > 0) {
    pdf.addPage();
    y = marginTop;

    ensureSpace(40);
    pdf.setFont(font, 'bold');
    pdf.setFontSize(18);
    pdf.text(safeText(doc.timeline.title), marginX, y);
    y += 26;

    for (const m of milestones) {
      ensureSpace(34);
      pdf.setFont(font, 'bold');
      pdf.setFontSize(12.5);
      pdf.text(safeText(m.title), marginX, y);
      y += 16;

      if (m.era) {
        pdf.setFont(font, 'italic');
        pdf.setFontSize(10);
        pdf.text(`Era / Date: ${safeText(m.era)}`, marginX, y);
        y += 14;
      }

      if (m.description) {
        pdf.setFont(font, 'normal');
        pdf.setFontSize(10);
        const split = pdf.splitTextToSize(safeText(m.description), contentWidth);
        ensureSpace(split.length * 14);
        pdf.text(split, marginX, y);
        y += split.length * 14 + 4;
      }

      for (const ref of m.references || []) {
        pdf.setFont(font, 'normal'); pdf.setFontSize(10);
        for (const line of pdf.splitTextToSize(`Read the event in ${safeText(ref.chapter_title)} - ${safeText(ref.book_name)}`, contentWidth)) { ensureSpace(14); pdf.text(line, marginX, y); y += 14; }
      }
      const changes = m.changes || [];
      if (changes.length > 0) {
        pdf.setFont(font, 'normal');
        pdf.setFontSize(9.5);
        for (const ch of changes) {
          ensureSpace(14);
          const line = `  * ${safeText(ch.entity_title)}: ${safeText(stateChangeText(ch))}`;
          const split = pdf.splitTextToSize(line, contentWidth - 10);
          pdf.text(split, marginX + 6, y);
          y += split.length * 13;
        }
      }
      y += 8;
    }
  }

  // 6. Alternate Continuities Section
  const branches = doc.alternate_continuities || [];
  if (branches.length > 0) {
    pdf.addPage();
    y = marginTop;

    ensureSpace(40);
    pdf.setFont(font, 'bold');
    pdf.setFontSize(18);
    pdf.text('Alternate Continuities', marginX, y);
    y += 26;

    for (const b of branches) {
      ensureSpace(32);
      pdf.setFont(font, 'bold');
      pdf.setFontSize(12.5);
      pdf.text(`Alternate Continuity: ${safeText(b.name)}`, marginX, y);
      y += 16;

      if (b.description) {
        pdf.setFont(font, 'italic');
        pdf.setFontSize(10);
        const split = pdf.splitTextToSize(safeText(b.description), contentWidth);
        ensureSpace(split.length * 14);
        pdf.text(split, marginX, y);
        y += split.length * 14;
      }

      if (b.divergence_milestone) {
        pdf.setFont(font, 'italic');
        pdf.setFontSize(9.5);
        pdf.text(
          `Diverges from canonical milestone: ${safeText(b.divergence_milestone.title)} (${safeText(b.divergence_milestone.era)})`,
          marginX,
          y
        );
        y += 14;
      }

      if (b.milestones && b.milestones.length > 0) {
        pdf.setFont(font, 'normal');
        pdf.setFontSize(9.5);
        for (const bm of b.milestones) {
          ensureSpace(14);
          const era = bm.era ? ` (${safeText(bm.era)})` : '';
          pdf.text(`* ${safeText(bm.title)}${era}`, marginX + 8, y);
          y += 13;
          if (bm.description) {
            const split = pdf.splitTextToSize(safeText(bm.description), contentWidth - 20);
            ensureSpace(split.length * 12);
            pdf.text(split, marginX + 16, y);
            y += split.length * 12;
          }
          for (const ref of bm.references || []) {
            for (const line of pdf.splitTextToSize(`Read the event in ${safeText(ref.chapter_title)} - ${safeText(ref.book_name)}`, contentWidth - 20)) { ensureSpace(14); pdf.text(line, marginX + 16, y); y += 14; }
          }
          for (const ch of bm.changes || []) {
            for (const line of pdf.splitTextToSize(`${safeText(ch.entity_title)}: ${safeText(stateChangeText(ch))}`, contentWidth - 20)) { ensureSpace(14); pdf.text(line, marginX + 16, y); y += 14; }
          }
        }
      }
      y += 10;
    }
  }

  // 7. Excerpts Section
  const excerpts = doc.excerpts || [];
  if (excerpts.length > 0) {
    pdf.addPage();
    y = marginTop;

    ensureSpace(40);
    pdf.setFont(font, 'bold');
    pdf.setFontSize(18);
    pdf.text('Excerpts', marginX, y);
    y += 26;

    for (const exc of excerpts) {
      ensureSpace(36);
      pdf.setFont(font, 'bold');
      pdf.setFontSize(12);
      pdf.text(safeText(exc.heading), marginX, y);
      y += 16;

      pdf.setFont(font, 'italic');
      pdf.setFontSize(9.5);
      pdf.text(
        `From Chapter ${safeText(exc.chapter_title)}, Book ${safeText(exc.book_name)}`,
        marginX,
        y
      );
      y += 14;

      pdf.setFont(font, 'normal');
      pdf.setFontSize(9.5);
      const split = pdf.splitTextToSize(`> ${safeText(exc.excerpt_text)}`, contentWidth - 12);
      ensureSpace(split.length * 14 + 6);
      pdf.text(split, marginX + 10, y);
      y += split.length * 14 + 10;
    }
  }

  // 8. Running Headers & Footers on pages 2..N
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1 || !includeTitlePage) {
      pdf.setPage(p);
      pdf.setFont(font, 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);

      if (includeAuthorHeader) {
        pdf.text(safeText(doc.title), marginX, marginTop - 18);
        if (doc.author) {
          pdf.text(safeText(doc.author), pageWidth - marginX, marginTop - 18, {
            align: 'right',
          });
        }
      }

      pdf.text(
        `Page ${p} of ${totalPages}`,
        pageWidth / 2,
        pageHeight - marginBottom + 24,
        { align: 'center' }
      );
      pdf.setTextColor(0, 0, 0);
    }
  }

  // Set standard PDF document properties (no internal UUIDs or House IDs!)
  pdf.setDocumentProperties({
    title: safeText(doc.title),
    author: safeText(doc.author || ''),
    creator: 'MetaCognition Notebook',
  });

  const arrayBuffer = pdf.output('arraybuffer');
  const pdfBytes = new Uint8Array(arrayBuffer);

  return {
    pdfDoc: pdf,
    pdfBytes,
    pageCount: totalPages,
    diagnostics,
  };
}
