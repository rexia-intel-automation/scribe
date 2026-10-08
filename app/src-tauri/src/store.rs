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
        let transaction = self.0.unchecked_transaction()?;
        Self::prune_records(&transaction, before)?;
        transaction.commit()?;
        Ok(())
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
        self.0
            .execute_batch("BEGIN; DELETE FROM sessions; DELETE FROM decisions; COMMIT; VACUUM;")?;
        Ok(())
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
mod benchmarks {
    use super::*;
    use crate::{now_ms, Core, Decision, DecisionInput};
    use serde_json::json;
    use std::time::Instant;

    fn configure(store: &Store, mode: &str) {
        let actual: String = store
            .0
            .query_row(&format!("PRAGMA journal_mode = {mode}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(actual, mode.to_ascii_lowercase());
        store.0.execute_batch("PRAGMA synchronous = FULL;").unwrap();
        for (name, expected) in [("synchronous", 2), ("secure_delete", 1)] {
            let actual: i32 = store
                .0
                .pragma_query_value(None, name, |r| r.get(0))
                .unwrap();
            assert_eq!(actual, expected, "{mode}/{name}");
        }
    }

    fn summary(mode: &str, operation: &str, samples: Vec<u128>) {
        let mut ranked = samples.clone();
        ranked.sort();
        let n = samples.len();
        eprintln!(
            "SCRIBE_STORAGE_BENCH {}",
            json!({"mode":mode,"operation":operation,"samples":n,
                "p50_us":ranked[(n * 50).div_ceil(100) - 1],
                "p95_us":ranked[(n * 95).div_ceil(100) - 1],
                "max_us":ranked[n-1],"samples_us":samples})
        );
    }

    // An explicit diagnostic, never a replacement for the signed HTTP SLA gate.
    #[tokio::test]
    #[ignore = "explicit same-runner storage comparison; creates only temporary public databases"]
    async fn storage_mode_round_robin() {
        const N: usize = 128;
        const MODES: [&str; 3] = ["DELETE", "TRUNCATE", "WAL"];
        let temp = tempfile::TempDir::new().unwrap();
        let mut probes = Vec::new();
        for mode in MODES {
            let core =
                Core::open(&temp.path().join(format!("choice-{mode}.db")), now_ms()).unwrap();
            configure(&core.data.lock().unwrap().store, mode);
            let start = json!({"hook_event_name":"SessionStart","session_id":"public-session","cwd":"/public/project"});
            core.hook(
                "SessionStart",
                &serde_json::to_vec(&start).unwrap(),
                now_ms(),
            )
            .unwrap();
            let store = Store::open(&temp.path().join(format!("commit-{mode}.db"))).unwrap();
            configure(&store, mode);
            probes.push((core, store));
        }

        for action in ["allow", "deny"] {
            let mut commits: [Vec<u128>; 3] = std::array::from_fn(|_| Vec::new());
            let mut choices: [Vec<u128>; 3] = std::array::from_fn(|_| Vec::new());
            // Rotate which mode goes first to distribute runner drift and ordering effects.
            for sample in 0..N {
                for offset in 0..MODES.len() {
                    let index = (sample + offset) % MODES.len();
                    let (core, store) = &probes[index];
                    let body = json!({"hook_event_name":"PermissionRequest","session_id":"public-session",
                        "cwd":"/public/project","tool_name":"Bash","tool_use_id":format!("{action}-{sample}"),
                        "tool_input":{"command":"echo public"}});
                    let wait = core
                        .permission(&serde_json::to_vec(&body).unwrap(), 120)
                        .unwrap();
                    let view: Decision = core
                        .snapshot(now_ms())
                        .unwrap()
                        .decisions
                        .into_iter()
                        .find(|d| d.status == "pending")
                        .unwrap();
                    assert!(view.can_allow && !view.risk);
                    let mut committed = view.clone();
                    committed.status = if action == "allow" {
                        "allowed"
                    } else {
                        "denied"
                    }
                    .into();
                    committed.resolved_at = Some(now_ms());
                    let measure_commit = || {
                        let started = Instant::now();
                        store.save_decision(&committed).unwrap();
                        started.elapsed().as_micros()
                    };
                    let commit = if sample % 2 == 0 {
                        Some(measure_commit())
                    } else {
                        None
                    };
                    let input: DecisionInput =
                        serde_json::from_value(json!({"action":action})).unwrap();
                    let started = Instant::now();
                    core.resolve_decision(&view.id, input).unwrap();
                    choices[index].push(started.elapsed().as_micros());
                    let response = wait.receive().await;
                    assert_eq!(
                        response["hookSpecificOutput"]["decision"]["behavior"],
                        action
                    );
                    commits[index].push(commit.unwrap_or_else(measure_commit));
                }
            }
            for (index, mode) in MODES.iter().enumerate() {
                summary(
                    mode,
                    &format!("save_decision/{action}"),
                    std::mem::take(&mut commits[index]),
                );
                summary(
                    mode,
                    &format!("core_choice/{action}"),
                    std::mem::take(&mut choices[index]),
                );
            }
        }
        for (index, mode) in MODES.iter().enumerate() {
            let (core, store) = &probes[index];
            assert!(core
                .snapshot(now_ms())
                .unwrap()
                .decisions
                .iter()
                .all(|d| d.status != "pending"));
            let integrity: String = store
                .0
                .pragma_query_value(None, "integrity_check", |r| r.get(0))
                .unwrap();
            assert_eq!(integrity, "ok", "{mode}");
        }
    }
}
