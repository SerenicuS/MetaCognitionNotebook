use super::models::*;
use crate::thought::{Branch, Node, Plan, Universe};
use std::collections::{BTreeMap, HashMap};

pub fn slugify(text: &str, seen: &mut BTreeMap<String, usize>) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for c in text.trim().chars() {
        if c.is_alphanumeric() {
            for lc in c.to_lowercase() {
                slug.push(lc);
            }
            last_dash = false;
        } else if c == '-' || c == '_' || c.is_whitespace() {
            if !last_dash && !slug.is_empty() {
                slug.push('-');
                last_dash = true;
            }
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        slug = "section".to_string();
    }
    let count = seen.entry(slug.clone()).or_insert(0);
    let final_slug = if *count == 0 {
        slug
    } else {
        format!("{}-{}", slug, count)
    };
    *count += 1;
    final_slug
}

pub fn escape_link_text(text: &str) -> String {
    text.replace('[', "\\[").replace(']', "\\]")
}

pub fn category_display_name(category: &str) -> &str {
    match category {
        "characters" => "Characters",
        "locations" => "Locations",
        "factions" => "Factions",
        "rules" => "Rules & Systems",
        "cultures" => "Cultures & Traditions",
        "artifacts" => "Relics & Artifacts",
        "events" => "Historical Events",
        _ => "Other Entries",
    }
}

pub struct GenerationResult {
    pub markdown: String,
    pub toc: Vec<TocItem>,
    pub category_counts: BTreeMap<String, usize>,
    pub relationship_count: usize,
    pub milestone_count: usize,
    pub excerpt_count: usize,
}

