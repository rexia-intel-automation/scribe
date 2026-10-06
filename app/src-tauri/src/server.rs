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
    pub async fn start(core: Core, port: u16, token: String) -> Result<Self> {
        if !(32..=128).contains(&token.len())
            || !token
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err("Invalid local token".into());
        }
        let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).await?;
        let port = listener.local_addr()?.port();
        let ui_token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
        let cancel = CancellationToken::new();
        let state = HttpState {
            core: core.clone(),
            port,
            token,
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
            .route("/v1/state", get(snapshot))
            .route("/v1/events", get(events))
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
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "));
    if headers.get_all(header::AUTHORIZATION).iter().count() != 1
        || !matches_secret(authorization, &state.token)
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if matches!(request.uri().path(), "/v1/state" | "/v1/events")
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
    next.run(Request::from_parts(parts, Body::from(bytes)))
        .await
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"ok":true,"version":env!("CARGO_PKG_VERSION")}))
}

async fn hook(
    State(state): State<HttpState>,
    Path(event): Path<String>,
    body: Bytes,
) -> StatusCode {
    match tokio::task::spawn_blocking(move || state.core.hook(&event, &body, now_ms())).await {
        Ok(Ok(())) => StatusCode::NO_CONTENT,
        _ => StatusCode::BAD_REQUEST,
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
