use crate::{model::Session, private_fs, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::{fs::OpenOptions, path::Path, time::Duration};

pub(crate) struct Store(Connection);
const SET_POLICY: &str = "INSERT INTO settings(key,value) VALUES(?1,?2)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value";

impl Store {
    pub(crate) fn open(path: &Path) -> Result<Self> {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .ok_or("Missing private storage directory")?;
        private_fs::directory(parent)?;
        let mut options = OpenOptions::new();
        options.create(true).truncate(false).read(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        drop(options.open(path)?);
        private_fs::file(path)?;
        let db = Connection::open(path)?;
        db.busy_timeout(Duration::from_millis(100))?;
        #[cfg(windows)]
        {
            db.pragma_update(None, "locking_mode", "NORMAL")?;
            let mode: String = db.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
            if mode != "wal" {
                return Err("Private Windows storage requires a write-ahead journal".into());
            }
            db.execute_batch("PRAGMA synchronous = FULL;")?;
        }
        db.execute_batch(
            "PRAGMA secure_delete = ON;
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, last_event_at INTEGER NOT NULL, data TEXT NOT NULL
            ); CREATE INDEX IF NOT EXISTS sessions_age ON sessions(last_event_at);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, data TEXT NOT NULL);",
        )?;
        Ok(Self(db))
    }

    pub(crate) fn load(&self, at: u64, completed_minutes: u16) -> Result<Vec<Session>> {
        let mut statement = self.0.prepare(
            "SELECT data FROM sessions
                WHERE json_extract(data, '$.endedAt') IS NULL
                   OR (?1 - json_extract(data, '$.endedAt')) < ?2
                ORDER BY (json_extract(data, '$.endedAt') IS NULL) DESC,
                         last_event_at DESC LIMIT 256",
        )?;
        let rows = statement.query_map(
            params![i64::try_from(at)?, i64::from(completed_minutes) * 60_000],
            |row| row.get::<_, String>(0),
        )?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }

    pub(crate) fn save(&self, session: &Session) -> Result<()> {
        self.0.execute(
            "INSERT INTO sessions(id, last_event_at, data) VALUES(?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET last_event_at=excluded.last_event_at, data=excluded.data",
            params![
                session.id,
                i64::try_from(session.last_event_at)?,
                serde_json::to_string(session)?
            ],
        )?;
        Ok(())
    }

    pub(crate) fn session(&self, id: &str) -> Result<Option<Session>> {
        let data: Option<String> = self
            .0
            .query_row("SELECT data FROM sessions WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .optional()?;
        data.map(|text| Ok(serde_json::from_str(&text)?))
            .transpose()
    }

    pub(crate) fn prune(&self, before: u64) -> Result<()> {
        let expired: bool = self.0.query_row(
            "SELECT EXISTS (SELECT 1 FROM decisions WHERE created_at < ?1) OR EXISTS (SELECT 1 FROM sessions WHERE last_event_at < ?1 OR EXISTS (
                SELECT 1 FROM json_each(sessions.data, '$.steps')
                WHERE json_extract(value, '$.at') < ?1
            ))",
            [i64::try_from(before)?],
            |row| row.get(0),
        )?;
        if !expired {
            return Ok(());
        }
        self.cleanup(|| {
            let transaction = self.0.unchecked_transaction()?;
            Self::prune_records(&transaction, before)?;
            transaction.commit()?;
            Ok(())
        })
    }

    fn cleanup<T>(&self, operation: impl FnOnce() -> Result<T>) -> Result<T> {
        #[cfg(windows)]
        {
            // Retain SQLite's exclusive file lock across the mode change and
            // transaction; another connection cannot switch back to WAL in between.
            self.0.pragma_update(None, "locking_mode", "EXCLUSIVE")?;
            // Finish and remove the WAL BEFORE deleting private data. A blocked
            // mode change must fail before any rows or preferences are changed.
            let mode: rusqlite::Result<String> =
                self.0
                    .query_row("PRAGMA journal_mode = TRUNCATE", [], |r| r.get(0));
            if !mode.as_ref().is_ok_and(|mode| mode == "truncate") {
                self.0.pragma_update(None, "locking_mode", "NORMAL")?;
                mode?;
                return Err("Private cleanup requires a truncating journal".into());
            }
        }
        let result = operation();
        #[cfg(windows)]
        {
            // Cleanup already committed or rolled back. Restoring the faster
            // writer is optional: never report a committed deletion as failed.
            // If this fails, FULL/secure_delete still protect the rollback writer.
            // Leave exclusive mode BEFORE entering WAL again.
            let _ = self.0.pragma_update(None, "locking_mode", "NORMAL");
            let _: rusqlite::Result<String> =
                self.0
                    .query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0));
        }
        result
    }

    fn prune_records(db: &Connection, before: u64) -> Result<()> {
        let before = i64::try_from(before)?;
        db.execute("DELETE FROM decisions WHERE created_at < ?1", [before])?;
        db.execute("DELETE FROM sessions WHERE last_event_at < ?1", [before])?;
        db.execute(
            "UPDATE sessions SET data = json_set(data, '$.steps', json((
                SELECT json_group_array(json(value)) FROM json_each(sessions.data, '$.steps')
                WHERE json_extract(value, '$.at') >= ?1
            ))) WHERE EXISTS (
                SELECT 1 FROM json_each(sessions.data, '$.steps')
                WHERE json_extract(value, '$.at') < ?1
            )",
            [before],
        )?;
        Ok(())
    }

    pub(crate) fn set_retention(&self, days: u16, before: u64) -> Result<()> {
        self.cleanup(|| {
            let transaction = self.0.unchecked_transaction()?;
            transaction.execute(SET_POLICY, params!["retention_days", days])?;
            Self::prune_records(&transaction, before)?;
            transaction.commit()?;
            Ok(())
        })
    }

    pub(crate) fn set_policies(
        &self,
        days: u16,
        minutes: u16,
        before: u64,
        at: u64,
    ) -> Result<Vec<Session>> {
        self.cleanup(|| {
            let transaction = self.0.unchecked_transaction()?;
            transaction.execute(SET_POLICY, params!["retention_days", days])?;
            transaction.execute(SET_POLICY, params!["completed_minutes", minutes])?;
            Self::prune_records(&transaction, before)?;
            let sessions = self.load(at, minutes)?;
            transaction.commit()?;
            Ok(sessions)
        })
    }

    pub(crate) fn clear(&self) -> Result<()> {
        self.cleanup(|| {
            let transaction = self.0.unchecked_transaction()?;
            transaction.execute_batch("DELETE FROM sessions; DELETE FROM decisions;")?;
            transaction.commit()?;
            Ok(())
        })
    }

    pub(crate) fn save_decision(&self, decision: &crate::Decision) -> Result<()> {
        self.0.execute("INSERT INTO decisions(id,created_at,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            params![decision.id, i64::try_from(decision.created_at)?, serde_json::to_string(decision)?])?;
        Ok(())
    }

    pub(crate) fn load_decisions(&self, at: u64) -> Result<Vec<crate::Decision>> {
        let mut statement = self
            .0
            .prepare("SELECT data FROM decisions ORDER BY created_at DESC LIMIT 256")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        let mut decisions = vec![];
        for row in rows {
            let mut decision: crate::Decision = serde_json::from_str(&row?)?;
            if decision.status == "pending" {
                decision.status = "expired".into();
                decision.resolved_at = Some(at);
                self.save_decision(&decision)?;
            }
            decisions.push(decision);
        }
        Ok(decisions)
    }

    pub(crate) fn policy(&self, key: &str, default: u16) -> Result<u16> {
        Ok(self
            .0
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |row| {
                row.get(0)
            })
            .optional()?
            .unwrap_or(default))
    }

    pub(crate) fn set_policy(&self, key: &str, value: u16) -> Result<()> {
        self.0.execute(SET_POLICY, params![key, value])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_journal_mode_keeps_full_sync_and_secure_delete() {
        let directory = tempfile::TempDir::new().unwrap();
        let store = Store::open(&directory.path().join("state.db")).unwrap();
        let mode: String = store
            .0
            .pragma_query_value(None, "journal_mode", |r| r.get(0))
            .unwrap();
        assert_eq!(mode, if cfg!(windows) { "wal" } else { "delete" });
        for (name, expected) in [("synchronous", 2), ("secure_delete", 1)] {
            let actual: i32 = store
                .0
                .pragma_query_value(None, name, |r| r.get(0))
                .unwrap();
            assert_eq!(actual, expected);
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_cleanup_restores_full_sync_wal_and_reopens() {
        let directory = tempfile::TempDir::new().unwrap();
        let path = directory.path().join("state.db");
        let store = Store::open(&path).unwrap();
        for (name, expected) in [("synchronous", 2), ("secure_delete", 1)] {
            let actual: i32 = store
                .0
                .pragma_query_value(None, name, |r| r.get(0))
                .unwrap();
            assert_eq!(actual, expected);
        }
        let journal = directory.path().join("state.db-journal");
        store.set_retention(14, 0).unwrap();
        let rollback: Result<()> = store.cleanup(|| {
            let transaction = store.0.unchecked_transaction()?;
            transaction.execute(SET_POLICY, params!["retention_days", 30])?;
            Err("PUBLIC_ROLLBACK".into())
        });
        assert!(rollback.is_err());
        assert_eq!(store.policy("retention_days", 0).unwrap(), 14);
        let mode: String = store
            .0
            .pragma_query_value(None, "journal_mode", |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
        for (name, expected) in [("synchronous", 2), ("secure_delete", 1)] {
            assert_eq!(
                store
                    .0
                    .pragma_query_value(None, name, |r| r.get::<_, i32>(0))
                    .unwrap(),
                expected
            );
        }
        // WAL may remove the old rollback journal, but cannot leave its contents.
        if journal.exists() {
            assert_eq!(std::fs::metadata(&journal).unwrap().len(), 0);
        }
        drop(store);
        let copy = directory.path().join("restored.db");
        std::fs::copy(&path, &copy).unwrap();
        let reopened = Store::open(&copy).unwrap();
        assert_eq!(reopened.policy("retention_days", 0).unwrap(), 14);
    }

    #[cfg(windows)]
    #[test]
    fn cleanup_holds_exclusive_lock_until_the_transaction_is_finished() {
        let directory = tempfile::TempDir::new().unwrap();
        let path = directory.path().join("state.db");
        let store = Store::open(&path).unwrap();
        store.set_policy("retention_days", 14).unwrap();
        store
            .cleanup(|| {
                let other = Connection::open(&path)?;
                other.busy_timeout(Duration::ZERO)?;
                let switch: rusqlite::Result<String> =
                    other.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0));
                assert!(switch.is_err());
                let read: rusqlite::Result<u32> =
                    other.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get(0));
                assert!(read.is_err());
                let transaction = store.0.unchecked_transaction()?;
                transaction.execute(SET_POLICY, params!["retention_days", 30])?;
                transaction.commit()?;
                Ok(())
            })
            .unwrap();
        assert_eq!(store.policy("retention_days", 0).unwrap(), 30);
        let other = Connection::open(&path).unwrap();
        assert_eq!(
            other
                .query_row(
                    "SELECT value FROM settings WHERE key='retention_days'",
                    [],
                    |r| r.get::<_, u16>(0)
                )
                .unwrap(),
            30
        );
    }

    #[cfg(windows)]
    #[test]
    fn failed_wal_restore_returns_the_committed_result_with_safe_fallback() {
        let directory = tempfile::TempDir::new().unwrap();
        let path = directory.path().join("state.db");
        let store = Store::open(&path).unwrap();
        store.set_policy("retention_days", 14).unwrap();
        let reader = std::cell::RefCell::new(None);
        store
            .cleanup(|| {
                let transaction = store.0.unchecked_transaction()?;
                transaction.execute("DELETE FROM settings", [])?;
                transaction.commit()?;
                // Inject a reader at the legitimate post-commit NORMAL -> WAL boundary.
                store.0.pragma_update(None, "locking_mode", "NORMAL")?;
                store
                    .0
                    .query_row("SELECT COUNT(*) FROM settings", [], |r| r.get::<_, u32>(0))?;
                let other = Connection::open(&path)?;
                other.execute_batch("BEGIN")?;
                other.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get::<_, u32>(0))?;
                reader.replace(Some(other));
                Ok(())
            })
            .unwrap();
        assert_eq!(store.policy("retention_days", 7).unwrap(), 7);
        let mode: String = store
            .0
            .pragma_query_value(None, "journal_mode", |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "truncate");
        for (name, expected) in [("synchronous", 2), ("secure_delete", 1)] {
            assert_eq!(
                store
                    .0
                    .pragma_query_value(None, name, |r| r.get::<_, i32>(0))
                    .unwrap(),
                expected
            );
        }
        drop(reader.take());
        store.set_retention(30, 0).unwrap();
        assert_eq!(store.policy("retention_days", 0).unwrap(), 30);
        let mode: String = store
            .0
            .pragma_query_value(None, "journal_mode", |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
    }
    #[tokio::test]
    async fn permission_commit_crossing_deadline_cannot_deliver_allow() {
        use crate::{now_ms, Core, DecisionInput};
        use serde_json::json;
        use std::cell::RefCell;

        thread_local! {
            static BLOCKER: RefCell<Option<(Connection, tokio::time::Instant)>> = const { RefCell::new(None) };
        }
        fn release_writer_after_deadline(_: i32) -> bool {
            BLOCKER.with(|slot| {
                let Some((writer, deadline)) = slot.borrow_mut().take() else {
                    return false;
                };
                std::thread::sleep(
                    deadline.saturating_duration_since(tokio::time::Instant::now())
                        + Duration::from_millis(10),
                );
                writer.execute_batch("COMMIT").unwrap();
                true
            })
        }

        let directory = tempfile::TempDir::new().unwrap();
        let path = directory.path().join("state.db");
        let core = Core::open(&path, now_ms()).unwrap();
        let body = serde_json::to_vec(&json!({
            "hook_event_name":"PermissionRequest", "session_id":"deadline-test",
            "cwd":"/public/project", "tool_name":"Bash", "tool_use_id":"public-call",
            "tool_input":{"command":"echo public"}
        }))
        .unwrap();
        let wait = core.permission(&body, 1).unwrap();
        let (id, deadline) = {
            let data = core.data.lock().unwrap();
            data.store
                .0
                .busy_handler(Some(release_writer_after_deadline))
                .unwrap();
            let pending = data.decisions.values().next().unwrap();
            (pending.view.id.clone(), pending.deadline.unwrap())
        };
        let writer = Connection::open(&path).unwrap();
        writer.execute_batch("BEGIN IMMEDIATE").unwrap();
        BLOCKER.with(|slot| *slot.borrow_mut() = Some((writer, deadline)));
        assert!(tokio::time::Instant::now() < deadline);
        let result = core.resolve_decision(
            &id,
            serde_json::from_value::<DecisionInput>(json!({"action":"allow"})).unwrap(),
        );
        assert!(
            BLOCKER.with(|slot| slot.borrow().is_none()),
            "SQLite must actually wait for the writer"
        );
        assert!(tokio::time::Instant::now() >= deadline);
        let answer = wait.receive().await;
        assert_eq!(
            answer.get("answer"),
            Some(&serde_json::Value::Null),
            "late durable commit must return no decision: {answer}"
        );
        assert!(result.is_err());
        assert_eq!(
            core.data.lock().unwrap().decisions[&id].view.status,
            "expired"
        );
        drop(core);
        let reopened = Core::open(&path, now_ms()).unwrap();
        assert_eq!(
            reopened.data.lock().unwrap().decisions[&id].view.status,
            "expired"
        );
    }
}
