//! Release integrity regression tests: only tempfile notebooks and synthetic data.
use meta_cognition_notebook_lib::{cipher,commands::{AppState,create_document_impl},db::Database,storage::StorageManager,vault,thought,portable};
use serde_json::{json,Value};
use std::{fs,sync::Mutex};

fn state(dir:&std::path::Path)->AppState {
    let storage=StorageManager::new(dir.join("Notebook"));storage.initialize().unwrap();
    AppState{storage,db:Mutex::new(Database::open(dir.join("index.db")).unwrap()),db_path:dir.join("index.db")}
}
fn fixture(name: &str) -> Value {
    let entries = json!([
        {"id":"stz-0","index":0,"mappings":[{"original":"love","replacement":"ember"}]},
        {"id":"stz-1","index":1,"mappings":[{"original":"love","replacement":"silence"}]},
        {"id":"stz-2","index":2,"mappings":[{"original":"love","replacement":"home"}]}
    ]);
    let meta = json!({"version":2,"scope":"per_stanza","recovery_version":1,"stanzas":entries,
        "whole_poem_backup":{"mappings":[{"original":"love","replacement":"warmth"}]},
        "per_stanza_backup":entries,
        "unresolved_stanzas":[{"id":"detached","index":4,"mappings":[{"original":"lost","replacement":"found"}]}]});
    if name == "poem-meta.json" { return meta; }
    json!({"version":2,"algorithm_version":"2.0","id":"rc-key","name":"RC key",
        "created_at":"2026-10-31T00:00:00Z","updated_at":"2026-10-31T00:00:00Z",
        "scope":"per_stanza","mappings":[],"stanzas":entries})
}
fn bridge(action: &str, directory: &std::path::Path) {
    let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let result = std::process::Command::new("node").current_dir(repo)
        .args(["node_modules/tsx/dist/cli.mjs", "tests/fixtures/cipher-package-bridge.ts", action])
        .arg(directory).output().expect("Node/tsx required for the real TypeScript/Rust package boundary");
    assert!(result.status.success(), "bridge failed: {}", String::from_utf8_lossy(&result.stderr));
}
#[test]
fn ts_v2_key_crosses_real_rust_import_export_boundary() {
    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());
    bridge("export",dir.path());
    let input=dir.path().join("ts-input.mckey");
    let original:Value=serde_json::from_slice(&fs::read(&input).unwrap()).unwrap();
    let imported=cipher::import_dictionary_impl(&state,input.to_string_lossy().into_owned()).unwrap();
    let output=dir.path().join("rust-output.mckey");
    cipher::export_dictionary_impl(&state,imported.id,output.to_string_lossy().into_owned()).unwrap();
    let back:Value=serde_json::from_slice(&fs::read(output).unwrap()).unwrap();
    for field in ["stanzas","whole_poem_backup","per_stanza_backup","unresolved_stanzas","recovery_version"] {
        assert_eq!(back[field],original[field],"{field}");
    }
    assert_eq!(back["scope"],"per_stanza");assert_eq!(back["algorithm_version"],"2.0");
    bridge("verify",dir.path());
}
#[test]
fn legacy_v1_key_crosses_real_rust_import_export_boundary() {
    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());
    let input=dir.path().join("legacy.mckey");fs::write(&input,serde_json::to_vec(&json!({"version":1,"id":"legacy-rc","name":"Legacy RC","created_at":"2026-10-31T00:00:00Z","updated_at":"2026-10-31T00:00:00Z","mappings":[{"original":"love","replacement":"ember"}]})).unwrap()).unwrap();
    let imported=cipher::import_dictionary_impl(&state,input.to_string_lossy().into_owned()).unwrap();
    assert_eq!(imported.version,1);assert_eq!(imported.algorithm_version.as_deref(),Some("1.0"));assert_eq!(imported.mappings[0].replacement,"ember");
    let output=dir.path().join("legacy-export.mckey");
    cipher::export_dictionary_impl(&state,imported.id,output.to_string_lossy().into_owned()).unwrap();
    let back:Value=serde_json::from_slice(&fs::read(output).unwrap()).unwrap();
    assert_eq!(back["version"],1);assert_eq!(back["mappings"][0]["replacement"],"ember");
}
#[test]
fn vault_actual_archive_restores_full_poem_metadata_and_exact_canonical_bytes() {
    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());let meta=fixture("poem-meta.json");
    let doc=create_document_impl(&state,"poetry".into(),"RC three stanzas".into(),None,Some("  love at dawn\n\nlove at noon\n\nlove at dusk\n".into()),Some(json!({"cipher":meta}).to_string()),None,None).unwrap();
    let before=fs::read(state.storage.get_root().join(&doc.metadata.relative_path)).unwrap();
    let plan:thought::Plan=serde_json::from_value(json!({"version":1,"revision":0,"universes":[{"id":"rc-u","name":"Disposable RC"}],"books":[],"entities":[],"nodes":[],"relationships":[]})).unwrap();
    thought::save_impl(&state,0,plan).unwrap();
    let catalog=fs::read_dir(state.storage.get_root().join("Lorebooks")).unwrap().map(|p|p.unwrap().path()).find(|p|fs::read_to_string(p).unwrap().contains("_web_of_thought")).unwrap();
    let catalog_before=fs::read(&catalog).unwrap();
    let backup=vault::create_backup(&state,&dir.path().join("Vault")).unwrap();
    fs::create_dir(dir.path().join("Restored")).unwrap();
    let restored=vault::restore_separate(std::path::Path::new(&backup.path),&backup.archive_sha256,&dir.path().join("Restored"),state.storage.get_root()).unwrap();
    let root=std::path::Path::new(&restored.restored_path);
    assert_eq!(fs::read(root.join(&doc.metadata.relative_path)).unwrap(),before);
    let read=StorageManager::new(root).read_document(&doc.metadata.relative_path).unwrap();
    let back:Value=serde_json::from_str(read.metadata.metadata_json.as_ref().unwrap()).unwrap();assert_eq!(back["cipher"],meta);
    assert_eq!(fs::read(root.join("Lorebooks").join(catalog.file_name().unwrap())).unwrap(),catalog_before);
}
#[test]
fn release_invariant_rust_key_boundary_must_not_silently_drop_recovery_fields() {
    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());let mut original=fixture("v2.mckey");let meta=fixture("poem-meta.json");
    for field in ["unresolved_stanzas","whole_poem_backup","per_stanza_backup"] {original[field]=meta[field].clone();}
    let input=dir.path().join("recovery.mckey");fs::write(&input,original.to_string()).unwrap();
    let imported=cipher::import_dictionary_impl(&state,input.to_string_lossy().into_owned()).unwrap();
    let back=serde_json::to_value(imported).unwrap();
    assert_eq!(back["recovery_version"],1);
    for field in ["unresolved_stanzas","whole_poem_backup","per_stanza_backup"] { assert_eq!(back[field],original[field]); }
}

