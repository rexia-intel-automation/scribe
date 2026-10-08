//! Desktop bridge. Tokens and filesystem access remain in Rust; the webview
//! receives sanitized session metadata and display preferences only.
use crate::{now_ms, private_fs, server::LocalServer, Core, Session, SessionState};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    language: String,
    theme: String,
    shortcut: String,
    notifications: bool,
    #[serde(default)]
    risk_patterns: Vec<String>,
    retention_days: u16,
    completed_minutes: u16,
    #[serde(default = "default_permission_seconds")]
    permission_seconds: u16,
    port: u16,
    collapsed: bool,
    side: String,
    y: Option<f64>,
    monitor: Option<String>,
}
fn default_permission_seconds() -> u16 {
    120
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            language: if sys_locale::get_locale().is_some_and(|l| l.starts_with("pt")) {
                "pt-BR"
            } else {
                "en"
            }
            .into(),
            theme: "auto".into(),
            shortcut: if cfg!(target_os = "macos") {
                "Super+Shift+Space"
            } else {
                "Control+Shift+Space"
            }
            .into(),
            notifications: true,
            risk_patterns: vec![],
            retention_days: 14,
            completed_minutes: 10,
            permission_seconds: 120,
            port: 7717,
            collapsed: false,
            side: "right".into(),
            y: None,
            monitor: None,
        }
    }
}
impl Preferences {
    fn validate(&self) -> Result<(), String> {
        crate::risk::validate(&self.risk_patterns).map_err(|_| "invalidPreferences")?;
        if !matches!(self.language.as_str(), "en" | "pt-BR")
            || !matches!(self.theme.as_str(), "light" | "dark" | "auto")
            || !(1..=365).contains(&self.retention_days)
            || !(1..=1440).contains(&self.completed_minutes)
            || !(1..=120).contains(&self.permission_seconds)
            || self.port < 1024
            || !matches!(self.side.as_str(), "left" | "right")
            || self.y.is_some_and(|y| !y.is_finite())
            || self.shortcut.len() > 80
            || self.shortcut.parse::<Shortcut>().is_err()
        {
            return Err("invalidPreferences".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Connection {
    port: u16,
    token: String,
    #[serde(default)]
    hook_key: String,
    app_path: Option<PathBuf>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    at: u64,
    revision: u64,
    sessions: Vec<Session>,
    decisions: Vec<crate::Decision>,
    preferences: Preferences,
    error: Option<String>,
    notification_decision_id: Option<String>,
}
struct Desktop {
    core: Option<Core>,
    server: Mutex<Option<LocalServer>>,
    connection: Mutex<Connection>,
    preferences: Mutex<Preferences>,
    error: Mutex<Option<String>>,
    connection_path: PathBuf,
    prefs_path: PathBuf,
    drag_generation: AtomicU64,
    view_revision: Mutex<u64>,
    saving: tokio::sync::Mutex<()>,
}
fn write_private(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().ok_or("configUnavailable")?;
    private_fs::directory(parent).map_err(|_| "configUnavailable")?;
    let temp = parent.join(format!(".scribe-{}.tmp", rand::random::<u64>()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        private_fs::file(&temp)?;
        file.write_all(&serde_json::to_vec(value)?)?;
        file.sync_all()?;
        fs::rename(&temp, path)?;
        Ok::<_, Box<dyn std::error::Error>>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|_| "configUnavailable".into())
}
fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    if fs::metadata(path).ok()?.len() > 8192 {
        return None;
    }
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}
fn init(app: &AppHandle) -> Result<Desktop, Box<dyn std::error::Error>> {
    let config = directories::BaseDirs::new()
        .ok_or("No configuration directory")?
        .config_dir()
        .join("com.rexia.scribe");
    let connection_path = std::env::var_os("SCRIBE_CONNECTION_FILE")
        .map(PathBuf::from)
        .unwrap_or(config.join("connection.json"));
    if !connection_path.is_absolute() {
        return Err("Configuration path must be absolute".into());
    }
    let parent = connection_path
        .parent()
        .ok_or("Missing configuration parent")?;
    let prefs_path = parent.join("preferences.json");
    let mut preferences = read_json::<Preferences>(&prefs_path)
        .filter(|p| p.validate().is_ok())
        .unwrap_or_default();
    if has_open_arg(std::env::args_os().skip(1)) {
        preferences.collapsed = false;
    }
    let mut error = None;
    let connection = match read_json::<Connection>(&connection_path) {
        Some(mut c)
            if c.port >= 1024
                && (32..=128).contains(&c.token.len())
                && c.token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') =>
        {
            c.app_path = Some(std::env::current_exe()?);
            if c.hook_key.is_empty() {
                c.hook_key = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
            }
            if !scribe_hook_protocol::valid_secret(&c.hook_key) || c.hook_key == c.token {
                return Err("Invalid hook key".into());
            }
            c
        }
        _ if connection_path.exists() => {
            error = Some("configUnavailable".into());
            Connection {
                port: preferences.port,
                token: URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>()),
                hook_key: URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>()),
                app_path: Some(std::env::current_exe()?),
            }
        }
        _ => Connection {
            port: preferences.port,
            token: URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>()),
            hook_key: URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>()),
            app_path: Some(std::env::current_exe()?),
        },
    };
    preferences.port = connection.port;
    if error.is_none() && write_private(&connection_path, &connection).is_err() {
        error = Some("configUnavailable".into());
    }
    let data_path = std::env::var_os("SCRIBE_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or(app.path().app_data_dir()?.join("history"));
    if !data_path.is_absolute() {
        return Err("Data path must be absolute".into());
    }
    let core = match Core::open(&data_path.join("state.db"), now_ms()) {
        Ok(core) => Some(core),
        Err(_) => {
            error = Some("storageUnavailable".into());
            None
        }
    };
    let server = if error.is_none() {
        core.as_ref().and_then(|core| {
            match tauri::async_runtime::block_on(LocalServer::start(
                core.clone(),
                connection.port,
                connection.token.clone(),
                connection.hook_key.clone(),
            )) {
                Ok(server) => Some(server),
                Err(_) => {
                    error = Some("portBusy".into());
                    None
                }
            }
        })
    } else {
        None
    };
    if let Some(core) = &core {
        core.set_risk_patterns(&preferences.risk_patterns)
            .map_err(|_| "Invalid risk patterns")?;
        core.set_permission_seconds(u64::from(preferences.permission_seconds))
            .map_err(|_| "Invalid permission timeout")?;
        let policy = core.data.lock().map_err(|_| "State lock unavailable")?;
        preferences.retention_days = policy.retention_days;
        preferences.completed_minutes = policy.completed_minutes;
    }
    Ok(Desktop {
        core,
        server: Mutex::new(server),
        connection: Mutex::new(connection),
        preferences: Mutex::new(preferences),
        error: Mutex::new(error),
        connection_path,
        prefs_path,
        drag_generation: AtomicU64::new(0),
        view_revision: Mutex::new(0),
        saving: tokio::sync::Mutex::new(()),
    })
}

fn has_open_arg(args: impl IntoIterator<Item = std::ffi::OsString>) -> bool {
    args.into_iter().any(|arg| arg == "--open")
}
fn local_url(url: &tauri::Url) -> bool {
    url.scheme() == "tauri" && url.host_str() == Some("localhost")
        || matches!(url.scheme(), "http" | "https")
            && url.host_str() == Some("tauri.localhost")
            && url.port().is_none()
        || cfg!(debug_assertions)
            && url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
            && url.port() == Some(1420)
}
fn trusted(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| "bridgeUnavailable")?;
    if window.label() != "main" || !local_url(&url) {
        return Err("bridgeUnavailable".into());
    }
    Ok(())
}
#[tauri::command]
fn open_help(window: WebviewWindow) -> Result<(), String> {
    trusted(&window)?;
    tauri_plugin_opener::open_url(
        "https://rexia-intel-automation.github.io/scribe/troubleshooting",
        None::<&str>,
    )
    .map_err(|_| "bridgeUnavailable".into())
}
fn view(data: &Desktop) -> Result<View, String> {
    // Serialize capture and numbering so delayed IPC replies cannot replace
    // a newer snapshot, including two captures within the same millisecond.
    let mut revision = data.view_revision.lock().map_err(|_| "bridgeUnavailable")?;
    *revision += 1;
    let at = now_ms();
    let snapshot = match &data.core {
        Some(c) => c.snapshot(at).map_err(|_| "bridgeUnavailable")?,
        None => crate::Snapshot {
            sessions: vec![],
            decisions: vec![],
        },
    };
    Ok(View {
        at,
        revision: *revision,
        sessions: snapshot.sessions,
        decisions: snapshot.decisions,
        preferences: data
            .preferences
            .lock()
            .map_err(|_| "bridgeUnavailable")?
            .clone(),
        error: data.error.lock().map_err(|_| "bridgeUnavailable")?.clone(),
        notification_decision_id: None,
    })
}
#[tauri::command]
fn get_view(window: WebviewWindow, data: State<'_, Desktop>) -> Result<View, String> {
    trusted(&window)?;
    view(&data)
}
#[tauri::command]
fn resolve_decision(
    window: WebviewWindow,
    data: State<'_, Desktop>,
    id: String,
    input: crate::DecisionInput,
) -> Result<View, String> {
    trusted(&window)?;
    if !window.is_focused().map_err(|_| "bridgeUnavailable")? {
        return Err("decisionUnavailable".into());
    }
    data.core
        .as_ref()
        .ok_or("bridgeUnavailable")?
        .resolve_decision(&id, input)
        .map_err(|_| "decisionUnavailable")?;
    view(&data)
}
fn text(language: &str, key: &str) -> String {
    let source = if language == "pt-BR" {
        include_str!("../../ui/src/i18n/pt-BR.json")
    } else {
        include_str!("../../ui/src/i18n/en.json")
    };
    serde_json::from_str::<serde_json::Value>(source)
        .ok()
        .and_then(|v| v.get(key)?.as_str().map(str::to_owned))
        .unwrap_or_default()
}
fn layout(window: &WebviewWindow, p: &Preferences) -> Result<(), String> {
    let monitor = window
        .available_monitors()
        .map_err(|_| "bridgeUnavailable")?
        .into_iter()
        .find(|m| {
            p.monitor
                .as_ref()
                .is_some_and(|name| m.name() == Some(name))
        })
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or("bridgeUnavailable")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let x = f64::from(area.position.x) / scale;
    let y = f64::from(area.position.y) / scale;
    let width = f64::from(area.size.width) / scale;
    let height = f64::from(area.size.height) / scale;
    let panel_width = if p.collapsed { 56.0 } else { 372.0 };
    let panel_height = if p.collapsed {
        56.0
    } else {
        (height - 32.0).max(56.0)
    };
    let top = if p.collapsed {
        p.y.unwrap_or(y + height / 2.0)
            .clamp(y + 16.0, (y + height - panel_height - 16.0).max(y + 16.0))
    } else {
        y + 16.0
    };
    window
        .set_size(LogicalSize::new(panel_width, panel_height))
        .map_err(|_| "bridgeUnavailable")?;
    window
        .set_position(LogicalPosition::new(
            if p.side == "left" {
                x
            } else {
                x + width - panel_width
            },
            top,
        ))
        .map_err(|_| "bridgeUnavailable")?;
    Ok(())
}
fn apply_layout(
    data: &Desktop,
    window: &WebviewWindow,
    old: &Preferences,
    preferences: Preferences,
) -> Result<(), String> {
    if let Err(error) = write_private(&data.prefs_path, &preferences) {
        *data.error.lock().map_err(|_| "bridgeUnavailable")? = Some("configUnavailable".into());
        return Err(error);
    }
    if let Err(error) = layout(window, &preferences) {
        let restore_file = write_private(&data.prefs_path, old);
        let restore_window = layout(window, old);
        if restore_file.is_err() || restore_window.is_err() {
            *data.error.lock().map_err(|_| "bridgeUnavailable")? = Some("configUnavailable".into());
        }
        return Err(error);
    }
    *data.preferences.lock().map_err(|_| "bridgeUnavailable")? = preferences;
    let mut error = data.error.lock().map_err(|_| "bridgeUnavailable")?;
    if error.as_deref() == Some("configUnavailable") {
        *error = None;
    }
    Ok(())
}
fn set_panel(app: &AppHandle, collapsed: bool) -> Result<View, String> {
    set_panel_for_decision(app, collapsed, None)
}
fn set_panel_for_decision(
    app: &AppHandle,
    collapsed: bool,
    decision_id: Option<&str>,
) -> Result<View, String> {
    let data = app.state::<Desktop>();
    let _saving = data.saving.try_lock().map_err(|_| "bridgeUnavailable")?;
    let window = app.get_webview_window("main").ok_or("bridgeUnavailable")?;
    let old = data
        .preferences
        .lock()
        .map_err(|_| "bridgeUnavailable")?
        .clone();
    let mut preferences = old.clone();
    preferences.collapsed = collapsed;
    apply_layout(&data, &window, &old, preferences)?;
    window.show().map_err(|_| "bridgeUnavailable")?;
    if !collapsed {
        window.set_focus().map_err(|_| "bridgeUnavailable")?;
    }
    let mut current = view(&data)?;
    current.notification_decision_id = decision_id
        .filter(|id| {
            current
                .decisions
                .iter()
                .any(|d| d.id == *id && d.status == "pending" && d.expires_at > current.at)
        })
        .map(str::to_owned);
    let _ = app.emit_to("main", "scribe:view", &current);
    Ok(current)
}

