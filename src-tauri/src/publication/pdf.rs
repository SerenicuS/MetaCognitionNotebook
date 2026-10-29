use super::models::*;
use std::collections::BTreeSet;

const PAGE_WIDTH: f64 = 595.28; // A4 width in pt
const PAGE_HEIGHT: f64 = 841.89; // A4 height in pt
const MARGIN_LEFT: f64 = 54.0;
const MARGIN_TOP: f64 = 54.0;
const MARGIN_BOTTOM: f64 = 54.0;

/// Sanitizes a string for WinAnsiEncoding in standard PDF Type 1 fonts.
/// If an unsupported glyph (e.g. CJK, Cyrillic) is encountered, it records
/// an explicit diagnostic warning and replaces it with a clean placeholder.
pub fn sanitize_pdf_text(text: &str, warnings: &mut Vec<PublicationWarning>) -> String {
    let mut out = String::new();
    let mut unsupported = BTreeSet::new();

    for c in text.chars() {
        let cp = c as u32;
        // Standard ASCII
        if (0x20..=0x7E).contains(&cp) {
            out.push(c);
        }
        // Common whitespace
        else if c == '\n' || c == '\t' || c == '\r' {
            out.push(' ');
        }
        // Latin-1 supplement (WinAnsi 0xA0..=0xFF)
        else if (0xA0..=0xFF).contains(&cp) {
            out.push(c);
        }
        // Selected Windows-1252 typographic quotes & dashes
        else if cp == 0x2018 || cp == 0x2019 {
            out.push('\'');
        } else if cp == 0x201C || cp == 0x201D {
            out.push('"');
        } else if cp == 0x2013 || cp == 0x2014 {
            out.push('-');
        } else if cp == 0x2022 {
            out.push('*');
        } else if cp == 0x2026 {
            out.push_str("...");
        } else {
            // Unsupported glyph
            unsupported.insert((c, cp));
            out.push_str("[?]");
        }
    }

    if !unsupported.is_empty() {
        for (c, cp) in unsupported {
            warnings.push(PublicationWarning {
                code: "unsupported_glyphs".into(),
                message: format!(
                    "Font 'Times' does not support glyph '{}' (U+{:04X}). CJK and complex scripts require an author-configured Unicode font.",
                    c, cp
                ),
                entity_id: None,
            });
        }
    }

    out
}

fn escape_pdf_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

fn wrap_text(text: &str, max_chars_per_line: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for raw_line in text.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let words: Vec<&str> = trimmed.split_whitespace().collect();
        let mut cur = String::new();
        for w in words {
            if cur.is_empty() {
                cur.push_str(w);
            } else if cur.chars().count() + 1 + w.chars().count() <= max_chars_per_line {
                cur.push(' ');
                cur.push_str(w);
            } else {
                lines.push(cur);
                cur = w.to_string();
            }
        }
        if !cur.is_empty() {
            lines.push(cur);
        }
    }
    lines
}

struct Page {
    stream: String,
}

pub struct PdfGenerator {
    pages: Vec<Page>,
    cursor_y: f64,
}

impl PdfGenerator {
    pub fn new() -> Self {
        let mut gen = Self {
            pages: Vec::new(),
            cursor_y: PAGE_HEIGHT - MARGIN_TOP,
        };
        gen.new_page();
        gen
    }

    fn current_page_mut(&mut self) -> &mut Page {
        let len = self.pages.len();
        &mut self.pages[len - 1]
    }

    pub fn new_page(&mut self) {
        self.pages.push(Page {
            stream: String::new(),
        });
        self.cursor_y = PAGE_HEIGHT - MARGIN_TOP;
    }

    fn ensure_space(&mut self, needed: f64) {
        if self.cursor_y - needed < MARGIN_BOTTOM {
            self.new_page();
        }
    }

    fn draw_text(&mut self, text: &str, x: f64, y: f64, font: &str, size: f64) {
        let escaped = escape_pdf_string(text);
        let op = format!("BT /{font} {size:.2} Tf 1 0 0 1 {x:.2} {y:.2} Tm ({escaped}) Tj ET\n");
        self.current_page_mut().stream.push_str(&op);
    }

