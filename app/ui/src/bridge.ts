import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DecisionInput, Preferences, View } from "./types";
export const desktop = isTauri();
export const defaults: Preferences = {
  language: navigator.language.startsWith("pt") ? "pt-BR" : "en",
  theme: "auto",
  shortcut: "CommandOrControl+Shift+Space",
  notifications: true,
  dropColor: "clay",
  retentionDays: 14,
  completedMinutes: 10,
  permissionSeconds: 120,
  port: 7717,
  collapsed: false,
  side: "right",
  y: null,
  monitor: null,
};
export const initial: View = {
  at: 0,
  revision: 0,
  sessions: [],
  decisions: [],
  preferences: defaults,
  error: desktop ? null : "desktopOnly",
};
let previewPreferences = defaults;
let previewRevision = 0;
function preview(preferences = previewPreferences): View {
  previewPreferences = preferences;
  return { ...initial, preferences, revision: ++previewRevision };
}
export async function observe(receive: (view: View) => void) {
  if (!desktop) {
    receive(initial);
    return () => {};
  }
  const stop = await listen<View>("scribe:view", (event) =>
    receive(event.payload),
  );
  try {
    receive(await invoke<View>("get_view"));
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
export async function savePreferences(preferences: Preferences): Promise<View> {
  return desktop
    ? invoke("set_preferences", { preferences })
    : preview(preferences);
}
export async function toggle(): Promise<View> {
  return desktop
    ? invoke("toggle_panel")
    : preview({
        ...previewPreferences,
        collapsed: !previewPreferences.collapsed,
      });
}
export async function drag() {
  if (desktop) await invoke("start_drag");
}
export async function move(direction: string): Promise<View> {
  return desktop
    ? invoke("move_panel", { direction })
    : preview({
        ...previewPreferences,
        side:
          direction === "ArrowLeft"
            ? "left"
            : direction === "ArrowRight"
              ? "right"
              : previewPreferences.side,
      });
}
export async function clearHistory(): Promise<View> {
  return desktop ? invoke("clear_history") : preview();
}
export async function openHelp() {
  if (desktop) await invoke("open_help");
  else
    window.open(
      "https://rexia-intel-automation.github.io/scribe/troubleshooting",
      "_blank",
      "noopener,noreferrer",
    );
}
export async function resolveDecision(
  id: string,
  input: DecisionInput,
): Promise<View> {
  if (!desktop) throw "desktopOnly";
  return invoke("resolve_decision", { id, input });
}
