import { jsPDF } from 'jspdf';
import {
  DocumentDetail,
  DocumentMetadata,
  DocumentType,
  ManuscriptExportSettings,
  ManuscriptLinkedDocNode,
  ManuscriptMetadata,
  ManuscriptNode,
  ManuscriptOriginalTextNode,
  ManuscriptSectionNode,
} from '../types';
import { api, isTauri } from '../services/api';

// ============================================================================
// Default Settings & Constants
// ============================================================================

export const DEFAULT_MANUSCRIPT_EXPORT_SETTINGS: ManuscriptExportSettings = {
  include_title_page: true,
  include_toc: true,
  page_breaks_between_sections: true,
  page_size: 'a4',
  font_family: 'serif',
  font_size: 11,
  include_author_header: true,
};

export interface ResolvedReadingItem {
  id: string;
  type: 'section' | 'original_text' | 'linked_doc' | 'missing_doc';
  title: string;
  level: number;
  content?: string;
  docId?: string;
  docType?: DocumentType;
  customTitle?: string;
  metadata?: Record<string, any>;
  description?: string;
}

export interface ManuscriptStats {
  totalWords: number;
  sectionCount: number;
  linkedDocCount: number;
  originalTextCount: number;
  missingDocCount: number;
  readingTimeMinutes: number;
  estimatedPages: number;
}

export function isDocumentDetail(d: DocumentDetail | DocumentMetadata): d is DocumentDetail {
  return typeof d === 'object' && d !== null && 'metadata' in d && 'content' in d;
}

// ============================================================================
// Outline Tree Operations (Pure Functional)
// ============================================================================

export function generateNodeId(prefix = 'node'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function cloneOutline(nodes: ManuscriptNode[]): ManuscriptNode[] {
  return JSON.parse(JSON.stringify(nodes));
}

export function findNodeById(
  nodes: ManuscriptNode[],
  id: string,
  parent: ManuscriptSectionNode | null = null
): { node: ManuscriptNode; parent: ManuscriptSectionNode | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const current = nodes[i];
    if (current.id === id) {
      return { node: current, parent, index: i };
    }
    if (current.type === 'section' && current.children?.length) {
      const found = findNodeById(current.children, id, current);
      if (found) return found;
    }
  }
  return null;
}

export function isDescendant(nodes: ManuscriptNode[], ancestorId: string, candidateId: string): boolean {
  const ancestor = findNodeById(nodes, ancestorId)?.node;
  if (!ancestor || ancestor.type !== 'section') return false;

  const queue: ManuscriptNode[] = [...(ancestor.children || [])];
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.id === candidateId) return true;
    if (item.type === 'section' && item.children) {
      queue.push(...item.children);
    }
  }
  return false;
}

export function countOutlineNodes(nodes: ManuscriptNode[]): {
  sections: number;
  linkedDocs: number;
  originalTexts: number;
  total: number;
} {
  let sections = 0;
  let linkedDocs = 0;
  let originalTexts = 0;

  function traverse(list: ManuscriptNode[]) {
    for (const node of list) {
      if (node.type === 'section') {
        sections++;
        if (node.children) traverse(node.children);
      } else if (node.type === 'linked_doc') {
        linkedDocs++;
      } else if (node.type === 'original_text') {
        originalTexts++;
      }
    }
  }

  traverse(nodes);
  return {
    sections,
    linkedDocs,
    originalTexts,
    total: sections + linkedDocs + originalTexts,
  };
}

export function addSectionToOutline(
  nodes: ManuscriptNode[],
  parentId: string | null,
  title: string,
  description?: string
): { outline: ManuscriptNode[]; newNode: ManuscriptSectionNode } {
  const outline = cloneOutline(nodes);
  const newNode: ManuscriptSectionNode = {
    id: generateNodeId('sec'),
    type: 'section',
    title: title.trim() || 'Untitled Section',
    description: description?.trim() || undefined,
    children: [],
  };

  if (!parentId) {
    outline.push(newNode);
    return { outline, newNode };
  }

  const target = findNodeById(outline, parentId);
  if (target && target.node.type === 'section') {
    if (!target.node.children) target.node.children = [];
    target.node.children.push(newNode);
  } else {
    outline.push(newNode);
  }

  return { outline, newNode };
}

