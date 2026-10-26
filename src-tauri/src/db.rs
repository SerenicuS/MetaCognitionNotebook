use std::path::Path;
use rusqlite::{params, Connection, Result};
use crate::models::{normalize_house_id, DocumentMetadata, DocumentType};

pub struct Database {
    conn: Connection,
    writes_blocked: bool,
}

impl Database {
    pub fn freeze_writes(&mut self) { self.writes_blocked = true; }
    pub fn ensure_writable(&self) -> std::result::Result<(), String> {
        if self.writes_blocked { Err("Notebook activation is pending. Restart the app before editing.".into()) } else { Ok(()) }
    }

    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        let db = Database { conn, writes_blocked: false };
        db.migrate()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        let db = Database { conn, writes_blocked: false };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            )",
            [],
        )?;

        let mut stmt = self.conn.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")?;
        let mut rows = stmt.query([])?;
        let current_version: i32 = if let Some(row) = rows.next()? {
            row.get(0)?
        } else {
            0
        };

        if current_version < 1 {
            self.conn.execute_batch(
                "BEGIN TRANSACTION;
                
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    doc_type TEXT NOT NULL,
                    parent_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    doc_type TEXT NOT NULL,
                    relative_path TEXT NOT NULL UNIQUE,
                    parent_id TEXT,
                    metadata_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
                CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id);

                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE
                );

                CREATE TABLE IF NOT EXISTS document_tags (
                    document_id TEXT NOT NULL,
                    tag_id TEXT NOT NULL,
                    PRIMARY KEY(document_id, tag_id),
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
                    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_document_tags_doc ON document_tags(document_id);
                CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag_id);

                CREATE TABLE IF NOT EXISTS document_links (
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    description TEXT,
                    PRIMARY KEY(source_id, target_id),
                    FOREIGN KEY(source_id) REFERENCES documents(id) ON DELETE CASCADE,
                    FOREIGN KEY(target_id) REFERENCES documents(id) ON DELETE CASCADE
                );

                INSERT INTO schema_version (version) VALUES (1);

                COMMIT;"
            )?;
        }

        if current_version < 2 {
            let has_house_id: bool = self
                .conn
                .prepare("PRAGMA table_info(documents)")?
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(Result::ok)
                .any(|col| col == "house_id");

            let tx = self.conn.unchecked_transaction()?;
            if !has_house_id {
                tx.execute(
                    "ALTER TABLE documents ADD COLUMN house_id TEXT NOT NULL DEFAULT 'house-default'",
                    [],
                )?;
            }
            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_documents_house_id ON documents(house_id)",
                [],
            )?;
            tx.execute("INSERT INTO schema_version (version) VALUES (2)", [])?;
            tx.commit()?;
        }

        Ok(())
    }

    pub fn upsert_document(&mut self, doc: &DocumentMetadata) -> Result<()> {
        let tx = self.conn.transaction()?;

        Self::write_document(&tx, doc)?;
        tx.commit()?;
        Ok(())
    }

    fn write_document(tx: &Connection, doc: &DocumentMetadata) -> Result<()> {
        let house_id = normalize_house_id(Some(&doc.house_id));
        tx.execute(
            "INSERT INTO documents (id, title, doc_type, house_id, relative_path, parent_id, metadata_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                doc_type = excluded.doc_type,
                house_id = excluded.house_id,
                relative_path = excluded.relative_path,
                parent_id = excluded.parent_id,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at",
            params![
                doc.id,
                doc.title,
                doc.doc_type.as_str(),
                house_id,
                doc.relative_path,
                doc.parent_id,
                doc.metadata_json,
                doc.created_at,
                doc.updated_at,
            ],
        )?;

        // Update tags
        tx.execute("DELETE FROM document_tags WHERE document_id = ?1", params![doc.id])?;

        for tag_name in &doc.tags {
            let tag_name = tag_name.trim();
            if tag_name.is_empty() {
                continue;
            }

            // Ensure tag exists
            tx.execute(
                "INSERT INTO tags (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING",
                params![uuid::Uuid::new_v4().to_string(), tag_name],
            )?;

            // Get tag id
            let tag_id: String = tx.query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![tag_name],
                |row| row.get(0),
            )?;

            tx.execute(
                "INSERT INTO document_tags (document_id, tag_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
                params![doc.id, tag_id],
            )?;
        }

        Ok(())
    }

    /// Rebuild as a single SQLite transaction; an insertion failure retains the old index.
    pub fn replace_index(&mut self, documents: &[DocumentMetadata], tags: &[String]) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM document_tags", [])?;
        tx.execute("DELETE FROM documents", [])?;
        for doc in documents { Self::write_document(&tx, doc)?; }
        for tag in tags {
            tx.execute("INSERT INTO tags (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING", params![uuid::Uuid::new_v4().to_string(), tag])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_document_metadata(&self, id: &str) -> Result<Option<DocumentMetadata>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, doc_type, house_id, relative_path, parent_id, metadata_json, created_at, updated_at
             FROM documents WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let doc_id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let doc_type_str: String = row.get(2)?;
            let house_id_raw: Option<String> = row.get(3)?;
            let relative_path: String = row.get(4)?;
            let parent_id: Option<String> = row.get(5)?;
            let metadata_json: Option<String> = row.get(6)?;
            let created_at: String = row.get(7)?;
            let updated_at: String = row.get(8)?;

            let doc_type = DocumentType::from_str(&doc_type_str).unwrap_or(DocumentType::Poetry);
            let house_id = normalize_house_id(house_id_raw.as_deref());

            // Fetch tags
            let tags = self.get_tags_for_document(&doc_id)?;

            Ok(Some(DocumentMetadata {
                id: doc_id,
                title,
                doc_type,
                house_id,
                relative_path,
                parent_id,
                metadata_json,
                created_at,
                updated_at,
                tags,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_documents(
        &self,
        doc_type_filter: Option<DocumentType>,
        house_id_filter: Option<&str>,
    ) -> Result<Vec<DocumentMetadata>> {
        let (query, mode) = match (doc_type_filter.is_some(), house_id_filter.is_some()) {
            (true, true) => (
                "SELECT id, title, doc_type, house_id, relative_path, parent_id, metadata_json, created_at, updated_at
                 FROM documents WHERE doc_type = ?1 AND house_id = ?2 ORDER BY updated_at DESC",
                3,
            ),
            (true, false) => (
                "SELECT id, title, doc_type, house_id, relative_path, parent_id, metadata_json, created_at, updated_at
                 FROM documents WHERE doc_type = ?1 ORDER BY updated_at DESC",
                2,
            ),
            (false, true) => (
                "SELECT id, title, doc_type, house_id, relative_path, parent_id, metadata_json, created_at, updated_at
                 FROM documents WHERE house_id = ?1 ORDER BY updated_at DESC",
                1,
            ),
            (false, false) => (
                "SELECT id, title, doc_type, house_id, relative_path, parent_id, metadata_json, created_at, updated_at
                 FROM documents ORDER BY updated_at DESC",
                0,
            ),
        };

        let mut stmt = self.conn.prepare(query)?;
        let mut docs = Vec::new();

        let mut rows = match mode {
            3 => {
                let filter_str = doc_type_filter.unwrap().as_str().to_string();
                let house_str = house_id_filter.unwrap().to_string();
                stmt.query(params![filter_str, house_str])?
            }
            2 => {
                let filter_str = doc_type_filter.unwrap().as_str().to_string();
                stmt.query(params![filter_str])?
            }
            1 => {
                let house_str = house_id_filter.unwrap().to_string();
                stmt.query(params![house_str])?
            }
            _ => stmt.query([])?,
        };

        while let Some(row) = rows.next()? {
            let doc_id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let doc_type_str: String = row.get(2)?;
            let house_id_raw: Option<String> = row.get(3)?;
            let relative_path: String = row.get(4)?;
            let parent_id: Option<String> = row.get(5)?;
            let metadata_json: Option<String> = row.get(6)?;
            let created_at: String = row.get(7)?;
            let updated_at: String = row.get(8)?;

            let doc_type = DocumentType::from_str(&doc_type_str).unwrap_or(DocumentType::Poetry);
            let house_id = normalize_house_id(house_id_raw.as_deref());
            let tags = self.get_tags_for_document(&doc_id)?;

            docs.push(DocumentMetadata {
                id: doc_id,
                title,
                doc_type,
                house_id,
                relative_path,
                parent_id,
                metadata_json,
                created_at,
                updated_at,
                tags,
            });
        }

        Ok(docs)
    }

    pub fn delete_document(&mut self, id: &str) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM document_tags WHERE document_id = ?1", params![id])?;
        tx.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn clear_all_documents(&mut self) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM document_tags", [])?;
        tx.execute("DELETE FROM documents", [])?;
        tx.commit()?;
        Ok(())
    }

    pub fn get_tags_for_document(&self, doc_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.name FROM tags t
             JOIN document_tags dt ON t.id = dt.tag_id
             WHERE dt.document_id = ?1 ORDER BY t.name ASC",
        )?;

        let rows = stmt.query_map(params![doc_id], |row| row.get::<_, String>(0))?;
        let mut tags = Vec::new();
        for tag in rows {
            tags.push(tag?);
        }
        Ok(tags)
    }

    pub fn list_tags(&self, house_id: Option<&str>) -> Result<Vec<String>> {
        let clean_house = house_id.map(str::trim).filter(|s| !s.is_empty());
        let mut tags = Vec::new();
        if let Some(h) = clean_house {
            let mut stmt = self.conn.prepare(
                "SELECT DISTINCT t.name FROM tags t
                 JOIN document_tags dt ON t.id = dt.tag_id
                 JOIN documents d ON dt.document_id = d.id
                 WHERE d.house_id = ?1
                 ORDER BY t.name ASC",
            )?;
            let rows = stmt.query_map(params![h], |row| row.get::<_, String>(0))?;
            for tag in rows {
                tags.push(tag?);
            }
        } else {
            return self.list_all_tags();
        }
        Ok(tags)
    }

    pub fn list_all_tags(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT name FROM tags ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut tags = Vec::new();
        for tag in rows {
            tags.push(tag?);
        }
        Ok(tags)
    }

    pub fn finish_tag_change(&self, old_name: &str, new_name: Option<&str>) -> Result<()> {
        if new_name == Some(old_name) { return Ok(()); }
        if let Some(name) = new_name {
            self.conn.execute(
                "INSERT INTO tags (id, name) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM tags WHERE name = ?3) ON CONFLICT(name) DO NOTHING",
                params![uuid::Uuid::new_v4().to_string(), name, old_name],
            )?;
        }
        self.conn.execute("DELETE FROM tags WHERE name = ?1 AND id NOT IN (SELECT tag_id FROM document_tags)", params![old_name])?;
        Ok(())
    }

    pub fn restore_tag_catalog(&self, tags: &[String]) -> Result<()> {
        for name in tags {
            self.conn.execute("INSERT INTO tags (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING", params![uuid::Uuid::new_v4().to_string(), name])?;
        }
        Ok(())
    }

    pub fn check_integrity(&self) -> Result<()> {
        let result: String = self.conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        if result != "ok" { return Err(rusqlite::Error::InvalidQuery); }
        self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
        Ok(())
    }

    pub fn get_stats(&self) -> Result<(usize, usize, usize, usize, usize)> {
        let total: usize = self.conn.query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))?;
        let poetry: usize = self.conn.query_row("SELECT COUNT(*) FROM documents WHERE doc_type = 'poetry'", [], |r| r.get(0))?;
        let philosophy: usize = self.conn.query_row("SELECT COUNT(*) FROM documents WHERE doc_type = 'philosophy'", [], |r| r.get(0))?;
        let lorebook: usize = self.conn.query_row("SELECT COUNT(*) FROM documents WHERE doc_type = 'lorebook'", [], |r| r.get(0))?;
        let manuscript: usize = self.conn.query_row("SELECT COUNT(*) FROM documents WHERE doc_type = 'manuscript'", [], |r| r.get(0))?;
        Ok((total, poetry, philosophy, lorebook, manuscript))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_crud_and_tags() {
        let mut db = Database::open_in_memory().expect("in-memory db open failed");

        let doc = DocumentMetadata {
            id: "doc-1".to_string(),
            title: "Test Poem".to_string(),
            doc_type: DocumentType::Poetry,
            house_id: crate::models::default_house_id(),
            relative_path: "Poetry/test_poem.md".to_string(),
            parent_id: None,
            metadata_json: Some(r#"{"form":"Free Verse"}"#.to_string()),
            created_at: "2026-10-18T10:00:00Z".to_string(),
            updated_at: "2026-10-18T10:00:00Z".to_string(),
            tags: vec!["verse".to_string(), "lyric".to_string()],
        };

        db.upsert_document(&doc).expect("upsert failed");

        let fetched = db.get_document_metadata("doc-1").expect("fetch failed").expect("doc not found");
        assert_eq!(fetched.title, "Test Poem");
        assert_eq!(fetched.doc_type, DocumentType::Poetry);
        assert_eq!(fetched.tags.len(), 2);
        assert!(fetched.tags.contains(&"verse".to_string()));

        let list = db.list_documents(Some(DocumentType::Poetry), None).expect("list failed");
        assert_eq!(list.len(), 1);

        let (total, poetry, _, _, _) = db.get_stats().expect("stats failed");
        assert_eq!(total, 1);
        assert_eq!(poetry, 1);

        db.delete_document("doc-1").expect("delete failed");
        let fetched_after = db.get_document_metadata("doc-1").expect("fetch failed");
        assert!(fetched_after.is_none());
    }

    #[test]
    fn test_phase1_sqlite_v1_to_v2_migration_and_idempotency() {
        let dir = tempfile::tempdir().expect("tempdir failed");
        let db_path = dir.path().join("legacy_v1.db");

        // Construct a genuine schema v1 database without house_id
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
                 CREATE TABLE collections (
                     id TEXT PRIMARY KEY,
                     name TEXT NOT NULL,
                     doc_type TEXT NOT NULL,
                     parent_id TEXT,
                     created_at TEXT NOT NULL,
                     updated_at TEXT NOT NULL
                 );
                 CREATE TABLE documents (
                     id TEXT PRIMARY KEY,
                     title TEXT NOT NULL,
                     doc_type TEXT NOT NULL,
                     relative_path TEXT NOT NULL UNIQUE,
                     parent_id TEXT,
                     metadata_json TEXT,
                     created_at TEXT NOT NULL,
                     updated_at TEXT NOT NULL
                 );
                 CREATE TABLE tags (
                     id TEXT PRIMARY KEY,
                     name TEXT NOT NULL UNIQUE
                 );
                 CREATE TABLE document_tags (
                     document_id TEXT NOT NULL,
                     tag_id TEXT NOT NULL,
                     PRIMARY KEY(document_id, tag_id)
                 );
                 CREATE TABLE document_links (
                     source_id TEXT NOT NULL,
                     target_id TEXT NOT NULL,
                     description TEXT,
                     PRIMARY KEY(source_id, target_id)
                 );
                 INSERT INTO schema_version (version) VALUES (1);
                 INSERT INTO documents (id, title, doc_type, relative_path, parent_id, metadata_json, created_at, updated_at)
                 VALUES ('v1-doc', 'Legacy V1 Doc', 'philosophy', 'Philosophy/Legacy_V1.md', NULL, '{\"chapter\":\"I\"}', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');",
            )
            .unwrap();
        }

        // First open: upgrades v1 -> v2 transactionally
        {
            let mut db = Database::open(&db_path).expect("v1 -> v2 migration failed");
            let migrated_doc = db
                .get_document_metadata("v1-doc")
                .unwrap()
                .expect("v1-doc should exist after migration");
            assert_eq!(migrated_doc.house_id, crate::models::DEFAULT_HOUSE_ID);
            assert_eq!(migrated_doc.title, "Legacy V1 Doc");
            assert_eq!(migrated_doc.doc_type, DocumentType::Philosophy);

            // Upsert a document with an explicit house_id
            let custom_doc = DocumentMetadata {
                id: "v2-doc".to_string(),
                title: "Custom House Doc".to_string(),
                doc_type: DocumentType::Lorebook,
                house_id: "house-custom-realm".to_string(),
                relative_path: "Lorebooks/Custom.md".to_string(),
                parent_id: None,
                metadata_json: None,
                created_at: "2026-10-20T00:00:00Z".to_string(),
                updated_at: "2026-10-20T00:00:00Z".to_string(),
                tags: vec!["lore".to_string()],
            };
            db.upsert_document(&custom_doc).unwrap();
        }

        // Second & third opens: verify repeated startup / migration idempotency
        for _ in 0..2 {
            let db = Database::open(&db_path).expect("repeated open failed");
            db.check_integrity().expect("integrity check failed");

            let d1 = db.get_document_metadata("v1-doc").unwrap().unwrap();
            assert_eq!(d1.house_id, crate::models::DEFAULT_HOUSE_ID);

            let d2 = db.get_document_metadata("v2-doc").unwrap().unwrap();
            assert_eq!(d2.house_id, "house-custom-realm");

            let all = db.list_documents(None, None).unwrap();
            assert_eq!(all.len(), 2);
        }
    }

    #[test]
    fn test_house_scoped_tag_listing() {
        let mut db = Database::open_in_memory().unwrap();
        let doc_a = DocumentMetadata {
            id: "doc-a".to_string(),
            title: "Doc A".to_string(),
            doc_type: DocumentType::Poetry,
            house_id: "house-a".to_string(),
            relative_path: "Poetry/DocA.md".to_string(),
            parent_id: None,
            metadata_json: None,
            created_at: "2026-10-26T00:00:00Z".to_string(),
            updated_at: "2026-10-26T00:00:00Z".to_string(),
            tags: vec!["cosmic".to_string(), "shared".to_string()],
        };
        let doc_b = DocumentMetadata {
            id: "doc-b".to_string(),
            title: "Doc B".to_string(),
            doc_type: DocumentType::Philosophy,
            house_id: "house-b".to_string(),
            relative_path: "Philosophy/DocB.md".to_string(),
            parent_id: None,
            metadata_json: None,
            created_at: "2026-10-26T00:00:00Z".to_string(),
            updated_at: "2026-10-26T00:00:00Z".to_string(),
            tags: vec!["medieval".to_string(), "shared".to_string()],
        };
        db.upsert_document(&doc_a).unwrap();
        db.upsert_document(&doc_b).unwrap();

        // Scoped to house-a
        let tags_a = db.list_tags(Some("house-a")).unwrap();
        assert_eq!(tags_a, vec!["cosmic", "shared"]);

        // Scoped to house-b
        let tags_b = db.list_tags(Some("house-b")).unwrap();
        assert_eq!(tags_b, vec!["medieval", "shared"]);

        // Unscoped (None)
        let tags_all = db.list_tags(None).unwrap();
        assert_eq!(tags_all, vec!["cosmic", "medieval", "shared"]);
    }
}
