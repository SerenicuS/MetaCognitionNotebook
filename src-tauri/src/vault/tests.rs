use super::*;
use crate::{
    commands::*,
    organization::{update_organization_impl, OrganizationPatch},
};
use std::sync::Mutex;

fn state(root: &Path) -> AppState {
    let storage = StorageManager::new(root.join("Library"));
    storage.initialize().unwrap();
    AppState {
        storage,
        db: Mutex::new(Database::open(root.join("metadata.db")).unwrap()),
        db_path: root.join("metadata.db"),
    }
}
fn fixture() -> (tempfile::TempDir, AppState, Preview) {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    create_document_impl(
        &state,
        "poetry".into(),
        "Poem".into(),
        None,
        Some("  One\nTwo\n\nThree\n".into()),
        Some(r#"{"poetic_form":"Free Verse"}"#.into()),
        Some(vec!["verse".into()]),
        None,
    )
    .unwrap();
    let preview = create_backup(&state, &directory.path().join("Vault")).unwrap();
    (directory, state, preview)
}
fn entries(path: &Path) -> Vec<(String, Vec<u8>)> {
    let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
    (0..archive.len())
        .map(|index| {
            let mut file = archive.by_index(index).unwrap();
            let name = file.name().to_string();
            let mut bytes = vec![];
            file.read_to_end(&mut bytes).unwrap();
            (name, bytes)
        })
        .collect()
}
fn write_entries(path: &Path, entries: &[(String, Vec<u8>)]) {
    let mut writer = ZipWriter::new(File::create(path).unwrap());
    for (name, bytes) in entries {
        writer
            .start_file(
                name,
                SimpleFileOptions::default()
                    .compression_method(CompressionMethod::Stored)
                    .unix_permissions(0o600),
            )
            .unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().sync_all().unwrap();
}
fn change_manifest(path: &Path, change: impl Fn(&mut serde_json::Value)) {
    let mut payload = entries(path);
    let (_, bytes) = payload
        .iter_mut()
        .find(|(name, _)| name == MANIFEST)
        .unwrap();
    let mut manifest: serde_json::Value = serde_json::from_slice(bytes).unwrap();
    change(&mut manifest);
    *bytes = serde_json::to_vec(&manifest).unwrap();
    write_entries(path, &payload);
}
fn replace_payload(path: &Path, name: &str, bytes: Vec<u8>, update_hash: bool) {
    let mut payload = entries(path);
    payload.iter_mut().find(|(key, _)| key == name).unwrap().1 = bytes.clone();
    if update_hash {
        let (_, manifest) = payload.iter_mut().find(|(key, _)| key == MANIFEST).unwrap();
        let mut value: serde_json::Value = serde_json::from_slice(manifest).unwrap();
        let entry = value["files"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|entry| entry["path"] == name)
            .unwrap();
        entry["size"] = serde_json::json!(bytes.len());
        entry["sha256"] = bytes_hash(&bytes).into();
        *manifest = serde_json::to_vec(&value).unwrap();
    }
    write_entries(path, &payload);
}
fn inventory(root: &Path) -> BTreeMap<String, String> {
    sources(root)
        .unwrap()
        .into_iter()
        .map(|(name, path)| (name, file_digest(&path).unwrap().0))
        .collect()
}

#[test]
fn complete_library_roundtrip_preserves_studios_metadata_attachments_archives_and_catalog() {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    let mut originals = vec![];
    for studio in ["poetry", "philosophy", "lorebook"] {
        let doc = create_document_impl(&state, studio.into(), format!("思想 {}",studio), Some("parent-id".into()),
            Some("  Line one\n\n<!-- premise -->\nReason 🧠\n\nConclusion.\n".into()),
            Some(serde_json::json!({"custom":{"keep":true},"composition_mode":"structured","attributes":[{"key":"Lifespan","value":"forever"}]}).to_string()), Some(vec!["shared".into()]), None).unwrap();
        update_organization_impl(
            &state,
            doc.metadata.id.clone(),
            OrganizationPatch {
                favorite: Some(true),
                opened: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        originals.push((
            doc.metadata.relative_path.clone(),
            fs::read(state.storage.get_root().join(&doc.metadata.relative_path)).unwrap(),
        ));
    }
    fs::write(
        state.storage.get_root().join("Attachments/图像.bin"),
        [0, 255, 42, 128],
    )
    .unwrap();
    fs::write(
        state.storage.get_root().join("Backups/old.md"),
        "Archived writing\n",
    )
    .unwrap();
    state
        .db
        .lock()
        .unwrap()
        .restore_tag_catalog(&["unused".into()])
        .unwrap();
    let before = inventory(state.storage.get_root());
    let preview = create_backup(&state, &directory.path().join("Vault")).unwrap();
    assert_eq!(preview.document_count, 3);
    assert_eq!(preview.attachment_count, 1);
    assert_eq!(preview.archived_count, 1);
    assert_eq!(preview.studios.len(), 3);
    assert!(entries(Path::new(&preview.path))
        .iter()
        .all(|(name, _)| !name.contains("sqlite") && !name.ends_with(".db")));
    let restored = restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        directory.path(),
        state.storage.get_root(),
    )
    .unwrap();
    let root = Path::new(&restored.restored_path);
    assert_eq!(restored.document_count, 3);
    for (relative, bytes) in originals {
        assert_eq!(fs::read(root.join(&relative)).unwrap(), bytes);
        let document = StorageManager::new(root).read_document(&relative).unwrap();
        assert!(document.content.contains("Reason 🧠"));
        assert_eq!(document.metadata.tags, vec!["shared"]);
        let metadata: serde_json::Value =
            serde_json::from_str(document.metadata.metadata_json.as_ref().unwrap()).unwrap();
        assert_eq!(metadata["custom"]["keep"], true);
        assert_eq!(metadata["_workshop"]["favorite"], true);
    }
    assert_eq!(
        fs::read(root.join("Attachments/图像.bin")).unwrap(),
        vec![0, 255, 42, 128]
    );
    assert_eq!(
        fs::read_to_string(root.join("Backups/old.md")).unwrap(),
        "Archived writing\n"
    );
    let db = Database::open(root.join(".vault-recovery/metadata.db")).unwrap();
    assert_eq!(db.get_stats().unwrap().0, 3);
    assert!(db.list_all_tags().unwrap().contains(&"unused".into()));
    db.check_integrity().unwrap();
    assert_eq!(inventory(state.storage.get_root()), before);
}
#[test]
fn empty_library_is_a_valid_portable_backup_and_restore() {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    let preview = create_backup(&state, &directory.path().join("Vault")).unwrap();
    assert_eq!(preview.document_count, 0);
    let result = restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        directory.path(),
        state.storage.get_root(),
    )
    .unwrap();
    assert_eq!(result.document_count, 0);
    assert!(Path::new(&result.restored_path).join("Poetry").is_dir());
}
#[test]
fn raw_markdown_import_keeps_identity_and_receives_frontmatter_only_in_restored_copy() {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    let text = "Raw\n\nUnfinished thoughts 🧠\n";
    fs::write(state.storage.get_root().join("Philosophy/raw.md"), text).unwrap();
    reindex_library_impl(&state).unwrap();
    let id = list_documents_impl(&state, None, None).unwrap()[0].id.clone();
    let preview = create_backup(&state, &directory.path().join("Vault")).unwrap();
    let result = restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        directory.path(),
        state.storage.get_root(),
    )
    .unwrap();
    let restored = StorageManager::new(&result.restored_path)
        .read_document("Philosophy/raw.md")
        .unwrap();
    assert_eq!(restored.metadata.id, id);
    assert_eq!(restored.content, text);
    assert_eq!(
        fs::read_to_string(state.storage.get_root().join("Philosophy/raw.md")).unwrap(),
        text
    );
}
#[test]
fn modified_payload_is_rejected_even_when_zip_crc_is_recomputed() {
    let (_directory, _state, preview) = fixture();
    let path = Path::new(&preview.path);
    replace_payload(
        path,
        "library/Poetry/Poem.md",
        b"altered content".to_vec(),
        false,
    );
    assert!(verify_backup(path).unwrap_err().contains("Integrity"));
}
#[test]
fn unsupported_versions_invalid_timestamps_sizes_hashes_and_duplicate_manifest_paths_fail() {
    for variant in 0..7 {
        let (_directory, _state, preview) = fixture();
        let path = Path::new(&preview.path);
        change_manifest(path, |value| match variant {
            0 => value["format_version"] = 2.into(),
            1 => value["created_at"] = "not a date".into(),
            2 => value["files"][0]["size"] = serde_json::json!(MAX_FILE_BYTES + 1),
            3 => value["files"][0]["sha256"] = "00".into(),
            4 => {
                let entry = value["files"][0].clone();
                value["files"].as_array_mut().unwrap().push(entry);
            }
            5 => value["files"][0]["size"] = 0.into(),
            _ => value["files"][0]["path"] = "library/Poetry/not-there.md".into(),
        });
        assert!(verify_backup(path).is_err(), "variant {}", variant);
    }
}
#[test]
fn missing_or_unlisted_zip_entries_fail() {
    for extra in [false, true] {
        let (_directory, _state, preview) = fixture();
        let path = Path::new(&preview.path);
        let mut payload = entries(path);
        if extra {
            payload.push(("library/Attachments/extra.bin".into(), vec![1]));
        } else {
            payload.retain(|(name, _)| name != "library/Poetry/Poem.md");
        }
        write_entries(path, &payload);
        assert!(verify_backup(path).is_err());
    }
}
#[test]
fn unsafe_windows_paths_traversal_and_nested_backups_are_rejected() {
    for name in [
        "../outside.md",
        "/absolute",
        "C:/escape",
        "library/Poetry/../../escape.md",
        "library/Poetry\\evil.md",
        "library/Poetry/CON.md",
        "library/Poetry/x.md.",
        "library/Poetry/x.md ",
        "library/Poetry/x:stream.md",
        "library/Attachments/old.mcbackup",
    ] {
        let (_directory, _state, preview) = fixture();
        let path = Path::new(&preview.path);
        let mut payload = entries(path);
        payload.push((name.into(), vec![42]));
        write_entries(path, &payload);
        assert!(verify_backup(path).is_err(), "{}", name);
    }
}
#[test]
fn case_aliases_and_file_directory_conflicts_fail() {
    for (a, b) in [
        ("library/Attachments/A.bin", "library/Attachments/a.bin"),
        ("library/Attachments/file", "library/Attachments/file/child"),
    ] {
        let (_directory, _state, preview) = fixture();
        let path = Path::new(&preview.path);
        let mut payload = entries(path);
        payload.push((a.into(), vec![1]));
        payload.push((b.into(), vec![2]));
        write_entries(path, &payload);
        assert!(verify_backup(path).is_err());
    }
}
#[test]
fn exact_duplicate_zip_directory_entries_fail_before_zip_name_deduplication() {
    let (_directory, _state, preview) = fixture();
    let path = Path::new(&preview.path);
    let bytes = fs::read(path).unwrap();
    let end = bytes.len() - 22;
    let offset = u32::from_le_bytes(bytes[end + 16..end + 20].try_into().unwrap()) as usize;
    let name = u16::from_le_bytes(bytes[offset + 28..offset + 30].try_into().unwrap()) as usize;
    let extra = u16::from_le_bytes(bytes[offset + 30..offset + 32].try_into().unwrap()) as usize;
    let comment = u16::from_le_bytes(bytes[offset + 32..offset + 34].try_into().unwrap()) as usize;
    let duplicate = &bytes[offset..offset + 46 + name + extra + comment];
    let mut changed = bytes[..end].to_vec();
    changed.extend_from_slice(duplicate);
    let mut eocd = bytes[end..].to_vec();
    let count = u16::from_le_bytes(eocd[10..12].try_into().unwrap()) + 1;
    eocd[8..10].copy_from_slice(&count.to_le_bytes());
    eocd[10..12].copy_from_slice(&count.to_le_bytes());
    let size = u32::from_le_bytes(eocd[12..16].try_into().unwrap()) + duplicate.len() as u32;
    eocd[12..16].copy_from_slice(&size.to_le_bytes());
    changed.extend_from_slice(&eocd);
    fs::write(path, changed).unwrap();
    assert!(verify_backup(path).is_err());
}
#[test]
fn oversized_encrypted_compressed_and_symlink_zip_entries_are_rejected() {
    for variant in 0..4 {
        let (_directory, _state, preview) = fixture();
        let path = Path::new(&preview.path);
        let mut bytes = fs::read(path).unwrap();
        let end = bytes.len() - 22;
        let central = u32::from_le_bytes(bytes[end + 16..end + 20].try_into().unwrap()) as usize;
        match variant {
            0 => bytes[central + 24..central + 28]
                .copy_from_slice(&((MAX_FILE_BYTES + 1) as u32).to_le_bytes()),
            1 => bytes[central + 8..central + 10].copy_from_slice(&1u16.to_le_bytes()),
            2 => bytes[central + 10..central + 12].copy_from_slice(&8u16.to_le_bytes()),
            _ => bytes[central + 38..central + 42]
                .copy_from_slice(&(0o120777u32 << 16).to_le_bytes()),
        }
        fs::write(path, bytes).unwrap();
        assert!(verify_backup(path).is_err(), "variant {}", variant);
    }
}
#[test]
fn corrupt_truncated_or_oversized_directory_is_rejected() {
    let (_directory, _state, preview) = fixture();
    let path = Path::new(&preview.path);
    let original = fs::read(path).unwrap();
    fs::write(path, &original[..original.len() / 2]).unwrap();
    assert!(verify_backup(path).is_err());
    let mut bytes = original;
    let n = bytes.len();
    bytes[n - 12..n - 10].copy_from_slice(&((MAX_FILES + 2) as u16).to_le_bytes());
    fs::write(path, bytes).unwrap();
    assert!(verify_backup(path).is_err());
}
#[test]
fn valid_hashes_do_not_make_invalid_document_metadata_acceptable() {
    let (_directory, _state, preview) = fixture();
    let path = Path::new(&preview.path);
    let mut payload = entries(path);
    let (_, bytes) = payload
        .iter_mut()
        .find(|(name, _)| name == "library/Poetry/Poem.md")
        .unwrap();
    let text = String::from_utf8(bytes.clone())
        .unwrap()
        .replace("\"type\": \"poetry\"", "\"type\": \"lorebook\"");
    replace_payload(path, "library/Poetry/Poem.md", text.into_bytes(), true);
    assert!(verify_backup(path).is_err());
    replace_payload(
        path,
        "library/Poetry/Poem.md",
        b"---json\n{\"id\":\"broken\"}\nNo closing delimiter".to_vec(),
        true,
    );
    assert!(verify_backup(path).unwrap_err().contains("Unterminated"));
}
#[test]
fn staged_restore_failures_keep_active_library_and_partial_recovery_then_retry_succeeds() {
    for phase in ["staging", "file", "validated"] {
        let (directory, state, preview) = fixture();
        let before = inventory(state.storage.get_root());
        let error = restore_inner(
            Path::new(&preview.path),
            &preview.archive_sha256,
            directory.path(),
            state.storage.get_root(),
            |point| {
                if point == phase {
                    Err("injected interruption".into())
                } else {
                    Ok(())
                }
            },
        )
        .unwrap_err();
        assert!(error.contains("Active library unchanged"));
        assert_eq!(inventory(state.storage.get_root()), before);
        let partials: Vec<_> = fs::read_dir(directory.path())
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.extension().is_some_and(|e| e == "partial"))
            .collect();
        assert_eq!(partials.len(), 1);
        assert!(partials[0].join(".vault-recovery/restore.json").exists());
        let result = restore_separate(
            Path::new(&preview.path),
            &preview.archive_sha256,
            directory.path(),
            state.storage.get_root(),
        )
        .unwrap();
        assert!(Path::new(&result.restored_path).exists());
        assert!(partials[0].exists());
        assert_eq!(inventory(state.storage.get_root()), before);
    }
}
#[test]
fn changed_backup_after_preview_fails_without_creating_staging() {
    let (directory, state, preview) = fixture();
    let path = Path::new(&preview.path);
    change_manifest(path, |manifest| manifest["app_version"] = "0.0.0".into());
    let error = restore_separate(
        path,
        &preview.archive_sha256,
        directory.path(),
        state.storage.get_root(),
    )
    .unwrap_err();
    assert!(error.contains("changed since preview"));
    assert!(!fs::read_dir(directory.path()).unwrap().any(|entry| entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("MetaCognitionNotebook-Restore")));
}
#[test]
fn backup_and_restore_destinations_cannot_be_inside_the_active_library() {
    let (directory, state, preview) = fixture();
    let before = inventory(state.storage.get_root());
    let inner = state.storage.get_root().join("Vault");
    fs::create_dir(&inner).unwrap();
    assert!(create_backup(&state, &inner).is_err());
    assert!(restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        &inner,
        state.storage.get_root()
    )
    .is_err());
    assert_eq!(inventory(state.storage.get_root()), before);
    fs::write(directory.path().join("blocked"), "not a folder").unwrap();
    assert!(create_backup(&state, &directory.path().join("blocked")).is_err());
}
#[test]
fn backup_files_are_not_recursively_captured_and_interrupted_archives_are_retained() {
    let (directory, state, _preview) = fixture();
    fs::write(
        state.storage.get_root().join("Attachments/old.mcbackup"),
        "not included",
    )
    .unwrap();
    let folder = directory.path().join("Vault");
    let preview = create_backup(&state, &folder).unwrap();
    assert!(!entries(Path::new(&preview.path))
        .iter()
        .any(|(name, _)| name.ends_with("old.mcbackup")));
    fs::write(folder.join("interrupted.partial"), "partial archive").unwrap();
    let history = history(&folder).unwrap();
    assert!(history.backups.iter().any(|b| b.incomplete));
    assert!(folder.join("interrupted.partial").exists());
}
#[test]
fn disk_space_overflow_and_invalid_manifest_catalog_fail_safely() {
    let (directory, _state, preview) = fixture();
    assert!(require_space(directory.path(), u64::MAX).is_err());
    replace_payload(
        Path::new(&preview.path),
        CATALOG,
        b"{\"tags\":[\"\"],\"raw_documents\":[]}".to_vec(),
        true,
    );
    assert!(verify_backup(Path::new(&preview.path)).is_err());
}

