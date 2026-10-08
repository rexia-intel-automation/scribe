//! Resolve the app's trust root from the OS account, never project environment.
use std::path::PathBuf;

#[derive(Debug, PartialEq)]
pub struct ProfileDirs {
    pub config: PathBuf,
    pub data: PathBuf,
}

pub fn trusted_profile_dirs() -> Option<ProfileDirs> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::{FOLDERID_LocalAppData, FOLDERID_RoamingAppData};
        Some(ProfileDirs {
            config: account_folder(&FOLDERID_RoamingAppData)?.join("com.rexia.scribe"),
            data: account_folder(&FOLDERID_LocalAppData)?.join("com.rexia.scribe"),
        })
    }
    #[cfg(unix)]
    {
        use nix::unistd::{Uid, User};
        let uid = Uid::current();
        if uid != Uid::effective() {
            return None;
        }
        let home = User::from_uid(uid).ok()??.dir;
        if !home.is_absolute() {
            return None;
        }
        #[cfg(target_os = "macos")]
        let (config, data) = {
            let root = home.join("Library/Application Support/com.rexia.scribe");
            (root.clone(), root)
        };
        #[cfg(not(target_os = "macos"))]
        let (config, data) = (
            home.join(".config/com.rexia.scribe"),
            home.join(".local/share/com.rexia.scribe"),
        );
        Some(ProfileDirs { config, data })
    }
}

#[cfg(windows)]
fn account_folder(folder: &windows_sys::core::GUID) -> Option<PathBuf> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::{
        Security::{TOKEN_IMPERSONATE, TOKEN_QUERY},
        System::{
            Com::CoTaskMemFree,
            Threading::{GetCurrentProcess, OpenProcessToken},
        },
        UI::Shell::SHGetKnownFolderPath,
    };
    let mut handle = std::ptr::null_mut();
    // SAFETY: valid process pseudo-handle and writable output; on success we own the token.
    if unsafe {
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_QUERY | TOKEN_IMPERSONATE,
            &mut handle,
        )
    } == 0
    {
        return None;
    }
    // SAFETY: OpenProcessToken returned a newly owned, valid handle.
    let token = unsafe { OwnedHandle::from_raw_handle(handle) };
    let mut path = std::ptr::null_mut();
    // An explicit account token prevents the shell from expanding the process's
    // untrusted USERPROFILE when resolving the account's redirected Known Folder.
    // SAFETY: valid GUID, token and output. The API allocates a NUL-terminated UTF-16 string.
    let result = unsafe { SHGetKnownFolderPath(folder, 0, token.as_raw_handle(), &mut path) };
    if result < 0 || path.is_null() {
        // SAFETY: the shell allocation, if present even on failure, belongs to the COM allocator.
        unsafe { CoTaskMemFree(path.cast()) };
        return None;
    }
    // SAFETY: successful API result guarantees a readable NUL-terminated allocation.
    let root = unsafe {
        let mut len = 0;
        while *path.add(len) != 0 {
            len += 1;
        }
        let value = PathBuf::from(OsString::from_wide(std::slice::from_raw_parts(path, len)));
        CoTaskMemFree(path.cast());
        value
    };
    root.is_absolute().then_some(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn account_paths_ignore_project_environment() {
        const CONFIG: &str = "SCRIBE_PUBLIC_EXPECTED_CONFIG_DIR";
        const DATA: &str = "SCRIBE_PUBLIC_EXPECTED_DATA_DIR";
        if let Some(expected) = std::env::var_os(CONFIG) {
            let actual = trusted_profile_dirs().unwrap();
            assert_eq!(actual.config, PathBuf::from(expected));
            assert_eq!(actual.data, PathBuf::from(std::env::var_os(DATA).unwrap()));
            return;
        }
        let expected = trusted_profile_dirs().unwrap();
        let temporary = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(temporary.path().join("AppData/Roaming")).unwrap();
        std::fs::create_dir_all(temporary.path().join("AppData/Local")).unwrap();
        for untrusted in [
            temporary.path().to_path_buf(),
            temporary.path().join("missing"),
        ] {
            let mut child = Command::new(std::env::current_exe().unwrap());
            child.args([
                "--exact",
                "profile::tests::account_paths_ignore_project_environment",
                "--nocapture",
            ]);
            child
                .env(CONFIG, &expected.config)
                .env(DATA, &expected.data);
            for name in [
                "HOME",
                "USERPROFILE",
                "APPDATA",
                "LOCALAPPDATA",
                "XDG_CONFIG_HOME",
                "XDG_DATA_HOME",
                "SCRIBE_CONNECTION_FILE",
                "SCRIBE_DATA_DIR",
            ] {
                child.env(name, &untrusted);
            }
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                child.creation_flags(0x08000000);
            }
            assert!(child.status().unwrap().success());
        }
    }
}
