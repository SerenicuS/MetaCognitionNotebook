use super::*;
use crate::{
    commands::*,
    db::Database,
    storage::StorageManager,
    thought::{self, Book, Branch, Change, Node, Plan, Relationship, Universe},
};
use std::{fs, path::Path, sync::Mutex};

fn test_state(root: &Path) -> AppState {
    let storage = StorageManager::new(root.join("Library"));
    storage.initialize().unwrap();
    AppState {
        storage,
        db: Mutex::new(Database::open(root.join("index.db")).unwrap()),
        db_path: root.join("index.db"),
    }
}

fn save_catalog(s: &AppState, plan: Plan) {
    thought::save_impl(s, 0, plan).expect("Failed to save planning catalog");
}

#[test]
fn test_empty_selection_and_category_filtering() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-aether";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Aetheria".into(),
            description: Some("World of floating sky-islands".into()),
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    // Create 1 character and 1 location
    let char_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "canon",
        "character_fields": {
            "role": "Sky Captain",
            "species": "Avian Humanoid"
        }
    })
    .to_string();

    let char_doc = create_document_impl(
        &s,
        "lorebook".into(),
        "Zephyr".into(),
        None,
        Some("Captain of the wind-cutter.".into()),
        Some(char_meta),
        None,
        None,
    )
    .unwrap();

    let loc_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "location",
        "canon_status": "canon",
        "location_fields": {
            "region": "Upper Stratum"
        }
    })
    .to_string();

    create_document_impl(
        &s,
        "lorebook".into(),
        "Cloud Spire".into(),
        None,
        Some("A towering crystal station.".into()),
        Some(loc_meta),
        None,
        None,
    )
    .unwrap();

    // 1. Preview with only "characters" category selected
    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Aetheria Encyclopedia".into()),
        subtitle: None,
        author: None,
        include_universe_description: true,
        include_table_of_contents: true,
        selected_categories: vec!["characters".into()],
        selected_entity_ids: None,
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req).unwrap();
    assert_eq!(preview.entry_count, 1);
    assert_eq!(preview.category_counts.get("characters"), Some(&1));
    assert_eq!(preview.category_counts.get("locations"), None);
    assert!(preview.generated_markdown.contains("Zephyr"));
    assert!(!preview.generated_markdown.contains("Cloud Spire"));

    // 2. Specific entity selection
    let req_specific = PublicationRequest {
        universe_id: u_id.into(),
        title: None,
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: true,
        selected_categories: vec!["characters".into(), "locations".into()],
        selected_entity_ids: Some(vec![char_doc.metadata.id.clone()]),
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview_specific = build_preview(&s, req_specific).unwrap();
    assert_eq!(preview_specific.entry_count, 1);
    assert!(preview_specific.generated_markdown.contains("Zephyr"));
    assert!(!preview_specific.generated_markdown.contains("Cloud Spire"));
}