#[test]
fn concurrent_external_edits_abort_capture_without_publishing_a_valid_backup() {
    let (directory, state, _preview) = fixture();
    let file = state.storage.get_root().join("Poetry/Poem.md");
    let folder = directory.path().join("ChangedVault");
    let error = create_backup_inner(&state, &folder, |_| {
        let mut text = fs::read_to_string(&file).map_err(err)?;
        text.push_str("\nExternal edit");
        fs::write(&file, text).map_err(err)
    })
    .unwrap_err();
    assert!(error.contains("changed during capture"));
    assert!(history(&folder)
        .unwrap()
        .backups
        .iter()
        .all(|entry| entry.incomplete));
    assert!(fs::read_to_string(file).unwrap().ends_with("External edit"));
}
#[test]
fn windows_device_aliases_and_unicode_case_aliases_are_rejected() {
    for path in [
        "library/Poetry/COM¹.md",
        "library/Poetry/CON .md",
        "library/Poetry/LPT³.md",
    ] {
        assert!(safe_path(path).is_err());
    }
    assert!(
        unique_names(["library/Attachments/Σ.txt", "library/Attachments/ς.txt"].into_iter())
            .is_err()
    );
}

#[test]
fn cipher_dictionaries_survive_vault_roundtrip() {
    let (directory, state, _preview) = fixture();
    let dict_json = serde_json::json!({
        "version": 1,
        "id": "dict-1",
        "name": "Surreal Botanical",
        "created_at": "2026-10-18T10:00:00Z",
        "updated_at": "2026-10-18T10:00:00Z",
        "mappings": [
            { "original": "love", "replacement": "chlorophyll" },
            { "original": "heart", "replacement": "rhizome" }
        ]
    });
    fs::create_dir_all(state.storage.get_root().join("Dictionaries")).unwrap();
    fs::write(
        state.storage.get_root().join("Dictionaries/dict-1.json"),
        serde_json::to_vec_pretty(&dict_json).unwrap(),
    )
    .unwrap();

    let preview = create_backup(&state, &directory.path().join("VaultWithDict")).unwrap();
    assert!(entries(Path::new(&preview.path))
        .iter()
        .any(|(name, _)| name == "library/Dictionaries/dict-1.json"));

    let restored = restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        directory.path(),
        state.storage.get_root(),
    )
    .unwrap();
    let root = Path::new(&restored.restored_path);
    assert!(root.join("Dictionaries/dict-1.json").exists());
    let restored_dict: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(root.join("Dictionaries/dict-1.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(restored_dict["name"], "Surreal Botanical");
    assert_eq!(restored_dict["mappings"][0]["replacement"], "chlorophyll");
}
#[test]
fn manuscripts_survive_vault_roundtrip() {
    let (directory, state, _preview) = fixture();
    let manuscript_meta = serde_json::json!({
        "manuscript": {
            "version": 1,
            "subtitle": "Selected Verse and Thought",
            "outline": [
                {
                    "id": "sec-1",
                    "type": "section",
                    "title": "Part 1",
                    "children": []
                }
            ]
        }
    });

    let doc = create_document_impl(
        &state,
        "manuscript".into(),
        "Collected Works".into(),
        None,
        Some("Manuscript project body notes".into()),
        Some(manuscript_meta.to_string()),
        Some(vec!["anthology".into()]),
        None,
    )
    .unwrap();

    let preview = create_backup(&state, &directory.path().join("VaultWithManuscript")).unwrap();
    let archive_entries = entries(Path::new(&preview.path));
    let expected_entry = format!("library/{}", doc.metadata.relative_path.replace('\\', "/"));
    assert!(archive_entries.iter().any(|(name, _)| name == &expected_entry));

    let restored = restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        directory.path(),
        state.storage.get_root(),
    )
    .unwrap();
    let root = Path::new(&restored.restored_path);
    assert!(root.join(&doc.metadata.relative_path).exists());

    let restored_content = fs::read_to_string(root.join(&doc.metadata.relative_path)).unwrap();
    assert!(restored_content.contains("Manuscript project body notes"));
    assert!(restored_content.contains("Selected Verse and Thought"));
    assert!(restored_content.contains("Part 1"));
}

