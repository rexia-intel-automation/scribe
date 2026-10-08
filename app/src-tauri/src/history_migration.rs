//! One-time, resumable copy from the old profile history directory.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
};

const MARKER_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    path: Vec<String>,
    directory: bool,
    length: u64,
    sha256: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct Marker {
    version: u32,
    operation: String,
    manifest: Vec<Entry>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct CleanupMarker {
    version: u32,
    operation: String,
    manifest_sha256: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Checkpoint {
    BeforeMarkerPublish,
    BeforePublish,
    AfterPublish,
    BeforeTombstone,
    AfterTombstone,
    BeforeCleanup,
}

#[cfg(test)]
std::thread_local! {
    static CHECKPOINT: std::cell::Cell<Option<Checkpoint>> = const { std::cell::Cell::new(None) };
}

#[cfg(test)]
fn checkpoint(point: Checkpoint) -> io::Result<()> {
    CHECKPOINT.with(|value| {
        if value.get() == Some(point) {
            value.set(None);
            Err(io::Error::other("synthetic migration interruption"))
        } else {
            Ok(())
        }
    })
}

#[cfg(not(test))]
fn checkpoint(_: Checkpoint) -> io::Result<()> {
    Ok(())
}

pub(crate) fn migrate(source: &Path, destination: &Path) -> io::Result<()> {
    if !source.is_absolute() || !destination.is_absolute() {
        return Err(invalid("migration paths must be absolute"));
    }
    if source
        .components()
        .chain(destination.components())
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(invalid("migration paths may not contain parent traversal"));
    }
    let source_exists = path_exists(source)?;
    let destination_exists = path_exists(destination)?;
    if source_exists {
        require_directory(source)?;
    }
    if destination_exists {
        require_directory(destination)?;
    }
    if same_path(source, destination)? {
        return Ok(());
    }
    if overlaps(source, destination) {
        return Err(invalid("source and destination overlap"));
    }

    let source_parent = source
        .parent()
        .ok_or_else(|| invalid("source has no parent"))?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| invalid("destination has no parent"))?;
    let operation = operation_id(source, destination);
    let marker_path =
        destination_parent.join(format!(".scribe-history-migration-{operation}.json"));
    let stage_path = destination_parent.join(format!(".scribe-history-stage-{operation}"));
    let tombstone_path = source_parent.join(format!(".scribe-history-tombstone-{operation}"));
    let cleanup_path = source_parent.join(format!(".scribe-history-cleanup-{operation}.json"));
    let marker_exists = path_exists(&marker_path)?;

    if !marker_exists && !source_exists {
        return Ok(());
    }
    if !marker_exists && destination_exists {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "history destination already exists without a migration marker",
        ));
    }

    crate::private_fs::directory(destination_parent)?;

    if marker_exists {
        crate::private_fs::directory(source_parent)?;
        let marker = read_marker(&marker_path, &operation)?;
        if marker.version != MARKER_VERSION {
            return Err(invalid("unsupported migration marker version"));
        }
        validate_manifest(&marker.manifest)?;
        if destination_exists {
            verify_tree(destination, &marker.manifest)?;
        } else {
            if !source_exists {
                return Err(invalid(
                    "migration marker exists without source or destination",
                ));
            }
            verify_tree(source, &marker.manifest)?;
            publish_source(source, destination, &stage_path, &marker)?;
        }
        cleanup_source(source, destination, &tombstone_path, &cleanup_path, &marker)?;
        remove_marker(&marker_path)?;
        return Ok(());
    }

    // A marker can only reach this branch if it disappeared during setup.
    if !source_exists || destination_exists {
        return Err(invalid("history migration state changed during setup"));
    }
    crate::private_fs::directory(source_parent)?;
    if path_exists(&stage_path)? || path_exists(&tombstone_path)? || path_exists(&cleanup_path)? {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "unrecognized history migration artifact exists",
        ));
    }

    let manifest = scan_tree(source)?;
    let marker = Marker {
        version: MARKER_VERSION,
        operation,
        manifest,
    };
    write_new_json(&marker_path, &marker)?;
    publish_source(source, destination, &stage_path, &marker)?;
    verify_tree(destination, &marker.manifest)?;
    cleanup_source(source, destination, &tombstone_path, &cleanup_path, &marker)?;
    remove_marker(&marker_path)?;
    Ok(())
}