#[test]
fn test_strict_privacy_and_allowlist() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-privacy";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Secret Realm".into(),
            description: Some("Public description of Secret Realm".into()),
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![Node {
            id: "node-priv-1".into(),
            universe_id: u_id.into(),
            book_id: None,
            branch_id: None,
            position: 1,
            title: "First Era".into(),
            description: "Public description of the First Era".into(),
            era: "Year 1".into(),
            status: "planned".into(),
            questions: "SECRET AUTHOR QUESTION: Should the hero die?".into(),
            entity_ids: vec![],
            changes: vec![Change {
                id: "ch-1".into(),
                entity_id: "PLACEHOLDER_WILL_SET".into(),
                property_key: "vital_status".into(),
                previous_value: Some("unknown".into()),
                new_value: Some("alive".into()),
                note: "AUTHOR SECRET NOTE: decided to keep alive for book 2".into(),
            }],
            relationship_changes: vec![],
            linked_event_id: None,
            origin_node_id: None,
            archived: false,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        }],
        relationships: vec![],
    };

    // 1. Canon character
    let char_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "canon",
        "character_fields": {
            "role": "Mage",
            "vital_status": "alive"
        }
    })
    .to_string();

    let canon_char = create_document_impl(
        &s,
        "lorebook".into(),
        "Astraea".into(),
        None,
        Some("Astraea is the bearer of light.".into()),
        Some(char_meta),
        None,
        None,
    )
    .unwrap();

    // 2. Draft character (must be excluded by default)
    let draft_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "draft",
        "character_fields": {
            "role": "Secret Spy"
        }
    })
    .to_string();

    let draft_char = create_document_impl(
        &s,
        "lorebook".into(),
        "Draft Spy".into(),
        None,
        Some("A character still in drafting stage.".into()),
        Some(draft_meta),
        None,
        None,
    )
    .unwrap();

    // 3. Speculative character (must be excluded by default)
    let spec_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "speculative"
    })
    .to_string();

    create_document_impl(
        &s,
        "lorebook".into(),
        "Speculative Entity".into(),
        None,
        Some("Speculative writing.".into()),
        Some(spec_meta),
        None,
        None,
    )
    .unwrap();

    // 4. Archived character (must be excluded by default)
    let arch_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "canon",
        "archived": true
    })
    .to_string();

    create_document_impl(
        &s,
        "lorebook".into(),
        "Archived Hero".into(),
        None,
        Some("An archived record.".into()),
        Some(arch_meta),
        None,
        None,
    )
    .unwrap();

    // Update catalog with real canon char ID in changes and register in entities
    let mut updated_plan = plan;
    updated_plan.entities.push(thought::Entity {
        id: canon_char.metadata.id.clone(),
        universe_id: u_id.into(),
    });
    updated_plan.nodes[0].changes[0].entity_id = canon_char.metadata.id.clone();
    save_catalog(&s, updated_plan);

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Realm Compendium".into()),
        subtitle: None,
        author: None,
        include_universe_description: true,
        include_table_of_contents: true,
        selected_categories: vec!["characters".into()],
        selected_entity_ids: None,
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: true,
        include_faction_hierarchy: true,
        include_faction_holders: true,
        include_relationships: true,
        relationship_types: None,
        include_timeline: true,
        selected_milestone_ids: None,
        include_alternate_continuities: true,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,      // default
        include_speculative: false, // default
        include_archived: false,    // default
    };

    let preview = build_preview(&s, req).unwrap();
    let md = &preview.generated_markdown;

    // Must include canon char
    assert!(md.contains("Astraea"));
    // Must NOT include drafts, speculative, or archived
    assert!(!md.contains("Draft Spy"));
    assert!(!md.contains("Speculative Entity"));
    assert!(!md.contains("Archived Hero"));

    // PRIVACY VERIFICATION:
    // 1. No internal document IDs
    assert!(!md.contains(&canon_char.metadata.id));
    assert!(!md.contains(&draft_char.metadata.id));
    assert!(!md.contains("node-priv-1"));
    assert!(!md.contains("ch-1"));
    assert!(!md.contains(u_id));

    // 2. No House IDs
    assert!(!md.contains("house-"));

    // 3. No raw frontmatter
    assert!(!md.contains("---json"));
    assert!(!md.contains("\"entry_type\""));

    // 4. No planning questions
    assert!(!md.contains("SECRET AUTHOR QUESTION"));
    assert!(!md.contains("Should the hero die?"));

    // 5. No change private notes
    assert!(!md.contains("AUTHOR SECRET NOTE"));
    assert!(!md.contains("decided to keep alive"));

    // 6. No planning internal status
    assert!(!md.contains("planned"));

    // 7. Public timeline changes are shown cleanly
    assert!(md.contains("vital_status changed from *unknown* to *alive*"));
}

#[test]
fn test_faction_hierarchy_and_holder_sanitization() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-faction";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Solar Empire".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    // Included character
    let c1 = create_document_impl(
        &s,
        "lorebook".into(),
        "Valeria".into(),
        None,
        Some("Grand Marshal.".into()),
        Some(
            serde_json::json!({
                "universe_id": u_id,
                "entry_type": "character",
                "canon_status": "canon"
            })
            .to_string(),
        ),
        None,
        None,
    )
    .unwrap();

    // Draft / Excluded character
    let c2 = create_document_impl(
        &s,
        "lorebook".into(),
        "Secret Informant".into(),
        None,
        Some("Top secret spy.".into()),
        Some(
            serde_json::json!({
                "universe_id": u_id,
                "entry_type": "character",
                "canon_status": "draft"
            })
            .to_string(),
        ),
        None,
        None,
    )
    .unwrap();

    // Faction with branch and positions
    let fac_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "faction",
        "canon_status": "canon",
        "faction_fields": {
            "faction_type": "Military Order",
            "ideology": "Honor and Duty",
            "branches": [
                {
                    "id": "br-vanguard",
                    "name": "Solar Vanguard",
                    "description": "Frontline combat division",
                    "parent_branch_id": null,
                    "sort_order": 1.0
                }
            ],
            "positions": [
                {
                    "id": "pos-commander",
                    "title": "Vanguard Commander",
                    "description": "Supreme military lead",
                    "branch_id": "br-vanguard",
                    "parent_position_id": null,
                    "holder_ids": [c1.metadata.id, c2.metadata.id], // c1 is canon, c2 is draft
                    "sort_order": 1.0
                }
            ]
        }
    })
    .to_string();

    create_document_impl(
        &s,
        "lorebook".into(),
        "Solar Legion".into(),
        None,
        Some("The primary armed forces.".into()),
        Some(fac_meta),
        None,
        None,
    )
    .unwrap();

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Faction Dossier".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: true,
        selected_categories: vec!["characters".into(), "factions".into()],
        selected_entity_ids: None,
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: true,
        include_faction_hierarchy: true,
        include_faction_holders: true,
        include_relationships: true,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false, // c2 excluded!
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req).unwrap();
    let md = &preview.generated_markdown;

    // Solar Legion and Solar Vanguard branch rendered
    assert!(md.contains("Solar Legion"));
    assert!(md.contains("Solar Vanguard"));
    assert!(md.contains("Vanguard Commander"));

    // Valeria is included and linked as a holder
    assert!(md.contains("[Valeria](#valeria)"));

    // Secret Informant (draft) must NEVER be linked or named as a holder!
    assert!(!md.contains("Secret Informant"));
    assert!(!md.contains(&c2.metadata.id));
}