/// Builds the shared, privacy-filtered, explicitly selected PublicationDocument.
/// Both Markdown and PDF publication pipelines consume this exact structured model.
pub fn build_publication_document(
    universe: &Universe,
    docs: &[PublishedDoc],
    plan: &Plan,
    request: &PublicationRequest,
    chapter_titles: &HashMap<String, PublicationChapterSource>,
    warnings: &mut Vec<PublicationWarning>,
) -> PublicationDocument {
    // This document is a reader-facing projection of already selected, privacy-filtered sources.
    let historical = request.filter_spoilers_after_milestone_id.is_some()
        || request.include_alternate_continuities;
    let mut projected_docs = docs.to_vec();
    if historical {
        for d in &mut projected_docs {
            if let Some(f) = &mut d.faction_fields {
                for p in f.positions.iter_mut().flatten() {
                    p.holder_ids = None;
                }
            }
        }
        warnings.push(PublicationWarning { code: "undated_offices_omitted".into(), message: "Institutional holders are omitted: dated office history is unavailable. Alternate continuity timelines do not establish current office holdings.".into(), entity_id: None });
    }
    if !request.include_factions {
        projected_docs.retain(|d| d.category != "factions");
    }
    if let Some(cutoff_id) = &request.filter_spoilers_after_milestone_id {
        // Current profiles cannot establish historical presence. Only explicit recorded absence removes an entry.
        if let Some(cutoff) = plan.nodes.iter().find(|n| {
            &n.id == cutoff_id
                && n.universe_id == universe.id
                && n.book_id.is_none()
                && n.branch_id.is_none()
                && !n.archived
        }) {
            let mut nodes: Vec<_> = plan
                .nodes
                .iter()
                .filter(|n| {
                    n.universe_id == universe.id
                        && n.book_id.is_none()
                        && n.branch_id.is_none()
                        && !n.archived
                        && n.position <= cutoff.position
                })
                .collect();
            nodes.sort_by(|a, b| a.position.cmp(&b.position).then(a.id.cmp(&b.id)));
            let mut statuses = HashMap::new();
            for node in nodes {
                for change in &node.changes {
                    if change.property_key == "status" {
                        statuses.insert(change.entity_id.as_str(), change.new_value.as_deref());
                    }
                }
            }
            projected_docs.retain(|d| statuses.get(d.id.as_str()) != Some(&Some("not_introduced")));
        }
    }
    let docs = projected_docs.as_slice();
    let mut seen_slugs = BTreeMap::new();

    // Map doc_id -> (title, slug) for entity linking without leaking internal IDs
    let mut entity_map: HashMap<String, (String, String)> = HashMap::new();

    let standard_categories = [
        "characters",
        "locations",
        "factions",
        "rules",
        "cultures",
        "artifacts",
        "events",
        "other",
    ];

    let mut docs_by_cat: BTreeMap<String, Vec<&PublishedDoc>> = BTreeMap::new();
    for doc in docs {
        docs_by_cat
            .entry(doc.category.clone())
            .or_default()
            .push(doc);
    }
    for list in docs_by_cat.values_mut() {
        list.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    }

    let doc_title = request
        .title
        .as_deref()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(&universe.name)
        .to_string();

    let _universe_slug = slugify(&doc_title, &mut seen_slugs);

    let mut category_slugs: HashMap<String, String> = HashMap::new();
    for cat in &standard_categories {
        if let Some(cat_docs) = docs_by_cat.get(*cat) {
            if !cat_docs.is_empty() {
                let cat_display = category_display_name(cat);
                let cat_slug = slugify(cat_display, &mut seen_slugs);
                category_slugs.insert(cat.to_string(), cat_slug);

                for d in cat_docs {
                    let s = slugify(&d.title, &mut seen_slugs);
                    entity_map.insert(d.id.clone(), (d.title.clone(), s));
                }
            }
        }
    }
    for (cat, cat_docs) in &docs_by_cat {
        if !standard_categories.contains(&cat.as_str()) && !cat_docs.is_empty() {
            let cat_display = category_display_name(cat);
            let cat_slug = slugify(cat_display, &mut seen_slugs);
            category_slugs.insert(cat.clone(), cat_slug);

            for d in cat_docs {
                let s = slugify(&d.title, &mut seen_slugs);
                entity_map.insert(d.id.clone(), (d.title.clone(), s));
            }
        }
    }

    // Build Table of Contents and Category Sections
    let mut toc = Vec::new();
    let mut sections = Vec::new();

    for cat in &standard_categories {
        if let Some(cat_docs) = docs_by_cat.get(*cat) {
            if !cat_docs.is_empty() {
                let cat_display = category_display_name(cat);
                let cat_slug = category_slugs.get(*cat).unwrap();

                let mut entries = Vec::new();
                let mut toc_children = Vec::new();

                for d in cat_docs {
                    let (_, ent_slug) = entity_map.get(&d.id).unwrap();
                    toc_children.push(TocItem {
                        title: d.title.clone(),
                        anchor: ent_slug.clone(),
                        level: 3,
                        children: vec![],
                    });

                    let fields = extract_entity_fields(d, request);
                    let institutional_positions =
                        institutional_positions(d, docs, request, historical);
                    let hierarchy = if request.include_faction_hierarchy && d.category == "factions"
                    {
                        d.faction_fields.as_ref().and_then(|f| {
                            extract_faction_hierarchy(
                                f.branches.as_deref().unwrap_or_default(),
                                f.positions.as_deref().unwrap_or_default(),
                                request.include_faction_holders,
                                &entity_map,
                            )
                        })
                    } else {
                        None
                    };

                    let prose = if request.include_entity_prose && !d.prose.trim().is_empty() {
                        suppress_template_prose(&d.prose, d, &universe.name)
                    } else {
                        None
                    };

                    entries.push(PublicationEntry {
                        title: d.title.clone(),
                        anchor: ent_slug.clone(),
                        category: d.category.clone(),
                        fields,
                        institutional_positions,
                        prose,
                        hierarchy,
                    });
                }

                toc.push(TocItem {
                    title: cat_display.to_string(),
                    anchor: cat_slug.clone(),
                    level: 2,
                    children: toc_children,
                });

                sections.push(PublicationSection {
                    category: cat.to_string(),
                    title: cat_display.to_string(),
                    anchor: cat_slug.clone(),
                    entries,
                });
            }
        }
    }

    for (cat, cat_docs) in &docs_by_cat {
        if !standard_categories.contains(&cat.as_str()) && !cat_docs.is_empty() {
            let cat_display = category_display_name(cat);
            let cat_slug = category_slugs.get(cat).unwrap();

            let mut entries = Vec::new();
            let mut toc_children = Vec::new();

            for d in cat_docs {
                let (_, ent_slug) = entity_map.get(&d.id).unwrap();
                toc_children.push(TocItem {
                    title: d.title.clone(),
                    anchor: ent_slug.clone(),
                    level: 3,
                    children: vec![],
                });

                let fields = extract_entity_fields(d, request);
                let institutional_positions = institutional_positions(d, docs, request, historical);
                let prose = if request.include_entity_prose && !d.prose.trim().is_empty() {
                    suppress_template_prose(&d.prose, d, &universe.name)
                } else {
                    None
                };

                entries.push(PublicationEntry {
                    title: d.title.clone(),
                    anchor: ent_slug.clone(),
                    category: d.category.clone(),
                    fields,
                    institutional_positions,
                    prose,
                    hierarchy: None,
                });
            }

            toc.push(TocItem {
                title: cat_display.to_string(),
                anchor: cat_slug.clone(),
                level: 2,
                children: toc_children,
            });

            sections.push(PublicationSection {
                category: cat.clone(),
                title: cat_display.to_string(),
                anchor: cat_slug.clone(),
                entries,
            });
        }
    }

    // Relationships section
    let mut relationships = Vec::new();
    if request.include_relationships {
        for rel in &plan.relationships {
            if rel.universe_id == universe.id && !rel.archived && rel.book_id.is_none() {
                if let (Some(source), Some(target)) = (
                    entity_map.get(&rel.source_id),
                    entity_map.get(&rel.target_id),
                ) {
                    let label = match resolved_relationship_label(rel, plan, request) {
                        Some(label) => label,
                        None => continue,
                    };
                    if request
                        .relationship_types
                        .as_ref()
                        .is_some_and(|types| !types.iter().any(|t| t.eq_ignore_ascii_case(&label)))
                    {
                        continue;
                    }
                    relationships.push(PublicationRelationship {
                        connections: vec![],
                        provenance: "authored".into(),
                        source_title: source.0.clone(),
                        source_anchor: source.1.clone(),
                        target_title: target.0.clone(),
                        target_anchor: target.1.clone(),
                        label,
                        description: if historical || rel.description.trim().is_empty() {
                            None
                        } else {
                            Some(rel.description.trim().to_string())
                        },
                        directed: rel.directed,
                    });
                }
            }
        }
        if !historical && request.include_faction_hierarchy && request.include_faction_holders {
            for faction in docs.iter().filter(|d| d.category == "factions") {
                if let Some(f) = &faction.faction_fields {
                    for p in f.positions.iter().flatten() {
                        for id in p.holder_ids.iter().flatten() {
                            if !docs
                                .iter()
                                .any(|d| &d.id == id && d.category == "characters")
                            {
                                continue;
                            }
                            let (Some(source), Some(target)) =
                                (entity_map.get(id), entity_map.get(&faction.id))
                            else {
                                continue;
                            };
                            let label = format!("Holds {} in", p.title.trim());
                            if request.relationship_types.as_ref().is_some_and(|types| {
                                !types.iter().any(|t| t.eq_ignore_ascii_case(&label))
                            }) {
                                continue;
                            }
                            let branch = f
                                .branches
                                .iter()
                                .flatten()
                                .find(|b| Some(&b.id) == p.branch_id.as_ref());
                            let description = Some(format!(
                                "Derived from faction organization{}",
                                branch
                                    .map(|b| format!(" / Branch: {}", b.name))
                                    .unwrap_or_default()
                            ));
                            relationships.push(PublicationRelationship {
                                source_title: source.0.clone(),
                                source_anchor: source.1.clone(),
                                target_title: target.0.clone(),
                                target_anchor: target.1.clone(),
                                label,
                                description,
                                directed: true,
                                provenance: "office".into(),
                                connections: vec![],
                            });
                        }
                    }
                }
            }
        }
        relationships = aggregate_relationships(relationships);
        if !relationships.is_empty() {
            let rel_slug = slugify("Relationships", &mut seen_slugs);
            toc.push(TocItem {
                title: "Relationships".into(),
                anchor: rel_slug,
                level: 2,
                children: vec![],
            });
        }
    }

    // Allocate safe excerpt anchors before chronicles so references link to the same reader-facing entry.
    let mut excerpt_anchors = HashMap::new();
    // Explicit document selection can approve a citation without approving manuscript prose.
    for (id, source) in chapter_titles {
        if request
            .selected_entity_ids
            .as_ref()
            .is_some_and(|ids| ids.contains(id))
            && chapter_reference_visible(source, plan, request)
        {
            excerpt_anchors.insert(id.clone(), String::new());
        }
    }

    let mut selected_excerpt_anchors = HashMap::new();
    for (index, excerpt) in request.selected_excerpts.iter().enumerate() {
        let Some(source) = chapter_titles.get(&excerpt.chapter_id) else {
            continue;
        };
        if excerpt.excerpt_text.trim().is_empty()
            || !chapter_reference_visible(source, plan, request)
        {
            continue;
        }
        let heading = excerpt
            .heading
            .as_deref()
            .filter(|h| !h.trim().is_empty())
            .unwrap_or(&source.title);
        let anchor = slugify(heading, &mut seen_slugs);
        selected_excerpt_anchors.insert(index, anchor.clone());
        let first_anchor = excerpt_anchors
            .entry(excerpt.chapter_id.clone())
            .or_default();
        if first_anchor.is_empty() {
            *first_anchor = anchor;
        }
    }

    // Historical Timeline section
    let mut timeline_section = None;
    if request.include_timeline {
        let mut nodes: Vec<&Node> = plan
            .nodes
            .iter()
            .filter(|n| {
                n.universe_id == universe.id
                    && n.book_id.is_none()
                    && !n.archived
                    && n.branch_id.is_none()
            })
            .collect();
        nodes.sort_by_key(|n| n.position);

        if let Some(ref target_id) = request.filter_spoilers_after_milestone_id {
            if let Some(target_node) = nodes.iter().find(|n| n.id == *target_id) {
                let cutoff = target_node.position;
                nodes.retain(|n| n.position <= cutoff);
            } else {
                warnings.push(PublicationWarning {
                    code: "unknown_milestone_cutoff".into(),
                    message: format!(
                        "Spoiler cutoff milestone '{}' not found in canonical timeline",
                        target_id
                    ),
                    entity_id: None,
                });
                nodes.clear();
            }
        }

        if let Some(ref selected_ids) = request.selected_milestone_ids {
            nodes.retain(|n| selected_ids.contains(&n.id));
        }

        let mut milestones = Vec::new();
        let mut toc_milestones = Vec::new();

        for n in nodes {
            let m_slug = slugify(&n.title, &mut seen_slugs);
            toc_milestones.push(TocItem {
                title: n.title.clone(),
                anchor: m_slug.clone(),
                level: 3,
                children: vec![],
            });

            let mut changes = Vec::new();
            for ch in &n.changes {
                if let Some((ent_title, ent_slug)) = entity_map.get(&ch.entity_id) {
                    changes.push(PublicationStateChange {
                        entity_title: ent_title.clone(),
                        entity_anchor: ent_slug.clone(),
                        property_key: ch.property_key.clone(),
                        previous_value: ch
                            .previous_value
                            .clone()
                            .unwrap_or_else(|| "unassigned".into()),
                        new_value: ch.new_value.clone().unwrap_or_else(|| "unknown".into()),
                    });
                }
            }

            milestones.push(PublicationMilestone {
                references: narrative_references(&n.id, chapter_titles, &excerpt_anchors),
                title: n.title.clone(),
                anchor: m_slug,
                era: if n.era.trim().is_empty() {
                    None
                } else {
                    Some(n.era.trim().to_string())
                },
                description: if n.description.trim().is_empty() {
                    None
                } else {
                    Some(n.description.trim().to_string())
                },
                changes,
            });
        }

        if !milestones.is_empty() {
            let time_slug = slugify("Historical Timeline", &mut seen_slugs);
            toc.push(TocItem {
                title: "Historical Timeline".into(),
                anchor: time_slug.clone(),
                level: 2,
                children: toc_milestones,
            });
            timeline_section = Some(PublicationTimeline {
                title: "Historical Timeline".into(),
                anchor: time_slug,
                milestones,
            });
        }
    }

    // Alternate Continuities section
    let mut alternate_continuities = Vec::new();
    if request.include_alternate_continuities
        && request.filter_spoilers_after_milestone_id.is_some()
    {
        warnings.push(PublicationWarning { code: "alternate_chronicles_omitted_at_cutoff".into(), message: "Alternate chronicles are omitted with a canonical spoiler cutoff because their later narrative cannot be safely ordered against it.".into(), entity_id: None });
    }

    if request.include_alternate_continuities
        && request.filter_spoilers_after_milestone_id.is_none()
    {
        let mut branches: Vec<&Branch> = plan
            .branches
            .iter()
            .filter(|b| b.universe_id == universe.id && !b.archived)
            .collect();

        if let Some(ref selected_branch_ids) = request.selected_branch_ids {
            branches.retain(|b| selected_branch_ids.contains(&b.id));
        }

        let mut toc_branches = Vec::new();

        for b in branches {
            let b_slug = slugify(&b.name, &mut seen_slugs);
            toc_branches.push(TocItem {
                title: b.name.clone(),
                anchor: b_slug.clone(),
                level: 3,
                children: vec![],
            });

            let divergence_milestone = plan
                .nodes
                .iter()
                .find(|n| {
                    n.id == b.divergence_node_id
                        && n.universe_id == universe.id
                        && !n.archived
                        && request
                            .selected_milestone_ids
                            .as_ref()
                            .map_or(true, |ids| ids.contains(&n.id))
                })
                .map(|dn| {
                    let div_slug = slugify(&dn.title, &mut seen_slugs);
                    PublicationDivergenceRef {
                        title: dn.title.clone(),
                        era: dn.era.clone(),
                        anchor: div_slug,
                    }
                });

            let mut branch_nodes: Vec<&Node> = plan
                .nodes
                .iter()
                .filter(|n| {
                    n.universe_id == universe.id
                        && n.book_id.is_none()
                        && n.branch_id == Some(b.id.clone())
                        && !n.archived
                        && request
                            .selected_milestone_ids
                            .as_ref()
                            .map_or(true, |ids| ids.contains(&n.id))
                })
                .collect();
            branch_nodes.sort_by_key(|n| n.position);

            let mut b_milestones = Vec::new();
            for bn in branch_nodes {
                let bn_slug = slugify(&bn.title, &mut seen_slugs);
                let mut b_changes = Vec::new();
                for ch in &bn.changes {
                    if let Some((ent_title, ent_slug)) = entity_map.get(&ch.entity_id) {
                        b_changes.push(PublicationStateChange {
                            entity_title: ent_title.clone(),
                            entity_anchor: ent_slug.clone(),
                            property_key: ch.property_key.clone(),
                            previous_value: ch
                                .previous_value
                                .clone()
                                .unwrap_or_else(|| "unassigned".into()),
                            new_value: ch.new_value.clone().unwrap_or_else(|| "unknown".into()),
                        });
                    }
                }

                b_milestones.push(PublicationMilestone {
                    references: narrative_references(&bn.id, chapter_titles, &excerpt_anchors),
                    title: bn.title.clone(),
                    anchor: bn_slug,
                    era: if bn.era.trim().is_empty() {
                        None
                    } else {
                        Some(bn.era.trim().to_string())
                    },
                    description: if bn.description.trim().is_empty() {
                        None
                    } else {
                        Some(bn.description.trim().to_string())
                    },
                    changes: b_changes,
                });
            }

            alternate_continuities.push(PublicationBranch {
                name: b.name.clone(),
                anchor: b_slug,
                description: b.description.clone().filter(|d| !d.trim().is_empty()),
                divergence_milestone,
                milestones: b_milestones,
            });
        }

        if !alternate_continuities.is_empty() {
            let alt_slug = slugify("Alternate Continuities", &mut seen_slugs);
            toc.push(TocItem {
                title: "Alternate Continuities".into(),
                anchor: alt_slug,
                level: 2,
                children: toc_branches,
            });
        }
    }

    // Excerpts section
    let mut excerpts = Vec::new();
    if !request.selected_excerpts.is_empty() {
        let mut toc_excerpts = Vec::new();
        for (index, exc) in request.selected_excerpts.iter().enumerate() {
            if exc.excerpt_text.trim().is_empty() {
                warnings.push(PublicationWarning {
                    code: "empty_excerpt".into(),
                    message: format!(
                        "Excerpt for chapter '{}' has empty text and was omitted",
                        exc.chapter_id
                    ),
                    entity_id: Some(exc.chapter_id.clone()),
                });
                continue;
            }
            let (Some(source), Some(exc_slug)) = (
                chapter_titles.get(&exc.chapter_id),
                selected_excerpt_anchors.get(&index),
            ) else {
                warnings.push(PublicationWarning { code: "excluded_manuscript_reference".into(), message: "A selected excerpt was omitted because its source is unavailable, excluded, or outside the selected timeline.".into(), entity_id: None });
                continue;
            };
            let ch_title = source.title.clone();
            let bk_title = source.book_name.clone();
            let heading = exc
                .heading
                .as_deref()
                .filter(|h| !h.trim().is_empty())
                .unwrap_or(&ch_title);
            let exc_slug = exc_slug.clone();

            toc_excerpts.push(TocItem {
                title: heading.to_string(),
                anchor: exc_slug.clone(),
                level: 3,
                children: vec![],
            });

            excerpts.push(PublicationExcerpt {
                heading: heading.to_string(),
                anchor: exc_slug,
                chapter_title: ch_title,
                book_name: bk_title,
                excerpt_text: exc.excerpt_text.trim().to_string(),
            });
        }

        if !excerpts.is_empty() {
            let exc_section_slug = slugify("Excerpts", &mut seen_slugs);
            toc.push(TocItem {
                title: "Excerpts".into(),
                anchor: exc_section_slug,
                level: 2,
                children: toc_excerpts,
            });
        }
    }

    PublicationDocument {
        title: doc_title,
        subtitle: request.subtitle.clone().filter(|s| !s.trim().is_empty()),
        author: request.author.clone().filter(|a| !a.trim().is_empty()),
        universe_name: universe.name.clone(),
        universe_description: if request.include_universe_description {
            universe
                .description
                .clone()
                .filter(|d| !d.trim().is_empty())
        } else {
            None
        },
        table_of_contents: toc,
        sections,
        relationships,
        timeline: timeline_section,
        alternate_continuities,
        excerpts,
    }
}