export function addLinkedDocToOutline(
  nodes: ManuscriptNode[],
  parentId: string | null,
  docId: string,
  docType: DocumentType,
  customTitle?: string
): { outline: ManuscriptNode[]; newNode: ManuscriptLinkedDocNode } {
  const outline = cloneOutline(nodes);
  const newNode: ManuscriptLinkedDocNode = {
    id: generateNodeId('link'),
    type: 'linked_doc',
    doc_id: docId,
    doc_type: docType,
    custom_title: customTitle?.trim() || undefined,
  };

  if (!parentId) {
    outline.push(newNode);
    return { outline, newNode };
  }

  const target = findNodeById(outline, parentId);
  if (target && target.node.type === 'section') {
    if (!target.node.children) target.node.children = [];
    target.node.children.push(newNode);
  } else {
    outline.push(newNode);
  }

  return { outline, newNode };
}

export function addOriginalTextToOutline(
  nodes: ManuscriptNode[],
  parentId: string | null,
  title: string,
  content = ''
): { outline: ManuscriptNode[]; newNode: ManuscriptOriginalTextNode } {
  const outline = cloneOutline(nodes);
  const newNode: ManuscriptOriginalTextNode = {
    id: generateNodeId('text'),
    type: 'original_text',
    title: title.trim() || 'Untitled Passage',
    content,
  };

  if (!parentId) {
    outline.push(newNode);
    return { outline, newNode };
  }

  const target = findNodeById(outline, parentId);
  if (target && target.node.type === 'section') {
    if (!target.node.children) target.node.children = [];
    target.node.children.push(newNode);
  } else {
    outline.push(newNode);
  }

  return { outline, newNode };
}

export function removeNodeFromOutline(
  nodes: ManuscriptNode[],
  id: string,
  unwrapChildren = false
): ManuscriptNode[] {
  const outline = cloneOutline(nodes);
  const found = findNodeById(outline, id);
  if (!found) return outline;

  const { node, parent, index } = found;
  const targetList = parent ? parent.children : outline;

  if (node.type === 'section' && unwrapChildren && node.children?.length) {
    targetList.splice(index, 1, ...node.children);
  } else {
    targetList.splice(index, 1);
  }

  return outline;
}

export function reorderNodeInOutline(
  nodes: ManuscriptNode[],
  id: string,
  direction: 'up' | 'down'
): ManuscriptNode[] {
  const outline = cloneOutline(nodes);
  const found = findNodeById(outline, id);
  if (!found) return outline;

  const { parent, index } = found;
  const targetList = parent ? parent.children : outline;

  if (direction === 'up' && index > 0) {
    const temp = targetList[index];
    targetList[index] = targetList[index - 1];
    targetList[index - 1] = temp;
  } else if (direction === 'down' && index < targetList.length - 1) {
    const temp = targetList[index];
    targetList[index] = targetList[index + 1];
    targetList[index + 1] = temp;
  }

  return outline;
}

export function indentNodeInOutline(nodes: ManuscriptNode[], id: string): ManuscriptNode[] {
  const outline = cloneOutline(nodes);
  const found = findNodeById(outline, id);
  if (!found || found.index === 0) return outline;

  const { parent, index, node } = found;
  const siblingList = parent ? parent.children : outline;
  const prevSibling = siblingList[index - 1];

  if (prevSibling.type === 'section') {
    siblingList.splice(index, 1);
    if (!prevSibling.children) prevSibling.children = [];
    prevSibling.children.push(node);
  }

  return outline;
}

export function outdentNodeInOutline(nodes: ManuscriptNode[], id: string): ManuscriptNode[] {
  const outline = cloneOutline(nodes);
  const found = findNodeById(outline, id);
  if (!found || !found.parent) return outline;

  const { parent, index, node } = found;
  const grandParentFound = findNodeById(outline, parent.id);
  const parentContainer = grandParentFound?.parent ? grandParentFound.parent.children : outline;
  const parentIndexInContainer = grandParentFound ? grandParentFound.index : -1;

  parent.children.splice(index, 1);

  if (parentIndexInContainer >= 0) {
    parentContainer.splice(parentIndexInContainer + 1, 0, node);
  } else {
    outline.push(node);
  }

  return outline;
}

export function updateNodeInOutline(
  nodes: ManuscriptNode[],
  id: string,
  patch: Record<string, any>
): ManuscriptNode[] {
  const outline = cloneOutline(nodes);
  const found = findNodeById(outline, id);
  if (!found) return outline;

  Object.assign(found.node, patch);
  return outline;
}

