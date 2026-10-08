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
use tokio::{net::TcpListener, sync::broadcast, task::JoinHandle};
use tokio_util::sync::CancellationToken;

const BODY_LIMIT: usize = 1024 * 1024;
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
    challenges: Arc<Mutex<HashMap<String, Instant>>>,
    ui_token: String,
    rate: Arc<Mutex<Rate>>,
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
            ui_token: ui_token.clone(),
            rate: Arc::new(Mutex::new(Rate {
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
                let result = axum::serve(listener, router)
                    .with_graceful_shutdown(shutdown.cancelled_owned())
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

fn matches_secret(actual: Option<&str>, expected: &str) -> bool {
    actual.is_some_and(|value| bool::from(value.as_bytes().ct_eq(expected.as_bytes())))
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
        && request.uri().path().starts_with("/v1/hooks/challenge/");
    let signed_hook = request.method() == axum::http::Method::POST
        && request.uri().path().starts_with("/v1/hooks/")
        && headers.contains_key("x-scribe-nonce");
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "));
    if !challenge_request
        && !signed_hook
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
    {
        let Ok(mut rate) = state.rate.lock() else {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        };
        if rate.since.elapsed() >= Duration::from_secs(1) {
            rate.since = Instant::now();
            rate.count = 0;
        }
        if rate.count >= 50 {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        rate.count += 1;
    }
    let (parts, body) = request.into_parts();
    let bytes =
        match tokio::time::timeout(Duration::from_millis(500), to_bytes(body, BODY_LIMIT)).await {
            Ok(Ok(bytes)) => bytes,
            Ok(Err(_)) => return StatusCode::PAYLOAD_TOO_LARGE.into_response(),
            Err(_) => return StatusCode::REQUEST_TIMEOUT.into_response(),
        };
    if signed_hook {
        let nonce = parts
            .headers
            .get("x-scribe-nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let proof = parts
            .headers
            .get("x-scribe-proof")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let event = parts.uri.path().strip_prefix("/v1/hooks/").unwrap_or("");
        if parts.headers.get_all("x-scribe-nonce").iter().count() != 1
            || parts.headers.get_all("x-scribe-proof").iter().count() != 1
            || !scribe_hook_protocol::valid_nonce(nonce)
            || !scribe_hook_protocol::verify(
                &state.hook_key,
                &[b"request", nonce.as_bytes(), event.as_bytes(), &bytes],
                proof,
            )
        {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        let valid = state
            .challenges
            .lock()
            .ok()
            .and_then(|mut c| c.remove(nonce))
            .is_some_and(|at| at.elapsed() < Duration::from_secs(2));
        if !valid {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        let nonce = nonce.to_owned();
        let event = event.to_owned();
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
                b"response",
                nonce.as_bytes(),
                event.as_bytes(),
                status.as_bytes(),
                &bytes,
            ],
        );
        parts
            .headers
            .insert("x-scribe-proof", proof.parse().expect("base64url header"));
        return Response::from_parts(parts, Body::from(bytes));
    }
    next.run(Request::from_parts(parts, Body::from(bytes)))
        .await
}

async fn challenge(State(state): State<HttpState>, Path(nonce): Path<String>) -> Response {
    if !scribe_hook_protocol::valid_nonce(&nonce) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(mut challenges) = state.challenges.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    challenges.retain(|_, at| at.elapsed() < Duration::from_secs(2));
    if challenges.len() >= 256 || challenges.contains_key(&nonce) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    challenges.insert(nonce.clone(), Instant::now());
    let proof = scribe_hook_protocol::sign(&state.hook_key, &[b"challenge", nonce.as_bytes()]);
    ([("x-scribe-proof", proof)], StatusCode::NO_CONTENT).into_response()
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"ok":true,"version":env!("CARGO_PKG_VERSION")}))
}

async fn hook(State(state): State<HttpState>, Path(event): Path<String>, body: Bytes) -> Response {
    if event == "PermissionRequest" {
        let core = state.core.clone();
        let wait =
            tokio::task::spawn_blocking(move || core.permission(&body, core.permission_seconds()))
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
