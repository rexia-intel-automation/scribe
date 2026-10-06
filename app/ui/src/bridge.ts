import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Preferences, View } from "./types";
export const desktop = isTauri();
export const defaults: Preferences = {
  language: navigator.language.startsWith("pt") ? "pt-BR" : "en",
  theme: "auto",
  shortcut: "CommandOrControl+Shift+Space",
  notifications: true,
  retentionDays: 14,
  completedMinutes: 10,
  port: 7717,
  collapsed: false,
  side: "right",
  y: null,
  monitor: null,
};
export const initial: View = {
  at: 0,
  sessions: [],
  preferences: defaults,
  error: desktop ? null : "desktopOnly",
};
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
    : { ...initial, preferences };
}
export async function toggle(): Promise<View> {
  return desktop
    ? invoke("toggle_panel")
    : { ...initial, preferences: { ...defaults, collapsed: true } };
}
export async function drag() {
  if (desktop) await invoke("start_drag");
}
export async function clearHistory(): Promise<View> {
  return desktop ? invoke("clear_history") : initial;
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