    pub fn render_document(
        &mut self,
        doc: &PublicationDocument,
        warnings: &mut Vec<PublicationWarning>,
    ) {
        // 1. Title Page
        self.cursor_y = PAGE_HEIGHT * 0.65;
        let title_clean = sanitize_pdf_text(&doc.title, warnings);
        let title_lines = wrap_text(&title_clean, 36);
        for line in title_lines {
            self.draw_text(&line, MARGIN_LEFT, self.cursor_y, "F2", 24.0);
            self.cursor_y -= 30.0;
        }

        if let Some(ref sub) = doc.subtitle {
            self.cursor_y -= 8.0;
            let sub_clean = sanitize_pdf_text(sub, warnings);
            let sub_lines = wrap_text(&sub_clean, 48);
            for line in sub_lines {
                self.draw_text(&line, MARGIN_LEFT, self.cursor_y, "F3", 14.0);
                self.cursor_y -= 18.0;
            }
        }

        if let Some(ref author) = doc.author {
            self.cursor_y -= 12.0;
            let author_clean = sanitize_pdf_text(&format!("By {}", author), warnings);
            self.draw_text(&author_clean, MARGIN_LEFT, self.cursor_y, "F1", 11.0);
            self.cursor_y -= 16.0;
        }

        if let Some(ref desc) = doc.universe_description {
            self.ensure_space(50.0);
            self.cursor_y -= 24.0;
            self.draw_text(
                "Universe Introduction",
                MARGIN_LEFT,
                self.cursor_y,
                "F2",
                14.0,
            );
            self.cursor_y -= 20.0;
            let name = sanitize_pdf_text(&doc.universe_name, warnings);
            for line in wrap_text(&name, 65) {
                self.ensure_space(16.0);
                self.draw_text(&line, MARGIN_LEFT, self.cursor_y, "F2", 11.0);
                self.cursor_y -= 16.0;
            }
            let desc_clean = sanitize_pdf_text(desc, warnings);
            let desc_lines = wrap_text(&desc_clean, 70);
            for line in desc_lines {
                self.ensure_space(15.0);
                self.draw_text(&line, MARGIN_LEFT, self.cursor_y, "F1", 10.5);
                self.cursor_y -= 15.0;
            }
        }

        // 2. Table of Contents
        if !doc.table_of_contents.is_empty() {
            self.new_page();
            self.draw_text("Table of Contents", MARGIN_LEFT, self.cursor_y, "F2", 18.0);
            self.cursor_y -= 28.0;

            for cat in &doc.table_of_contents {
                self.ensure_space(20.0);
                let cat_clean = sanitize_pdf_text(&cat.title, warnings);
                self.draw_text(
                    &format!("* {}", cat_clean),
                    MARGIN_LEFT,
                    self.cursor_y,
                    "F2",
                    11.0,
                );
                self.cursor_y -= 16.0;

                for item in &cat.children {
                    self.ensure_space(16.0);
                    let item_clean = sanitize_pdf_text(&item.title, warnings);
                    self.draw_text(
                        &format!("  - {}", item_clean),
                        MARGIN_LEFT + 14.0,
                        self.cursor_y,
                        "F1",
                        10.0,
                    );
                    self.cursor_y -= 14.0;
                }
                self.cursor_y -= 6.0;
            }
        }

        // 3. Category Sections and Entries
        for (idx, section) in doc.sections.iter().enumerate() {
            if idx > 0 || !doc.table_of_contents.is_empty() {
                self.new_page();
            }

            let sec_clean = sanitize_pdf_text(&section.title, warnings);
            self.draw_text(&sec_clean, MARGIN_LEFT, self.cursor_y, "F2", 16.0);
            self.cursor_y -= 24.0;

            for entry in &section.entries {
                self.ensure_space(40.0);
                let entry_clean = sanitize_pdf_text(&entry.title, warnings);
                self.draw_text(&entry_clean, MARGIN_LEFT, self.cursor_y, "F2", 13.0);
                self.cursor_y -= 18.0;

                // Fields
                for f in &entry.fields {
                    self.ensure_space(16.0);
                    let label_clean = sanitize_pdf_text(&f.label, warnings);
                    let val_clean = sanitize_pdf_text(&f.value, warnings);
                    let line = format!("* {}: {}", label_clean, val_clean);
                    let wrapped = wrap_text(&line, 75);
                    for w in wrapped {
                        self.ensure_space(14.0);
                        self.draw_text(&w, MARGIN_LEFT + 8.0, self.cursor_y, "F1", 10.0);
                        self.cursor_y -= 14.0;
                    }
                }

                if !entry.institutional_positions.is_empty() {
                    self.ensure_space(20.0);
                    self.draw_text(
                        "Institutional Positions",
                        MARGIN_LEFT + 8.0,
                        self.cursor_y,
                        "F2",
                        10.0,
                    );
                    self.cursor_y -= 15.0;
                    for office in &entry.institutional_positions {
                        let text = sanitize_pdf_text(
                            &format!("{}: {}", office.label, office.value),
                            warnings,
                        );
                        for line in wrap_text(&text, 72) {
                            self.ensure_space(14.0);
                            self.draw_text(&line, MARGIN_LEFT + 12.0, self.cursor_y, "F1", 10.0);
                            self.cursor_y -= 14.0;
                        }
                    }
                }
                // Faction Hierarchy
                if let Some(ref h) = entry.hierarchy {
                    self.ensure_space(20.0);
                    self.draw_text(
                        "* Organizational Structure:",
                        MARGIN_LEFT + 8.0,
                        self.cursor_y,
                        "F2",
                        10.0,
                    );
                    self.cursor_y -= 15.0;
                    self.render_hierarchy_pdf(h, 1, warnings);
                }

                // Prose
                if let Some(ref prose) = entry.prose {
                    self.cursor_y -= 6.0;
                    let prose_clean = sanitize_pdf_text(prose, warnings);
                    let wrapped = wrap_text(&prose_clean, 75);
                    for line in wrapped {
                        self.ensure_space(14.0);
                        self.draw_text(&line, MARGIN_LEFT, self.cursor_y, "F1", 10.0);
                        self.cursor_y -= 14.0;
                    }
                }

                self.cursor_y -= 14.0;
            }
        }

        // 4. Relationships
        if !doc.relationships.is_empty() {
            self.new_page();
            self.draw_text("Relationships", MARGIN_LEFT, self.cursor_y, "F2", 16.0);
            self.cursor_y -= 24.0;

            for rel in &doc.relationships {
                self.ensure_space(24.0);
                let src_clean = sanitize_pdf_text(&rel.source_title, warnings);
                let tgt_clean = sanitize_pdf_text(&rel.target_title, warnings);
                let label_clean = sanitize_pdf_text(&rel.label, warnings);

                let arrow = if rel.directed { "-->" } else { "<-->" };
                let line = format!("* {} {} {} {}", src_clean, arrow, label_clean, tgt_clean);
                for summary_line in wrap_text(&line, 78) {
                    self.ensure_space(15.0);
                    self.draw_text(&summary_line, MARGIN_LEFT, self.cursor_y, "F1", 10.0);
                    self.cursor_y -= 15.0;
                }

                for connection in &rel.connections {
                    let text = sanitize_pdf_text(
                        &format!(
                            "{} {} {} {} ({})",
                            connection.source_title,
                            if connection.directed { "-->" } else { "<-->" },
                            connection.label,
                            connection.target_title,
                            connection.provenance
                        ),
                        warnings,
                    );
                    for line in wrap_text(&text, 72) {
                        self.ensure_space(14.0);
                        self.draw_text(&line, MARGIN_LEFT + 10.0, self.cursor_y, "F1", 9.5);
                        self.cursor_y -= 14.0;
                    }
                    if let Some(desc) = &connection.description {
                        let text = sanitize_pdf_text(desc, warnings);
                        for line in wrap_text(&text, 70) {
                            self.ensure_space(14.0);
                            self.draw_text(&line, MARGIN_LEFT + 15.0, self.cursor_y, "F3", 9.5);
                            self.cursor_y -= 14.0;
                        }
                    }
                }
                if let Some(ref desc) = rel.description {
                    let desc_clean = sanitize_pdf_text(desc, warnings);
                    let wrapped = wrap_text(&format!("  * {}", desc_clean), 75);
                    for w in wrapped {
                        self.ensure_space(14.0);
                        self.draw_text(&w, MARGIN_LEFT + 10.0, self.cursor_y, "F3", 9.5);
                        self.cursor_y -= 13.0;
                    }
                }
            }
        }

        // 5. Historical Timeline
        if let Some(ref timeline) = doc.timeline {
            self.new_page();
            let t_title = sanitize_pdf_text(&timeline.title, warnings);
            self.draw_text(&t_title, MARGIN_LEFT, self.cursor_y, "F2", 16.0);
            self.cursor_y -= 24.0;

            for m in &timeline.milestones {
                self.ensure_space(36.0);
                let m_title = sanitize_pdf_text(&m.title, warnings);
                self.draw_text(&m_title, MARGIN_LEFT, self.cursor_y, "F2", 12.0);
                self.cursor_y -= 16.0;

                if let Some(ref era) = m.era {
                    let era_clean = sanitize_pdf_text(&format!("Era / Date: {}", era), warnings);
                    self.draw_text(&era_clean, MARGIN_LEFT, self.cursor_y, "F3", 10.0);
                    self.cursor_y -= 14.0;
                }

                if let Some(ref desc) = m.description {
                    let desc_clean = sanitize_pdf_text(desc, warnings);
                    let wrapped = wrap_text(&desc_clean, 75);
                    for w in wrapped {
                        self.ensure_space(14.0);
                        self.draw_text(&w, MARGIN_LEFT, self.cursor_y, "F1", 10.0);
                        self.cursor_y -= 14.0;
                    }
                }

                self.render_narrative_references(&m.references, warnings);
                for ch in &m.changes {
                    self.ensure_space(14.0);
                    let ent_clean = sanitize_pdf_text(&ch.entity_title, warnings);
                    let details = sanitize_pdf_text(&state_change_text(ch), warnings);
                    let line = format!("  * {}: {}", ent_clean, details);
                    let wrapped = wrap_text(&line, 75);
                    for w in wrapped {
                        self.ensure_space(14.0);
                        self.draw_text(&w, MARGIN_LEFT + 8.0, self.cursor_y, "F1", 9.5);
                        self.cursor_y -= 13.0;
                    }
                }
                self.cursor_y -= 8.0;
            }
        }

        // 6. Alternate Continuities
        if !doc.alternate_continuities.is_empty() {
            self.new_page();
            self.draw_text(
                "Alternate Continuities",
                MARGIN_LEFT,
                self.cursor_y,
                "F2",
                16.0,
            );
            self.cursor_y -= 24.0;

            for b in &doc.alternate_continuities {
                self.ensure_space(32.0);
                let b_name =
                    sanitize_pdf_text(&format!("Alternate Continuity: {}", b.name), warnings);
                self.draw_text(&b_name, MARGIN_LEFT, self.cursor_y, "F2", 12.5);
                self.cursor_y -= 16.0;

                if let Some(ref desc) = b.description {
                    let desc_clean = sanitize_pdf_text(desc, warnings);
                    let wrapped = wrap_text(&desc_clean, 75);
                    for w in wrapped {
                        self.ensure_space(14.0);
                        self.draw_text(&w, MARGIN_LEFT, self.cursor_y, "F3", 10.0);
                        self.cursor_y -= 14.0;
                    }
                }

                if let Some(ref div) = b.divergence_milestone {
                    let div_clean = sanitize_pdf_text(
                        &format!(
                            "Diverges from canonical milestone: {} ({})",
                            div.title, div.era
                        ),
                        warnings,
                    );
                    self.draw_text(&div_clean, MARGIN_LEFT, self.cursor_y, "F3", 9.5);
                    self.cursor_y -= 14.0;
                }

                for bn in &b.milestones {
                    self.ensure_space(16.0);
                    let era_str = bn.era.as_deref().unwrap_or("");
                    let title_clean =
                        sanitize_pdf_text(&format!("* {} ({})", bn.title, era_str), warnings);
                    self.draw_text(&title_clean, MARGIN_LEFT + 8.0, self.cursor_y, "F2", 10.0);
                    self.cursor_y -= 14.0;

                    if let Some(ref desc) = bn.description {
                        let desc_clean = sanitize_pdf_text(desc, warnings);
                        let wrapped = wrap_text(&desc_clean, 70);
                        for w in wrapped {
                            self.ensure_space(13.0);
                            self.draw_text(&w, MARGIN_LEFT + 16.0, self.cursor_y, "F1", 9.0);
                            self.cursor_y -= 13.0;
                        }
                    }
                    self.render_narrative_references(&bn.references, warnings);
                    for ch in &bn.changes {
                        let text = sanitize_pdf_text(
                            &format!("{}: {}", ch.entity_title, state_change_text(ch)),
                            warnings,
                        );
                        for line in wrap_text(&text, 70) {
                            self.ensure_space(14.0);
                            self.draw_text(&line, MARGIN_LEFT + 16.0, self.cursor_y, "F1", 9.5);
                            self.cursor_y -= 14.0;
                        }
                    }
                }
                self.cursor_y -= 10.0;
            }
        }

        // 7. Excerpts
        if !doc.excerpts.is_empty() {
            self.new_page();
            self.draw_text("Excerpts", MARGIN_LEFT, self.cursor_y, "F2", 16.0);
            self.cursor_y -= 24.0;

            for exc in &doc.excerpts {
                self.ensure_space(40.0);
                let head_clean = sanitize_pdf_text(&exc.heading, warnings);
                self.draw_text(&head_clean, MARGIN_LEFT, self.cursor_y, "F2", 12.0);
                self.cursor_y -= 16.0;

                let attr_clean = sanitize_pdf_text(
                    &format!("From Chapter {}, Book {}", exc.chapter_title, exc.book_name),
                    warnings,
                );
                self.draw_text(&attr_clean, MARGIN_LEFT, self.cursor_y, "F3", 9.5);
                self.cursor_y -= 14.0;

                let quote_clean = sanitize_pdf_text(&exc.excerpt_text, warnings);
                let wrapped = wrap_text(&quote_clean, 70);
                for w in wrapped {
                    self.ensure_space(14.0);
                    self.draw_text(
                        &format!("> {}", w),
                        MARGIN_LEFT + 12.0,
                        self.cursor_y,
                        "F1",
                        9.5,
                    );
                    self.cursor_y -= 14.0;
                }
                self.cursor_y -= 10.0;
            }
        }

        // 8. Headers and Footers (Running header & Page numbers)
        let total_pages = self.pages.len();
        for p in 1..=total_pages {
            if p > 1 {
                // Running header
                let header_title = sanitize_pdf_text(&doc.title, warnings);
                let header_op = format!(
                    "BT /F1 9.00 Tf 0.47 0.47 0.47 rg 1 0 0 1 {x:.2} {y:.2} Tm ({escaped}) Tj 0 0 0 rg ET\n",
                    x = MARGIN_LEFT,
                    y = PAGE_HEIGHT - MARGIN_TOP + 18.0,
                    escaped = escape_pdf_string(&header_title)
                );
                self.pages[p - 1].stream.push_str(&header_op);

                // Footer: Page X of Y (centered)
                let footer_text = format!("Page {} of {}", p, total_pages);
                let footer_x = (PAGE_WIDTH / 2.0) - 25.0;
                let footer_op = format!(
                    "BT /F1 9.00 Tf 0.47 0.47 0.47 rg 1 0 0 1 {x:.2} {y:.2} Tm ({escaped}) Tj 0 0 0 rg ET\n",
                    x = footer_x,
                    y = MARGIN_BOTTOM - 24.0,
                    escaped = escape_pdf_string(&footer_text)
                );
                self.pages[p - 1].stream.push_str(&footer_op);
            }
        }
    }