// ============================================================================
// Outline Resolution & Flattening (Single Source of Truth)
// ============================================================================

export function flattenManuscriptOutline(
  outline: ManuscriptNode[],
  documents: Array<DocumentDetail | DocumentMetadata> | Map<string, DocumentDetail | DocumentMetadata>
): ResolvedReadingItem[] {
  const docMap =
    documents instanceof Map
      ? documents
      : new Map(
          documents.map((d) => {
            const id = isDocumentDetail(d) ? d.metadata.id : d.id;
            return [id, d];
          })
        );

  const result: ResolvedReadingItem[] = [];

  function traverse(nodeList: ManuscriptNode[], level: number) {
    for (const node of nodeList) {
      if (node.type === 'section') {
        result.push({
          id: node.id,
          type: 'section',
          title: node.title,
          level,
          description: node.description,
        });
        if (node.children?.length) {
          traverse(node.children, level + 1);
        }
      } else if (node.type === 'original_text') {
        result.push({
          id: node.id,
          type: 'original_text',
          title: node.title,
          content: node.content,
          level,
        });
      } else if (node.type === 'linked_doc') {
        const rawDoc = docMap.get(node.doc_id);
        if (rawDoc) {
          const docMeta = isDocumentDetail(rawDoc) ? rawDoc.metadata : rawDoc;
          const docContent = isDocumentDetail(rawDoc) ? rawDoc.content : '';
          let metaParsed: Record<string, any> | undefined;
          if (docMeta.metadata_json) {
            try {
              metaParsed = JSON.parse(docMeta.metadata_json);
            } catch {
              metaParsed = undefined;
            }
          }
          result.push({
            id: node.id,
            type: 'linked_doc',
            docId: node.doc_id,
            docType: node.doc_type || docMeta.doc_type,
            title: node.custom_title || docMeta.title,
            customTitle: node.custom_title,
            content: docContent,
            level,
            metadata: metaParsed,
          });
        } else {
          result.push({
            id: node.id,
            type: 'missing_doc',
            docId: node.doc_id,
            docType: node.doc_type,
            title: node.custom_title || `[Missing Document: ${node.doc_id}]`,
            customTitle: node.custom_title,
            level,
          });
        }
      }
    }
  }

  traverse(outline, 1);
  return result;
}

export function computeManuscriptStats(items: ResolvedReadingItem[]): ManuscriptStats {
  let totalWords = 0;
  let sectionCount = 0;
  let linkedDocCount = 0;
  let originalTextCount = 0;
  let missingDocCount = 0;

  for (const item of items) {
    if (item.type === 'section') {
      sectionCount++;
    } else if (item.type === 'original_text') {
      originalTextCount++;
      if (item.content) {
        totalWords += countWords(item.content);
      }
    } else if (item.type === 'linked_doc') {
      linkedDocCount++;
      if (item.content) {
        totalWords += countWords(item.content);
      }
    } else if (item.type === 'missing_doc') {
      missingDocCount++;
    }
  }

  const readingTimeMinutes = Math.max(1, Math.ceil(totalWords / 200));
  const estimatedPages = Math.max(1, Math.ceil(totalWords / 250));

  return {
    totalWords,
    sectionCount,
    linkedDocCount,
    originalTextCount,
    missingDocCount,
    readingTimeMinutes,
    estimatedPages,
  };
}

