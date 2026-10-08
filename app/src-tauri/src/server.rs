use crate::{mcp::ScribeMcp, now_ms, Core, Result, StateEvent};
use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{Path, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive},
        IntoResponse, Response, Sse,
    },
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::stream;
use hyper::server::conn::http1;
use hyper_util::{
    rt::{TokioIo, TokioTimer},
    service::TowerToHyperService,
};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use std::{
    collections::HashMap,
    convert::Infallible,
    net::{Ipv4Addr, SocketAddrV4},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use tokio::{
    net::TcpListener,
    sync::{broadcast, Semaphore},
    task::{JoinHandle, JoinSet},
};
use tokio_util::sync::CancellationToken;

const BODY_LIMIT: usize = 1024 * 1024;
const CONNECTION_LIMIT: usize = 32;
const HEADER_TIMEOUT: Duration = Duration::from_secs(2);
struct Rate {
    since: Instant,
    count: u16,
}

#[derive(Clone)]
struct HttpState {
    core: Core,
    port: u16,
    token: String,
    hook_key: String,
    challenges: Arc<Mutex<HashMap<String, (String, Instant)>>>,
    mcp_challenges: Arc<Mutex<HashMap<String, (String, Instant)>>>,
    ui_token: String,
    rate: Arc<Mutex<Rate>>,
    challenge_rate: Arc<Mutex<Rate>>,
    cancel: CancellationToken,
}

/// A loopback server embedded by the desktop app. Only Rust receives the
/// ephemeral UI credential; it is never stored in hook configuration or snapshots.
pub struct LocalServer {
    port: u16,
    ui_token: String,
    cancel: CancellationToken,
    task: Option<JoinHandle<std::io::Result<()>>>,
}

impl LocalServer {
    /// Bind exclusively to IPv4 loopback. Port zero is for isolated tests;
    /// production passes 7717 or the user's explicitly selected port.
    pub async fn start(core: Core, port: u16, token: String, hook_key: String) -> Result<Self> {
        if !(32..=128).contains(&token.len())
            || !token
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
            || !scribe_hook_protocol::valid_secret(&hook_key)
            || hook_key == token
        {
            return Err("Invalid local token".into());
        }
        let socket = socket2::Socket::new(socket2::Domain::IPV4, socket2::Type::STREAM, None)?;
        // Match Tokio's Unix listener behavior so TIME_WAIT does not prevent restart.
        // SO_REUSEPORT remains disabled; an active listener still owns the port.
        #[cfg(unix)]
        socket.set_reuse_address(true)?;
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawSocket;
            use windows_sys::Win32::Networking::WinSock::{
                setsockopt, WSAGetLastError, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
            };
            let enabled = 1_i32;
            // SAFETY: a live socket and a four-byte BOOL, as required by Winsock.
            if unsafe {
                setsockopt(
                    socket.as_raw_socket() as usize,
                    SOL_SOCKET,
                    SO_EXCLUSIVEADDRUSE,
                    &enabled as *const i32 as *const u8,
                    std::mem::size_of_val(&enabled) as i32,
                )
            } != 0
            {
                return Err(std::io::Error::from_raw_os_error(unsafe { WSAGetLastError() }).into());
            }
        }
        socket.bind(&SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into())?;
        socket.listen(128)?;
        socket.set_nonblocking(true)?;
        let listener = TcpListener::from_std(socket.into())?;
        let port = listener.local_addr()?.port();
        let ui_token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
        let cancel = CancellationToken::new();
        let state = HttpState {
            core: core.clone(),
            port,
            token,
            hook_key,
            challenges: Arc::new(Mutex::new(HashMap::new())),
            mcp_challenges: Arc::new(Mutex::new(HashMap::new())),
            ui_token: ui_token.clone(),
            rate: Arc::new(Mutex::new(Rate {
                since: Instant::now(),
                count: 0,
            })),
            challenge_rate: Arc::new(Mutex::new(Rate {
                since: Instant::now(),
                count: 0,
            })),
            cancel: cancel.child_token(),
        };
        let config = StreamableHttpServerConfig::default()
            .with_allowed_hosts([format!("127.0.0.1:{port}"), format!("localhost:{port}")])
            .enforce_origin_validation()
            .with_max_request_body_bytes(BODY_LIMIT)
            .with_legacy_session_mode(false)
            .with_json_response(true)
            .with_cancellation_token(cancel.child_token());
        let maintenance_core = core.clone();
        let service: StreamableHttpService<ScribeMcp, LocalSessionManager> =
            StreamableHttpService::new(
                move || Ok(ScribeMcp::new(core.clone())),
                Default::default(),
                config,
            );
        let router = Router::new()
            .route("/v1/health", get(health))
            .route("/v1/hooks/{event}", post(hook))
            .route("/v1/hooks/challenge/{nonce}", get(challenge))
            .route("/v1/mcp/challenge/{nonce}", get(mcp_challenge))
            .route("/v1/state", get(snapshot))
            .route("/v1/events", get(events))
            .route("/v1/decisions/{id}", post(decision))
            .nest_service("/mcp", service)
            .with_state(state.clone())
            .layer(middleware::from_fn_with_state(state, defend));
        let shutdown = cancel.clone();
        let maintenance_cancel = cancel.child_token();
        let http_finished = cancel.clone();
        let task = tokio::spawn(async move {
            let http = async {
                let result = serve_bounded(
                    listener,
                    router,
                    shutdown,
                    Arc::new(Semaphore::new(CONNECTION_LIMIT)),
                    HEADER_TIMEOUT,
                )
                .await;
                http_finished.cancel();
                result
            };
            let maintenance = async {
                let mut tick = tokio::time::interval(Duration::from_secs(60));
                loop {
                    tokio::select! {
                        _ = maintenance_cancel.cancelled() => break,
                        _ = tick.tick() => {
                            let _ = read_snapshot(maintenance_core.clone()).await;
                        }
                    }
                }
            };
            let (result, ()) = tokio::join!(http, maintenance);
            result
        });
        Ok(Self {
            port,
            ui_token,
            cancel,
            task: Some(task),
        })
    }

    /// Port actually bound; no network address other than loopback is accepted.
    pub fn port(&self) -> u16 {
        self.port
    }
    /// Kept inside the Rust/Tauri bridge, never exposed through a hook or MCP call.
    pub fn ui_token(&self) -> &str {
        &self.ui_token
    }
    /// Cancel MCP work and SSE streams before joining the HTTP listener.
    pub async fn stop(mut self) -> Result<()> {
        self.cancel.cancel();
        if let Some(mut task) = self.task.take() {
            if let Ok(result) = tokio::time::timeout(Duration::from_secs(1), &mut task).await {
                return Ok(result??);
            }
            task.abort();
            let _ = task.await;
        }
        Ok(())
    }
}

