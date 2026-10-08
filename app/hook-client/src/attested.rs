//! Both local transports prove the listener before sending content on one socket.
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper::{client::conn::http1, header, Request};
use hyper_util::rt::TokioIo;
use std::time::Duration;
use tokio::{net::TcpStream, task::JoinHandle};

#[derive(Clone, Copy)]
pub(super) enum Channel<'a> {
    Hook(&'a str),
    Mcp(&'a str),
}

// Dropping a cancelled or timed-out call closes the connection driver too.
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

pub(super) async fn post(
    config: &super::Connection,
    channel: Channel<'_>,
    body: Vec<u8>,
) -> Result<(u16, Vec<u8>), ()> {
    if !scribe_hook_protocol::valid_secret(&config.hook_key)
        || config.hook_key == config.token
        || body.len() as u64 > super::BODY_LIMIT
    {
        return Err(());
    }
    let (path, challenge_path, domains, preflight_budget, response_limit) = match channel {
        Channel::Hook(event) => (
            format!("/v1/hooks/{event}"),
            "/v1/hooks/challenge",
            [
                "hook-challenge-request",
                "hook-challenge",
                "hook-request",
                "hook-response",
            ],
            Duration::from_millis(250),
            8192,
        ),
        Channel::Mcp(_) => (
            "/mcp".to_owned(),
            "/v1/mcp/challenge",
            [
                "mcp-challenge-request",
                "mcp-challenge",
                "mcp-request",
                "mcp-response",
            ],
            Duration::from_millis(500),
            super::BODY_LIMIT as usize,
        ),
    };
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
            &[domains[0].as_bytes(), nonce.as_bytes()],
        );
        let challenge = Request::builder()
            .method("GET")
            .uri(format!("{challenge_path}/{nonce}"))
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
                &[
                    domains[1].as_bytes(),
                    nonce.as_bytes(),
                    server_nonce.as_bytes(),
                ],
                proof,
            )
        {
            return Err(());
        }
        let bytes = Limited::new(response.into_body(), response_limit)
            .collect()
            .await
            .map_err(|_| ())?
            .to_bytes();
        if !bytes.is_empty() {
            return Err(());
        }
        Ok((sender, task, server_nonce))
    };
    let (mut sender, _task, server_nonce) = tokio::time::timeout(preflight_budget, preflight)
        .await
        .map_err(|_| ())??;
    // This Sender owns exactly the attested socket. It cannot reconnect or retry.
    let proof = scribe_hook_protocol::sign(
        &config.hook_key,
        &[
            domains[2].as_bytes(),
            nonce.as_bytes(),
            server_nonce.as_bytes(),
            path.as_bytes(),
            &body,
        ],
    );
    let mut request = Request::builder()
        .method("POST")
        .uri(&path)
        .header(header::HOST, authority)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CONNECTION, "close")
        .header("x-scribe-nonce", &nonce)
        .header("x-scribe-server-nonce", &server_nonce)
        .header("x-scribe-proof", proof);
    if let Channel::Mcp(version) = channel {
        request = request
            .header(header::ACCEPT, "application/json, text/event-stream")
            .header("mcp-protocol-version", version);
    }
    let response = sender
        .send_request(request.body(Full::new(Bytes::from(body))).map_err(|_| ())?)
        .await
        .map_err(|_| ())?;
    let status = response.status().as_u16();
    let status_text = status.to_string();
    let proof = single_header(response.headers(), "x-scribe-proof")?.to_owned();
    let bytes = Limited::new(response.into_body(), response_limit)
        .collect()
        .await
        .map_err(|_| ())?
        .to_bytes();
    let mut fields = vec![
        domains[3].as_bytes(),
        nonce.as_bytes(),
        server_nonce.as_bytes(),
    ];
    if let Channel::Hook(_) = channel {
        fields.push(path.as_bytes());
    }
    fields.extend([status_text.as_bytes(), bytes.as_ref()]);
    if !scribe_hook_protocol::verify(&config.hook_key, &fields, &proof) {
        return Err(());
    }
    Ok((status, bytes.to_vec()))
}
