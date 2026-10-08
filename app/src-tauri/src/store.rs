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
        db.execute_batch(
            "PRAGMA secure_delete = ON;
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, last_event_at INTEGER NOT NULL, data TEXT NOT NULL
            ); CREATE INDEX IF NOT EXISTS sessions_age ON sessions(last_event_at);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value INTEGER NOT NULL);",
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
            "SELECT EXISTS (SELECT 1 FROM sessions WHERE last_event_at < ?1 OR EXISTS (
                SELECT 1 FROM json_each(sessions.data, '$.steps')
                WHERE json_extract(value, '$.at') < ?1
            ))",
            [i64::try_from(before)?],
            |row| row.get(0),
        )?;
        if !expired {
            return Ok(());
        }
        let transaction = self.0.unchecked_transaction()?;
        Self::prune_records(&transaction, before)?;
        transaction.commit()?;
        Ok(())
    }

    fn prune_records(db: &Connection, before: u64) -> Result<()> {
        let before = i64::try_from(before)?;
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
        let transaction = self.0.unchecked_transaction()?;
        transaction.execute(SET_POLICY, params!["retention_days", days])?;
        Self::prune_records(&transaction, before)?;
        transaction.commit()?;
        Ok(())
    }

    pub(crate) fn set_policies(
        &self,
        days: u16,
        minutes: u16,
        before: u64,
        at: u64,
    ) -> Result<Vec<Session>> {
        let transaction = self.0.unchecked_transaction()?;
        transaction.execute(SET_POLICY, params!["retention_days", days])?;
        transaction.execute(SET_POLICY, params!["completed_minutes", minutes])?;
        Self::prune_records(&transaction, before)?;
        let sessions = self.load(at, minutes)?;
        transaction.commit()?;
        Ok(sessions)
    }

    pub(crate) fn clear(&self) -> Result<()> {
        self.0.execute_batch("DELETE FROM sessions; VACUUM;")?;
        Ok(())
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