#[test]
fn test_relationship_filtering_and_privacy() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-rel";

    // Entity 1 (Canon)
    let e1 = create_document_impl(
        &s,
        "lorebook".into(),
        "Hero".into(),
        None,
        Some("The protagonist.".into()),
        Some(
            serde_json::json!({
                "universe_id": u_id,
                "entry_type": "character",
                "canon_status": "canon"
            })
            .to_string(),
        ),
        None,
        None,
    )
    .unwrap();

    // Entity 2 (Canon)
    let e2 = create_document_impl(
        &s,
        "lorebook".into(),
        "Mentor".into(),
        None,
        Some("The guide.".into()),
        Some(
            serde_json::json!({
                "universe_id": u_id,
                "entry_type": "character",
                "canon_status": "canon"
            })
            .to_string(),
        ),
        None,
        None,
    )
    .unwrap();

    // Entity 3 (Draft - excluded)
    let e3 = create_document_impl(
        &s,
        "lorebook".into(),
        "Secret Nemesis".into(),
        None,
        Some("The hidden villain.".into()),
        Some(
            serde_json::json!({
                "universe_id": u_id,
                "entry_type": "character",
                "canon_status": "draft"
            })
            .to_string(),
        ),
        None,
        None,
    )
    .unwrap();

    // Plan with relationships:
    // Rel 1: Hero -> Mentor (Both included -> should be published)
    // Rel 2: Hero -> Secret Nemesis (Nemesis excluded -> MUST BE SUPPRESSED)
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Rel World".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![
            thought::Entity {
                id: e1.metadata.id.clone(),
                universe_id: u_id.into(),
            },
            thought::Entity {
                id: e2.metadata.id.clone(),
                universe_id: u_id.into(),
            },
            thought::Entity {
                id: e3.metadata.id.clone(),
                universe_id: u_id.into(),
            },
        ],
        nodes: vec![],
        relationships: vec![
            Relationship {
                id: "rel-1".into(),
                universe_id: u_id.into(),
                book_id: None,
                source_id: e1.metadata.id.clone(),
                target_id: e2.metadata.id.clone(),
                label: "Apprentice of".into(),
                description: "Trained under the mentor for 5 years.".into(),
                directed: true,
                context_node_id: None,
                archived: false,
            },
            Relationship {
                id: "rel-2".into(),
                universe_id: u_id.into(),
                book_id: None,
                source_id: e1.metadata.id.clone(),
                target_id: e3.metadata.id.clone(),
                label: "Hunted by".into(),
                description: "Secret blood feud.".into(),
                directed: true,
                context_node_id: None,
                archived: false,
            },
        ],
    };
    save_catalog(&s, plan);

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Relationship Test".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: true,
        selected_categories: vec!["characters".into()],
        selected_entity_ids: None,
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: true,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false, // excludes e3
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req).unwrap();
    let md = &preview.generated_markdown;

    // Rel 1: Hero -> Mentor must exist
    assert!(md.contains("[Hero](#hero) -- **Apprentice of** --> [Mentor](#mentor)"));
    assert!(md.contains("Trained under the mentor for 5 years."));

    // Rel 2: Hero -> Secret Nemesis must NOT exist and Secret Nemesis must NOT be leaked
    assert!(!md.contains("Secret Nemesis"));
    assert!(!md.contains("Hunted by"));
    assert!(!md.contains("Secret blood feud."));
    assert!(!md.contains(&e3.metadata.id));
}

