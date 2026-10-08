//! Stdio stays available offline. Only tool calls cross the attested local socket.
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::{client::conn::http1, header, Request};
use hyper_util::rt::TokioIo;
use rmcp::{
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
        ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
    },
    service::RequestContext,
    ErrorData, RoleServer, ServerHandler, ServiceExt,
};
use serde_json::{json, Value};
use std::{
    io,
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, ReadBuf},
    net::TcpStream,
    task::JoinHandle,
};
use tokio_util::sync::CancellationToken;

const LIMIT: usize = super::BODY_LIMIT as usize;

#[derive(Clone)]
struct NativeMcp {
    tools: Vec<Tool>,
    closed: CancellationToken,
}

impl ServerHandler for NativeMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("scribe", env!("CARGO_PKG_VERSION")))
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.tools.iter().find(|tool| tool.name == name).cloned()
    }

    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult {
            tools: self.tools.clone(),
            ..Default::default()
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        if self.get_tool(&request.name).is_none() {
            return Err(ErrorData::invalid_params("Unknown Scribe tool", None));
        }
        let version = context
            .protocol_version()
            .map(|v| v.to_string())
            .unwrap_or_else(|| "2025-11-25".into());
        let result = tokio::select! {
            result = tokio::time::timeout(Duration::from_secs(610), forward(&context.id, request, &version)) => result.ok().and_then(Result::ok),
            _ = context.ct.cancelled() => None,
            _ = self.closed.cancelled() => None,
        };
        Ok(result.unwrap_or_else(|| CallToolResult::error(vec![ContentBlock::text(
            "Scribe is unavailable or incompatible. Open Scribe and use the app and helper from the same release. No answer or consent was supplied."
        )])).into())
    }
}

// Dropping a cancelled tool future must close its connection driver as well.
struct SocketTask(JoinHandle<Result<(), hyper::Error>>);
impl Drop for SocketTask {
    fn drop(&mut self) {
        self.0.abort();
    }
}

fn single_header<'a>(headers: &'a hyper::HeaderMap, name: &str) -> Result<&'a str, ()> {
    if headers.get_all(name).iter().count() != 1 {
        return Err(());
    }
    headers.get(name).and_then(|h| h.to_str().ok()).ok_or(())
}

async fn forward(
    id: &rmcp::model::RequestId,
    request: CallToolRequestParams,
    version: &str,
) -> Result<CallToolResult, ()> {
    let config = super::connection().ok_or(())?;
    if !scribe_hook_protocol::valid_secret(&config.hook_key) || config.hook_key == config.token {
        return Err(());
    }
    let body = serde_json::to_vec(
        &json!({"jsonrpc":"2.0", "id":id, "method":"tools/call", "params":request}),
    )
    .map_err(|_| ())?;
    if body.len() > LIMIT {
        return Err(());
    }
    let authority = format!("127.0.0.1:{}", config.port);
    let nonce = format!("{:032x}", rand::random::<u128>());
    let preflight = async {
        let socket = TcpStream::connect(("127.0.0.1", config.port))
            .await
            .map_err(|_| ())?;
        let (mut sender, connection) = http1::Builder::new()
            .max_headers(32)
            .max_buf_size(16 * 1024)
            .handshake::<_, Full<Bytes>>(TokioIo::new(socket))
            .await
            .map_err(|_| ())?;
        let task = SocketTask(tokio::spawn(connection));
        let proof = scribe_hook_protocol::sign(
            &config.hook_key,
            &[b"mcp-challenge-request", nonce.as_bytes()],
        );
        let challenge = Request::builder()
            .method("GET")
            .uri(format!("/v1/mcp/challenge/{nonce}"))
            .header(header::HOST, &authority)
            .header("x-scribe-proof", proof)
            .body(Full::new(Bytes::new()))
            .map_err(|_| ())?;
        let response = sender.send_request(challenge).await.map_err(|_| ())?;
        if response.status().as_u16() != 204 {
            return Err(());
        }
        let server_nonce = single_header(response.headers(), "x-scribe-server-nonce")?.to_owned();
        let proof = single_header(response.headers(), "x-scribe-proof")?;
        if !scribe_hook_protocol::valid_nonce(&server_nonce)
            || !scribe_hook_protocol::verify(
                &config.hook_key,
                &[b"mcp-challenge", nonce.as_bytes(), server_nonce.as_bytes()],
                proof,
            )
        {
            return Err(());
        }
        let bytes = Limited::new(response.into_body(), LIMIT)
            .collect()
            .await
            .map_err(|_| ())?
            .to_bytes();
        if !bytes.is_empty() {
            return Err(());
        }
        Ok((sender, task, server_nonce))
    };
    let (mut sender, _task, server_nonce) =
        tokio::time::timeout(Duration::from_millis(500), preflight)
            .await
            .map_err(|_| ())??;
    // Sender owns the established connection: no pool, redirects or reconnect retry.
    let proof = scribe_hook_protocol::sign(
        &config.hook_key,
        &[
            b"mcp-request",
            nonce.as_bytes(),
            server_nonce.as_bytes(),
            b"/mcp",
            &body,
        ],
    );
    let request = Request::builder()
        .method("POST")
        .uri("/mcp")
        .header(header::HOST, authority)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ACCEPT, "application/json, text/event-stream")
        .header(header::CONNECTION, "close")
        .header("mcp-protocol-version", version)
        .header("x-scribe-nonce", &nonce)
        .header("x-scribe-server-nonce", &server_nonce)
        .header("x-scribe-proof", proof)
        .body(Full::new(Bytes::from(body)))
        .map_err(|_| ())?;
    let response = sender.send_request(request).await.map_err(|_| ())?;
    let status = response.status().as_u16().to_string();
    let proof = single_header(response.headers(), "x-scribe-proof")?.to_owned();
    let bytes = Limited::new(response.into_body(), LIMIT)
        .collect()
        .await
        .map_err(|_| ())?
        .to_bytes();
    if status != "200"
        || !scribe_hook_protocol::verify(
            &config.hook_key,
            &[
                b"mcp-response",
                nonce.as_bytes(),
                server_nonce.as_bytes(),
                status.as_bytes(),
                &bytes,
            ],
            &proof,
        )
    {
        return Err(());
    }
    let reply: Value = serde_json::from_slice(&bytes).map_err(|_| ())?;
    if reply["jsonrpc"] != "2.0" || reply["id"] != serde_json::to_value(id).map_err(|_| ())? {
        return Err(());
    }
    serde_json::from_value(reply.get("result").cloned().ok_or(())?).map_err(|_| ())
}