/// Renders CommonMark Markdown from the structured PublicationDocument.
/// Preserves strict backward compatibility with L3a Markdown formatting.
pub fn render_markdown_from_document(
    doc: &PublicationDocument,
    request: &PublicationRequest,
) -> String {
    let mut md = String::new();

    md.push_str(&format!("# {}\n\n", doc.title));

    if let Some(ref sub) = doc.subtitle {
        md.push_str(&format!("*{ }*\n\n", sub.trim()));
    }

    if let Some(ref author) = doc.author {
        md.push_str(&format!("*Authored by {}*\n\n", author.trim()));
    }

    if let Some(ref desc) = doc.universe_description {
        md.push_str(&format!(
            "## Universe Introduction\n\n**{}**\n\n{}\n\n",
            escape_link_text(&doc.universe_name),
            desc.trim()
        ));
    }

    if request.include_table_of_contents && !doc.table_of_contents.is_empty() {
        md.push_str("## Table of Contents\n\n");
        for cat_item in &doc.table_of_contents {
            md.push_str(&format!(
                "- [{}](#{})\n",
                escape_link_text(&cat_item.title),
                cat_item.anchor
            ));
            for child in &cat_item.children {
                md.push_str(&format!(
                    "  - [{}](#{})\n",
                    escape_link_text(&child.title),
                    child.anchor
                ));
            }
        }
        md.push_str("\n---\n\n");
    }

    for section in &doc.sections {
        md.push_str(&format!(
            "<a id=\"{}\"></a>\n## {}\n\n",
            section.anchor, section.title
        ));

        for entry in &section.entries {
            md.push_str(&format!(
                "<a id=\"{}\"></a>\n### {}\n\n",
                entry.anchor, entry.title
            ));

            for f in &entry.fields {
                md.push_str(&format!(
                    "* **{}:** {}\n",
                    escape_link_text(&f.label),
                    f.value
                ));
            }

            if !entry.institutional_positions.is_empty() {
                md.push_str("#### Institutional Positions\n\n");
                for p in &entry.institutional_positions {
                    md.push_str(&format!(
                        "* **{}:** {}\n",
                        escape_link_text(&p.label),
                        p.value
                    ));
                }
                md.push_str("\n");
            }
            if let Some(ref hierarchy) = entry.hierarchy {
                md.push_str("* **Organizational Structure:**\n");
                render_hierarchy_markdown(&mut md, hierarchy, 1);
            }

            if !entry.fields.is_empty() || entry.hierarchy.is_some() {
                md.push_str("\n");
            }

            if let Some(ref prose) = entry.prose {
                md.push_str(&format!("{}\n\n", prose));
            }

            md.push_str("\n");
        }
    }

    if !doc.relationships.is_empty() {
        let rel_anchor = doc
            .table_of_contents
            .iter()
            .find(|item| item.title == "Relationships")
            .map(|item| item.anchor.as_str())
            .unwrap_or("relationships");

        md.push_str(&format!(
            "<a id=\"{}\"></a>\n## Relationships\n\n",
            rel_anchor
        ));

        for rel in &doc.relationships {
            let left_hyphens = if rel.directed { "--" } else { "<--" };
            let right_hyphens = "-->";
            md.push_str(&format!(
                "* [{}](#{}) {} **{}** {} [{}](#{})\n",
                escape_link_text(&rel.source_title),
                rel.source_anchor,
                left_hyphens,
                escape_link_text(&rel.label),
                right_hyphens,
                escape_link_text(&rel.target_title),
                rel.target_anchor
            ));
            for connection in &rel.connections {
                md.push_str(&format!(
                    "  * {} {} **{}** {} ({})\n",
                    escape_link_text(&connection.source_title),
                    if connection.directed { "→" } else { "↔" },
                    escape_link_text(&connection.label),
                    escape_link_text(&connection.target_title),
                    connection.provenance
                ));
                if let Some(desc) = &connection.description {
                    md.push_str(&format!("    * {}\n", desc));
                }
            }
            if let Some(ref desc) = rel.description {
                md.push_str(&format!("  * {}\n", desc));
            }
        }
        md.push_str("\n");
    }

    if let Some(ref timeline) = doc.timeline {
        md.push_str(&format!(
            "<a id=\"{}\"></a>\n## {}\n\n",
            timeline.anchor, timeline.title
        ));

        for m in &timeline.milestones {
            md.push_str(&format!("<a id=\"{}\"></a>\n### {}\n\n", m.anchor, m.title));
            if let Some(ref era) = m.era {
                md.push_str(&format!("* **Era / Date:** {}\n\n", era));
            }
            if let Some(ref desc) = m.description {
                md.push_str(&format!("{}\n\n", desc));
            }

            for reference in &m.references {
                md.push_str(&format!(
                    "* Read the event in {} — {}\n",
                    reference_markdown(reference),
                    escape_link_text(&reference.book_name)
                ));
            }
            if !m.references.is_empty() {
                md.push_str("\n");
            }
            if !m.changes.is_empty() {
                md.push_str("#### State Evolutions\n\n");
                for ch in &m.changes {
                    md.push_str(&format!(
                        "* **[{}](#{}):** {} changed from *{}* to *{}*\n",
                        escape_link_text(&ch.entity_title),
                        ch.entity_anchor,
                        escape_link_text(&ch.property_key),
                        escape_link_text(&ch.previous_value),
                        escape_link_text(&ch.new_value)
                    ));
                }
                md.push_str("\n");
            }
        }
    }

    if !doc.alternate_continuities.is_empty() {
        let alt_anchor = doc
            .table_of_contents
            .iter()
            .find(|item| item.title == "Alternate Continuities")
            .map(|item| item.anchor.as_str())
            .unwrap_or("alternate-continuities");

        md.push_str(&format!(
            "<a id=\"{}\"></a>\n## Alternate Continuities\n\n",
            alt_anchor
        ));

        for b in &doc.alternate_continuities {
            md.push_str(&format!(
                "<a id=\"{}\"></a>\n### Alternate Continuity: {}\n\n",
                b.anchor, b.name
            ));
            if let Some(ref desc) = b.description {
                md.push_str(&format!("{}\n\n", desc));
            }

            if let Some(ref div) = b.divergence_milestone {
                md.push_str(&format!(
                    "*Diverges from canonical milestone: **{}** ({})*\n\n",
                    div.title, div.era
                ));
            }

            if !b.milestones.is_empty() {
                md.push_str("#### Branch Milestones\n\n");
                for bn in &b.milestones {
                    let era_str = bn.era.as_deref().unwrap_or("");
                    md.push_str(&format!("* **{}** ({})\n", bn.title, era_str));
                    if let Some(ref desc) = bn.description {
                        md.push_str(&format!("  * {}\n", desc));
                    }
                    for reference in &bn.references {
                        md.push_str(&format!(
                            "  * Read the event in {} — {}\n",
                            reference_markdown(reference),
                            escape_link_text(&reference.book_name)
                        ));
                    }
                    for ch in &bn.changes {
                        md.push_str(&format!(
                            "  * **[{}](#{}):** {} -> {}\n",
                            escape_link_text(&ch.entity_title),
                            ch.entity_anchor,
                            escape_link_text(&ch.previous_value),
                            escape_link_text(&ch.new_value)
                        ));
                    }
                }
                md.push_str("\n");
            }
        }
    }

    if !doc.excerpts.is_empty() {
        let exc_anchor = doc
            .table_of_contents
            .iter()
            .find(|item| item.title == "Excerpts")
            .map(|item| item.anchor.as_str())
            .unwrap_or("excerpts");

        md.push_str(&format!("<a id=\"{}\"></a>\n## Excerpts\n\n", exc_anchor));

        for exc in &doc.excerpts {
            md.push_str(&format!(
                "<a id=\"{}\"></a>\n### {}\n\n",
                exc.anchor, exc.heading
            ));
            md.push_str(&format!(
                "*From Chapter **{}**, Book **{}***\n\n",
                escape_link_text(&exc.chapter_title),
                escape_link_text(&exc.book_name)
            ));
            for line in exc.excerpt_text.lines() {
                md.push_str(&format!("> {}\n", line));
            }
            md.push_str("\n");
        }
    }

    md
}