#[test]
fn test_historical_timeline_and_spoiler_filtering() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-time";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Chronicles".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![
            Node {
                id: "m-1".into(),
                universe_id: u_id.into(),
                book_id: None,
                branch_id: None,
                position: 1,
                title: "Dawn of the Kingdom".into(),
                description: "The founding era.".into(),
                era: "Era 1".into(),
                status: "planned".into(),
                questions: "".into(),
                entity_ids: vec![],
                changes: vec![],
                relationship_changes: vec![],
                linked_event_id: None,
                origin_node_id: None,
                archived: false,
                created_at: "2026-01-01T00:00:00Z".into(),
                updated_at: "2026-01-01T00:00:00Z".into(),
            },
            Node {
                id: "m-2".into(),
                universe_id: u_id.into(),
                book_id: None,
                branch_id: None,
                position: 2,
                title: "The Great Schism".into(),
                description: "Division of the realm.".into(),
                era: "Era 2".into(),
                status: "planned".into(),
                questions: "".into(),
                entity_ids: vec![],
                changes: vec![],
                relationship_changes: vec![],
                linked_event_id: None,
                origin_node_id: None,
                archived: false,
                created_at: "2026-01-02T00:00:00Z".into(),
                updated_at: "2026-01-02T00:00:00Z".into(),
            },
            Node {
                id: "m-3".into(),
                universe_id: u_id.into(),
                book_id: None,
                branch_id: None,
                position: 3,
                title: "Late Cataclysm (SPOILER)".into(),
                description: "The entire continent falls into the sea.".into(),
                era: "Era 3".into(),
                status: "planned".into(),
                questions: "".into(),
                entity_ids: vec![],
                changes: vec![],
                relationship_changes: vec![],
                linked_event_id: None,
                origin_node_id: None,
                archived: false,
                created_at: "2026-01-03T00:00:00Z".into(),
                updated_at: "2026-01-03T00:00:00Z".into(),
            },
        ],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    // Filter spoilers after m-2 (Great Schism)
    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Early Kingdom History".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: true,
        selected_categories: vec![],
        selected_entity_ids: None,
        include_entity_prose: false,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: true,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: Some("m-2".into()),
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req).unwrap();
    let md = &preview.generated_markdown;

    assert!(md.contains("Dawn of the Kingdom"));
    assert!(md.contains("The Great Schism"));
    // Late Cataclysm must be omitted due to spoiler cutoff!
    assert!(!md.contains("Late Cataclysm"));
    assert!(!md.contains("continent falls into the sea"));
}

#[test]
fn test_alternate_continuities_and_divergence() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-alt";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Multiverse".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![Branch {
            id: "br-dark".into(),
            universe_id: u_id.into(),
            name: "Shadow Timeline".into(),
            description: Some("What if darkness prevailed?".into()),
            divergence_node_id: "m-div".into(),
            parent_continuity_id: None,
            archived: false,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        }],
        entities: vec![],
        nodes: vec![
            Node {
                id: "m-div".into(),
                universe_id: u_id.into(),
                book_id: None,
                branch_id: None,
                position: 1,
                title: "Battle of the Eclipse".into(),
                description: "The turning point.".into(),
                era: "Eclipse Era".into(),
                status: "planned".into(),
                questions: "".into(),
                entity_ids: vec![],
                changes: vec![],
                relationship_changes: vec![],
                linked_event_id: None,
                origin_node_id: None,
                archived: false,
                created_at: "2026-01-01T00:00:00Z".into(),
                updated_at: "2026-01-01T00:00:00Z".into(),
            },
            Node {
                id: "m-alt-1".into(),
                universe_id: u_id.into(),
                book_id: None,
                branch_id: Some("br-dark".into()),
                position: 1,
                title: "Coronation of the Dark King".into(),
                description: "The reign of eternal shadow begins.".into(),
                era: "Dark Era Year 1".into(),
                status: "planned".into(),
                questions: "".into(),
                entity_ids: vec![],
                changes: vec![],
                relationship_changes: vec![],
                linked_event_id: None,
                origin_node_id: None,
                archived: false,
                created_at: "2026-01-02T00:00:00Z".into(),
                updated_at: "2026-01-02T00:00:00Z".into(),
            },
        ],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Alternate Realities".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: true,
        selected_categories: vec![],
        selected_entity_ids: None,
        include_entity_prose: false,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: true,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req).unwrap();
    let md = &preview.generated_markdown;

    assert!(md.contains("Alternate Continuity: Shadow Timeline"));
    assert!(md.contains("What if darkness prevailed?"));
    assert!(md.contains("Diverges from canonical milestone: **Battle of the Eclipse** (Eclipse Era)"));
    assert!(md.contains("Coronation of the Dark King"));
}