fn publish_source(
    source: &Path,
    destination: &Path,
    stage: &Path,
    marker: &Marker,
) -> io::Result<()> {
    if path_exists(stage)? {
        require_directory(stage)?;
        remove_tree(stage)?;
    }
    create_private_directory(stage)?;
    populate_stage(source, stage, &marker.manifest)?;
    verify_tree(source, &marker.manifest)?;
    verify_tree(stage, &marker.manifest)?;
    checkpoint(Checkpoint::BeforePublish)?;
    publish_no_replace(stage, destination)?;
    checkpoint(Checkpoint::AfterPublish)?;
    verify_tree(destination, &marker.manifest)
}

fn cleanup_source(
    source: &Path,
    destination: &Path,
    tombstone: &Path,
    cleanup_marker_path: &Path,
    marker: &Marker,
) -> io::Result<()> {
    let source_exists = path_exists(source)?;
    let tombstone_exists = path_exists(tombstone)?;
    if source_exists && tombstone_exists {
        return Err(invalid("source and migration tombstone both exist"));
    }
    if source_exists && path_exists(cleanup_marker_path)? {
        return Err(invalid("source reappeared during migration cleanup"));
    }

    if source_exists {
        verify_tree(source, &marker.manifest)?;
        checkpoint(Checkpoint::BeforeTombstone)?;
        publish_no_replace(source, tombstone)?;
        checkpoint(Checkpoint::AfterTombstone)?;
    }

    if path_exists(tombstone)? {
        verify_tree(destination, &marker.manifest)?;
        require_directory(tombstone)?;
        let cleanup = if path_exists(cleanup_marker_path)? {
            read_cleanup_marker(cleanup_marker_path, marker)?
        } else {
            verify_tree(tombstone, &marker.manifest)?;
            let cleanup = CleanupMarker {
                version: MARKER_VERSION,
                operation: marker.operation.clone(),
                manifest_sha256: manifest_hash(&marker.manifest)?,
            };
            write_new_json(cleanup_marker_path, &cleanup)?;
            cleanup
        };
        if cleanup.manifest_sha256 != manifest_hash(&marker.manifest)? {
            return Err(invalid(
                "migration cleanup marker does not match destination",
            ));
        }
        verify_remaining_tree(tombstone, &marker.manifest)?;
        checkpoint(Checkpoint::BeforeCleanup)?;
        remove_tree(tombstone)?;
    }

    if path_exists(cleanup_marker_path)? {
        let cleanup = read_cleanup_marker(cleanup_marker_path, marker)?;
        if cleanup.manifest_sha256 != manifest_hash(&marker.manifest)? {
            return Err(invalid(
                "migration cleanup marker does not match destination",
            ));
        }
        remove_marker(cleanup_marker_path)?;
    }
    Ok(())
}

fn populate_stage(source: &Path, stage: &Path, manifest: &[Entry]) -> io::Result<()> {
    for entry in manifest.iter().filter(|entry| entry.directory) {
        let destination = entry_path(stage, &entry.path)?;
        create_private_directory(&destination)?;
    }
    for entry in manifest.iter().filter(|entry| !entry.directory) {
        let source_file = entry_path(source, &entry.path)?;
        let destination_file = entry_path(stage, &entry.path)?;
        let mut input = open_regular(&source_file)?;
        let mut output = create_new_private_file(&destination_file)?;
        let mut hasher = Sha256::new();
        let mut length = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = input.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            hasher.update(&buffer[..count]);
            output.write_all(&buffer[..count])?;
            length = length
                .checked_add(count as u64)
                .ok_or_else(|| invalid("history file size overflow"))?;
        }
        output.sync_all()?;
        let copied_hash = hex(&hasher.finalize());
        if length != entry.length || Some(copied_hash) != entry.sha256 {
            return Err(invalid("history changed while it was being copied"));
        }
    }
    Ok(())
}

fn scan_tree(root: &Path) -> io::Result<Vec<Entry>> {
    require_directory(root)?;
    let mut entries = Vec::new();
    scan_directory(root, &mut Vec::new(), &mut entries)?;
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    validate_manifest(&entries)?;
    Ok(entries)
}