#[test]
fn vault_multi_house_and_universe_mapping_survive_backup_and_restore() {
    let directory = tempfile::tempdir().unwrap();
    let s = state(directory.path());

    // 1. Create a custom House with custom enabled studios and universe mapping
    let house = s.storage.create_house(crate::models::CreateHouseInput {
        name: "Valenrift Realm".to_string(),
        description: Some("Fantasy universe setting".to_string()),
        color: Some("emerald".to_string()),
        icon: Some("castle".to_string()),
        enabled_studios: Some(vec![crate::models::AuthoringStudio::Lorebook]),
        manuscript_tools_enabled: Some(false),
    }).unwrap();

    s.storage.assign_universe_to_house("uni-valenrift-99", &house.id).unwrap();

    // 2. Create documents in both Default House and custom House
    let default_doc = create_document_impl(
        &s,
        "poetry".into(),
        "Default Poem".into(),
        None,
        Some("Default verse".into()),
        None,
        Some(vec!["verse".into()]),
        None,
    ).unwrap();

    let mut custom_doc = create_document_impl(
        &s,
        "lorebook".into(),
        "Valenrift Spire".into(),
        None,
        Some("Valenrift crystalline lore".into()),
        None,
        Some(vec!["spire".into()]),
        Some(house.id.clone()),
    ).unwrap();
    // Attribute to custom house
    custom_doc.metadata.house_id = house.id.clone();
    s.storage.write_document_atomic(&custom_doc.metadata.relative_path, &custom_doc).unwrap();
    s.db.lock().unwrap().upsert_document(&custom_doc.metadata).unwrap();

    // 3. Backup through Vault
    let preview = create_backup(&s, &directory.path().join("Vault")).unwrap();
    assert_eq!(preview.document_count, 2);

    // Verify library.json inside backup archive contains house_registry
    let archive_payload = entries(Path::new(&preview.path));
    let (_, lib_bytes) = archive_payload.iter().find(|(name, _)| name == "library/library.json").unwrap();
    let lib_val: serde_json::Value = serde_json::from_slice(lib_bytes).unwrap();
    assert_eq!(lib_val["house_registry"]["houses"].as_array().unwrap().len(), 2);

    // 4. Restore through Vault into separate destination
    let restored = restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        directory.path(),
        s.storage.get_root(),
    ).unwrap();

    let restored_root = Path::new(&restored.restored_path);
    let restored_storage = StorageManager::new(restored_root);

    // 5. Verify restored House registry and universe mapping
    let restored_registry = restored_storage.read_house_registry().unwrap();
    assert_eq!(restored_registry.houses.len(), 2);
    let restored_house = restored_registry.houses.iter().find(|h| h.id == house.id).unwrap();
    assert_eq!(restored_house.name, "Valenrift Realm");
    assert_eq!(restored_house.enabled_studios, vec![crate::models::AuthoringStudio::Lorebook]);
    assert!(!restored_house.manuscript_tools_enabled);
    assert_eq!(restored_house.universe_ids, vec!["uni-valenrift-99".to_string()]);

    assert_eq!(
        restored_storage.get_universe_owning_house("uni-valenrift-99").unwrap(),
        house.id
    );

    // 6. Verify restored documents and SQLite index
    let restored_db = Database::open(restored_root.join(".vault-recovery/metadata.db")).unwrap();
    let indexed_custom = restored_db.get_document_metadata(&custom_doc.metadata.id).unwrap().unwrap();
    assert_eq!(indexed_custom.house_id, house.id);

    let indexed_default = restored_db.get_document_metadata(&default_doc.metadata.id).unwrap().unwrap();
    assert_eq!(indexed_default.house_id, crate::models::DEFAULT_HOUSE_ID);
}