#[test]
fn test_chapter_excerpts_selection() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-excerpt";
    let b_id = "book-genesis";

    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Literary Universe".into(),
            description: None,
            archived: false,
        }],
        books: vec![Book {
            id: b_id.into(),
            universe_id: u_id.into(),
            name: "Genesis Chronicles".into(),
            continuity: "canonical".into(),
            description: None,
            branch_id: None,
            archived: false,
        }],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    let ch_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "chapter",
        "book_id": b_id,
        "chapter_order": 1.0,
        "canon_status": "canon"
    })
    .to_string();

    let ch = create_document_impl(
        &s,
        "lorebook".into(),
        "Chapter I: The First Spark".into(),
        None,
        Some("Full chapter prose that should NOT be exported without selection.".into()),
        Some(ch_meta),
        None,
        None,
    )
    .unwrap();

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Literary Excerpts".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: true,
        selected_categories: vec![],
        selected_entity_ids: None,
        include_entity_prose: false,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![ChapterExcerptSelection {
            chapter_id: ch.metadata.id.clone(),
            heading: Some("Opening Reflection".into()),
            excerpt_text: "In the quiet before morning, the spark took hold.".into(),
        }],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req).unwrap();
    let md = &preview.generated_markdown;

    assert!(md.contains("## Excerpts"));
    assert!(md.contains("Opening Reflection"));
    assert!(md.contains("*From Chapter **Chapter I: The First Spark**, Book **Genesis Chronicles***"));
    assert!(md.contains("> In the quiet before morning, the spark took hold."));
    // Full prose must NOT be dumped
    assert!(!md.contains("Full chapter prose that should NOT be exported"));
}

#[test]
fn test_anchor_slugification_unicode_and_collision_avoidance() {
    let mut seen = std::collections::BTreeMap::new();

    // Standard ASCII
    assert_eq!(generator::slugify("Astraea", &mut seen), "astraea");
    // Duplicate title: should get -1 suffix
    assert_eq!(generator::slugify("Astraea", &mut seen), "astraea-1");
    // Third duplicate: should get -2 suffix
    assert_eq!(generator::slugify("Astraea", &mut seen), "astraea-2");

    // Unicode handling
    let mut seen_unicode = std::collections::BTreeMap::new();
    let slug_french = generator::slugify("Hélène de la Mer", &mut seen_unicode);
    assert_eq!(slug_french, "hélène-de-la-mer");

    let slug_cjk = generator::slugify("太陽の神 Solaris", &mut seen_unicode);
    assert_eq!(slug_cjk, "太陽の神-solaris");

    // Escaping of brackets in markdown links
    assert_eq!(generator::escape_link_text("[Special] Hero"), "\\[Special\\] Hero");
}

#[test]
fn test_snapshot_consistency_and_overwrite_rejection() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-pub-consistency";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Consistency World".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    let doc = create_document_impl(
        &s,
        "lorebook".into(),
        "Solaris".into(),
        None,
        Some("Sun deity.".into()),
        Some(
            serde_json::json!({
                "universe_id": u_id,
                "entry_type": "character",
                "canon_status": "canon"
            })
            .to_string(),
        ),
        None,
        None,
    )
    .unwrap();

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Consistency Test".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: true,
        selected_categories: vec!["characters".into()],
        selected_entity_ids: None,
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req.clone()).unwrap();
    let orig_fingerprint = preview.source_fingerprint.clone();

    let out_dir = dir.path().join("output");
    fs::create_dir_all(&out_dir).unwrap();
    let dest_file = out_dir.join("encyclopedia.md");

    // 1. Successful publication
    let pub_req = PublishMarkdownRequest {
        request: req.clone(),
        destination_path: dest_file.to_string_lossy().to_string(),
        expected_source_fingerprint: orig_fingerprint.clone(),
    };

    let result = publish_markdown_to_file(&s, pub_req).unwrap();
    assert_eq!(result.destination_path, dest_file.to_string_lossy().to_string());
    assert!(result.bytes_written > 0);
    assert_eq!(result.word_count, preview.word_count);

    // Verify written file contents
    let written = fs::read_to_string(&dest_file).unwrap();
    assert_eq!(written, preview.generated_markdown);

    // 2. Overwrite refusal: publishing to existing destination MUST FAIL
    let overwrite_req = PublishMarkdownRequest {
        request: req.clone(),
        destination_path: dest_file.to_string_lossy().to_string(),
        expected_source_fingerprint: orig_fingerprint.clone(),
    };
    let err_overwrite = publish_markdown_to_file(&s, overwrite_req).unwrap_err();
    assert!(err_overwrite.contains("Export destination already exists; no file was overwritten"));

    // 3. Stale fingerprint rejection: modifying a source document changes fingerprint
    // Save an update to Solaris
    let new_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "canon",
        "character_fields": {
            "role": "Ascended Deity"
        }
    })
    .to_string();

    save_document_impl(
        &s,
        doc.metadata.id.clone(),
        "Solaris the Ascended.".into(),
        None,
        None,
        Some(new_meta),
    )
    .unwrap();

    let dest_file_2 = out_dir.join("encyclopedia_v2.md");
    let stale_req = PublishMarkdownRequest {
        request: req,
        destination_path: dest_file_2.to_string_lossy().to_string(),
        expected_source_fingerprint: orig_fingerprint, // old stale fingerprint
    };

    let err_stale = publish_markdown_to_file(&s, stale_req).unwrap_err();
    assert!(err_stale.contains("Source notebook changed during publication; retry after saving"));
    assert!(!dest_file_2.exists());
}