fn scan_directory(
    root: &Path,
    relative: &mut Vec<String>,
    entries: &mut Vec<Entry>,
) -> io::Result<()> {
    let mut children = fs::read_dir(join_components(root, relative)?)?
        .map(|result| result.map(|entry| entry.file_name()))
        .collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(|name| encode_component(name));

    for name in children {
        let encoded = encode_component(&name);
        relative.push(encoded);
        let path = join_components(root, relative)?;
        let metadata = fs::symlink_metadata(&path)?;
        require_not_link_or_reparse(&metadata)?;
        if metadata.is_dir() {
            entries.push(Entry {
                path: relative.clone(),
                directory: true,
                length: 0,
                sha256: None,
            });
            scan_directory(root, relative, entries)?;
        } else if metadata.is_file() {
            let (length, digest) = hash_file(&path)?;
            entries.push(Entry {
                path: relative.clone(),
                directory: false,
                length,
                sha256: Some(digest),
            });
        } else {
            return Err(invalid("history contains a non-regular file"));
        }
        relative.pop();
    }
    Ok(())
}

fn verify_tree(root: &Path, expected: &[Entry]) -> io::Result<()> {
    if scan_tree(root)? == expected {
        Ok(())
    } else {
        Err(invalid(
            "history tree changed or failed integrity verification",
        ))
    }
}

fn verify_remaining_tree(root: &Path, expected: &[Entry]) -> io::Result<()> {
    for entry in scan_tree(root)? {
        let index = expected.binary_search_by(|value| value.path.cmp(&entry.path));
        if index.is_err() || expected[index.unwrap()] != entry {
            return Err(invalid("history changed during migration cleanup"));
        }
    }
    Ok(())
}

fn hash_file(path: &Path) -> io::Result<(u64, String)> {
    let mut file = open_regular(path)?;
    let mut hasher = Sha256::new();
    let mut length = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        length = length
            .checked_add(count as u64)
            .ok_or_else(|| invalid("history file size overflow"))?;
    }
    Ok((length, hex(&hasher.finalize())))
}

fn open_regular(path: &Path) -> io::Result<File> {
    let before = fs::symlink_metadata(path)?;
    require_regular_file(&before)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    let file = options.open(path)?;
    require_regular_file(&file.metadata()?)?;
    require_regular_file(&fs::symlink_metadata(path)?)?;
    Ok(file)
}

fn create_private_directory(path: &Path) -> io::Result<()> {
    fs::create_dir(path)?;
    crate::private_fs::directory(path)?;
    sync_directory(path)?;
    sync_parent(path)
}

fn create_new_private_file(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path)?;
    crate::private_fs::file(path)?;
    sync_parent(path)?;
    Ok(file)
}

fn write_new_json<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    let bytes =
        serde_json::to_vec(value).map_err(|_| invalid("could not encode migration marker"))?;
    // An interrupted metadata write must not leave a partial authoritative marker.
    // The pending file contains only migration metadata; historical data stays intact.
    let pending = path.with_extension("pending");
    if path_exists(&pending)? {
        require_regular_file(&fs::symlink_metadata(&pending)?)?;
        fs::remove_file(&pending)?;
        sync_parent(&pending)?;
    }
    let mut file = create_new_private_file(&pending)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    checkpoint(Checkpoint::BeforeMarkerPublish)?;
    publish_no_replace(&pending, path)
}

fn remove_marker(path: &Path) -> io::Result<()> {
    fs::remove_file(path)?;
    sync_parent(path)
}

fn read_marker(path: &Path, operation: &str) -> io::Result<Marker> {
    let metadata = fs::symlink_metadata(path)?;
    require_regular_file(&metadata)?;
    crate::private_fs::file(path)?;
    let marker: Marker = serde_json::from_slice(&fs::read(path)?)
        .map_err(|_| invalid("history migration marker is invalid"))?;
    if marker.operation != operation || marker.version != MARKER_VERSION {
        return Err(invalid(
            "history migration marker does not match this migration",
        ));
    }
    Ok(marker)
}

fn read_cleanup_marker(path: &Path, marker: &Marker) -> io::Result<CleanupMarker> {
    let metadata = fs::symlink_metadata(path)?;
    require_regular_file(&metadata)?;
    crate::private_fs::file(path)?;
    let cleanup: CleanupMarker = serde_json::from_slice(&fs::read(path)?)
        .map_err(|_| invalid("history cleanup marker is invalid"))?;
    if cleanup.version != MARKER_VERSION || cleanup.operation != marker.operation {
        return Err(invalid(
            "history cleanup marker does not match this migration",
        ));
    }
    Ok(cleanup)
}

