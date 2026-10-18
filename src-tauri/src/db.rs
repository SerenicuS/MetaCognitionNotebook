use std::path::Path;
use rusqlite::{params, Connection, Result};
use crate::models::{DocumentMetadata, DocumentType};

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

        Ok(())
    }

    pub fn upsert_document(&mut self, doc: &DocumentMetadata) -> Result<()> {
        let tx = self.conn.transaction()?;

        Self::write_document(&tx, doc)?;
        tx.commit()?;
        Ok(())
    }

    fn write_document(tx: &Connection, doc: &DocumentMetadata) -> Result<()> {
        tx.execute(
            "INSERT INTO documents (id, title, doc_type, relative_path, parent_id, metadata_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                doc_type = excluded.doc_type,
                relative_path = excluded.relative_path,
                parent_id = excluded.parent_id,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at",
            params![
                doc.id,
                doc.title,
                doc.doc_type.as_str(),
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
            "SELECT id, title, doc_type, relative_path, parent_id, metadata_json, created_at, updated_at
             FROM documents WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let doc_id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let doc_type_str: String = row.get(2)?;
            let relative_path: String = row.get(3)?;
            let parent_id: Option<String> = row.get(4)?;
            let metadata_json: Option<String> = row.get(5)?;
            let created_at: String = row.get(6)?;
            let updated_at: String = row.get(7)?;

            let doc_type = DocumentType::from_str(&doc_type_str).unwrap_or(DocumentType::Poetry);

            // Fetch tags
            let tags = self.get_tags_for_document(&doc_id)?;

            Ok(Some(DocumentMetadata {
                id: doc_id,
                title,
                doc_type,
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

    pub fn list_documents(&self, doc_type_filter: Option<DocumentType>) -> Result<Vec<DocumentMetadata>> {
        let (query, has_filter) = match doc_type_filter {
            Some(_) => (
                "SELECT id, title, doc_type, relative_path, parent_id, metadata_json, created_at, updated_at
                 FROM documents WHERE doc_type = ?1 ORDER BY updated_at DESC",
                true,
            ),
            None => (
                "SELECT id, title, doc_type, relative_path, parent_id, metadata_json, created_at, updated_at
                 FROM documents ORDER BY updated_at DESC",
                false,
            ),
        };

        let mut stmt = self.conn.prepare(query)?;
        let mut docs = Vec::new();

        let mut rows = if has_filter {
            let filter_str = doc_type_filter.unwrap().as_str().to_string();
            stmt.query(params![filter_str])?
        } else {
            stmt.query([])?
        };

        while let Some(row) = rows.next()? {
            let doc_id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let doc_type_str: String = row.get(2)?;
            let relative_path: String = row.get(3)?;
            let parent_id: Option<String> = row.get(4)?;
            let metadata_json: Option<String> = row.get(5)?;
            let created_at: String = row.get(6)?;
            let updated_at: String = row.get(7)?;

            let doc_type = DocumentType::from_str(&doc_type_str).unwrap_or(DocumentType::Poetry);
            let tags = self.get_tags_for_document(&doc_id)?;

            docs.push(DocumentMetadata {
                id: doc_id,
                title,
                doc_type,
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

    pub fn get_stats(&self) -> Result<(usize, usize, usize, usize)> {
        let total: usize = self.conn.query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0))?;
        let poetry: usize = self.conn.query_row("SELECT COUNT(*) FROM documents WHERE doc_type = 'poetry'", [], |r| r.get(0))?;
        let philosophy: usize = self.conn.query_row("SELECT COUNT(*) FROM documents WHERE doc_type = 'philosophy'", [], |r| r.get(0))?;
        let lorebook: usize = self.conn.query_row("SELECT COUNT(*) FROM documents WHERE doc_type = 'lorebook'", [], |r| r.get(0))?;
        Ok((total, poetry, philosophy, lorebook))
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

        let list = db.list_documents(Some(DocumentType::Poetry)).expect("list failed");
        assert_eq!(list.len(), 1);

        let (total, poetry, _, _) = db.get_stats().expect("stats failed");
        assert_eq!(total, 1);
        assert_eq!(poetry, 1);

        db.delete_document("doc-1").expect("delete failed");
        let fetched_after = db.get_document_metadata("doc-1").expect("fetch failed");
        assert!(fetched_after.is_none());
    }
}