function countWords(str: string): number {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// ============================================================================
// Markdown Compiler
// ============================================================================

export function formatPoetryMarkdown(content: string): string {
  if (!content) return '';
  const lines = content.split('\n');
  const formattedLines = lines.map((line) => {
    if (line.trim().length > 0) {
      return `${line.trimEnd()}  `;
    }
    return '';
  });
  return formattedLines.join('\n');
}

export function compileManuscriptToMarkdown(
  title: string,
  metadata: ManuscriptMetadata,
  items: ResolvedReadingItem[],
  settings?: Partial<ManuscriptExportSettings>
): string {
  const mergedSettings = { ...DEFAULT_MANUSCRIPT_EXPORT_SETTINGS, ...settings };
  const lines: string[] = [];

  if (mergedSettings.include_title_page) {
    lines.push(`# ${title}`);
    if (metadata.subtitle) {
      lines.push(`\n*${metadata.subtitle}*`);
    }
    if (metadata.author) {
      lines.push(`\n**By ${metadata.author}**`);
    }
    lines.push('\n---\n');
  }

  if (mergedSettings.include_toc && items.length > 0) {
    lines.push('## Table of Contents\n');
    for (const item of items) {
      const indent = '  '.repeat(Math.max(0, item.level - 1));
      const cleanTitle = item.title.replace(/[\[\]]/g, '');
      lines.push(`${indent}- ${cleanTitle}`);
    }
    lines.push('\n---\n');
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const headingLevel = Math.min(6, Math.max(1, item.level + 1));
    const hashes = '#'.repeat(headingLevel);

    if (item.type === 'section') {
      if (mergedSettings.page_breaks_between_sections && i > 0 && item.level === 1) {
        lines.push('\n---\n');
      }
      lines.push(`\n${hashes} ${item.title}\n`);
      if (item.description) {
        lines.push(`*${item.description}*\n`);
      }
    } else if (item.type === 'original_text') {
      lines.push(`\n${hashes} ${item.title}\n`);
      if (item.content) {
        lines.push(item.content.trim());
      }
      lines.push('');
    } else if (item.type === 'linked_doc') {
      lines.push(`\n${hashes} ${item.title}\n`);
      if (item.content) {
        if (item.docType === 'poetry') {
          lines.push(formatPoetryMarkdown(item.content));
        } else {
          lines.push(item.content.trim());
        }
      }
      lines.push('');
    } else if (item.type === 'missing_doc') {
      lines.push(`\n${hashes} ${item.title}\n`);
      lines.push(`> *[Note: Referenced document ${item.docId} is missing or inaccessible.]*\n`);
    }
  }

  return lines.join('\n').trim() + '\n';
}

// ============================================================================
// PDF Generator (Deterministic client-side PDF)
// ============================================================================

export function generateManuscriptPdf(
  title: string,
  metadata: ManuscriptMetadata,
  items: ResolvedReadingItem[],
  settings?: Partial<ManuscriptExportSettings>
): jsPDF {
  const mergedSettings = { ...DEFAULT_MANUSCRIPT_EXPORT_SETTINGS, ...settings };
  const format = mergedSettings.page_size === 'letter' ? 'letter' : 'a4';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 54;
  const marginBottom = 54;
  const contentWidth = pageWidth - marginX * 2;
  const usableBottom = pageHeight - marginBottom;

  let y = marginTop;

  function ensureSpace(needed: number) {
    if (y + needed > usableBottom) {
      doc.addPage();
      y = marginTop;
    }
  }

  if (mergedSettings.include_title_page) {
    y = pageHeight * 0.35;
    doc.setFont('times', 'bold');
    doc.setFontSize(26);
    doc.text(title, pageWidth / 2, y, { align: 'center' });
    y += 32;

    if (metadata.subtitle) {
      doc.setFont('times', 'italic');
      doc.setFontSize(14);
      doc.text(metadata.subtitle, pageWidth / 2, y, { align: 'center' });
      y += 24;
    }

    if (metadata.author) {
      doc.setFont('times', 'normal');
      doc.setFontSize(12);
      doc.text(`By ${metadata.author}`, pageWidth / 2, y, { align: 'center' });
    }

    doc.addPage();
    y = marginTop;
  }

  if (mergedSettings.include_toc && items.length > 0) {
    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    doc.text('Table of Contents', marginX, y);
    y += 28;

    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);

    for (const item of items) {
      ensureSpace(18);
      const indent = (item.level - 1) * 16;
      const bullet = item.type === 'section' ? '• ' : '- ';
      const label = `${bullet}${item.title}`;
      const split = doc.splitTextToSize(label, contentWidth - indent);
      doc.text(split, marginX + indent, y);
      y += split.length * 15;
    }

    doc.addPage();
    y = marginTop;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (mergedSettings.page_breaks_between_sections && item.type === 'section' && item.level === 1 && i > 0) {
      doc.addPage();
      y = marginTop;
    }

    if (item.type === 'section') {
      ensureSpace(40);
      const fontSize = item.level === 1 ? 18 : item.level === 2 ? 15 : 13;
      doc.setFont('times', 'bold');
      doc.setFontSize(fontSize);
      const titleLines = doc.splitTextToSize(item.title, contentWidth);
      doc.text(titleLines, marginX, y);
      y += titleLines.length * (fontSize + 4);

      if (item.description) {
        doc.setFont('times', 'italic');
        doc.setFontSize(10.5);
        const descLines = doc.splitTextToSize(item.description, contentWidth);
        doc.text(descLines, marginX, y);
        y += descLines.length * 14 + 10;
      } else {
        y += 8;
      }
    } else if (item.type === 'original_text' || item.type === 'linked_doc') {
      ensureSpace(32);
      doc.setFont('times', 'bold');
      doc.setFontSize(13);
      const headingLines = doc.splitTextToSize(item.title, contentWidth);
      doc.text(headingLines, marginX, y);
      y += headingLines.length * 16 + 6;

      if (item.content) {
        if (item.docType === 'poetry') {
          doc.setFont('times', 'normal');
          doc.setFontSize(10.5);
          const stanzas = item.content.split(/\n\s*\n/);
          for (const stanza of stanzas) {
            const lines = stanza.split('\n');
            ensureSpace(lines.length * 15 + 10);
            for (const line of lines) {
              doc.text(line, marginX + 24, y);
              y += 15;
            }
            y += 8;
          }
        } else {
          doc.setFont('times', 'normal');
          doc.setFontSize(10.5);
          const paragraphs = item.content.split(/\n\s*\n/);
          for (const para of paragraphs) {
            if (!para.trim()) continue;
            const paraLines = doc.splitTextToSize(para.trim(), contentWidth);
            ensureSpace(paraLines.length * 15 + 8);
            doc.text(paraLines, marginX, y);
            y += paraLines.length * 15 + 8;
          }
        }
      }
      y += 12;
    } else if (item.type === 'missing_doc') {
      ensureSpace(36);
      doc.setFont('times', 'italic');
      doc.setFontSize(10.5);
      doc.setTextColor(180, 80, 0);
      const warnText = `[Missing Document: ${item.title}] (Source document is deleted or unavailable)`;
      const warnLines = doc.splitTextToSize(warnText, contentWidth);
      doc.text(warnLines, marginX, y);
      doc.setTextColor(0, 0, 0);
      y += warnLines.length * 15 + 10;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);

    if (p > 1 || !mergedSettings.include_title_page) {
      if (mergedSettings.include_author_header) {
        doc.text(title, marginX, marginTop - 18);
        if (metadata.author) {
          doc.text(metadata.author, pageWidth - marginX, marginTop - 18, { align: 'right' });
        }
      }
      doc.text(`Page ${p} of ${totalPages}`, pageWidth / 2, pageHeight - marginBottom + 24, {
        align: 'center',
      });
    }
  }

  return doc;
}