fn notify_requests(
    app: &AppHandle,
    current: &View,
    notifications: &mut crate::notifications::Notifications,
) {
    let foreground = app.get_webview_window("main").is_some_and(|w| {
        !current.preferences.collapsed
            && w.is_visible().unwrap_or(false)
            && w.is_focused().unwrap_or(false)
    });
    for decision in notifications.new_requests(
        &current.decisions,
        current.preferences.notifications,
        foreground,
        current.at,
    ) {
        let Some(listener) = notifications.listener() else {
            notifications.defer(&decision.id);
            continue;
        };
        let app = app.clone();
        let id = decision.id.clone();
        let label = current
            .sessions
            .iter()
            .find(|s| s.id == decision.session_id)
            .and_then(|s| s.title.as_deref())
            .filter(|title| !title.is_empty())
            .unwrap_or(&decision.project);
        let body = crate::notifications::body(
            label,
            &text(&current.preferences.language, "notificationBody"),
        );
        // XDG daemons may render notification bodies as markup.
        let body = if cfg!(all(unix, not(target_os = "macos"))) {
            crate::notifications::escape_markup(&body)
        } else {
            body
        };
        let _ = std::thread::Builder::new()
            .name("scribe-notification".into())
            .spawn(move || {
                let _listener = listener;
                let mut notification = notify_rust::Notification::new();
                notification
                    .summary("Scribe")
                    .body(&body)
                    .appname("Scribe")
                    .timeout(8000);
                #[cfg(windows)]
                notification.app_id("com.rexia.scribe");
                #[cfg(all(unix, not(target_os = "macos")))]
                notification.action("default", "Scribe");
                if let Ok(handle) = notification.show() {
                    let _ =
                        handle.wait_for_response(|response: &notify_rust::NotificationResponse| {
                            if !response.is_default_action() {
                                return;
                            }
                            let handle = app.clone();
                            let _ = app.run_on_main_thread(move || {
                                let data = handle.state::<Desktop>();
                                if let Ok(current) = view(&data) {
                                    if current.preferences.notifications
                                        && current.decisions.iter().any(|d| {
                                            d.id == id
                                                && d.status == "pending"
                                                && d.expires_at > current.at
                                        })
                                    {
                                        let _ = set_panel_for_decision(&handle, false, Some(&id));
                                    }
                                }
                            });
                        });
                }
            });
    }
}
#[tauri::command]
fn move_panel(
    window: WebviewWindow,
    app: AppHandle,
    data: State<'_, Desktop>,
    direction: String,
) -> Result<View, String> {
    trusted(&window)?;
    let _saving = data.saving.try_lock().map_err(|_| "bridgeUnavailable")?;
    let old = data
        .preferences
        .lock()
        .map_err(|_| "bridgeUnavailable")?
        .clone();
    if !old.collapsed {
        return Err("invalidPreferences".into());
    }
    let mut next = old.clone();
    match direction.as_str() {
        "ArrowLeft" => next.side = "left".into(),
        "ArrowRight" => next.side = "right".into(),
        "ArrowUp" | "ArrowDown" => {
            let position = window.outer_position().map_err(|_| "bridgeUnavailable")?;
            let scale = window.scale_factor().map_err(|_| "bridgeUnavailable")?;
            next.y = Some(
                f64::from(position.y) / scale + if direction == "ArrowUp" { -16.0 } else { 16.0 },
            );
        }
        _ => return Err("invalidPreferences".into()),
    }
    apply_layout(&data, &window, &old, next)?;
    let current = view(&data)?;
    let _ = app.emit_to("main", "scribe:view", &current);
    Ok(current)
}
#[tauri::command]
fn toggle_panel(
    window: WebviewWindow,
    app: AppHandle,
    data: State<'_, Desktop>,
) -> Result<View, String> {
    trusted(&window)?;
    let collapsed = data
        .preferences
        .lock()
        .map_err(|_| "bridgeUnavailable")?
        .collapsed;
    set_panel(&app, !collapsed)
}
#[tauri::command]
fn start_drag(window: WebviewWindow) -> Result<(), String> {
    trusted(&window)?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::POINT,
            UI::{
                Input::KeyboardAndMouse::ReleaseCapture,
                WindowsAndMessaging::{GetCursorPos, PostMessageW, HTCAPTION, WM_NCLBUTTONDOWN},
            },
        };
        let mut cursor = POINT { x: 0, y: 0 };
        let handle = window.hwnd().map_err(|_| "bridgeUnavailable")?.0;
        // WM_NCLBUTTONDOWN takes packed screen coordinates, never a POINTS pointer.
        unsafe {
            if GetCursorPos(&mut cursor) == 0 {
                return Err("bridgeUnavailable".into());
            }
            ReleaseCapture();
            if PostMessageW(
                handle,
                WM_NCLBUTTONDOWN,
                HTCAPTION as usize,
                cursor_lparam(cursor.x, cursor.y),
            ) == 0
            {
                return Err("bridgeUnavailable".into());
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    window
        .start_dragging()
        .map_err(|_| "bridgeUnavailable".into())
}
#[cfg(windows)]
fn cursor_lparam(x: i32, y: i32) -> isize {
    (u32::from(x as u16) | (u32::from(y as u16) << 16)) as isize
}
#[tauri::command]
fn clear_history(window: WebviewWindow, data: State<'_, Desktop>) -> Result<View, String> {
    trusted(&window)?;
    data.core
        .as_ref()
        .ok_or("storageUnavailable")?
        .clear_history()
        .map_err(|_| "storageUnavailable")?;
    view(&data)
}
#[tauri::command]
async fn set_preferences(
    window: WebviewWindow,
    app: AppHandle,
    data: State<'_, Desktop>,
    mut preferences: Preferences,
) -> Result<View, String> {
    trusted(&window)?;
    preferences.validate()?;
    let _saving = data.saving.lock().await;
    let old = data
        .preferences
        .lock()
        .map_err(|_| "bridgeUnavailable")?
        .clone();
    preferences.collapsed = old.collapsed;
    if old.risk_patterns != preferences.risk_patterns
        && !window.is_focused().map_err(|_| "bridgeUnavailable")?
    {
        return Err("bridgeUnavailable".into());
    }
    preferences.side = old.side.clone();
    preferences.y = old.y;
    preferences.monitor = old.monitor.clone();
    let connection = data
        .connection
        .lock()
        .map_err(|_| "bridgeUnavailable")?
        .clone();
    let core = data.core.as_ref().ok_or("storageUnavailable")?;
    let next_server = if old.port != preferences.port
        || data
            .server
            .lock()
            .map_err(|_| "bridgeUnavailable")?
            .is_none()
    {
        Some(
            LocalServer::start(
                core.clone(),
                preferences.port,
                connection.token.clone(),
                connection.hook_key.clone(),
            )
            .await
            .map_err(|_| "portBusy")?,
        )
    } else {
        None
    };
    let register_shortcut = old.shortcut != preferences.shortcut
        || !app
            .global_shortcut()
            .is_registered(preferences.shortcut.as_str());
    if register_shortcut {
        app.global_shortcut()
            .register(preferences.shortcut.as_str())
            .map_err(|_| "shortcutConflict")?;
    }
    let changed = (|| {
        let next_connection = Connection {
            port: preferences.port,
            ..connection.clone()
        };
        write_private(&data.connection_path, &next_connection)?;
        write_private(&data.prefs_path, &preferences)?;
        core.set_policies(
            preferences.retention_days,
            preferences.completed_minutes,
            now_ms(),
        )
        .map_err(|_| "storageUnavailable")?;
        core.set_risk_patterns(&preferences.risk_patterns)
            .map_err(|_| "invalidPreferences")?;
        *data.connection.lock().map_err(|_| "bridgeUnavailable")? = next_connection;
        Ok::<_, String>(())
    })();
    if let Err(error) = changed {
        if register_shortcut {
            let _ = app
                .global_shortcut()
                .unregister(preferences.shortcut.as_str());
        }
        let restore_connection = write_private(&data.connection_path, &connection);
        let restore_preferences = write_private(&data.prefs_path, &old);
        if restore_connection.is_err() || restore_preferences.is_err() {
            *data.error.lock().map_err(|_| "bridgeUnavailable")? = Some("configUnavailable".into());
        }
        return Err(error);
    }
    if old.shortcut != preferences.shortcut {
        let _ = app.global_shortcut().unregister(old.shortcut.as_str());
    }
    if let Some(server) = next_server {
        *data.server.lock().map_err(|_| "bridgeUnavailable")? = Some(server);
    }
    core.set_permission_seconds(u64::from(preferences.permission_seconds))
        .map_err(|_| "invalidPreferences")?;
    *data.preferences.lock().map_err(|_| "bridgeUnavailable")? = preferences;
    *data.error.lock().map_err(|_| "bridgeUnavailable")? = None;
    update_tray(&app)?;
    view(&data)
}
fn icon(state: Option<SessionState>) -> tauri::image::Image<'static> {
    let mut bytes = vec![0; 24 * 24 * 4];
    for y in 0..24 {
        for x in 0..24 {
            let a = (x as f64 - 11.5) / 8.0;
            let b = (y as f64 - 11.5) / 8.0;
            let r = (a * a + b * b).sqrt();
            let inside = match state {
                None => r < 0.4,
                Some(SessionState::Pena) => (a + b).powi(2) * 0.35 + (a - b).powi(2) * 3.0 < 1.0,
                Some(SessionState::Divisao) => {
                    (a - 0.5).powi(2) + b * b < 0.5 || (a + 0.5).powi(2) + b * b < 0.5
                }
                Some(SessionState::Ampulheta) => b.abs() < 0.95 && a.abs() < 0.18 + 0.65 * b.abs(),
                Some(SessionState::Respingo) => {
                    r < 0.86
                        + 0.13 * (b.atan2(a) * 3.0 + 0.8).sin()
                        + 0.12 * (b.atan2(a) * 5.0).cos()
                }
                Some(SessionState::Mancha) => {
                    (a * a + (b / 0.65).powi(2)).sqrt()
                        < 0.86
                            + 0.13 * (b.atan2(a) * 3.0 + 0.8).sin()
                            + 0.12 * (b.atan2(a) * 5.0).cos()
                }
                Some(SessionState::Selo) => r < 0.93 + 0.07 * (b.atan2(a) * 10.0).cos(),
                Some(SessionState::Orbita) => {
                    r < 0.64 || ((a * a / 1.5 + b * b / 0.45) - 1.0).abs() < 0.20
                }
                Some(SessionState::Interrogacao) => {
                    ((a * a + (b + 0.3).powi(2)).sqrt() - 0.5).abs() < 0.19 && (b < -0.2 || a > 0.1)
                        || a.abs() < 0.17 && b > -0.1 && b < 0.38
                        || a * a + (b - 0.8).powi(2) < 0.06
                }
                _ => r < 1.0,
            };
            if inside {
                let i = (y * 24 + x) * 4;
                bytes[i..i + 4].copy_from_slice(&[217, 119, 87, 255]);
                if state == Some(SessionState::Selo)
                    && ((-0.45..=-0.05).contains(&a) && (b - a - 0.45).abs() < 0.12
                        || (-0.05..=0.45).contains(&a) && (b + a - 0.35).abs() < 0.12)
                {
                    bytes[i..i + 4].copy_from_slice(&[20, 20, 19, 255]);
                }
            }
        }
    }
    tauri::image::Image::new_owned(bytes, 24, 24)
}
fn update_tray(app: &AppHandle) -> Result<(), String> {
    let data = app.state::<Desktop>();
    let current = view(&data)?;
    let p = &current.preferences;
    let open = MenuItem::with_id(
        app,
        "open",
        text(&p.language, "trayOpen"),
        true,
        None::<&str>,
    )
    .map_err(|_| "bridgeUnavailable")?;
    let collapse = MenuItem::with_id(
        app,
        "collapse",
        text(&p.language, "trayCollapse"),
        true,
        None::<&str>,
    )
    .map_err(|_| "bridgeUnavailable")?;
    let pause = MenuItem::with_id(
        app,
        "pause",
        text(
            &p.language,
            if p.notifications {
                "trayPause"
            } else {
                "trayResume"
            },
        ),
        true,
        None::<&str>,
    )
    .map_err(|_| "bridgeUnavailable")?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        text(&p.language, "trayQuit"),
        true,
        None::<&str>,
    )
    .map_err(|_| "bridgeUnavailable")?;
    let menu = Menu::with_items(app, &[&open, &collapse, &pause, &quit])
        .map_err(|_| "bridgeUnavailable")?;
    let priority = current
        .sessions
        .iter()
        .max_by_key(|s| s.state.priority())
        .map(|s| s.state);
    if let Some(tray) = app.tray_by_id("scribe") {
        tray.set_menu(Some(menu)).map_err(|_| "bridgeUnavailable")?;
        tray.set_icon(Some(icon(priority)))
            .map_err(|_| "bridgeUnavailable")?;
    }
    Ok(())
}
fn snap(app: &AppHandle) -> Result<(), String> {
    let data = app.state::<Desktop>();
    let _saving = data.saving.try_lock().map_err(|_| "bridgeUnavailable")?;
    let window = app.get_webview_window("main").ok_or("bridgeUnavailable")?;
    let mut p = data
        .preferences
        .lock()
        .map_err(|_| "bridgeUnavailable")?
        .clone();
    if !p.collapsed {
        return Ok(());
    }
    let monitor = window
        .current_monitor()
        .map_err(|_| "bridgeUnavailable")?
        .ok_or("bridgeUnavailable")?;
    let pos = window.outer_position().map_err(|_| "bridgeUnavailable")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    p.side =
        if f64::from(pos.x - area.position.x) + 28.0 * scale < f64::from(area.size.width) / 2.0 {
            "left"
        } else {
            "right"
        }
        .into();
    p.y = Some(f64::from(pos.y) / scale);
    p.monitor = monitor.name().cloned();
    let old = data
        .preferences
        .lock()
        .map_err(|_| "bridgeUnavailable")?
        .clone();
    if old.side != p.side || old.y != p.y || old.monitor != p.monitor {
        write_private(&data.prefs_path, &p)?;
        *data.preferences.lock().map_err(|_| "bridgeUnavailable")? = p.clone();
        layout(&window, &p)?;
    }
    Ok(())
}