impl Drop for LocalServer {
    fn drop(&mut self) {
        self.cancel.cancel();
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}

/// Bound sockets before HTTP parsing; header deadlines do not limit SSE/MCP responses.
async fn serve_bounded(
    mut listener: TcpListener,
    router: Router,
    cancel: CancellationToken,
    slots: Arc<Semaphore>,
    header_timeout: Duration,
) -> std::io::Result<()> {
    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            Some(_) = connections.join_next(), if !connections.is_empty() => {},
            // Retain Axum's retry/backoff for transient accept errors (including
            // Windows resets and descriptor exhaustion), cancellable by select.
            accepted = axum::serve::Listener::accept(&mut listener) => {
                let (socket, _) = accepted;
                let Ok(permit) = slots.clone().try_acquire_owned() else {
                    // No HTTP response or parser allocation for excess connections.
                    drop(socket);
                    continue;
                };
                let router = router.clone();
                let shutdown = cancel.child_token();
                connections.spawn(async move {
                    let _permit = permit;
                    let mut builder = http1::Builder::new();
                    builder
                        .timer(TokioTimer::new())
                        .header_read_timeout(header_timeout)
                        .max_headers(32)
                        .max_buf_size(16 * 1024);
                    let connection = builder.serve_connection(
                        TokioIo::new(socket),
                        TowerToHyperService::new(router),
                    );
                    tokio::pin!(connection);
                    tokio::select! {
                        _ = connection.as_mut() => {},
                        _ = shutdown.cancelled() => {
                            connection.as_mut().graceful_shutdown();
                            let _ = connection.await;
                        },
                    }
                });
            }
        }
    }
    // LocalServer::stop bounds this join. Dropping JoinSet on abort cancels every
    // connection task and releases its permit, including incomplete requests.
    while connections.join_next().await.is_some() {}
    Ok(())
}