fn render_hierarchy_markdown(
    md: &mut String,
    node: &PublicationHierarchyNode,
    indent_level: usize,
) {
    let indent = "  ".repeat(indent_level);
    let prefix = if node.node_type == "branch" {
        format!("{}* Branch: **{}**", indent, node.title)
    } else {
        format!("{}* Position: **{}**", indent, node.title)
    };
    md.push_str(&format!("{}\n", prefix));

    if let Some(ref desc) = node.description {
        md.push_str(&format!("{}  * Description: {}\n", indent, desc));
    }

    if !node.holders.is_empty() {
        let holder_strs: Vec<String> = node
            .holders
            .iter()
            .map(|h| format!("[{}](#{})", escape_link_text(&h.title), h.anchor))
            .collect();
        md.push_str(&format!(
            "{}  * Holders: {}\n",
            indent,
            holder_strs.join(", ")
        ));
    }

    for child in &node.children {
        render_hierarchy_markdown(md, child, indent_level + 1);
    }
}

pub fn generate_markdown(
    universe: &Universe,
    docs: &[PublishedDoc],
    plan: &Plan,
    request: &PublicationRequest,
    chapter_titles: &HashMap<String, PublicationChapterSource>,
    warnings: &mut Vec<PublicationWarning>,
) -> GenerationResult {
    let doc = build_publication_document(universe, docs, plan, request, chapter_titles, warnings);
    let md = render_markdown_from_document(&doc, request);

    let mut category_counts = BTreeMap::new();
    for sec in &doc.sections {
        category_counts.insert(sec.category.clone(), sec.entries.len());
    }

    let rel_count = doc.relationships.len();
    let milestone_count = doc
        .timeline
        .as_ref()
        .map(|t| t.milestones.len())
        .unwrap_or(0);
    let exc_count = doc.excerpts.len();

    GenerationResult {
        markdown: md,
        toc: doc.table_of_contents,
        category_counts,
        relationship_count: rel_count,
        milestone_count,
        excerpt_count: exc_count,
    }
}

fn extract_entity_fields(
    doc: &PublishedDoc,
    request: &PublicationRequest,
) -> Vec<PublicationField> {
    let mut fields = Vec::new();

    if let Some(ref c) = doc.character_fields {
        add_field(&mut fields, "Role", c.role.as_deref());
        add_field(&mut fields, "Species", c.species.as_deref());
        add_field(&mut fields, "Affiliation", c.affiliation.as_deref());
        add_field(&mut fields, "Residence", c.residence.as_deref());
        add_field(&mut fields, "Vital Status", c.vital_status.as_deref());
        add_field(&mut fields, "Age", c.age.as_deref());
        add_field(&mut fields, "Gender", c.gender.as_deref());
        if let Some(ref aliases) = c.aliases {
            let joined = aliases
                .iter()
                .map(|a| a.trim())
                .filter(|a| !a.is_empty())
                .collect::<Vec<_>>()
                .join(", ");
            if !joined.is_empty() {
                fields.push(PublicationField {
                    label: "Aliases".into(),
                    value: joined,
                });
            }
        }
        add_field(&mut fields, "Occupation", c.occupation.as_deref());
        add_field(&mut fields, "Narrative Role", c.narrative_role.as_deref());
        add_field(
            &mut fields,
            "Physical Appearance",
            c.physical_appearance.as_deref(),
        );
        add_field(
            &mut fields,
            "Clothing / Attire",
            c.clothing_attire.as_deref(),
        );
        add_field(&mut fields, "Personality", c.personality.as_deref());
        add_field(&mut fields, "Goals", c.goals.as_deref());
        add_field(&mut fields, "Motivations", c.motivations.as_deref());
        add_field(&mut fields, "Strengths", c.strengths.as_deref());
        add_field(&mut fields, "Weaknesses", c.weaknesses.as_deref());
    }

    if let Some(ref l) = doc.location_fields {
        add_field(&mut fields, "Type", l.location_type.as_deref());
        add_field(&mut fields, "Region", l.region.as_deref());
        add_field(&mut fields, "Inhabitants", l.inhabitants.as_deref());
        add_field(&mut fields, "Factions", l.factions.as_deref());
        add_field(&mut fields, "Notable Events", l.notable_events.as_deref());
    }

    if let Some(ref f) = doc.faction_fields {
        add_field(&mut fields, "Type", f.faction_type.as_deref());
        add_field(&mut fields, "Leadership", f.leadership.as_deref());
        add_field(&mut fields, "Ideology", f.ideology.as_deref());
        add_field(&mut fields, "Territory", f.territory.as_deref());
        add_field(&mut fields, "Territory Notes", f.territory_notes.as_deref());
        add_field(&mut fields, "Allies", f.allies.as_deref());
        add_field(&mut fields, "Rivals", f.rivals.as_deref());
    }

    if let Some(ref a) = doc.artifact_fields {
        add_field(&mut fields, "Type", a.artifact_type.as_deref());
        add_field(&mut fields, "Owner", a.owner.as_deref());
        add_field(&mut fields, "Creator", a.creator.as_deref());
        add_field(&mut fields, "Origin", a.origin.as_deref());
        add_field(&mut fields, "Powers / Capabilities", a.powers.as_deref());
    }

    if let Some(ref r) = doc.rule_fields {
        add_field(&mut fields, "System Type", r.system_type.as_deref());
        add_field(&mut fields, "Principles", r.principles.as_deref());
        add_field(&mut fields, "Limitations", r.limitations.as_deref());
        add_field(&mut fields, "Exceptions", r.exceptions.as_deref());
        add_field(&mut fields, "Consequences", r.consequences.as_deref());
    }

    if let Some(ref e) = doc.event_fields {
        add_field(&mut fields, "Type", e.event_type.as_deref());
        add_field(&mut fields, "Date / Era", e.date_era.as_deref());
        add_field(&mut fields, "Location", e.location.as_deref());
        add_field(&mut fields, "Participants", e.participants.as_deref());
        add_field(&mut fields, "Outcome", e.outcome.as_deref());
        add_field(&mut fields, "Significance", e.significance.as_deref());
    }

    for attr in &doc.attributes {
        if attr.key.trim().is_empty() || attr.value.trim().is_empty() || attr.key.starts_with('_') {
            continue;
        }
        if let Some(ref allowed_keys) = request.included_attribute_keys {
            if !allowed_keys
                .iter()
                .any(|k| k.eq_ignore_ascii_case(&attr.key))
            {
                continue;
            }
        }
        fields.push(PublicationField {
            label: attr.key.trim().to_string(),
            value: attr.value.trim().to_string(),
        });
    }

    fields
}