fn validate_manifest(entries: &[Entry]) -> io::Result<()> {
    let mut previous: Option<&Vec<String>> = None;
    for entry in entries {
        if entry.path.is_empty() || previous.is_some_and(|path| path >= &entry.path) {
            return Err(invalid("history manifest is not strictly sorted"));
        }
        for component in &entry.path {
            let decoded = decode_component(component)?;
            let mut parts = Path::new(&decoded).components();
            if !matches!(parts.next(), Some(Component::Normal(_))) || parts.next().is_some() {
                return Err(invalid("history manifest path is invalid"));
            }
        }
        if entry.directory {
            if entry.length != 0 || entry.sha256.is_some() {
                return Err(invalid("history directory manifest entry is invalid"));
            }
        } else if entry.sha256.as_deref().is_none_or(|hash| !valid_hash(hash)) {
            return Err(invalid("history file manifest entry is invalid"));
        }
        previous = Some(&entry.path);
    }
    Ok(())
}

fn manifest_hash(manifest: &[Entry]) -> io::Result<String> {
    let bytes =
        serde_json::to_vec(manifest).map_err(|_| invalid("could not encode history manifest"))?;
    Ok(hex(&Sha256::digest(bytes)))
}

fn operation_id(source: &Path, destination: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"scribe-history-migration-v1\0");
    hash_path(&mut hasher, source);
    hasher.update([0]);
    hash_path(&mut hasher, destination);
    hex(&hasher.finalize())
}

fn hash_path(hasher: &mut Sha256, path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        hasher.update(path.as_os_str().as_bytes());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        for unit in path.as_os_str().encode_wide() {
            hasher.update(unit.to_le_bytes());
        }
    }
}

fn same_path(source: &Path, destination: &Path) -> io::Result<bool> {
    if source == destination {
        return Ok(true);
    }
    match (fs::canonicalize(source), fs::canonicalize(destination)) {
        (Ok(a), Ok(b)) => Ok(a == b),
        (Err(source_error), _) if source_error.kind() != io::ErrorKind::NotFound => {
            Err(source_error)
        }
        (_, Err(destination_error)) if destination_error.kind() != io::ErrorKind::NotFound => {
            Err(destination_error)
        }
        _ => Ok(false),
    }
}

fn overlaps(source: &Path, destination: &Path) -> bool {
    source.starts_with(destination) || destination.starts_with(source)
}

fn path_exists(path: &Path) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn require_directory(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    require_not_link_or_reparse(&metadata)?;
    if metadata.is_dir() {
        Ok(())
    } else {
        Err(invalid("history path is not a directory"))
    }
}

fn require_regular_file(metadata: &fs::Metadata) -> io::Result<()> {
    require_not_link_or_reparse(metadata)?;
    if metadata.is_file() {
        Ok(())
    } else {
        Err(invalid("history entry is not a regular file"))
    }
}

fn require_not_link_or_reparse(metadata: &fs::Metadata) -> io::Result<()> {
    if metadata.file_type().is_symlink() || is_reparse_point(metadata) {
        Err(invalid("history tree contains a link or reparse point"))
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x400 != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_: &fs::Metadata) -> bool {
    false
}

fn entry_path(root: &Path, encoded: &[String]) -> io::Result<PathBuf> {
    let mut path = root.to_path_buf();
    for component in encoded {
        path.push(decode_component(component)?);
    }
    Ok(path)
}

fn join_components(root: &Path, encoded: &[String]) -> io::Result<PathBuf> {
    entry_path(root, encoded)
}

#[cfg(unix)]
fn encode_component(component: &std::ffi::OsStr) -> String {
    use std::os::unix::ffi::OsStrExt;
    format!("b:{}", hex(component.as_bytes()))
}

#[cfg(windows)]
fn encode_component(component: &std::ffi::OsStr) -> String {
    use std::os::windows::ffi::OsStrExt;
    let mut bytes = Vec::new();
    for unit in component.encode_wide() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    format!("w:{}", hex(&bytes))
}

#[cfg(not(any(unix, windows)))]
fn encode_component(_: &std::ffi::OsStr) -> String {
    unreachable!("history migration is supported only on Unix and Windows")
}

#[cfg(unix)]
fn decode_component(encoded: &str) -> io::Result<std::ffi::OsString> {
    use std::os::unix::ffi::OsStringExt;
    let bytes = encoded
        .strip_prefix("b:")
        .ok_or_else(|| invalid("history manifest platform encoding mismatch"))?;
    Ok(std::ffi::OsString::from_vec(unhex(bytes)?))
}

#[cfg(windows)]
fn decode_component(encoded: &str) -> io::Result<std::ffi::OsString> {
    use std::os::windows::ffi::OsStringExt;
    let bytes = unhex(
        encoded
            .strip_prefix("w:")
            .ok_or_else(|| invalid("history manifest platform encoding mismatch"))?,
    )?;
    if !bytes.len().is_multiple_of(2) {
        return Err(invalid("history manifest path encoding is invalid"));
    }
    let units = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect::<Vec<_>>();
    Ok(std::ffi::OsString::from_wide(&units))
}

#[cfg(not(any(unix, windows)))]
fn decode_component(_: &str) -> io::Result<std::ffi::OsString> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "unsupported platform",
    ))
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(DIGITS[(byte >> 4) as usize] as char);
        encoded.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn unhex(value: &str) -> io::Result<Vec<u8>> {
    if !value.len().is_multiple_of(2) {
        return Err(invalid("history manifest path encoding is invalid"));
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = hex_digit(pair[0])
                .ok_or_else(|| invalid("history manifest path encoding is invalid"))?;
            let low = hex_digit(pair[1])
                .ok_or_else(|| invalid("history manifest path encoding is invalid"))?;
            Ok((high << 4) | low)
        })
        .collect()
}