#[test]
fn test_pdf_publication_success_and_parity() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-solaris";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Solaris".into(),
            description: Some("The realm of twin suns".into()),
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    let char_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "canon",
        "character_fields": {
            "role": "Solar Priest"
        }
    })
    .to_string();

    let doc = create_document_impl(
        &s,
        "lorebook".into(),
        "Sol Invictus".into(),
        None,
        Some("High Guardian of the Dawn Gate.".into()),
        Some(char_meta),
        None,
        None,
    )
    .unwrap();

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Solaris Codex".into()),
        subtitle: Some("Chronicles of Light".into()),
        author: Some("Chronicler Aethelgard".into()),
        include_universe_description: true,
        include_table_of_contents: true,
        selected_categories: default_categories(),
        selected_entity_ids: None,
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: true,
        include_faction_hierarchy: true,
        include_faction_holders: true,
        include_relationships: true,
        relationship_types: None,
        include_timeline: true,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req.clone()).unwrap();
    assert_eq!(preview.document.title, "Solaris Codex");
    assert_eq!(preview.document.subtitle.as_deref(), Some("Chronicles of Light"));
    assert_eq!(preview.document.universe_name, "Solaris");
    assert_eq!(preview.document.sections.len(), 1);
    assert_eq!(preview.document.sections[0].entries[0].title, "Sol Invictus");

    let out_dir = dir.path().join("output_pdf");
    fs::create_dir_all(&out_dir).unwrap();
    let dest_pdf = out_dir.join("solaris_codex.pdf");

    // 1. Native backend PDF rendering
    let pub_req = PublishPdfRequest {
        request: req.clone(),
        destination_path: dest_pdf.to_string_lossy().to_string(),
        expected_source_fingerprint: preview.source_fingerprint.clone(),
        pdf_bytes: None,
    };

    let result = publish_pdf_to_file(&s, pub_req).unwrap();
    assert_eq!(result.destination_path, dest_pdf.to_string_lossy().to_string());
    assert!(result.bytes_written > 0);
    assert!(result.page_count >= 1);
    assert!(dest_pdf.exists());

    let file_bytes = fs::read(&dest_pdf).unwrap();
    assert_eq!(file_bytes.len(), result.bytes_written);
    assert!(file_bytes.starts_with(b"%PDF-1.4"));
    assert!(file_bytes.ends_with(b"%%EOF\n") || file_bytes.ends_with(b"%%EOF"));

    // SHA256 integrity match
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    let expected_hash = format!("{:x}", hasher.finalize());
    assert_eq!(result.sha256, expected_hash);

    // Verify privacy: raw internal ID not leaked into PDF stream
    let pdf_str = String::from_utf8_lossy(&file_bytes);
    assert!(!pdf_str.contains(&doc.metadata.id));
}

