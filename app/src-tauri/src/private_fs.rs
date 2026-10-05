use std::{fs, io, path::Path};

pub(crate) fn directory(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)?;
    restrict(path, true)
}

pub(crate) fn file(path: &Path) -> io::Result<()> {
    restrict(path, false)
}

#[cfg(unix)]
fn restrict(path: &Path, directory: bool) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(
        path,
        fs::Permissions::from_mode(if directory { 0o700 } else { 0o600 }),
    )
}

#[cfg(windows)]
fn restrict(path: &Path, directory: bool) -> io::Result<()> {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, LocalFree},
        Security::{
            Authorization::{
                ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            },
            GetTokenInformation, SetFileSecurityW, TokenUser, DACL_SECURITY_INFORMATION,
            PROTECTED_DACL_SECURITY_INFORMATION, TOKEN_QUERY, TOKEN_USER,
        },
        System::Threading::{GetCurrentProcess, OpenProcessToken},
    };
    // Token buffers are pointer-aligned; returned SID/descriptor allocations are
    // owned by LocalAlloc and freed on every path after a successful conversion.
    let sid = unsafe {
        let mut token = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(io::Error::last_os_error());
        }
        let result = (|| {
            let mut length = 0;
            GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut length);
            if length == 0 {
                return Err(io::Error::last_os_error());
            }
            let mut buffer = vec![0usize; (length as usize).div_ceil(size_of::<usize>())];
            if GetTokenInformation(
                token,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                length,
                &mut length,
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let user = &*buffer.as_ptr().cast::<TOKEN_USER>();
            let mut string_sid = ptr::null_mut();
            if ConvertSidToStringSidW(user.User.Sid, &mut string_sid) == 0 {
                return Err(io::Error::last_os_error());
            }
            let mut count = 0;
            while *string_sid.add(count) != 0 {
                count += 1;
            }
            let sid = String::from_utf16_lossy(std::slice::from_raw_parts(string_sid, count));
            LocalFree(string_sid.cast());
            Ok(sid)
        })();
        CloseHandle(token);
        result?
    };
    let flags = if directory { "OICI" } else { "" };
    let descriptor_text: Vec<u16> = format!("D:P(A;{flags};FA;;;{sid})")
        .encode_utf16()
        .chain([0])
        .collect();
    let filename: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    // Both strings remain alive throughout the native call. SetFileSecurity
    // copies the descriptor; no pointer escapes into the application state.
    unsafe {
        let mut descriptor = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            descriptor_text.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
        let result = if SetFileSecurityW(
            filename.as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            descriptor,
        ) == 0
        {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        };
        LocalFree(descriptor);
        result
    }
}