    fn render_narrative_references(
        &mut self,
        references: &[PublicationNarrativeReference],
        warnings: &mut Vec<PublicationWarning>,
    ) {
        for reference in references {
            let text = sanitize_pdf_text(
                &format!(
                    "Read the event in {} - {}",
                    reference.chapter_title, reference.book_name
                ),
                warnings,
            );
            for line in wrap_text(&text, 72) {
                self.ensure_space(14.0);
                self.draw_text(&line, MARGIN_LEFT + 8.0, self.cursor_y, "F1", 10.0);
                self.cursor_y -= 14.0;
            }
        }
    }

    fn render_hierarchy_pdf(
        &mut self,
        node: &PublicationHierarchyNode,
        level: usize,
        warnings: &mut Vec<PublicationWarning>,
    ) {
        self.ensure_space(16.0);
        let indent = (level * 10) as f64;
        let prefix = if node.node_type == "branch" {
            "Branch: "
        } else {
            "Position: "
        };
        let title_clean = sanitize_pdf_text(&format!("{}{}", prefix, node.title), warnings);
        self.draw_text(
            &title_clean,
            MARGIN_LEFT + 8.0 + indent,
            self.cursor_y,
            "F2",
            9.5,
        );
        self.cursor_y -= 13.0;

        if let Some(ref desc) = node.description {
            let desc_clean = sanitize_pdf_text(&format!("Description: {}", desc), warnings);
            self.draw_text(
                &desc_clean,
                MARGIN_LEFT + 14.0 + indent,
                self.cursor_y,
                "F1",
                9.0,
            );
            self.cursor_y -= 12.0;
        }

        if !node.holders.is_empty() {
            let holder_names: Vec<String> = node.holders.iter().map(|h| h.title.clone()).collect();
            let holders_clean =
                sanitize_pdf_text(&format!("Holders: {}", holder_names.join(", ")), warnings);
            self.draw_text(
                &holders_clean,
                MARGIN_LEFT + 14.0 + indent,
                self.cursor_y,
                "F3",
                9.0,
            );
            self.cursor_y -= 12.0;
        }

        for child in &node.children {
            self.render_hierarchy_pdf(child, level + 1, warnings);
        }
    }

