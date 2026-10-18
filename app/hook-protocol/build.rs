fn main() {
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=SCRIBE_SOURCE_SHA");
    let revision = std::env::var("SCRIBE_SOURCE_SHA")
        .or_else(|_| std::env::var("GITHUB_SHA"))
        .unwrap_or_else(|_| "development".into());
    assert!(
        revision == "development"
            || revision.len() == 40 && revision.bytes().all(|c| c.is_ascii_hexdigit()),
        "Build revision must be a Git SHA or development"
    );
    println!(
        "cargo:rustc-env=SCRIBE_BUILD_REVISION={}",
        revision.to_ascii_lowercase()
    );
}