fn hex_digit(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| hex_digit(byte).is_some())
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn remove_tree(root: &Path) -> io::Result<()> {
    require_directory(root)?;
    remove_directory_contents(root)?;
    fs::remove_dir(root)?;
    sync_parent(root)
}

fn remove_directory_contents(directory: &Path) -> io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        let metadata = fs::symlink_metadata(&path)?;
        require_not_link_or_reparse(&metadata)?;
        if metadata.is_dir() {
            remove_directory_contents(&path)?;
            fs::remove_dir(path)?;
        } else if metadata.is_file() {
            fs::remove_file(path)?;
        } else {
            return Err(invalid("history tree contains a non-regular file"));
        }
    }
    sync_directory(directory)
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

#[cfg(windows)]
fn sync_directory(_: &Path) -> io::Result<()> {
    Ok(())
}

fn sync_parent(path: &Path) -> io::Result<()> {
    match path.parent() {
        Some(parent) => sync_directory(parent),
        None => Err(invalid("migration path has no parent")),
    }
}

#[cfg(windows)]
fn publish_no_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};
    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain([0])
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain([0])
        .collect::<Vec<_>>();
    // SAFETY: both pointers reference NUL-terminated buffers valid for this call.
    // Request WRITE_THROUGH; omitting REPLACE_EXISTING prevents clobbering.
    if unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    sync_parent(source)?;
    if source.parent() != destination.parent() {
        sync_parent(destination)?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn publish_no_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| invalid("migration path contains NUL"))?;
    let destination = CString::new(destination.as_os_str().as_bytes())
        .map_err(|_| invalid("migration path contains NUL"))?;
    // SAFETY: both C strings are NUL-terminated and valid for the duration of the call.
    // RENAME_NOREPLACE prevents replacing a destination created by another process.
    if unsafe {
        libc::renameat2(
            libc::AT_FDCWD,
            source.as_ptr(),
            libc::AT_FDCWD,
            destination.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    sync_parent(source)?;
    if source.parent() != destination.parent() {
        sync_parent(destination)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn publish_no_replace(source: &Path, destination: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(source.as_os_str().as_bytes())
        .map_err(|_| invalid("migration path contains NUL"))?;
    let destination = CString::new(destination.as_os_str().as_bytes())
        .map_err(|_| invalid("migration path contains NUL"))?;
    // SAFETY: both C strings are NUL-terminated and valid for the duration of the call.
    // RENAME_EXCL prevents replacing an existing destination.
    if unsafe { libc::renamex_np(source.as_ptr(), destination.as_ptr(), libc::RENAME_EXCL) } != 0 {
        return Err(io::Error::last_os_error());
    }
    sync_parent(source)?;
    if source.parent() != destination.parent() {
        sync_parent(destination)?;
    }
    Ok(())
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn publish_no_replace(_: &Path, _: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "atomic no-replace history publication is unsupported on this platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    #[cfg(windows)]
    use std::os::windows::fs::MetadataExt;
    use tempfile::TempDir;

    fn paths(temp: &TempDir) -> (PathBuf, PathBuf) {
        let source = temp.path().join("roaming history");
        let destination = temp.path().join("local history");
        fs::create_dir(&source).unwrap();
        (source, destination)
    }

    fn fail_once(point: Checkpoint) {
        CHECKPOINT.with(|value| value.set(Some(point)));
    }

    fn write_history(source: &Path) -> Vec<u8> {
        let db = source.join("state.db");
        let connection = Connection::open(db).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE events(value TEXT); INSERT INTO events VALUES ('public-row');",
            )
            .unwrap();
        let value: String = connection
            .query_row("SELECT value FROM events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "public-row");
        drop(connection);
        fs::write(source.join("state.db-wal"), b"").unwrap();
        fs::write(source.join("state.db-shm"), vec![0u8; 32 * 1024]).unwrap();
        fs::write(source.join("state.db-journal"), b"").unwrap();
        fs::create_dir(source.join("unknown nested")).unwrap();
        fs::write(
            source.join("unknown nested/data.bin"),
            b"public-unknown-file",
        )
        .unwrap();
        fs::read(source.join("state.db")).unwrap()
    }

    fn assert_history(destination: &Path, original_database: &[u8]) {
        assert_eq!(
            fs::read(destination.join("state.db")).unwrap(),
            original_database
        );
        assert_eq!(
            fs::read(destination.join("unknown nested/data.bin")).unwrap(),
            b"public-unknown-file"
        );
    }

    #[test]
    fn migrates_database_companions_and_unknown_files_then_cleans_source() {
        let temp = TempDir::new().unwrap();
        let (source, destination) = paths(&temp);
        let original_database = write_history(&source);
        migrate(&source, &destination).unwrap();
        assert_eq!(fs::read(destination.join("state.db-wal")).unwrap(), b"");
        assert_eq!(
            fs::read(destination.join("state.db-shm")).unwrap(),
            vec![0u8; 32 * 1024]
        );
        assert_eq!(fs::read(destination.join("state.db-journal")).unwrap(), b"");
        assert_history(&destination, &original_database);
        assert!(!source.exists());

        let reopened = Connection::open(destination.join("state.db")).unwrap();
        let value: String = reopened
            .query_row("SELECT value FROM events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "public-row");
    }

    #[test]
    fn same_path_and_absent_source_are_noops_but_unmarked_destination_is_preserved() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("missing source");
        migrate(&source, &source).unwrap();
        let destination = temp.path().join("destination");
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("keep.txt"), b"public-existing").unwrap();
        migrate(&source, &destination).unwrap();
        assert_eq!(
            fs::read(destination.join("keep.txt")).unwrap(),
            b"public-existing"
        );
    }

    #[test]
    fn existing_destination_with_source_fails_without_merging() {
        let temp = TempDir::new().unwrap();
        let (source, destination) = paths(&temp);
        write_history(&source);
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("keep.txt"), b"public-existing").unwrap();
        assert_eq!(
            migrate(&source, &destination).unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert!(source.join("state.db").exists());
        assert_eq!(
            fs::read(destination.join("keep.txt")).unwrap(),
            b"public-existing"
        );
    }

    #[test]
    fn resumes_at_each_publication_and_cleanup_checkpoint() {
        for point in [
            Checkpoint::BeforeMarkerPublish,
            Checkpoint::BeforePublish,
            Checkpoint::AfterPublish,
            Checkpoint::BeforeTombstone,
            Checkpoint::AfterTombstone,
            Checkpoint::BeforeCleanup,
        ] {
            let temp = TempDir::new().unwrap();
            let (source, destination) = paths(&temp);
            let original_database = write_history(&source);
            fail_once(point);
            assert!(
                migrate(&source, &destination).is_err(),
                "checkpoint {point:?}"
            );
            migrate(&source, &destination).unwrap();
            assert_history(&destination, &original_database);
            assert!(!source.exists());
        }
    }

    #[test]
    fn interrupted_marker_write_never_publishes_partial_metadata() {
        let temp = TempDir::new().unwrap();
        let (source, destination) = paths(&temp);
        let original = write_history(&source);
        fail_once(Checkpoint::BeforeMarkerPublish);
        assert!(migrate(&source, &destination).is_err());
        let operation = operation_id(&source, &destination);
        let marker = destination
            .parent()
            .unwrap()
            .join(format!(".scribe-history-migration-{operation}.json"));
        assert!(!marker.exists());
        fs::write(marker.with_extension("pending"), b"{").unwrap();
        migrate(&source, &destination).unwrap();
        assert_history(&destination, &original);
        assert!(!source.exists());
    }

    #[test]
    fn changed_source_or_racing_destination_fails_without_overwrite() {
        let temp = TempDir::new().unwrap();
        let (source, destination) = paths(&temp);
        write_history(&source);
        fail_once(Checkpoint::BeforePublish);
        assert!(migrate(&source, &destination).is_err());
        fs::write(source.join("changed.txt"), b"public-raced-change").unwrap();
        assert!(migrate(&source, &destination).is_err());
        assert!(!destination.exists());
        assert!(source.join("changed.txt").exists());

        let second = TempDir::new().unwrap();
        let (source, destination) = paths(&second);
        write_history(&source);
        fail_once(Checkpoint::BeforePublish);
        assert!(migrate(&source, &destination).is_err());
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("keep.txt"), b"public-race").unwrap();
        assert!(migrate(&source, &destination).is_err());
        assert_eq!(
            fs::read(destination.join("keep.txt")).unwrap(),
            b"public-race"
        );
        assert!(source.join("state.db").exists());
    }

    #[test]
    fn partial_cleanup_resumes_but_new_or_changed_content_is_preserved() {
        for change in [false, true] {
            let temp = TempDir::new().unwrap();
            let (source, destination) = paths(&temp);
            let original = write_history(&source);
            fail_once(Checkpoint::BeforeCleanup);
            assert!(migrate(&source, &destination).is_err());
            let operation = operation_id(&source, &destination);
            let tombstone = source
                .parent()
                .unwrap()
                .join(format!(".scribe-history-tombstone-{operation}"));
            fs::remove_file(tombstone.join("state.db-wal")).unwrap();
            if change {
                fs::write(tombstone.join("new.txt"), b"public-new-content").unwrap();
                assert!(migrate(&source, &destination).is_err());
                assert_eq!(
                    fs::read(tombstone.join("new.txt")).unwrap(),
                    b"public-new-content"
                );
            } else {
                migrate(&source, &destination).unwrap();
                assert!(!tombstone.exists());
            }
            assert_history(&destination, &original);
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_without_removing_source() {
        use std::os::unix::fs::symlink;
        let temp = TempDir::new().unwrap();
        let (source, destination) = paths(&temp);
        let outside = temp.path().join("outside");
        fs::write(&outside, b"public-outside").unwrap();
        symlink(&outside, source.join("link")).unwrap();
        assert!(migrate(&source, &destination).is_err());
        assert!(!destination.exists());
        assert_eq!(fs::read(&outside).unwrap(), b"public-outside");
    }

    #[cfg(windows)]
    #[test]
    fn rejects_junctions_without_removing_source_or_target() {
        use std::process::Command;

        struct JunctionCleanup(PathBuf);
        impl Drop for JunctionCleanup {
            fn drop(&mut self) {
                let _ = fs::remove_dir(&self.0);
            }
        }

        let temp = TempDir::new().unwrap();
        let (source, destination) = paths(&temp);
        fs::write(source.join("state.db"), b"public-source").unwrap();
        let target = temp.path().join("junction target");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("keep.txt"), b"public-target").unwrap();
        let junction = source.join("linked target");
        let quote = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "''"));
        let command = format!(
            "New-Item -ItemType Junction -Path {} -Target {} -ErrorAction Stop | Out-Null",
            quote(&junction),
            quote(&target)
        );
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &command])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "could not create synthetic junction: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let _cleanup = JunctionCleanup(junction.clone());
        let metadata = fs::symlink_metadata(&junction).unwrap();
        assert_ne!(
            metadata.file_attributes() & 0x400,
            0,
            "synthetic junction must be a reparse point"
        );

        assert!(migrate(&source, &destination).is_err());
        assert!(source.join("state.db").exists());
        assert!(fs::symlink_metadata(&junction).is_ok());
        assert!(!destination.exists());
        assert_eq!(fs::read(target.join("keep.txt")).unwrap(), b"public-target");

        drop(_cleanup);
        assert!(!junction.exists());
        assert_eq!(fs::read(target.join("keep.txt")).unwrap(), b"public-target");
    }
}