    pub fn to_bytes(&self, title: &str) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

        let total_pages = self.pages.len();
        // Object IDs:
        // 1: Catalog
        // 2: Pages
        // 3: Font Times-Roman
        // 4: Font Times-Bold
        // 5: Font Times-Italic
        // 6: Info
        // 7 .. 7 + total_pages - 1: Page objects
        // 7 + total_pages .. 7 + total_pages * 2 - 1: Content stream objects

        let mut offsets = Vec::new();

        // 1: Catalog
        offsets.push(out.len());
        out.extend_from_slice(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

        // 2: Pages
        offsets.push(out.len());
        let mut kids = String::new();
        for p in 0..total_pages {
            kids.push_str(&format!("{} 0 R ", 7 + p));
        }
        let pages_obj =
            format!("2 0 obj\n<< /Type /Pages /Kids [{kids}] /Count {total_pages} >>\nendobj\n");
        out.extend_from_slice(pages_obj.as_bytes());

        // 3: Font Times-Roman
        offsets.push(out.len());
        out.extend_from_slice(
            b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>\nendobj\n",
        );

        // 4: Font Times-Bold
        offsets.push(out.len());
        out.extend_from_slice(
            b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
        );

        // 5: Font Times-Italic
        offsets.push(out.len());
        out.extend_from_slice(
            b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>\nendobj\n",
        );

        // 6: Info
        offsets.push(out.len());
        let info_obj = format!(
            "6 0 obj\n<< /Title ({title}) /Creator (MetaCognition Notebook) >>\nendobj\n",
            title = escape_pdf_string(title)
        );
        out.extend_from_slice(info_obj.as_bytes());

        // Page objects
        for p in 0..total_pages {
            offsets.push(out.len());
            let content_id = 7 + total_pages + p;
            let page_obj = format!(
                "{} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Contents {} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> >>\nendobj\n",
                7 + p,
                PAGE_WIDTH,
                PAGE_HEIGHT,
                content_id
            );
            out.extend_from_slice(page_obj.as_bytes());
        }

        // Content stream objects
        for (p, page) in self.pages.iter().enumerate() {
            offsets.push(out.len());
            let stream_bytes = page.stream.as_bytes();
            let stream_obj = format!(
                "{} 0 obj\n<< /Length {} >>\nstream\n",
                7 + total_pages + p,
                stream_bytes.len()
            );
            out.extend_from_slice(stream_obj.as_bytes());
            out.extend_from_slice(stream_bytes);
            out.extend_from_slice(b"\nendstream\nendobj\n");
        }

        // Xref table
        let xref_offset = out.len();
        let total_objects = 7 + total_pages * 2;
        let xref_header = format!("xref\n0 {total_objects}\n0000000000 65535 f \n");
        out.extend_from_slice(xref_header.as_bytes());

        for off in offsets {
            let line = format!("{:010} 00000 n \n", off);
            out.extend_from_slice(line.as_bytes());
        }

        // Trailer
        let trailer = format!(
            "trailer\n<< /Size {total_objects} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
        );
        out.extend_from_slice(trailer.as_bytes());

        out
    }
}

pub fn render_pdf_from_document(
    doc: &PublicationDocument,
    warnings: &mut Vec<PublicationWarning>,
) -> (Vec<u8>, usize) {
    let mut gen = PdfGenerator::new();
    gen.render_document(doc, warnings);
    let bytes = gen.to_bytes(&doc.title);
    let page_count = gen.pages.len();
    (bytes, page_count)
}