#[test]
fn actual_portable_archive_scope_excludes_poetry_even_with_universe_metadata() {
    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());
    let poem=create_document_impl(&state,"poetry".into(),"RC universe poem".into(),None,Some("love".into()),Some(json!({"universe_id":"rc-u","cipher":fixture("poem-meta.json")}).to_string()),None,None).unwrap();
    let plan:thought::Plan=serde_json::from_value(json!({"version":1,"revision":0,"universes":[{"id":"rc-u","name":"Disposable RC"}],"books":[],"entities":[],"nodes":[],"relationships":[]})).unwrap();
    thought::save_impl(&state,0,plan).unwrap();
    let package=dir.path().join("scope.mcuniverse");
    let out=portable::export(&state,portable::ExportRequest{universe_id:"rc-u".into(),snapshot_basis:portable::SnapshotBasis::LastSavedState,book_ids:vec![],chapter_ids:vec![]},&package).unwrap();
    assert!(!out.manifest.documents.iter().any(|d|d.id==poem.metadata.id));
    assert!(!portable::inspect(&package).unwrap().manifest.files.iter().any(|f|f.path.contains("Poetry")));
}

#[test]
fn unsupported_or_malformed_recovery_metadata_never_imports_successfully() {
    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());
    for replacement in [json!({"recovery_version":99}),json!({"unresolved_stanzas":"lost"}),
        json!({"per_stanza_backup":[{"id":"","index":0,"mappings":[]}]}),
        json!({"whole_poem_backup":{"mappings":"lost"}})] {
        let mut key=fixture("v2.mckey");
        for (field,value) in replacement.as_object().unwrap() {key[field]=value.clone();}
        let input=dir.path().join("bad.mckey");fs::write(&input,key.to_string()).unwrap();
        assert!(cipher::import_dictionary_impl(&state,input.to_string_lossy().into_owned()).is_err());
    }
    assert!(cipher::list_dictionaries_impl(&state).unwrap().is_empty());
}

#[test]
fn per_stanza_keys_without_algorithm_metadata_default_to_algorithm_2() {
    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());
    let mut key=fixture("v2.mckey");key.as_object_mut().unwrap().remove("algorithm_version");
    let input=dir.path().join("default-algorithm.mckey");fs::write(&input,key.to_string()).unwrap();
    let imported=cipher::import_dictionary_impl(&state,input.to_string_lossy().into_owned()).unwrap();
    assert_eq!(imported.algorithm_version.as_deref(),Some("2.0"));
}
