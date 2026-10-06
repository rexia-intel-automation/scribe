import { useEffect, useRef, useState, type RefObject } from "react";
import { Gota } from "./gota/Gota";
import { t, action, type Message } from "./i18n";
import { priority, type View, type Session, type Preferences } from "./types";
import * as bridge from "./bridge";
function useTheme(theme: Preferences["theme"]) {
  const [dark, setDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setDark(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const effective = theme === "auto" ? (dark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = effective;
  }, [effective]);
  return effective;
}
/** Sanitized session summary with keyboard-accessible recent steps. */
function SessionRow({
  session,
  view,
  theme,
  now,
}: {
  session: Session;
  view: View;
  theme: string;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const language = view.preferences.language;
  const elapsed = Math.max(0, (session.endedAt ?? now) - session.startedAt);
  const duration =
    elapsed >= 60000
      ? t(language, "minute", { count: Math.floor(elapsed / 60000) })
      : t(language, "second", { count: Math.floor(elapsed / 1000) });
  return (
    <li className="session">
      <button
        className="session-head"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <Gota
          form={session.state}
          size={40}
          label={t(language, session.state)}
          theme={theme}
        />
        <span className="session-copy">
          <span className="project">{session.project}</span>
          <span className="action">{action(session.action, language)}</span>
          {session.origin && (
            <span className="origin">
              {t(language, "origin", { value: session.origin })}
            </span>
          )}
        </span>
        <span className="session-time">
          {duration}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </span>
      </button>
      {expanded && (
        <div className="session-detail">
          <p className="path">{session.cwd}</p>
          {session.state === "interrogacao" && (
            <p className="terminal-hint">{t(language, "permissionTerminal")}</p>
          )}
          <ol className="steps">
            {session.steps.slice(-8).map((step, index) => (
              <li key={`${step.at}-${index}`}>
                <span className={step.ok === false ? "failed-step" : ""}>
                  {action(step.summary, language)}
                </span>
                <time dateTime={new Date(step.at).toISOString()}>
                  {new Intl.DateTimeFormat(language, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(step.at)}
                </time>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}
/** Modal preferences editor; failed saves retain the current session view. */
function Settings({
  view,
  receive,
  close,
  returnFocus,
}: {
  view: View;
  receive: (view: View) => void;
  close: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [preferences, setPreferences] = useState(view.preferences);
  const [error, setError] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const previousConfirm = useRef(confirm);
  const [notice, setNotice] = useState(false);
  const language = view.preferences.language;
  useEffect(() => {
    const modal = dialog.current;
    const source = opener.current;
    const fallback = returnFocus.current;
    modal?.showModal();
    return () => {
      modal?.close();
      queueMicrotask(() => {
        if (!modal?.isConnected) {
          const target =
            source?.isConnected && source !== document.body ? source : fallback;
          if (target?.isConnected) target.focus();
        }
      });
    };
  }, [returnFocus]);
  useEffect(() => {
    if (previousConfirm.current !== confirm) {
      previousConfirm.current = confirm;
      historyToggle.current?.focus();
    }
  }, [confirm]);
  const change = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPreferences((previous) => ({ ...previous, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      receive(await bridge.savePreferences(preferences));
      close();
    } catch (cause) {
      setError(
        (typeof cause === "string" ? cause : "configUnavailable") as Message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setBusy(true);
    try {
      receive(await bridge.clearHistory());
      setConfirm(false);
      setNotice(true);
    } catch {
      setError("storageUnavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="settings"
      aria-labelledby="settings-title"
      onCancel={close}
      onClose={(event) => {
        if (!event.currentTarget.open) close();
      }}
    >
      <header>
        <h2 id="settings-title">{t(language, "settings")}</h2>
        <button
          className="icon-button"
          aria-label={t(language, "close")}
          onClick={close}
        >
          ×
        </button>
      </header>
      <form onSubmit={save}>
        <label>
          {t(language, "theme")}
          <select
            value={preferences.theme}
            onChange={(e) =>
              change("theme", e.target.value as Preferences["theme"])
            }
          >
            {(["auto", "light", "dark"] as const).map((theme) => (
              <option key={theme} value={theme}>
                {t(language, theme)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(language, "language")}
          <select
            value={preferences.language}
            onChange={(e) =>
              change("language", e.target.value as Preferences["language"])
            }
          >
            {(["pt-BR", "en"] as const).map((lang) => (
              <option key={lang} value={lang}>
                {t(language, lang)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(language, "shortcut")}
          <input
            value={preferences.shortcut}
            maxLength={80}
            required
            onChange={(e) => change("shortcut", e.target.value)}
          />
          <small>{t(language, "shortcutHelp")}</small>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={preferences.notifications}
            onChange={(e) => change("notifications", e.target.checked)}
          />
          {t(language, "notifications")}
        </label>
        <label>
          {t(language, "retention")}
          <input
            type="number"
            min={1}
            max={365}
            required
            value={preferences.retentionDays}
            onChange={(e) => change("retentionDays", e.target.valueAsNumber)}
          />
        </label>
        <label>
          {t(language, "completedMinutes")}
          <input
            type="number"
            min={1}
            max={1440}
            required
            value={preferences.completedMinutes}
            onChange={(e) => change("completedMinutes", e.target.valueAsNumber)}
          />
        </label>
        <label>
          {t(language, "port")}
          <input
            type="number"
            min={1024}
            max={65535}
            required
            value={preferences.port}
            onChange={(e) => change("port", e.target.valueAsNumber)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {t(language, error)}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {t(language, "save")}
        </button>
      </form>
      <section className="history">
        <h3>{t(language, "clearHistory")}</h3>
        {confirm ? (
          <>
            <p>{t(language, "clearConfirm")}</p>
            <p>{t(language, "clearDescription")}</p>
            <div className="actions">
              <button disabled={busy} onClick={clear}>
                {t(language, "confirmClear")}
              </button>
              <button ref={historyToggle} onClick={() => setConfirm(false)}>
                {t(language, "cancel")}
              </button>
            </div>
          </>
        ) : (
          <button ref={historyToggle} onClick={() => setConfirm(true)}>
            {t(language, "clearHistory")}
          </button>
        )}
        {notice && <p role="status">{t(language, "historyCleared")}</p>}
      </section>
      <footer>
        <h3>{t(language, "about")}</h3>
        <p>{t(language, "legal")}</p>
      </footer>
    </dialog>
  );
}
/** Native session panel; accepts ordered snapshots and explicit user actions. */
export default function App({
  initialView = bridge.initial,
}: {
  initialView?: View;
}) {
  const [view, setView] = useState(initialView);
  const [settings, setSettings] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<Message | null>(null);
  const opened = useRef(Date.now());
  const revision = useRef(initialView.revision);
  const [heardHook, setHeardHook] = useState(
    initialView.sessions.some(
      (session) => session.lastEventAt >= opened.current,
    ),
  );
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const panelToggle = useRef<HTMLButtonElement>(null);
  const settingsToggle = useRef<HTMLButtonElement>(null);
  const previousMode = useRef(initialView.preferences.collapsed);
  const language = view.preferences.language;
  const theme = useTheme(view.preferences.theme);
  const receive = (next: View) => {
    if (next.revision <= revision.current) return;
    revision.current = next.revision;
    setView(next);
    if (!next.error) setError(null);
    if (next.sessions.some((session) => session.lastEventAt >= opened.current))
      setHeardHook(true);
  };
  const fail = (cause: unknown) =>
    setError(
      (typeof cause === "string" ? cause : "bridgeUnavailable") as Message,
    );
  useEffect(() => {
    if (previousMode.current === view.preferences.collapsed) return;
    previousMode.current = view.preferences.collapsed;
    if (view.preferences.collapsed || !settings) panelToggle.current?.focus();
  }, [view.preferences.collapsed, settings]);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    bridge
      .observe((next) => {
        if (!disposed) receive(next);
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else stop = cleanup;
      })
      .catch(() => {
        if (!disposed) setError("bridgeUnavailable");
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  async function toggle() {
    try {
      receive(await bridge.toggle());
      setError(null);
    } catch (cause) {
      fail(cause);
    }
  }
  const active = view.sessions.filter((s) => s.endedAt === null);
  const completed = view.sessions.filter((s) => s.endedAt !== null);
  const form = priority(view.sessions);
  const problem = (error || view.error) as Message | null;
  if (view.preferences.collapsed)
    return (
      <button
        ref={panelToggle}
        className="collapsed"
        aria-label={t(language, "open")}
        title={problem ? t(language, problem) : t(language, "moveHint")}
        aria-description={[
          ...(problem ? [t(language, problem)] : []),
          t(language, "moveHint"),
        ].join(" ")}
        onKeyDown={(event) => {
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            void bridge
              .move(event.key)
              .then((next) => {
                receive(next);
                setError(null);
              })
              .catch(fail);
          }
        }}
        onPointerDown={(event) => {
          if (event.button === 0) {
            dragStart.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          const start = dragStart.current;
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
          ) {
            dragStart.current = null;
            void bridge.drag().catch(fail);
          }
        }}
        onPointerUp={() => {
          if (dragStart.current) {
            dragStart.current = null;
            void toggle();
          }
        }}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
        onClick={(event) => {
          if (event.detail === 0) void toggle();
        }}
      >
        <Gota form={form} size={56} label={t(language, form)} theme={theme} />
        {problem && (
          <span className="collapsed-error">
            <span aria-hidden="true">!</span>
            <span className="sr-only" role="alert">
              {t(language, problem)}
            </span>
          </span>
        )}
      </button>
    );
  return (
    <main className="panel">
      <header className="app-header">
        <Gota form={form} size={46} label={t(language, form)} theme={theme} />
        <div>
          <h1>{t(language, "app")}</h1>
          <p>
            {t(language, active.length === 1 ? "summaryOne" : "summary", {
              count: active.length,
            })}
          </p>
        </div>
        <button
          ref={panelToggle}
          className="icon-button collapse-button"
          onClick={toggle}
          aria-label={t(language, "collapse")}
        >
          ›
        </button>
      </header>
      <nav className="navigation" aria-label={t(language, "now")}>
        <span>{t(language, "now")}</span>
        <button
          ref={settingsToggle}
          className="icon-button"
          onClick={() => setSettings(true)}
          aria-label={t(language, "settings")}
        >
          ⚙
        </button>
      </nav>
      <div className="content">
        {(error || view.error) && (
          <p className="error" role="alert">
            {t(language, (error || view.error) as Message)}
          </p>
        )}
        {!view.sessions.length && (
          <div className="empty">
            <Gota
              form="gota"
              size={96}
              label={t(language, "gota")}
              theme={theme}
            />
            <p>{t(language, "empty")}</p>
          </div>
        )}
        {active.length > 0 && (
          <section aria-labelledby="active-title">
            <h2 id="active-title">{t(language, "sessions")}</h2>
            <ul className="session-list">
              {active.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  view={view}
                  theme={theme}
                  now={now}
                />
              ))}
            </ul>
          </section>
        )}
        {completed.length > 0 && (
          <section aria-labelledby="completed-title">
            <h2 id="completed-title">{t(language, "completed")}</h2>
            <ul className="session-list">
              {completed.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  view={view}
                  theme={theme}
                  now={now}
                />
              ))}
            </ul>
          </section>
        )}
        {now - opened.current >= 300000 && !heardHook && (
          <aside className="hint">
            <p>{t(language, "troubleshoot")}</p>
            <button
              className="help-link"
              onClick={() =>
                void bridge
                  .openHelp()
                  .catch(() => setError("bridgeUnavailable"))
              }
            >
              {t(language, "help")}
            </button>
          </aside>
        )}
      </div>
      {settings && (
        <Settings
          view={view}
          receive={receive}
          close={() => setSettings(false)}
          returnFocus={settingsToggle}
        />
      )}
    </main>
  );
}