// Bound a line before RMCP's newline codec allocates an unbounded JSON message.
struct LimitedLines<R> {
    inner: R,
    count: usize,
    closed: CancellationToken,
}
impl<R: AsyncRead + Unpin> AsyncRead for LimitedLines<R> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if buf.remaining() == 0 {
            return Poll::Ready(Ok(()));
        }
        let before = buf.filled().len();
        match Pin::new(&mut this.inner).poll_read(cx, buf) {
            Poll::Ready(Ok(())) => {
                if buf.filled().len() == before {
                    this.closed.cancel();
                }
                for byte in &buf.filled()[before..] {
                    if *byte == b'\n' {
                        this.count = 0;
                    } else {
                        this.count += 1;
                        if this.count > LIMIT {
                            // AsyncRead errors must not report newly filled bytes.
                            buf.set_filled(before);
                            this.closed.cancel();
                            return Poll::Ready(Err(io::Error::new(
                                io::ErrorKind::InvalidData,
                                "MCP input too large",
                            )));
                        }
                    }
                }
                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(error)) => {
                this.closed.cancel();
                Poll::Ready(Err(error))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

pub(super) async fn run() -> Result<(), ()> {
    let closed = CancellationToken::new();
    let service = NativeMcp {
        tools: serde_json::from_str(scribe_hook_protocol::MCP_TOOLS).map_err(|_| ())?,
        closed: closed.clone(),
    };
    let input = LimitedLines {
        inner: tokio::io::stdin(),
        count: 0,
        closed: closed.clone(),
    };
    let running = service
        .serve((input, tokio::io::stdout()))
        .await
        .map_err(|_| ())?;
    let cancellation = running.cancellation_token();
    let eof = tokio::spawn(async move {
        closed.cancelled().await;
        cancellation.cancel();
    });
    let result = running.waiting().await;
    eof.abort();
    result.map_err(|_| ())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    #[test]
    fn stdio_line_limit_applies_before_json_parsing_and_resets_per_line() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        runtime.block_on(async {
            let oversized = vec![b'x'; LIMIT + 1];
            let mut reader = LimitedLines {
                inner: oversized.as_slice(),
                count: 0,
                closed: CancellationToken::new(),
            };
            assert!(reader.read_to_end(&mut Vec::new()).await.is_err());
            let mut separate_lines = vec![b'x'; LIMIT];
            separate_lines.push(b'\n');
            separate_lines.extend(vec![b'y'; LIMIT]);
            separate_lines.push(b'\n');
            let mut reader = LimitedLines {
                inner: separate_lines.as_slice(),
                count: 0,
                closed: CancellationToken::new(),
            };
            let mut read = Vec::new();
            reader.read_to_end(&mut read).await.unwrap();
            assert_eq!(read, separate_lines);
        });
    }
}