// ============================================================================
// File Export Coordinator (Tauri RFD or Web Download)
// ============================================================================

export async function saveExportFileToDisk(
  suggestedName: string,
  content: { text?: string; bytes?: Uint8Array },
  filterName: string,
  filterExt: string
): Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }> {
  try {
    if (isTauri()) {
      const bytesArray = content.bytes ? Array.from(content.bytes) : undefined;
      const savedPath = await api.saveExportFile(
        suggestedName,
        { text: content.text, bytes: bytesArray },
        filterName,
        filterExt
      );
      if (savedPath) {
        return { success: true, path: savedPath };
      }
      return { success: false, cancelled: true };
    }

    const mimeType = filterExt === 'pdf' ? 'application/pdf' : 'text/markdown;charset=utf-8';
    const blob = content.bytes
      ? new Blob([content.bytes.buffer as ArrayBuffer], { type: mimeType })
      : new Blob([content.text || ''], { type: mimeType });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    return { success: true, path: suggestedName };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Returns candidate documents eligible for insertion as linked documents in a manuscript.
 * Excludes manuscripts themselves to prevent circular embedding.
 * If activeHouseId is provided, scopes candidates to documents belonging to that House.
 */
export function getManuscriptSourceCandidates(
  documents: DocumentMetadata[],
  activeHouseId?: string | null
): DocumentMetadata[] {
  return documents.filter(doc => {
    if (doc.doc_type === 'manuscript') return false;
    if (activeHouseId !== undefined && activeHouseId !== null) {
      const docHouseId = doc.house_id || 'house-default';
      return docHouseId === activeHouseId;
    }
    return true;
  });
}