#[test]
fn vault_backup_serialization_and_corrupted_registry_rejection() {
    let directory = tempfile::tempdir().unwrap();
    let s = state(directory.path());

    // 1. Verify lock coordination between create_backup and StorageManager registry_lock
    let house = s.storage.create_house(crate::models::CreateHouseInput {
        name: "Synchronized House".to_string(),
        description: None,
        color: None,
        icon: None,
        enabled_studios: None,
        manuscript_tools_enabled: None,
    }).unwrap();

    let backup_dest = directory.path().join("Vault");
    let preview = create_backup(&s, &backup_dest).unwrap();
    assert!(Path::new(&preview.path).exists());

    // 2. Corrupt the house_registry inside library/library.json with unsupported schema version
    let corrupt_version_backup = backup_dest.join("corrupt_version.mcbackup");
    fs::copy(&preview.path, &corrupt_version_backup).unwrap();

    let corrupt_version_lib = serde_json::json!({
        "name": "MetaCognition Notebook Library",
        "version": "1.0",
        "house_registry": {
            "schema_version": 999,
            "default_house_id": "house-default",
            "houses": [{
                "id": "house-default",
                "name": "Primary House",
                "color": "amber",
                "icon": "castle",
                "enabled_studios": ["poetry", "philosophy", "lorebook"],
                "manuscript_tools_enabled": true,
                "universe_ids": [],
                "created_at": "2026-10-18T10:00:00Z",
                "updated_at": "2026-10-18T10:00:00Z",
                "archived": false
            }]
        }
    });

    replace_payload(
        &corrupt_version_backup,
        "library/library.json",
        serde_json::to_vec_pretty(&corrupt_version_lib).unwrap(),
        true,
    );

    let (corrupt_hash, _) = digest(&mut File::open(&corrupt_version_backup).unwrap(), MAX_TOTAL_BYTES).unwrap();
    let restore_err = restore_separate(
        &corrupt_version_backup,
        &corrupt_hash,
        directory.path(),
        s.storage.get_root(),
    ).unwrap_err();
    assert!(restore_err.contains("Unsupported house_registry schema version"));

    // 3. Corrupt registry with missing default house
    let corrupt_nodes_backup = backup_dest.join("corrupt_missing_default.mcbackup");
    fs::copy(&preview.path, &corrupt_nodes_backup).unwrap();

    let corrupt_missing_default = serde_json::json!({
        "name": "MetaCognition Notebook Library",
        "version": "1.0",
        "house_registry": {
            "schema_version": 1,
            "default_house_id": "house-default",
            "houses": [{
                "id": house.id,
                "name": "Synchronized House",
                "color": "amber",
                "icon": "castle",
                "enabled_studios": ["poetry"],
                "manuscript_tools_enabled": true,
                "universe_ids": [],
                "created_at": "2026-10-18T10:00:00Z",
                "updated_at": "2026-10-18T10:00:00Z",
                "archived": false
            }]
        }
    });

    replace_payload(
        &corrupt_nodes_backup,
        "library/library.json",
        serde_json::to_vec_pretty(&corrupt_missing_default).unwrap(),
        true,
    );

    let (corrupt_missing_hash, _) = digest(&mut File::open(&corrupt_nodes_backup).unwrap(), MAX_TOTAL_BYTES).unwrap();
    let restore_missing_err = restore_separate(
        &corrupt_nodes_backup,
        &corrupt_missing_hash,
        directory.path(),
        s.storage.get_root(),
    ).unwrap_err();
    assert!(restore_missing_err.contains("missing required Default House"));
}

