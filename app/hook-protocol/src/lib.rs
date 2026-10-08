//! Domain-separated authentication for local hooks and MCP.
//! The signing key is independent of the local Bearer and never sent over HTTP.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;
mod permission_update;
pub use permission_update::valid_permission_update;
mod profile;
pub use profile::{trusted_profile_dirs, ProfileDirs};

/// Offline tool discovery; the app tests this against its generated schemas.
pub const MCP_TOOLS: &str = include_str!("../mcp-tools.json");

fn mac(key: &str, fields: &[&[u8]]) -> Hmac<Sha256> {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(key.as_bytes()).expect("HMAC accepts any key size");
    mac.update(b"scribe-hook-v1");
    for field in fields {
        mac.update(&(field.len() as u64).to_be_bytes());
        mac.update(field);
    }
    mac
}

pub fn sign(key: &str, fields: &[&[u8]]) -> String {
    URL_SAFE_NO_PAD.encode(mac(key, fields).finalize().into_bytes())
}

pub fn verify(key: &str, fields: &[&[u8]], proof: &str) -> bool {
    let Ok(bytes) = URL_SAFE_NO_PAD.decode(proof) else {
        return false;
    };
    mac(key, fields).verify_slice(&bytes).is_ok()
}

pub fn valid_secret(value: &str) -> bool {
    (32..=128).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub fn valid_nonce(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proofs_bind_domain_nonce_event_and_exact_bytes() {
        let proof = sign(
            "public synthetic key",
            &[b"response", b"nonce", b"Stop", b"allow"],
        );
        assert!(verify(
            "public synthetic key",
            &[b"response", b"nonce", b"Stop", b"allow"],
            &proof
        ));
        for fields in [
            [b"request".as_slice(), b"nonce", b"Stop", b"allow"],
            [b"response".as_slice(), b"other", b"Stop", b"allow"],
            [
                b"response".as_slice(),
                b"nonce",
                b"PermissionRequest",
                b"allow",
            ],
            [b"response".as_slice(), b"nonce", b"Stop", b"deny"],
        ] {
            assert!(!verify("public synthetic key", &fields, &proof));
        }
        assert!(!verify(
            "wrong key",
            &[b"response", b"nonce", b"Stop", b"allow"],
            &proof
        ));
        assert!(!verify("public synthetic key", &[b"response"], "invalid"));
    }
}
