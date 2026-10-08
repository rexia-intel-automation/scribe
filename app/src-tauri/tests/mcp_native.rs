//! Paired release fixture helper + real app server, temporary profile, no installed GUI or credentials.
use scribe_core::{Core, LocalServer};
use serde_json::{json, Value};
use std::{path::Path, process::Stdio, time::Duration};
use tempfile::TempDir;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
};

const TOKEN: &str = "PUBLIC_SYNTHETIC_MCP_TOKEN_32_CHARACTERS";
const KEY: &str = "PUBLIC_INDEPENDENT_MCP_KEY_32_CHARACTERS";

struct Helper {
    child: Child,
    input: ChildStdin,
    output: Lines<BufReader<ChildStdout>>,
}
impl Helper {
    fn start(config: &Path) -> Self {
        let exe = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../hook-client/target/fixture/release")
            .join(if cfg!(windows) {
                "scribe-hook.exe"
            } else {
                "scribe-hook"
            });
        assert!(
            exe.is_file(),
            "Build the release fixture hook client with the test-fixture feature before this isolated integration fixture"
        );
        let mut command = Command::new(exe);
        command
            .arg("--mcp")
            .env("SCRIBE_CONNECTION_FILE", config)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().unwrap();
        Self {
            input: child.stdin.take().unwrap(),
            output: BufReader::new(child.stdout.take().unwrap()).lines(),
            child,
        }
    }
    async fn send(&mut self, value: Value) {
        let line = format!("{value}\n");
        self.input.write_all(line.as_bytes()).await.unwrap();
        self.input.flush().await.unwrap();
    }
    async fn reply(&mut self, id: u64) -> Value {
        let line = tokio::time::timeout(Duration::from_secs(5), self.output.next_line())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let response: Value =
            serde_json::from_str(&line).expect("stdout must contain only JSON-RPC");
        assert_eq!(response["jsonrpc"], "2.0");
        assert_eq!(response["id"], id);
        response
    }
    async fn initialize(&mut self) {
        self.send(json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
            "protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"public-test","version":"1"}}})).await;
        let response = self.reply(1).await;
        assert_eq!(response["result"]["serverInfo"]["name"], "scribe");
        assert_eq!(response["result"]["protocolVersion"], "2025-11-25");
        assert!(response["result"]["capabilities"]["tools"].is_object());
        self.send(json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
            .await;
    }
    async fn finish(self) {
        let Self {
            mut child,
            input,
            mut output,
        } = self;
        drop(input);
        let status = tokio::time::timeout(Duration::from_secs(5), child.wait())
            .await
            .unwrap()
            .unwrap();
        assert!(status.success());
        while let Some(line) = output.next_line().await.unwrap() {
            let response: Value =
                serde_json::from_str(&line).expect("No non-protocol output after EOF");
            assert_eq!(response["jsonrpc"], "2.0");
            assert!(
                response.get("error").is_some() || response["result"]["isError"] == true,
                "EOF must not produce a successful answer or consent"
            );
            assert!(!line.contains(TOKEN) && !line.contains(KEY));
        }
        let mut stderr = String::new();
        child
            .stderr
            .take()
            .unwrap()
            .read_to_string(&mut stderr)
            .await
            .unwrap();
        assert!(
            stderr.is_empty(),
            "No tool contents or credentials in MCP stderr"
        );
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn helper_discovers_offline_recovers_and_keeps_pending_question_concurrent() {
    let temp = TempDir::new().unwrap();
    let config = temp.path().join("public connection.json");
    let mut helper = Helper::start(&config);
    helper.initialize().await;
    helper
        .send(json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}))
        .await;
    let listed = helper.reply(2).await;
    assert_eq!(listed["result"]["ttlMs"], 0);
    assert_eq!(listed["result"]["cacheScope"], "private");
    assert_eq!(
        listed["result"]["tools"],
        serde_json::from_str::<Value>(scribe_hook_protocol::MCP_TOOLS).unwrap()
    );
    helper.send(json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
        "name":"scribe_report","arguments":{"session_id":"public-session","text":"PUBLIC OFFLINE"}}})).await;
    let offline = helper.reply(3).await;
    assert_eq!(offline["result"]["isError"], true);
    assert!(!offline.to_string().contains(TOKEN));
    let core = Core::open(&temp.path().join("state.db"), scribe_core::now_ms()).unwrap();
    core.hook("SessionStart", &serde_json::to_vec(&json!({"hook_event_name":"SessionStart","session_id":"public-session","cwd":"/public/project"})).unwrap(), scribe_core::now_ms()).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), KEY.into())
        .await
        .unwrap();
    std::fs::write(
        &config,
        json!({"port":server.port(),"token":TOKEN,"hook_key":KEY}).to_string(),
    )
    .unwrap();
    helper.send(json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{
        "name":"scribe_ask","arguments":{"session_id":"public-session","question":"PUBLIC QUESTION","options":["A","B"]}}})).await;
    let decision = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(decision) = core
                .snapshot(scribe_core::now_ms())
                .unwrap()
                .decisions
                .first()
            {
                break decision.clone();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("Authenticated helper must reach the real app");
    helper.send(json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{
        "name":"scribe_report","arguments":{"session_id":"public-session","text":"PUBLIC CONCURRENT"}}})).await;
    assert_ne!(helper.reply(5).await["result"]["isError"], true);
    assert!(core.snapshot(scribe_core::now_ms()).unwrap().sessions[0]
        .steps
        .iter()
        .any(|step| step.summary == "PUBLIC CONCURRENT"));
    core.resolve_decision(
        &decision.id,
        serde_json::from_value(json!({"option":1})).unwrap(),
    )
    .unwrap();
    let answered = helper.reply(4).await;
    assert_ne!(answered["result"]["isError"], true);
    let answer: Value =
        serde_json::from_str(answered["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(answer["answer"], "B");
    helper.finish().await;
    server.stop().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn helper_cancel_closes_socket_and_cannot_leave_a_live_question() {
    let temp = TempDir::new().unwrap();
    let config = temp.path().join("connection.json");
    let core = Core::open(&temp.path().join("state.db"), scribe_core::now_ms()).unwrap();
    core.hook("SessionStart", &serde_json::to_vec(&json!({"hook_event_name":"SessionStart","session_id":"public-session","cwd":"/public/project"})).unwrap(), scribe_core::now_ms()).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), KEY.into())
        .await
        .unwrap();
    std::fs::write(
        &config,
        json!({"port":server.port(),"token":TOKEN,"hook_key":KEY}).to_string(),
    )
    .unwrap();
    let mut helper = Helper::start(&config);
    helper.initialize().await;
    helper.send(json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
        "name":"scribe_ask","arguments":{"session_id":"public-session","question":"PUBLIC CANCEL","options":["A","B"]}}})).await;
    tokio::time::timeout(Duration::from_secs(5), async {
        while core
            .snapshot(scribe_core::now_ms())
            .unwrap()
            .decisions
            .is_empty()
        {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    helper.send(json!({"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":2,"reason":"PUBLIC CANCEL"}})).await;
    tokio::time::timeout(Duration::from_secs(5), async {
        while core
            .snapshot(scribe_core::now_ms())
            .unwrap()
            .decisions
            .iter()
            .any(|decision| decision.status == "pending")
        {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("Cancellation must remove the live app question, not just ignore its reply");
    helper.finish().await;
    server.stop().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn helper_eof_expires_a_pending_question_without_answering_it() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), scribe_core::now_ms()).unwrap();
    core.hook("SessionStart", &serde_json::to_vec(&json!({"hook_event_name":"SessionStart","session_id":"public-session","cwd":"/public/project"})).unwrap(), scribe_core::now_ms()).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), KEY.into())
        .await
        .unwrap();
    let config = temp.path().join("connection.json");
    std::fs::write(
        &config,
        json!({"port":server.port(),"token":TOKEN,"hook_key":KEY}).to_string(),
    )
    .unwrap();
    let mut helper = Helper::start(&config);
    helper.initialize().await;
    helper.send(json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
        "name":"scribe_ask","arguments":{"session_id":"public-session","question":"PUBLIC EOF","options":["A","B"]}}})).await;
    let decision = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(decision) = core
                .snapshot(scribe_core::now_ms())
                .unwrap()
                .decisions
                .first()
            {
                break decision.clone();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    helper.finish().await;
    tokio::time::timeout(Duration::from_secs(5), async {
        while core
            .snapshot(scribe_core::now_ms())
            .unwrap()
            .decisions
            .iter()
            .any(|d| d.status == "pending")
        {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert!(core
        .resolve_decision(
            &decision.id,
            serde_json::from_value(json!({"option":0})).unwrap()
        )
        .is_err());
    server.stop().await.unwrap();
}