#[test]
fn vault_roundtrip_preserves_moved_documents_and_index_consistency() {
    let directory = tempfile::tempdir().unwrap();
    let s = state(directory.path());

    let house_a = s.storage.create_house(crate::models::CreateHouseInput {
        name: "House Alpha".to_string(),
        description: None,
        color: None,
        icon: None,
        enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
        manuscript_tools_enabled: Some(true),
    }).unwrap();

    let house_b = s.storage.create_house(crate::models::CreateHouseInput {
        name: "House Beta".to_string(),
        description: None,
        color: None,
        icon: None,
        enabled_studios: Some(vec![crate::models::AuthoringStudio::Poetry]),
        manuscript_tools_enabled: Some(true),
    }).unwrap();

    // Create poetry in House Alpha
    let doc = create_document_impl(
        &s,
        "poetry".into(),
        "Alpha Verse".into(),
        None,
        Some("Poetic lines written in Alpha.".into()),
        None,
        Some(vec!["alpha".into()]),
        Some(house_a.id.clone()),
    ).unwrap();
    assert_eq!(doc.metadata.house_id, house_a.id);

    // Move document to House Beta
    let moved = move_document_to_house_impl(&s, doc.metadata.id.clone(), house_b.id.clone()).unwrap();
    assert_eq!(moved.house_id, house_b.id);

    // Create Vault backup
    let preview = create_backup(&s, &directory.path().join("Vault")).unwrap();
    assert_eq!(preview.document_count, 1);

    // Restore Vault backup into separate destination
    let restored = restore_separate(
        Path::new(&preview.path),
        &preview.archive_sha256,
        directory.path(),
        s.storage.get_root(),
    ).unwrap();

    let restored_root = Path::new(&restored.restored_path);
    let restored_storage = StorageManager::new(restored_root);

    // Check disk file in restored library
    let restored_doc = restored_storage.read_document(&moved.relative_path).unwrap();
    assert_eq!(restored_doc.metadata.house_id, house_b.id);
    assert_eq!(restored_doc.content, "Poetic lines written in Alpha.");

    // Check restored SQLite index
    let restored_db = Database::open(restored_root.join(".vault-recovery/metadata.db")).unwrap();
    let restored_indexed = restored_db.get_document_metadata(&moved.id).unwrap().unwrap();
    assert_eq!(restored_indexed.house_id, house_b.id);
}
