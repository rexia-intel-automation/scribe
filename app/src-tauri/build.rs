fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_view",
            "set_preferences",
            "toggle_panel",
            "start_drag",
            "clear_history",
            "open_help",
        ]),
    ))
    .expect("Tauri build configuration is invalid");
}
