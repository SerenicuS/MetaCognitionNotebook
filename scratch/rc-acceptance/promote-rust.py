from pathlib import Path
s=Path('scratch/rc-acceptance/rust-boundaries.rs').read_text(encoding='utf-8')
s=s.replace('//! Disposable release audit fixture. No production changes or real notebook access.', '//! Release integrity regression tests: only tempfile notebooks and synthetic data.')
a=s.index('fn fixture(name:&str)->Value {')
b=s.index('#[test]',a)
s=s[:a]+'''fn fixture(name: &str) -> Value {
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
''' + s[b:]
a=s.index('    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());let original=fixture("v2.mckey");')
b=s.index('\n}\n#[test]',a)
s=s[:a]+'''    let dir=tempfile::tempdir().unwrap();let state=state(dir.path());
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
    bridge("verify",dir.path());''' + s[b:]
s=s.replace('let back=serde_json::to_value(imported).unwrap();assert_eq!(back["unresolved_stanzas"],original["unresolved_stanzas"]);','''let back=serde_json::to_value(imported).unwrap();
    assert_eq!(back["recovery_version"],1);
    for field in ["unresolved_stanzas","whole_poem_backup","per_stanza_backup"] { assert_eq!(back[field],original[field]); }''')
s+='''
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
'''
Path('src-tauri/tests/poetry_release_integrity.rs').write_text(s,encoding='utf-8')