/// Start the native application with an isolated core and a single local window.
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if app.try_state::<Desktop>().is_some() {
                let _ = set_panel(app, false);
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        let collapsed = app
                            .state::<Desktop>()
                            .preferences
                            .lock()
                            .map(|p| p.collapsed)
                            .unwrap_or(false);
                        let _ = set_panel(app, !collapsed);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_view,
            set_preferences,
            toggle_panel,
            move_panel,
            start_drag,
            clear_history,
            open_help,
            resolve_decision
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            let _ = notify_rust::set_application("com.rexia.scribe");
            let data = init(app.handle())?;
            let p = data
                .preferences
                .lock()
                .map_err(|_| "Preferences lock unavailable")?
                .clone();
            app.manage(data);
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(local_url)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            if app.global_shortcut().register(p.shortcut.as_str()).is_err() {
                *app.state::<Desktop>()
                    .error
                    .lock()
                    .map_err(|_| "Error lock unavailable")? = Some("shortcutConflict".into());
            }
            TrayIconBuilder::with_id("scribe")
                .icon(icon(None))
                .tooltip("Scribe")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        let _ = set_panel(tray.app_handle(), false);
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        let _ = set_panel(app, false);
                    }
                    "collapse" => {
                        let _ = set_panel(app, true);
                    }
                    "quit" => app.exit(0),
                    "pause" => {
                        let data = app.state::<Desktop>();
                        if let Ok(_saving) = data.saving.try_lock() {
                            if let Ok(mut p) = data.preferences.lock() {
                                let mut next = p.clone();
                                next.notifications = !next.notifications;
                                if write_private(&data.prefs_path, &next).is_ok() {
                                    *p = next;
                                }
                            }
                        }
                        let _ = update_tray(app);
                    }
                    _ => {}
                })
                .build(app)?;
            let window = app
                .get_webview_window("main")
                .ok_or("Main window unavailable")?;
            layout(&window, &p)?;
            window.show()?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut receiver = handle.state::<Desktop>().core.as_ref().map(Core::subscribe);
                let mut tick = tokio::time::interval(Duration::from_secs(1));
                let mut last = String::new();
                let mut notifications = crate::notifications::Notifications::default();
                loop {
                    tokio::select! {
                        _ = tick.tick() => {},
                        _ = async {
                            match &mut receiver {
                                Some(r) => { let _ = r.recv().await; }
                                None => std::future::pending().await,
                            }
                        } => {}
                    }
                    let current = {
                        let handle = handle.clone();
                        tokio::task::spawn_blocking(move || view(&handle.state::<Desktop>())).await
                    };
                    if let Ok(Ok(current)) = current {
                        notify_requests(&handle, &current, &mut notifications);
                        let encoded = serde_json::to_string(&(
                            &current.sessions,
                            &current.decisions,
                            &current.preferences,
                            &current.error,
                        ))
                        .unwrap_or_default();
                        if encoded != last {
                            last = encoded;
                            let _ = handle.emit_to("main", "scribe:view", current);
                            let _ = update_tray(&handle);
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = set_panel(app, true);
                }
                WindowEvent::Moved(_) => {
                    let generation = app
                        .state::<Desktop>()
                        .drag_generation
                        .fetch_add(1, Ordering::Relaxed)
                        + 1;
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(Duration::from_millis(200)).await;
                        if app
                            .state::<Desktop>()
                            .drag_generation
                            .load(Ordering::Relaxed)
                            == generation
                        {
                            let handle = app.clone();
                            let _ = app.run_on_main_thread(move || {
                                let _ = snap(&handle);
                            });
                        }
                    });
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("Scribe desktop initialization failed");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Ok(mut server) = app.state::<Desktop>().server.lock() {
                let _ = server.take();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_risk_preferences_roundtrip_and_old_files_default_to_empty() {
        let temp = tempfile::TempDir::new().unwrap();
        let path = temp.path().join("preferences.json");
        let mut preferences = Preferences {
            risk_patterns: vec!["Restart-Service".into()],
            ..Preferences::default()
        };
        preferences.validate().unwrap();
        write_private(&path, &preferences).unwrap();
        let restored: Preferences = read_json(&path).unwrap();
        assert_eq!(restored.risk_patterns, ["Restart-Service"]);
        let mut old = serde_json::to_value(restored).unwrap();
        old.as_object_mut().unwrap().remove("riskPatterns");
        assert!(serde_json::from_value::<Preferences>(old)
            .unwrap()
            .risk_patterns
            .is_empty());
        preferences.risk_patterns = vec![String::new()];
        assert!(preferences.validate().is_err());
    }

    #[test]
    fn cold_launch_recognizes_the_hook_open_argument() {
        assert!(has_open_arg([std::ffi::OsString::from("--open")]));
        assert!(!has_open_arg([std::ffi::OsString::from("--show")]));
    }

    #[cfg(windows)]
    #[test]
    fn drag_coordinates_preserve_signed_monitor_positions() {
        for (x, y) in [(1900, 510), (-1800, -340), (0, 0)] {
            let packed = cursor_lparam(x, y);
            assert_eq!(i32::from(packed as i16), x);
            assert_eq!(i32::from((packed >> 16) as i16), y);
        }
    }

    #[test]
    fn only_local_asset_origins_can_navigate_or_invoke() {
        for address in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/index.html",
            "https://tauri.localhost/",
        ] {
            assert!(local_url(&address.parse().unwrap()), "{address}");
        }
        for address in [
            "https://example.com",
            "https://tauri.localhost.example.com/",
            "http://tauri.localhost:8080",
            "file:///index.html",
            "tauri://example.com/",
            "http://localhost:7717",
            "https://localhost:1420",
        ] {
            assert!(!local_url(&address.parse().unwrap()), "{address}");
        }
    }

    #[test]
    fn preferences_are_bounded_and_reject_unknown_fields() {
        let valid = Preferences::default();
        assert!(valid.validate().is_ok());
        for seconds in [0, 121] {
            assert!(Preferences {
                permission_seconds: seconds,
                ..valid.clone()
            }
            .validate()
            .is_err());
        }
        let mut legacy = serde_json::to_value(&valid).unwrap();
        legacy.as_object_mut().unwrap().remove("permissionSeconds");
        assert_eq!(
            serde_json::from_value::<Preferences>(legacy)
                .unwrap()
                .permission_seconds,
            120
        );
        for (days, minutes, port) in [
            (0, 10, 7717),
            (366, 10, 7717),
            (14, 0, 7717),
            (14, 1441, 7717),
            (14, 10, 80),
        ] {
            let next = Preferences {
                retention_days: days,
                completed_minutes: minutes,
                port,
                ..valid.clone()
            };
            assert!(next.validate().is_err());
        }
        let mut value = serde_json::to_value(&valid).unwrap();
        value["token"] = serde_json::json!("PUBLIC_FIELD");
        assert!(serde_json::from_value::<Preferences>(value).is_err());
        assert!(Preferences {
            language: "xx".into(),
            ..valid.clone()
        }
        .validate()
        .is_err());
        assert!(Preferences {
            theme: "remote".into(),
            ..valid.clone()
        }
        .validate()
        .is_err());
        assert!(Preferences {
            y: Some(f64::INFINITY),
            ..valid
        }
        .validate()
        .is_err());
    }

    #[test]
    fn private_json_replaces_atomically_and_does_not_leave_staging_files() {
        let temp = tempfile::TempDir::new().unwrap();
        let directory = temp.path().join("config");
        let path = directory.join("preferences.json");
        write_private(&path, &Preferences::default()).unwrap();
        let next = Preferences {
            theme: "dark".into(),
            ..Preferences::default()
        };
        write_private(&path, &next).unwrap();
        assert_eq!(read_json::<Preferences>(&path).unwrap().theme, "dark");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        let blocked = directory.join("blocked.json");
        fs::create_dir(&blocked).unwrap();
        assert!(write_private(&blocked, &next).is_err());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
    }
}