fn add_field(fields: &mut Vec<PublicationField>, label: &str, val: Option<&str>) {
    if let Some(v) = val {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            fields.push(PublicationField {
                label: label.to_string(),
                value: trimmed.to_string(),
            });
        }
    }
}

fn extract_faction_hierarchy(
    branches: &[FactionBranch],
    positions: &[FactionPosition],
    include_holders: bool,
    entity_map: &HashMap<String, (String, String)>,
) -> Option<PublicationHierarchyNode> {
    if branches.is_empty() && positions.is_empty() {
        return None;
    }

    let mut branch_positions: HashMap<Option<String>, Vec<&FactionPosition>> = HashMap::new();
    for pos in positions {
        let b_key = pos.branch_id.clone().filter(|b| !b.trim().is_empty());
        branch_positions.entry(b_key).or_default().push(pos);
    }
    for list in branch_positions.values_mut() {
        list.sort_by(|a, b| {
            a.sort_order
                .unwrap_or(0.0)
                .partial_cmp(&b.sort_order.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    let mut branch_children: HashMap<Option<String>, Vec<&FactionBranch>> = HashMap::new();
    for br in branches {
        let p_key = br
            .parent_branch_id
            .clone()
            .filter(|p| !p.trim().is_empty() && branches.iter().any(|b| &b.id == p));
        branch_children.entry(p_key).or_default().push(br);
    }
    for list in branch_children.values_mut() {
        list.sort_by(|a, b| {
            a.sort_order
                .unwrap_or(0.0)
                .partial_cmp(&b.sort_order.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    fn build_branch_node(
        branch: &FactionBranch,
        branch_children: &HashMap<Option<String>, Vec<&FactionBranch>>,
        branch_positions: &HashMap<Option<String>, Vec<&FactionPosition>>,
        include_holders: bool,
        entity_map: &HashMap<String, (String, String)>,
    ) -> PublicationHierarchyNode {
        let mut children = Vec::new();

        if let Some(pos_list) = branch_positions.get(&Some(branch.id.clone())) {
            let pos_nodes = build_position_hierarchy(pos_list, include_holders, entity_map);
            children.extend(pos_nodes);
        }

        if let Some(sub_branches) = branch_children.get(&Some(branch.id.clone())) {
            for sub in sub_branches {
                children.push(build_branch_node(
                    sub,
                    branch_children,
                    branch_positions,
                    include_holders,
                    entity_map,
                ));
            }
        }

        PublicationHierarchyNode {
            node_type: "branch".into(),
            title: branch.name.trim().to_string(),
            description: branch.description.clone().filter(|d| !d.trim().is_empty()),
            holders: vec![],
            children,
        }
    }

    let mut root_children = Vec::new();
    if let Some(root_branches) = branch_children.get(&None) {
        for rb in root_branches {
            root_children.push(build_branch_node(
                rb,
                &branch_children,
                &branch_positions,
                include_holders,
                entity_map,
            ));
        }
    }

    if let Some(unassigned_pos) = branch_positions.get(&None) {
        if !unassigned_pos.is_empty() {
            let pos_nodes = build_position_hierarchy(unassigned_pos, include_holders, entity_map);
            root_children.extend(pos_nodes);
        }
    }

    if root_children.is_empty() {
        None
    } else if root_children.len() == 1 {
        Some(root_children.remove(0))
    } else {
        Some(PublicationHierarchyNode {
            node_type: "branch".into(),
            title: "Organization".into(),
            description: None,
            holders: vec![],
            children: root_children,
        })
    }
}

fn build_position_hierarchy(
    positions: &[&FactionPosition],
    include_holders: bool,
    entity_map: &HashMap<String, (String, String)>,
) -> Vec<PublicationHierarchyNode> {
    let mut pos_children: HashMap<Option<String>, Vec<&FactionPosition>> = HashMap::new();
    for p in positions {
        let parent_key = p
            .parent_position_id
            .clone()
            .filter(|pid| !pid.trim().is_empty() && positions.iter().any(|other| &other.id == pid));
        pos_children.entry(parent_key).or_default().push(p);
    }

    fn build_pos_node(
        p: &FactionPosition,
        pos_children: &HashMap<Option<String>, Vec<&FactionPosition>>,
        include_holders: bool,
        entity_map: &HashMap<String, (String, String)>,
    ) -> PublicationHierarchyNode {
        let mut holders = Vec::new();
        if include_holders {
            if let Some(ref h_ids) = p.holder_ids {
                for id in h_ids {
                    if let Some((h_title, h_slug)) = entity_map.get(id) {
                        holders.push(PublicationHolderLink {
                            title: h_title.clone(),
                            anchor: h_slug.clone(),
                        });
                    }
                }
            }
        }

        let mut children = Vec::new();
        if let Some(sub_pos) = pos_children.get(&Some(p.id.clone())) {
            for sub in sub_pos {
                children.push(build_pos_node(
                    sub,
                    pos_children,
                    include_holders,
                    entity_map,
                ));
            }
        }

        PublicationHierarchyNode {
            node_type: "position".into(),
            title: p.title.trim().to_string(),
            description: p.description.clone().filter(|d| !d.trim().is_empty()),
            holders,
            children,
        }
    }

    let mut roots = Vec::new();
    if let Some(root_positions) = pos_children.get(&None) {
        for rp in root_positions {
            roots.push(build_pos_node(
                rp,
                &pos_children,
                include_holders,
                entity_map,
            ));
        }
    }
    roots
}

/// Exact factory text only, under its original heading. Edited prose is retained verbatim.
fn suppress_template_prose(prose: &str, doc: &PublishedDoc, universe_name: &str) -> Option<String> {
    let singular = match doc.entry_type.as_str() {
        "character" => "Character",
        "location" => "Location",
        "faction" => "Faction",
        "nation" => "Nation / Kingdom",
        "rule" => "World Rule / System",
        "culture" => "Culture / Era",
        "artifact" => "Artifact / Relic",
        "event" => "Event",
        "other" => "Lore Entry",
        _ => &doc.entry_type,
    };
    let overview = [
        format!(
            "Provide the canonical context for this {} in {}.",
            doc.entry_type, universe_name
        ),
        format!(
            "Provide the canonical definition and context for this {} in {}.",
            singular, universe_name
        ),
    ];
    let mut output = Vec::new();
    let mut section: Vec<&str> = Vec::new();
    let flush = |section: &mut Vec<&str>, output: &mut Vec<String>| {
        if section.is_empty() {
            return;
        }
        let heading = section[0].trim();
        let body = section[1..].join("\n");
        let body = body.trim();
        let placeholder = (heading == "### Overview" && overview.iter().any(|s| s == body))
            || (heading == "### Historical Lore"
                && body
                    == "Describe the origin, background, and cultural impact within the world.");
        if !(heading == "### Overview" || heading == "### Historical Lore")
            || (!body.is_empty() && !placeholder)
        {
            output.push(section.join("\n"));
        }
        section.clear();
    };
    for line in prose.lines() {
        if line.starts_with('#') && !section.is_empty() {
            flush(&mut section, &mut output);
        }
        section.push(line);
    }
    flush(&mut section, &mut output);
    let cleaned = output.join("\n").trim().to_string();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn institutional_positions(
    character: &PublishedDoc,
    docs: &[PublishedDoc],
    request: &PublicationRequest,
    historical: bool,
) -> Vec<PublicationField> {
    if historical
        || character.category != "characters"
        || !request.include_faction_hierarchy
        || !request.include_faction_holders
    {
        return vec![];
    }
    let mut result = Vec::new();
    for faction in docs.iter().filter(|d| d.category == "factions") {
        if let Some(f) = &faction.faction_fields {
            for p in f.positions.iter().flatten() {
                if p.holder_ids
                    .as_ref()
                    .is_some_and(|ids| ids.contains(&character.id))
                {
                    let branch = f
                        .branches
                        .iter()
                        .flatten()
                        .find(|b| Some(&b.id) == p.branch_id.as_ref());
                    result.push(PublicationField {
                        label: p.title.clone(),
                        value: format!(
                            "{}{}",
                            faction.title,
                            branch.map(|b| format!(" / {}", b.name)).unwrap_or_default()
                        ),
                    });
                }
            }
        }
    }
    result.sort_by(|a, b| a.label.cmp(&b.label).then(a.value.cmp(&b.value)));
    result
}

fn resolved_relationship_label(
    rel: &crate::thought::Relationship,
    plan: &Plan,
    request: &PublicationRequest,
) -> Option<String> {
    let Some(cutoff_id) = &request.filter_spoilers_after_milestone_id else {
        return Some(rel.label.clone());
    };
    let cutoff = plan.nodes.iter().find(|n| {
        &n.id == cutoff_id
            && n.universe_id == rel.universe_id
            && n.book_id.is_none()
            && n.branch_id.is_none()
            && !n.archived
    })?;
    let mut nodes: Vec<_> = plan
        .nodes
        .iter()
        .filter(|n| {
            n.universe_id == rel.universe_id
                && n.book_id.is_none()
                && n.branch_id.is_none()
                && !n.archived
                && n.position <= cutoff.position
        })
        .collect();
    nodes.sort_by(|a, b| a.position.cmp(&b.position).then(a.id.cmp(&b.id)));
    let mut label = if rel.context_node_id.is_none() {
        Some(rel.label.clone())
    } else {
        None
    };
    for node in nodes {
        if rel.context_node_id.as_ref() == Some(&node.id) {
            label = Some(rel.label.clone());
        }
        for change in node
            .relationship_changes
            .iter()
            .filter(|c| c.relationship_id == rel.id)
        {
            label = change.label.clone();
        }
    }
    label
}

fn publication_priority(rel: &PublicationRelationship) -> u8 {
    if rel.provenance == "office" {
        1
    } else if ["member of", "affiliated with", "members", "has member"]
        .contains(&rel.label.to_lowercase().as_str())
    {
        3
    } else {
        2
    }
}

fn aggregate_relationships(rows: Vec<PublicationRelationship>) -> Vec<PublicationRelationship> {
    let mut groups: BTreeMap<Vec<String>, Vec<PublicationRelationship>> = BTreeMap::new();
    for row in rows {
        let mut pair = vec![row.source_anchor.clone(), row.target_anchor.clone()];
        pair.sort();
        groups.entry(pair).or_default().push(row);
    }
    groups
        .into_values()
        .map(|mut group| {
            group.sort_by(|a, b| {
                publication_priority(a)
                    .cmp(&publication_priority(b))
                    .then(a.label.cmp(&b.label))
                    .then(a.source_anchor.cmp(&b.source_anchor))
            });
            let mut primary = group[0].clone();
            // Retain the primary as well: every underlying direction and provenance stays available.
            primary.connections = group;
            primary.description = None;
            primary
        })
        .collect()
}

#[cfg(test)]
mod acceptance_tests {
    use super::*;
    use serde_json::json;

    fn request() -> PublicationRequest {
        serde_json::from_value(json!({"universe_id":"u"})).unwrap()
    }
    fn plan() -> Plan {
        serde_json::from_value(json!({"version":1,"revision":0,"universes":[],"books":[],"nodes":[],"entities":[],"relationships":[]})).unwrap()
    }
    fn character(id: &str) -> PublishedDoc {
        PublishedDoc {
            id: id.into(),
            title: "Character".into(),
            category: "characters".into(),
            entry_type: "character".into(),
            ..Default::default()
        }
    }
    fn faction() -> PublishedDoc {
        PublishedDoc {
            id: "f".into(),
            title: "Central Body".into(),
            category: "factions".into(),
            entry_type: "faction".into(),
            faction_fields: Some(FactionFields {
                branches: Some(vec![FactionBranch {
                    id: "fleet".into(),
                    name: "Fleet".into(),
                    ..Default::default()
                }]),
                positions: Some(vec![
                    FactionPosition {
                        id: "emperor".into(),
                        title: "Cognitive Emperor".into(),
                        holder_ids: Some(vec!["c".into()]),
                        ..Default::default()
                    },
                    FactionPosition {
                        id: "admiral".into(),
                        title: "Galactic Admiral".into(),
                        branch_id: Some("fleet".into()),
                        holder_ids: Some(vec!["c".into()]),
                        ..Default::default()
                    },
                ]),
                ..Default::default()
            }),
            ..Default::default()
        }
    }
    fn relationship(
        id: &str,
        source: &str,
        target: &str,
        label: &str,
    ) -> crate::thought::Relationship {
        serde_json::from_value(json!({"id":id,"universe_id":"u","book_id":null,"source_id":source,"target_id":target,"label":label,"description":"Authored relationship","directed":true,"context_node_id":null,"archived":false})).unwrap()
    }
    fn node(id: &str, position: i32) -> Node {
        serde_json::from_value(json!({"id":id,"universe_id":"u","book_id":null,"branch_id":null,"position":position,"title":id,"description":"","era":"","status":"planned","questions":"","entity_ids":[],"changes":[],"relationship_changes":[],"linked_event_id":null,"origin_node_id":null,"archived":false,"created_at":"","updated_at":""})).unwrap()
    }
    fn build(
        docs: &[PublishedDoc],
        plan: &Plan,
        request: &PublicationRequest,
    ) -> PublicationDocument {
        build_publication_document(
            &Universe {
                id: "u".into(),
                name: "Universe".into(),
                description: None,
                archived: false,
            },
            docs,
            plan,
            request,
            &HashMap::new(),
            &mut vec![],
        )
    }

    #[test]
    fn offices_membership_priority_direction_and_pdf_markdown_parity() {
        let mut p = plan();
        p.relationships = vec![
            relationship("membership", "c", "f", "Member of"),
            relationship("protects", "f", "c", "Protects"),
        ];
        let docs = vec![character("c"), faction()];
        let doc = build(&docs, &p, &request());
        assert_eq!(doc.relationships.len(), 1);
        let group = &doc.relationships[0];
        assert_eq!(group.label, "Holds Cognitive Emperor in");
        assert_eq!(group.connections.len(), 4);
        assert_eq!(group.connections[1].label, "Holds Galactic Admiral in");
        assert_eq!(
            group.connections[1].description.as_deref(),
            Some("Derived from faction organization / Branch: Fleet")
        );
        assert_eq!(group.connections[2].source_title, "Central Body");
        assert_eq!(group.connections[2].provenance, "authored");
        assert_eq!(doc.sections[0].entries[0].institutional_positions.len(), 2);
        let md = render_markdown_from_document(&doc, &request());
        let (pdf, _) = super::super::pdf::render_pdf_from_document(&doc, &mut vec![]);
        let pdf = String::from_utf8_lossy(&pdf);
        for text in [
            "Institutional Positions",
            "Cognitive Emperor",
            "Galactic Admiral",
            "Member of",
            "Protects",
            "Fleet",
            "Authored relationship",
        ] {
            assert!(md.contains(text), "Markdown missing {text}");
            assert!(pdf.contains(text), "PDF missing {text}");
        }
        assert!(!md.contains("emperor\""));
        p.relationships.reverse();
        assert_eq!(
            doc.relationships,
            build(&docs, &p, &request()).relationships
        );
    }

    #[test]
    fn selection_holder_flags_reassignment_and_removal_cannot_leak_offices() {
        for docs in [vec![character("c")], vec![faction()]] {
            let doc = build(&docs, &plan(), &request());
            assert!(doc.relationships.is_empty());
            assert!(doc
                .sections
                .iter()
                .flat_map(|s| &s.entries)
                .all(|e| e.institutional_positions.is_empty()));
        }
        for flag in [
            "include_factions",
            "include_faction_holders",
            "include_faction_hierarchy",
        ] {
            let mut value = serde_json::to_value(request()).unwrap();
            value[flag] = json!(false);
            let req = serde_json::from_value(value).unwrap();
            let doc = build(&[character("c"), faction()], &plan(), &req);
            assert!(doc.relationships.is_empty(), "{flag}");
            assert!(doc.sections[0].entries[0]
                .institutional_positions
                .is_empty());
        }
        let mut f = faction();
        f.faction_fields
            .as_mut()
            .unwrap()
            .positions
            .as_mut()
            .unwrap()[0]
            .holder_ids = Some(vec!["other".into()]);
        let doc = build(&[character("c"), f.clone()], &plan(), &request());
        assert_eq!(doc.relationships[0].label, "Holds Galactic Admiral in");
        f.faction_fields.as_mut().unwrap().positions = None;
        assert!(build(&[character("c"), f], &plan(), &request())
            .relationships
            .is_empty());
    }

    #[test]
    fn distinct_factions_same_names_and_foreign_universe_relationships() {
        let mut f2 = faction();
        f2.id = "other-faction".into();
        let mut p = plan();
        let mut foreign = relationship("foreign", "c", "f", "Secret foreign relationship");
        foreign.universe_id = "other".into();
        p.relationships.push(foreign);
        let doc = build(&[character("c"), faction(), f2], &p, &request());
        assert_eq!(doc.relationships.len(), 2);
        assert_ne!(
            doc.relationships[0].target_anchor,
            doc.relationships[1].target_anchor
        );
        assert!(!render_markdown_from_document(&doc, &request()).contains("Secret foreign"));
    }

    #[test]
    fn history_omits_current_holders_and_future_or_unknown_relationships() {
        let mut p = plan();
        p.nodes = vec![node("past", 0), node("future", 1)];
        let mut future = relationship("future-rel", "c", "f", "Future secret");
        future.context_node_id = Some("future".into());
        p.relationships = vec![future, relationship("member", "c", "f", "Member of")];
        let mut req = request();
        req.filter_spoilers_after_milestone_id = Some("past".into());
        let doc = build(&[character("c"), faction()], &p, &req);
        assert_eq!(doc.relationships.len(), 1);
        assert_eq!(doc.relationships[0].label, "Member of");
        assert!(doc.sections[0].entries[0]
            .institutional_positions
            .is_empty());
        let serialized = serde_json::to_string(&doc).unwrap();
        assert!(!serialized.contains("Future secret"));
        assert!(!serialized.contains("\"holders\":["));
        p.nodes[0]
            .relationship_changes
            .push(crate::thought::RelationshipChange {
                relationship_id: "member".into(),
                label: None,
                note: "PRIVATE".into(),
            });
        assert!(build(&[character("c"), faction()], &p, &req)
            .relationships
            .is_empty());
        req.filter_spoilers_after_milestone_id = Some("missing".into());
        assert!(build(&[character("c"), faction()], &p, &req)
            .relationships
            .is_empty());
        req.filter_spoilers_after_milestone_id = None;
        req.include_alternate_continuities = true;
        assert!(build(&[character("c"), faction()], &plan(), &req)
            .relationships
            .is_empty());
    }

    #[test]
    fn known_templates_empty_sections_and_edited_prose() {
        let doc = character("c");
        for text in [
            "### Overview\n\nProvide the canonical context for this character in Universe.\n\n### Historical Lore\n\n",
            "### Overview\n\nProvide the canonical definition and context for this Character in Universe.\n\n### Historical Lore\n\nDescribe the origin, background, and cultural impact within the world.",
            "", "\n\n", "### Overview\n\n### Historical Lore\n",
        ] { assert_eq!(suppress_template_prose(text, &doc, "Universe"), None, "{text}"); }
        for text in [
            "### Overview\n\nProvide the canonical context for this character in Universe. Edited.",
            "### Historical Lore\n\nDescribe the origin, background, and cultural impact within the world. It began in 2100.",
            "### Overview\n\nProvide the canonical context for this character in Another Universe.",
            "Provide the canonical context for this character in Universe.",
        ] { assert_eq!(suppress_template_prose(text, &doc, "Universe").as_deref(), Some(text)); }
        let mixed = "### Overview\n\nProvide the canonical context for this character in Universe.\n\n### Historical Lore\n\nBorn during the eclipse.";
        assert_eq!(
            suppress_template_prose(mixed, &doc, "Universe").as_deref(),
            Some("### Historical Lore\n\nBorn during the eclipse.")
        );
    }
    #[test]
    fn placeholder_suppression_and_absence_are_shared_by_markdown_and_pdf() {
        let mut c = character("c");
        c.prose = "### Overview\n\nProvide the canonical context for this character in Universe.\n\n### Historical Lore\n\nDescribe the origin, background, and cultural impact within the world.".into();
        let doc = build(&[c], &plan(), &request());
        assert!(doc.sections[0].entries[0].prose.is_none());
        let md = render_markdown_from_document(&doc, &request());
        let (pdf, _) = super::super::pdf::render_pdf_from_document(&doc, &mut vec![]);
        let pdf_text = String::from_utf8_lossy(&pdf);
        for text in [md.as_str(), pdf_text.as_ref()] {
            assert!(!text.contains("Provide the canonical"));
            assert!(!text.contains("Describe the origin"));
        }
        let mut p = plan();
        let mut past = node("past", 0);
        past.changes.push(crate::thought::Change {
            id: "status".into(),
            entity_id: "c".into(),
            property_key: "status".into(),
            previous_value: None,
            new_value: Some("not_introduced".into()),
            note: "PRIVATE".into(),
        });
        p.nodes.push(past);
        p.relationships
            .push(relationship("r", "c", "f", "Member of"));
        let mut req = request();
        req.filter_spoilers_after_milestone_id = Some("past".into());
        let doc = build(&[character("c"), faction()], &p, &req);
        assert!(doc.relationships.is_empty());
        assert!(doc.sections.iter().all(|s| s.category != "characters"));
        assert!(!serde_json::to_string(&doc).unwrap().contains("PRIVATE"));
    }

    #[test]
    fn relationship_type_filters_apply_to_historical_labels() {
        let mut p = plan();
        let mut past = node("past", 0);
        past.relationship_changes
            .push(crate::thought::RelationshipChange {
                relationship_id: "r".into(),
                label: Some("Ally".into()),
                note: String::new(),
            });
        p.nodes.push(past);
        p.relationships.push(relationship("r", "c", "f", "Rival"));
        let mut req = request();
        req.filter_spoilers_after_milestone_id = Some("past".into());
        req.relationship_types = Some(vec!["Ally".into()]);
        let doc = build(&[character("c"), faction()], &p, &req);
        assert_eq!(doc.relationships[0].label, "Ally");
    }
}

fn chapter_reference_visible(
    source: &PublicationChapterSource,
    plan: &Plan,
    request: &PublicationRequest,
) -> bool {
    let Some(id) = &source.milestone_id else {
        return request.filter_spoilers_after_milestone_id.is_none();
    };
    let Some(node) = plan.nodes.iter().find(|n| {
        &n.id == id && n.universe_id == request.universe_id && !n.archived && n.book_id.is_none()
    }) else {
        return false;
    };
    if request
        .selected_milestone_ids
        .as_ref()
        .is_some_and(|ids| !ids.contains(id))
    {
        return false;
    }
    if let Some(branch) = &node.branch_id {
        return request.filter_spoilers_after_milestone_id.is_none()
            && request.include_alternate_continuities
            && request
                .selected_branch_ids
                .as_ref()
                .map_or(true, |ids| ids.contains(branch))
            && plan
                .branches
                .iter()
                .any(|b| &b.id == branch && !b.archived && b.universe_id == request.universe_id);
    }
    if let Some(cutoff_id) = &request.filter_spoilers_after_milestone_id {
        return plan
            .nodes
            .iter()
            .find(|n| {
                &n.id == cutoff_id
                    && n.universe_id == node.universe_id
                    && !n.archived
                    && n.book_id.is_none()
                    && n.branch_id.is_none()
            })
            .is_some_and(|cutoff| node.position <= cutoff.position);
    }
    true
}

fn narrative_references(
    milestone_id: &str,
    sources: &HashMap<String, PublicationChapterSource>,
    anchors: &HashMap<String, String>,
) -> Vec<PublicationNarrativeReference> {
    let mut references: Vec<_> = sources
        .iter()
        .filter_map(|(id, source)| {
            if source.milestone_id.as_deref() != Some(milestone_id) {
                return None;
            }
            anchors.get(id).map(|anchor| PublicationNarrativeReference {
                chapter_title: source.title.clone(),
                book_name: source.book_name.clone(),
                excerpt_anchor: anchor.clone(),
            })
        })
        .collect();
    references.sort_by(|a, b| {
        a.book_name
            .cmp(&b.book_name)
            .then(a.chapter_title.cmp(&b.chapter_title))
            .then(a.excerpt_anchor.cmp(&b.excerpt_anchor))
    });
    references
}

#[cfg(test)]
mod narrative_tests {
    use super::*;
    use serde_json::json;
    fn plan() -> Plan {
        serde_json::from_value(json!({"version":1,"revision":0,"universes":[],"books":[],"entities":[],"relationships":[],"branches":[{"id":"branch","universe_id":"u","name":"Alternate","divergence_node_id":"past","created_at":"","updated_at":""}],"nodes":[node("past",0,None),node("future",1,None),node("alternate",0,Some("branch"))]})).unwrap()
    }
    fn node(id: &str, position: i32, branch: Option<&str>) -> serde_json::Value {
        json!({"id":id,"universe_id":"u","book_id":null,"branch_id":branch,"position":position,"title":format!("Chronicle {id}"),"description":format!("Summary {id}.\n\nConsequences {id}."),"era":"","status":"planned","questions":"PRIVATE PLANNING","entity_ids":[],"changes":[],"relationship_changes":[],"linked_event_id":null,"origin_node_id":null,"archived":false,"created_at":"","updated_at":""})
    }
    fn request() -> PublicationRequest {
        serde_json::from_value(json!({"universe_id":"u","include_timeline":true})).unwrap()
    }
    fn build(
        plan: &Plan,
        req: &PublicationRequest,
        sources: &HashMap<String, PublicationChapterSource>,
        description: Option<String>,
    ) -> PublicationDocument {
        build_publication_document(
            &Universe {
                id: "u".into(),
                name: "Actual Universe".into(),
                description,
                archived: false,
            },
            &[],
            plan,
            req,
            sources,
            &mut vec![],
        )
    }
    #[test]
    fn introduction_chronicles_and_selected_references_have_markdown_pdf_parity() {
        let p = plan();
        let mut req = request();
        req.selected_excerpts.push(ChapterExcerptSelection {
            chapter_id: "chapter".into(),
            heading: None,
            excerpt_text: "APPROVED PASSAGE".into(),
        });
        let sources = HashMap::from([(
            "chapter".into(),
            PublicationChapterSource {
                title: "Chapter 17".into(),
                book_name: "Volume I".into(),
                milestone_id: Some("past".into()),
            },
        )]);
        req.selected_excerpts.push(ChapterExcerptSelection {
            chapter_id: "chapter".into(),
            heading: Some("Second passage".into()),
            excerpt_text: "ANOTHER APPROVED PASSAGE".into(),
        });
        let doc = build(
            &p,
            &req,
            &sources,
            Some("A premise.\n\nExtended world introduction.".into()),
        );
        assert_eq!(doc.excerpts.len(), 2);
        assert_ne!(doc.excerpts[0].anchor, doc.excerpts[1].anchor);
        let reference = &doc.timeline.as_ref().unwrap().milestones[0].references[0];
        assert_eq!(reference.excerpt_anchor, doc.excerpts[0].anchor);
        let md = render_markdown_from_document(&doc, &req);
        let (pdf, _) = super::super::pdf::render_pdf_from_document(&doc, &mut vec![]);
        let pdf = String::from_utf8_lossy(&pdf);
        for text in [
            "Universe Introduction",
            "Actual Universe",
            "A premise.",
            "Extended world introduction.",
            "Summary past.",
            "Consequences past.",
            "Read the event in",
            "Chapter 17",
            "Volume I",
            "APPROVED PASSAGE",
        ] {
            assert!(md.contains(text), "Markdown missing {text}");
            assert!(pdf.contains(text), "PDF missing {text}");
        }
        assert!(!md.contains("PRIVATE PLANNING"));
        assert!(!md.contains("Chronicle alternate"));
        assert!(!md.contains("chapter_id"));
    }
    #[test]
    fn reference_only_chronicle_uses_existing_document_allowlist_without_copying_prose() {
        let mut p = plan();
        p.nodes[0].description.clear();
        let mut req = request();
        req.selected_entity_ids = Some(vec!["chapter".into()]);
        let sources = HashMap::from([(
            "chapter".into(),
            PublicationChapterSource {
                title: "Chapter 17".into(),
                book_name: "Volume I".into(),
                milestone_id: Some("past".into()),
            },
        )]);
        let doc = build(&p, &req, &sources, None);
        assert!(doc.excerpts.is_empty());
        let milestone = &doc.timeline.as_ref().unwrap().milestones[0];
        assert!(milestone.description.is_none());
        assert_eq!(milestone.references.len(), 1);
        assert!(milestone.references[0].excerpt_anchor.is_empty());
        let md = render_markdown_from_document(&doc, &req);
        assert!(md.contains("Read the event in Chapter 17"));
        assert!(!md.contains("(#)"));
    }

    #[test]
    fn empty_intro_and_unselected_excerpts_do_not_create_reader_facing_content() {
        let p = plan();
        let mut req = request();
        let sources = HashMap::from([(
            "chapter".into(),
            PublicationChapterSource {
                title: "PRIVATE TITLE".into(),
                book_name: "PRIVATE BOOK".into(),
                milestone_id: Some("past".into()),
            },
        )]);
        for text in [None, Some("".into()), Some("   ".into())] {
            let doc = build(&p, &req, &sources, text);
            let md = render_markdown_from_document(&doc, &req);
            assert!(!md.contains("Universe Introduction"));
            assert!(!md.contains("PRIVATE TITLE"));
            assert!(doc.timeline.as_ref().unwrap().milestones[0]
                .references
                .is_empty());
        }
        req.include_universe_description = false;
        assert!(
            build(&p, &req, &sources, Some("Hidden introduction".into()))
                .universe_description
                .is_none()
        );
        req.selected_excerpts.push(ChapterExcerptSelection {
            chapter_id: "missing".into(),
            heading: None,
            excerpt_text: "Hidden selected text".into(),
        });
        assert!(build(&p, &req, &sources, None).excerpts.is_empty());
    }
    #[test]
    fn future_unknown_and_excluded_branch_references_fail_closed() {
        let p = plan();
        let mut req = request();
        req.filter_spoilers_after_milestone_id = Some("past".into());
        req.include_alternate_continuities = true;
        for binding in [Some("future"), Some("alternate"), Some("deleted"), None] {
            let sources = HashMap::from([(
                "chapter".into(),
                PublicationChapterSource {
                    title: "HIDDEN TITLE".into(),
                    book_name: "HIDDEN BOOK".into(),
                    milestone_id: binding.map(str::to_string),
                },
            )]);
            req.selected_excerpts = vec![ChapterExcerptSelection {
                chapter_id: "chapter".into(),
                heading: None,
                excerpt_text: "HIDDEN PASSAGE".into(),
            }];
            let doc = build(&p, &req, &sources, None);
            let md = render_markdown_from_document(&doc, &req);
            for hidden in ["HIDDEN", "Consequences future", "Chronicle alternate"] {
                assert!(!md.contains(hidden));
            }
            assert!(doc.excerpts.is_empty());
            assert!(doc.alternate_continuities.is_empty());
        }
        req.filter_spoilers_after_milestone_id = None;
        req.selected_branch_ids = Some(vec![]);
        let sources = HashMap::from([(
            "chapter".into(),
            PublicationChapterSource {
                title: "HIDDEN".into(),
                book_name: "HIDDEN".into(),
                milestone_id: Some("alternate".into()),
            },
        )]);
        assert!(build(&p, &req, &sources, None).excerpts.is_empty());
        req.filter_spoilers_after_milestone_id = Some("missing".into());
        assert!(build(&p, &req, &sources, None).timeline.is_none());
    }
    #[test]
    fn alternate_chronicles_respect_milestone_allowlists_and_keep_authored_accounts() {
        let p = plan();
        let mut req = request();
        req.include_alternate_continuities = true;
        req.selected_milestone_ids = Some(vec!["alternate".into()]);
        let doc = build(&p, &req, &HashMap::new(), None);
        assert!(doc.timeline.is_none());
        assert_eq!(doc.alternate_continuities[0].milestones.len(), 1);
        assert_eq!(
            doc.alternate_continuities[0].milestones[0]
                .description
                .as_deref(),
            Some("Summary alternate.\n\nConsequences alternate.")
        );
    }
}

fn reference_markdown(reference: &PublicationNarrativeReference) -> String {
    let title = escape_link_text(&reference.chapter_title);
    if reference.excerpt_anchor.is_empty() {
        title
    } else {
        format!("[{}](#{})", title, reference.excerpt_anchor)
    }
}