#[test]
fn test_pdf_publication_custom_payload_and_validation() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-aether";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Aetheria".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Aetheria".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: false,
        selected_categories: default_categories(),
        selected_entity_ids: None,
        include_entity_prose: false,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req.clone()).unwrap();
    let out_dir = dir.path().join("output_custom");
    fs::create_dir_all(&out_dir).unwrap();

    // 1. Invalid PDF payload rejected
    let bad_dest = out_dir.join("bad.pdf");
    let bad_req = PublishPdfRequest {
        request: req.clone(),
        destination_path: bad_dest.to_string_lossy().to_string(),
        expected_source_fingerprint: preview.source_fingerprint.clone(),
        pdf_bytes: Some(b"NOT A VALID PDF FILE".to_vec()),
    };
    let err_bad = publish_pdf_to_file(&s, bad_req).unwrap_err();
    assert!(err_bad.contains("Invalid PDF payload"));

    // 2. Valid custom PDF payload written
    let good_dest = out_dir.join("custom.pdf");
    let custom_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF\n".to_vec();
    let good_req = PublishPdfRequest {
        request: req.clone(),
        destination_path: good_dest.to_string_lossy().to_string(),
        expected_source_fingerprint: preview.source_fingerprint.clone(),
        pdf_bytes: Some(custom_bytes.clone()),
    };
    let res = publish_pdf_to_file(&s, good_req).unwrap();
    assert_eq!(res.bytes_written, custom_bytes.len());
    let read_back = fs::read(&good_dest).unwrap();
    assert_eq!(read_back, custom_bytes);
}

#[test]
fn test_pdf_publication_destination_checks_and_diagnostics() {
    let dir = tempfile::tempdir().unwrap();
    let s = test_state(dir.path());

    let u_id = "uni-east";
    let plan = Plan {
        version: 1,
        revision: 0,
        universes: vec![Universe {
            id: u_id.into(),
            name: "Eastern Realm".into(),
            description: None,
            archived: false,
        }],
        books: vec![],
        branches: vec![],
        entities: vec![],
        nodes: vec![],
        relationships: vec![],
    };
    save_catalog(&s, plan);

    // Entity with CJK characters to test glyph diagnostics
    let cjk_meta = serde_json::json!({
        "universe_id": u_id,
        "entry_type": "character",
        "canon_status": "canon",
        "character_fields": {
            "role": "太陽の神"
        }
    })
    .to_string();

    let _cjk_doc = create_document_impl(
        &s,
        "lorebook".into(),
        "Amaterasu (天照)".into(),
        None,
        Some("Solar deity of the heavens.".into()),
        Some(cjk_meta),
        None,
        None,
    )
    .unwrap();

    let req = PublicationRequest {
        universe_id: u_id.into(),
        title: Some("Eastern Realm Encyclopedia".into()),
        subtitle: None,
        author: None,
        include_universe_description: false,
        include_table_of_contents: false,
        selected_categories: default_categories(),
        selected_entity_ids: None,
        include_entity_prose: true,
        included_attribute_keys: None,
        include_factions: false,
        include_faction_hierarchy: false,
        include_faction_holders: false,
        include_relationships: false,
        relationship_types: None,
        include_timeline: false,
        selected_milestone_ids: None,
        include_alternate_continuities: false,
        selected_branch_ids: None,
        selected_excerpts: vec![],
        filter_spoilers_after_milestone_id: None,
        include_drafts: false,
        include_speculative: false,
        include_archived: false,
    };

    let preview = build_preview(&s, req.clone()).unwrap();
    let out_dir = dir.path().join("output_checks");
    fs::create_dir_all(&out_dir).unwrap();

    // 1. Reject non-PDF extension
    let txt_dest = out_dir.join("encyclopedia.txt");
    let txt_req = PublishPdfRequest {
        request: req.clone(),
        destination_path: txt_dest.to_string_lossy().to_string(),
        expected_source_fingerprint: preview.source_fingerprint.clone(),
        pdf_bytes: None,
    };
    let err_txt = publish_pdf_to_file(&s, txt_req).unwrap_err();
    assert!(err_txt.contains("must have a .pdf extension"));

    // 2. Reject existing destination (no-clobber)
    let existing_dest = out_dir.join("already_exists.pdf");
    fs::write(&existing_dest, b"already here").unwrap();
    let exist_req = PublishPdfRequest {
        request: req.clone(),
        destination_path: existing_dest.to_string_lossy().to_string(),
        expected_source_fingerprint: preview.source_fingerprint.clone(),
        pdf_bytes: None,
    };
    let err_exist = publish_pdf_to_file(&s, exist_req).unwrap_err();
    assert!(err_exist.contains("already exists; no file was overwritten"));

    // 3. Render and test glyph diagnostics
    let mut warnings = Vec::new();
    let (bytes, page_count) = pdf::render_pdf_from_document(&preview.document, &mut warnings);
    assert!(!bytes.is_empty());
    assert!(page_count >= 1);
    // Explicit diagnostic for unsupported glyphs
    let glyph_warn = warnings.iter().find(|w| w.code == "unsupported_glyphs");
    assert!(glyph_warn.is_some());
    let msg = &glyph_warn.unwrap().message;
    assert!(msg.contains("does not support glyph"));
}