fn matches_secret(actual: Option<&str>, expected: &str) -> bool {
    actual.is_some_and(|value| bool::from(value.as_bytes().ct_eq(expected.as_bytes())))
}

fn within_rate(rate: &Mutex<Rate>, limit: u16) -> bool {
    let Ok(mut rate) = rate.lock() else {
        return false;
    };
    if rate.since.elapsed() >= Duration::from_secs(1) {
        rate.since = Instant::now();
        rate.count = 0;
    }
    if rate.count >= limit {
        return false;
    }
    rate.count += 1;
    true
}

async fn defend(State(state): State<HttpState>, request: Request, next: Next) -> Response {
    let headers = request.headers();
    let host = headers.get(header::HOST).and_then(|h| h.to_str().ok());
    if headers.get_all(header::HOST).iter().count() != 1
        || ![
            format!("127.0.0.1:{}", state.port),
            format!("localhost:{}", state.port),
        ]
        .iter()
        .any(|h| Some(h.as_str()) == host)
        || headers.contains_key(header::ORIGIN)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    if let Some(authority) = request.uri().authority() {
        if Some(authority.as_str()) != host {
            return StatusCode::FORBIDDEN.into_response();
        }
    }
    let challenge_request = request.method() == axum::http::Method::GET
        && (request.uri().path().starts_with("/v1/hooks/challenge/")
            || request.uri().path().starts_with("/v1/mcp/challenge/"));
    let mcp_endpoint = matches!(request.uri().path(), "/mcp" | "/mcp/");
    let signed_mcp = mcp_endpoint && request.method() == axum::http::Method::POST;
    if mcp_endpoint && (!signed_mcp || request.uri().query().is_some()) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let hook_request = request.method() == axum::http::Method::POST
        && request.uri().path().starts_with("/v1/hooks/")
        && !request.uri().path().starts_with("/v1/hooks/challenge/");
    let signed_hook = hook_request;
    if (challenge_request || signed_hook) && request.uri().query().is_some() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "));
    if !challenge_request
        && !signed_hook
        && !signed_mcp
        && (headers.get_all(header::AUTHORIZATION).iter().count() != 1
            || !matches_secret(authorization, &state.token))
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if (matches!(request.uri().path(), "/v1/state" | "/v1/events")
        || request.uri().path().starts_with("/v1/decisions/"))
        && (headers.get_all("x-scribe-ui").iter().count() != 1
            || !matches_secret(
                headers.get("x-scribe-ui").and_then(|h| h.to_str().ok()),
                &state.ui_token,
            ))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    // Reject unauthenticated MCP clients before collecting their request body.
    if signed_mcp {
        let nonce = headers
            .get("x-scribe-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let server_nonce = headers
            .get("x-scribe-server-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let issued = state.mcp_challenges.lock().ok().is_some_and(|c| {
            c.get(nonce).is_some_and(|(expected, at)| {
                expected == server_nonce && at.elapsed() < Duration::from_secs(2)
            })
        });
        if ["x-scribe-nonce", "x-scribe-server-nonce", "x-scribe-proof"]
            .iter()
            .any(|h| headers.get_all(*h).iter().count() != 1)
            || !scribe_hook_protocol::valid_nonce(nonce)
            || !scribe_hook_protocol::valid_nonce(server_nonce)
            || !issued
        {
            return StatusCode::UNAUTHORIZED.into_response();
        }
    }
    // Reject hook requests without a currently reserved server challenge before
    // waiting for or collecting an attacker-controlled body.
    if signed_hook {
        let nonce = headers
            .get("x-scribe-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let server_nonce = headers
            .get("x-scribe-server-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let issued = state.challenges.lock().ok().is_some_and(|c| {
            c.get(nonce).is_some_and(|(expected, at)| {
                expected == server_nonce && at.elapsed() < Duration::from_secs(2)
            })
        });
        if ["x-scribe-nonce", "x-scribe-server-nonce", "x-scribe-proof"]
            .iter()
            .any(|h| headers.get_all(*h).iter().count() != 1)
            || !scribe_hook_protocol::valid_nonce(nonce)
            || !scribe_hook_protocol::valid_nonce(server_nonce)
            || !issued
        {
            return StatusCode::UNAUTHORIZED.into_response();
        }
    }
    let (parts, body) = request.into_parts();
    let bytes =
        match tokio::time::timeout(Duration::from_millis(500), to_bytes(body, BODY_LIMIT)).await {
            Ok(Ok(bytes)) => bytes,
            Ok(Err(_)) => return StatusCode::PAYLOAD_TOO_LARGE.into_response(),
            Err(_) => return StatusCode::REQUEST_TIMEOUT.into_response(),
        };
    if signed_mcp {
        let nonce = parts
            .headers
            .get("x-scribe-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let server_nonce = parts
            .headers
            .get("x-scribe-server-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let proof = parts
            .headers
            .get("x-scribe-proof")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        if !scribe_hook_protocol::verify(
            &state.hook_key,
            &[
                b"mcp-request",
                nonce.as_bytes(),
                server_nonce.as_bytes(),
                b"/mcp",
                &bytes,
            ],
            proof,
        ) {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        let valid = state.mcp_challenges.lock().ok().is_some_and(|mut c| {
            if c.get(nonce).is_some_and(|(expected, at)| {
                expected == server_nonce && at.elapsed() < Duration::from_secs(2)
            }) {
                c.remove(nonce);
                true
            } else {
                false
            }
        });
        if !valid {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        if !within_rate(&state.rate, 50) {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        let nonce = nonce.to_owned();
        let server_nonce = server_nonce.to_owned();
        let response = next
            .run(Request::from_parts(parts, Body::from(bytes)))
            .await;
        let (mut parts, body) = response.into_parts();
        let Ok(bytes) = to_bytes(body, BODY_LIMIT).await else {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        };
        let status = parts.status.as_u16().to_string();
        let proof = scribe_hook_protocol::sign(
            &state.hook_key,
            &[
                b"mcp-response",
                nonce.as_bytes(),
                server_nonce.as_bytes(),
                status.as_bytes(),
                &bytes,
            ],
        );
        parts
            .headers
            .insert("x-scribe-proof", proof.parse().expect("base64url header"));
        return Response::from_parts(parts, Body::from(bytes));
    }
    if signed_hook {
        let nonce = parts
            .headers
            .get("x-scribe-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let server_nonce = parts
            .headers
            .get("x-scribe-server-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let proof = parts
            .headers
            .get("x-scribe-proof")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let path = parts.uri.path();
        if !scribe_hook_protocol::verify(
            &state.hook_key,
            &[
                b"hook-request",
                nonce.as_bytes(),
                server_nonce.as_bytes(),
                path.as_bytes(),
                &bytes,
            ],
            proof,
        ) {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        let valid = state.challenges.lock().ok().is_some_and(|mut c| {
            if c.get(nonce).is_some_and(|(expected, at)| {
                expected == server_nonce && at.elapsed() < Duration::from_secs(2)
            }) {
                c.remove(nonce);
                true
            } else {
                false
            }
        });
        if !valid {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        if !within_rate(&state.rate, 50) {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        let nonce = nonce.to_owned();
        let server_nonce = server_nonce.to_owned();
        let path = path.to_owned();
        let response = next
            .run(Request::from_parts(parts, Body::from(bytes)))
            .await;
        let (mut parts, body) = response.into_parts();
        let Ok(bytes) = to_bytes(body, 8192).await else {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        };
        let status = parts.status.as_u16().to_string();
        let proof = scribe_hook_protocol::sign(
            &state.hook_key,
            &[
                b"hook-response",
                nonce.as_bytes(),
                server_nonce.as_bytes(),
                path.as_bytes(),
                status.as_bytes(),
                &bytes,
            ],
        );
        parts
            .headers
            .insert("x-scribe-proof", proof.parse().expect("base64url header"));
        return Response::from_parts(parts, Body::from(bytes));
    }
    if !challenge_request && !within_rate(&state.rate, 50) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    next.run(Request::from_parts(parts, Body::from(bytes)))
        .await
}

async fn challenge(
    State(state): State<HttpState>,
    Path(nonce): Path<String>,
    headers: axum::http::HeaderMap,
) -> Response {
    if !scribe_hook_protocol::valid_nonce(&nonce) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    // Authenticate before reserving a nonce or spending the legitimate hook quota.
    // This proof discloses no secret or payload and cannot be reflected as the
    // server's proof, which uses the separate "hook-challenge" domain.
    if headers.get_all("x-scribe-proof").iter().count() != 1
        || !scribe_hook_protocol::verify(
            &state.hook_key,
            &[b"hook-challenge-request", nonce.as_bytes()],
            headers
                .get("x-scribe-proof")
                .and_then(|h| h.to_str().ok())
                .unwrap_or(""),
        )
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !within_rate(&state.challenge_rate, 256) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let Ok(mut challenges) = state.challenges.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    challenges.retain(|_, (_, at)| at.elapsed() < Duration::from_secs(2));
    if challenges.len() >= 256 || challenges.contains_key(&nonce) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let server_nonce = format!("{:032x}", rand::random::<u128>());
    challenges.insert(nonce.clone(), (server_nonce.clone(), Instant::now()));
    let proof = scribe_hook_protocol::sign(
        &state.hook_key,
        &[b"hook-challenge", nonce.as_bytes(), server_nonce.as_bytes()],
    );
    (
        [
            ("x-scribe-server-nonce", server_nonce),
            ("x-scribe-proof", proof),
        ],
        StatusCode::NO_CONTENT,
    )
        .into_response()
}

async fn mcp_challenge(
    State(state): State<HttpState>,
    Path(nonce): Path<String>,
    headers: axum::http::HeaderMap,
) -> Response {
    if !scribe_hook_protocol::valid_nonce(&nonce) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    if headers.get_all("x-scribe-proof").iter().count() != 1
        || !scribe_hook_protocol::verify(
            &state.hook_key,
            &[b"mcp-challenge-request", nonce.as_bytes()],
            headers
                .get("x-scribe-proof")
                .and_then(|h| h.to_str().ok())
                .unwrap_or(""),
        )
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !within_rate(&state.challenge_rate, 256) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let Ok(mut challenges) = state.mcp_challenges.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    challenges.retain(|_, (_, at)| at.elapsed() < Duration::from_secs(2));
    if challenges.len() >= 256 || challenges.contains_key(&nonce) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let server_nonce = format!("{:032x}", rand::random::<u128>());
    challenges.insert(nonce.clone(), (server_nonce.clone(), Instant::now()));
    let proof = scribe_hook_protocol::sign(
        &state.hook_key,
        &[b"mcp-challenge", nonce.as_bytes(), server_nonce.as_bytes()],
    );
    (
        [
            ("x-scribe-server-nonce", server_nonce),
            ("x-scribe-proof", proof),
        ],
        StatusCode::NO_CONTENT,
    )
        .into_response()
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"ok":true,"version":env!("CARGO_PKG_VERSION")}))
}

async fn hook(State(state): State<HttpState>, Path(event): Path<String>, body: Bytes) -> Response {
    let interactive = event == "PreToolUse"
        && serde_json::from_slice::<serde_json::Value>(&body)
            .ok()
            .is_some_and(|v| {
                matches!(
                    v["tool_name"].as_str(),
                    Some("AskUserQuestion" | "ExitPlanMode")
                )
            });
    if event == "PermissionRequest" || interactive {
        let core = state.core.clone();
        let wait = tokio::task::spawn_blocking(move || {
            if interactive {
                core.interactive(&body, 120)
            } else {
                core.permission(&body, core.permission_seconds())
            }
        })
        .await;
        return match wait {
            Ok(Ok(wait)) => {
                tokio::select! {
                    result = wait.receive() => {
                        if result.get("hookSpecificOutput").is_some() { Json(result).into_response() }
                        else { StatusCode::NO_CONTENT.into_response() }
                    },
                    _ = state.cancel.cancelled() => StatusCode::NO_CONTENT.into_response(),
                }
            }
            _ => StatusCode::NO_CONTENT.into_response(),
        };
    }
    match tokio::task::spawn_blocking(move || state.core.hook(&event, &body, now_ms())).await {
        Ok(Ok(())) => StatusCode::NO_CONTENT.into_response(),
        _ => StatusCode::BAD_REQUEST.into_response(),
    }
}

async fn decision(
    State(state): State<HttpState>,
    Path(id): Path<String>,
    Json(input): Json<crate::DecisionInput>,
) -> StatusCode {
    match tokio::task::spawn_blocking(move || state.core.resolve_decision(&id, input)).await {
        Ok(Ok(())) => StatusCode::NO_CONTENT,
        _ => StatusCode::CONFLICT,
    }
}

async fn snapshot(State(state): State<HttpState>) -> Response {
    match read_snapshot(state.core).await {
        Ok(snapshot) => Json(snapshot).into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

async fn events(State(state): State<HttpState>) -> Response {
    let receiver = state.core.subscribe();
    let initial = match read_snapshot(state.core.clone()).await {
        Ok(snapshot) => StateEvent::Snapshot(snapshot),
        Err(_) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let updates = stream::unfold(
        (
            state.core,
            receiver,
            Some(initial),
            tokio::time::interval(Duration::from_secs(1)),
            state.cancel,
        ),
        |(core, mut receiver, mut initial, mut tick, cancel)| async move {
            let event = if let Some(event) = initial.take() {
                event
            } else {
                tokio::select! {
                    _ = cancel.cancelled() => return None,
                    received = receiver.recv() => match received {
                        Ok(event) => event,
                        Err(broadcast::error::RecvError::Lagged(_)) => StateEvent::Snapshot(read_snapshot(core.clone()).await.ok()?),
                        Err(broadcast::error::RecvError::Closed) => return None,
                    },
                    _ = tick.tick() => StateEvent::Snapshot(read_snapshot(core.clone()).await.ok()?),
                }
            };
            let encoded = Event::default().event("state").json_data(event).ok()?;
            Some((
                Ok::<_, Infallible>(encoded),
                (core, receiver, initial, tick, cancel),
            ))
        },
    );
    Sse::new(updates)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
        .into_response()
}

async fn read_snapshot(core: Core) -> Result<crate::Snapshot> {
    tokio::task::spawn_blocking(move || core.snapshot(now_ms())).await?
}

#[cfg(test)]
mod connection_tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpStream,
    };

    async fn wait_for_slots(slots: &Semaphore, expected: usize) {
        tokio::time::timeout(Duration::from_secs(1), async {
            while slots.available_permits() != expected {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("connection permit must be acquired or released");
    }

    #[tokio::test]
    async fn one_reserved_connection_rejects_an_excess_socket_and_releases_on_close() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let slots = Arc::new(Semaphore::new(1));
        let cancel = CancellationToken::new();
        let router = Router::new().route("/health", get(|| async { StatusCode::NO_CONTENT }));
        let server = tokio::spawn(serve_bounded(
            listener,
            router,
            cancel.clone(),
            slots.clone(),
            HEADER_TIMEOUT,
        ));
        let first = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        wait_for_slots(&slots, 0).await;
        let mut excess = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        let mut byte = [0];
        let closed = tokio::time::timeout(Duration::from_secs(1), excess.read(&mut byte))
            .await
            .unwrap();
        assert!(matches!(closed, Ok(0)) || closed.is_err());
        assert_eq!(slots.available_permits(), 0);
        drop(first);
        wait_for_slots(&slots, 1).await;
        let mut accepted = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        accepted
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut response = Vec::new();
        tokio::time::timeout(Duration::from_secs(1), accepted.read_to_end(&mut response))
            .await
            .unwrap()
            .unwrap();
        assert!(response.starts_with(b"HTTP/1.1 204"));
        cancel.cancel();
        tokio::time::timeout(Duration::from_secs(1), server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(slots.available_permits(), 1);
    }

    #[tokio::test]
    async fn keepalive_survives_two_requests_and_shutdown_closes_partial_headers() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let slots = Arc::new(Semaphore::new(1));
        let cancel = CancellationToken::new();
        let router = Router::new()
            .route("/challenge", get(|| async { StatusCode::NO_CONTENT }))
            .route("/signed", post(|| async { StatusCode::NO_CONTENT }));
        let server = tokio::spawn(serve_bounded(
            listener,
            router,
            cancel.clone(),
            slots.clone(),
            HEADER_TIMEOUT,
        ));
        let mut socket = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        for (method, path) in [("GET", "/challenge"), ("POST", "/signed")] {
            socket
                .write_all(
                    format!(
                        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n"
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            let mut headers = Vec::new();
            tokio::time::timeout(Duration::from_secs(1), async {
                while !headers.ends_with(b"\r\n\r\n") {
                    headers.push(socket.read_u8().await.unwrap());
                }
            })
            .await
            .unwrap();
            assert!(headers.starts_with(b"HTTP/1.1 204"));
        }
        socket
            .write_all(b"GET /challenge HTTP/1.1\r\nHost: ")
            .await
            .unwrap();
        cancel.cancel();
        tokio::time::timeout(Duration::from_secs(1), server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let mut byte = [0];
        let closed = tokio::time::timeout(Duration::from_secs(1), socket.read(&mut byte))
            .await
            .unwrap();
        assert!(matches!(closed, Ok(0)) || closed.is_err());
        assert_eq!(slots.available_permits(), 1);
    }

    #[tokio::test]
    async fn header_deadline_does_not_end_an_active_sse_response() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let cancel = CancellationToken::new();
        let router = Router::new().route(
            "/events",
            get(|| async {
                Sse::new(stream::pending::<std::result::Result<Event, Infallible>>())
                    .keep_alive(KeepAlive::new().interval(Duration::from_millis(25)))
            }),
        );
        let server = tokio::spawn(serve_bounded(
            listener,
            router,
            cancel.clone(),
            Arc::new(Semaphore::new(1)),
            HEADER_TIMEOUT,
        ));
        let mut socket = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        socket
            .write_all(b"GET /events HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .await
            .unwrap();
        // Drain continuously past the header deadline: an SSE response is not a
        // partially received request. No limit or body deadline is raised here.
        let started = Instant::now();
        let mut bytes = [0u8; 1024];
        while started.elapsed() < HEADER_TIMEOUT + Duration::from_millis(100) {
            let count = tokio::time::timeout(Duration::from_secs(1), socket.read(&mut bytes))
                .await
                .unwrap()
                .unwrap();
            assert!(
                count > 0,
                "active SSE response was closed by a header deadline"
            );
        }
        drop(socket);
        cancel.cancel();
        tokio::time::timeout(Duration::from_secs(1), server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn reset_in_the_backlog_does_not_end_the_listener() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        // A single client resets before the first accept. Windows may report
        // WSAECONNRESET here; Unix can instead return a socket closed by its peer.
        let reset = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        socket2::SockRef::from(&reset)
            .set_linger(Some(Duration::ZERO))
            .unwrap();
        drop(reset);
        let cancel = CancellationToken::new();
        let router = Router::new().route("/health", get(|| async { StatusCode::NO_CONTENT }));
        let server = tokio::spawn(serve_bounded(
            listener,
            router,
            cancel.clone(),
            // The reset can be returned as a dead socket rather than an accept
            // error; keep one slot for it and one for the healthy request.
            Arc::new(Semaphore::new(2)),
            HEADER_TIMEOUT,
        ));
        let mut healthy = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        healthy
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut response = Vec::new();
        tokio::time::timeout(Duration::from_secs(3), healthy.read_to_end(&mut response))
            .await
            .unwrap()
            .unwrap();
        assert!(response.starts_with(b"HTTP/1.1 204"));
        cancel.cancel();
        tokio::time::timeout(Duration::from_secs(1), server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
}
