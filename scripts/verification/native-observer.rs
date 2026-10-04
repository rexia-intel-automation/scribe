//! Phase 0 transport observer only. No permission decisions and no GUI startup.
use std::env;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

fn observe() -> Result<(), Box<dyn std::error::Error>> {
    let url = env::args().nth(1).ok_or("missing URL")?;
    let local = url.strip_prefix("http://127.0.0.1:").ok_or("not loopback HTTP")?;
    let (port, path) = local.split_once('/').ok_or("missing path")?;
    let port: u16 = port.parse()?;
    let event = path.strip_prefix("v1/hooks/").ok_or("invalid route")?;
    if ![
        "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
        "PostToolUseFailure", "PermissionRequest", "Notification",
        "SubagentStart", "SubagentStop", "Stop", "SessionEnd",
    ].contains(&event) {
        return Err("invalid event".into());
    }
    let token = env::var("SCRIBE_PROBE_TOKEN")?;
    if token.len() != 43 || !token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("invalid token".into());
    }
    let mut body = Vec::new();
    io::stdin().take(1_048_577).read_to_end(&mut body)?;
    if body.len() > 1_048_576 {
        return Err("body too large".into());
    }
    let address: SocketAddr = format!("127.0.0.1:{port}").parse()?;
    let limit = Duration::from_millis(250);
    let mut stream = TcpStream::connect_timeout(&address, limit)?;
    stream.set_write_timeout(Some(limit))?;
    stream.set_read_timeout(Some(limit))?;
    let header = format!(
        "POST /{path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(&body)?;
    // Only wait for an acknowledgement. All response bodies are ignored.
    let mut first_byte = [0_u8; 1];
    stream.read_exact(&mut first_byte)?;
    Ok(())
}

fn main() {
    // A failed observer always exits zero without writing stdout or stderr.
    let _ = observe();
}