#[test]
fn narrative_chapter_sources_obey_selection_house_universe_privacy_and_spoiler_filters() {
    let dir=tempfile::tempdir().unwrap(); let s=test_state(dir.path());
    let node=|id:&str,position:i32| serde_json::json!({"id":id,"universe_id":"u","book_id":null,"position":position,"title":format!("Event {id}"),"description":"An authored summary.\n\nConsequences: An authored account.","era":"","status":"planned","questions":"PRIVATE NOTE","entity_ids":[],"changes":[],"relationship_changes":[],"linked_event_id":null,"origin_node_id":null,"archived":false,"created_at":"2026-10-28T00:00:00Z","updated_at":"2026-10-28T00:00:00Z"});
    let p: Plan=serde_json::from_value(serde_json::json!({"version":1,"revision":0,"universes":[{"id":"u","name":"World","description":"A premise.\n\nAn extended overview."},{"id":"v","name":"Other"}],"books":[{"id":"book","universe_id":"u","name":"Public Volume","continuity":"canonical"},{"id":"foreign","universe_id":"v","name":"HIDDEN FOREIGN BOOK","continuity":"canonical"},{"id":"archived","universe_id":"u","name":"HIDDEN ARCHIVED BOOK","continuity":"canonical","archived":true}],"nodes":[node("past",0),node("future",1)],"entities":[],"relationships":[]})).unwrap();
    save_catalog(&s,p);
    let mut selections=Vec::new();
    for case in ["PUBLIC CHAPTER","HIDDEN DRAFT","HIDDEN ARCHIVED","HIDDEN HOUSE","HIDDEN FOREIGN","HIDDEN BOOK","HIDDEN FUTURE","HIDDEN MISSING"] {
        let mut meta=serde_json::json!({"universe_id":"u","entry_type":"chapter","book_id":"book","milestone_id":"past","canon_status":"canon"});
        match case {
            "HIDDEN DRAFT"=>meta["canon_status"]=serde_json::json!("draft"),
            "HIDDEN ARCHIVED"=>meta["archived"]=serde_json::json!(true),
            "HIDDEN FOREIGN"=>meta["universe_id"]=serde_json::json!("v"),
            "HIDDEN BOOK"=>meta["book_id"]=serde_json::json!("foreign"),
            "HIDDEN FUTURE"=>meta["milestone_id"]=serde_json::json!("future"),
            "HIDDEN MISSING"=>meta["milestone_id"]=serde_json::json!("deleted"), _=>{}
        }
        let chapter=create_document_impl(&s,"lorebook".into(),case.into(),None,Some("PRIVATE MANUSCRIPT CONTENT".into()),Some(meta.to_string()),None,None).unwrap();
        if case=="HIDDEN HOUSE" {
            let path=s.storage.get_root().join(&chapter.metadata.relative_path);
            let text=fs::read_to_string(&path).unwrap();
            let (header,body)=text.strip_prefix("---json\n").unwrap().split_once("\n---\n").unwrap();
            let mut header:serde_json::Value=serde_json::from_str(header).unwrap();header["house_id"]=serde_json::json!("another-house");
            fs::write(path,format!("---json\n{}\n---\n{}",serde_json::to_string_pretty(&header).unwrap(),body)).unwrap();
        }
        selections.push(ChapterExcerptSelection {chapter_id:chapter.metadata.id,heading:None,excerpt_text:format!("APPROVED TEXT {case}")});
    }
    let mut req:PublicationRequest=serde_json::from_value(serde_json::json!({"universe_id":"u","include_timeline":true,"filter_spoilers_after_milestone_id":"past"})).unwrap();
    req.selected_excerpts=selections;
    let preview=build_preview(&s,req.clone()).unwrap();
    assert_eq!(preview.document.excerpts.len(),1);
    assert_eq!(preview.document.timeline.as_ref().unwrap().milestones[0].references.len(),1);
    for hidden in ["HIDDEN","PRIVATE MANUSCRIPT CONTENT","PRIVATE NOTE"] { assert!(!preview.generated_markdown.contains(hidden),"leaked {hidden}"); }
    assert!(preview.generated_markdown.contains("PUBLIC CHAPTER"));
    assert!(preview.generated_markdown.contains("Consequences: An authored account."));
    req.selected_excerpts.clear();
    let preview=build_preview(&s,req).unwrap();
    assert!(!preview.generated_markdown.contains("PUBLIC CHAPTER"));
    assert!(preview.document.timeline.as_ref().unwrap().milestones[0].references.is_empty());
}
