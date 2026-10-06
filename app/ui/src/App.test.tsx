import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import * as bridge from "./bridge";
import { t, action } from "./i18n";
import { priority, type View } from "./types";
vi.mock("./bridge", async () => {
  const actual = await vi.importActual<typeof import("./bridge")>("./bridge");
  return {
    ...actual,
    observe: vi.fn(async () => () => {}),
    savePreferences: vi.fn(),
    toggle: vi.fn(),
    move: vi.fn(),
    clearHistory: vi.fn(),
  };
});
function fixture(): View {
  return {
    at: Date.now(),
    revision: 1,
    error: null,
    preferences: { ...bridge.defaults, language: "pt-BR" },
    sessions: [
      {
        id: "public",
        project: "public-project",
        cwd: "…/public/project",
        origin: "startup",
        state: "pena",
        action: "Editando …/project/test.ts",
        startedAt: Date.now() - 120000,
        lastEventAt: Date.now(),
        endedAt: null,
        steps: Array.from({ length: 20 }, (_, i) => ({
          at: Date.now() - 20000 + i * 1000,
          summary: `PUBLIC_STEP_${i}`,
          tool: "Edit",
          ok: true,
        })),
      },
    ],
  };
}
beforeEach(() => vi.clearAllMocks());
describe("session window", () => {
  it("starts with an honest empty state and no future tabs or fabricated sessions", () => {
    render(
      <App
        initialView={{
          ...bridge.initial,
          error: null,
          preferences: { ...bridge.defaults, language: "en" },
        }}
      />,
    );
    expect(screen.getByText(t("en", "empty"))).toBeVisible();
    expect(screen.queryByText("public-project")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
  it("supports keyboard expansion and shows only the eight recent steps", async () => {
    const user = userEvent.setup();
    render(<App initialView={fixture()} />);
    const row = screen.getByRole("button", { name: /public-project/ });
    expect(within(row).getByText("Origem: startup")).toBeVisible();
    row.focus();
    await user.keyboard("{Enter}");
    expect(row).toHaveAttribute("aria-expanded", "true");
    const steps = screen.getAllByRole("list")[1];
    expect(within(steps).getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText("PUBLIC_STEP_12")).toBeVisible();
    expect(screen.queryByText("PUBLIC_STEP_11")).not.toBeInTheDocument();
    expect(screen.getByText("PUBLIC_STEP_19")).toBeVisible();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("PUBLIC_STEP_19")).not.toBeInTheDocument();
  });
  it("does not invent an origin when the hook did not supply one", () => {
    const data = fixture();
    data.sessions[0].origin = null;
    render(<App initialView={data} />);
    expect(screen.queryByText(/^Origem:/)).not.toBeInTheDocument();
  });
  it("translates persisted system actions while preserving user reports", () => {
    expect(action("Editando …/project/file.ts", "en")).toBe(
      "Editing …/project/file.ts",
    );
    expect(action("Falhou: Bash", "en")).toBe("Failed: Bash");
    expect(action("sem notícias há 12 min", "en")).toBe("No news for 12 min");
    expect(action("PUBLIC_MILESTONE", "en")).toBe("PUBLIC_MILESTONE");
  });
  it("settings save real selected preferences and switch all visible copy", async () => {
    const user = userEvent.setup();
    const data = fixture();
    vi.mocked(bridge.savePreferences).mockImplementation(
      async (preferences) => ({
        ...data,
        revision: data.revision + 1,
        preferences,
      }),
    );
    render(<App initialView={data} />);
    await user.click(
      screen.getByRole("button", { name: t("pt-BR", "settings") }),
    );
    await user.selectOptions(
      screen.getByLabelText(t("pt-BR", "language")),
      "en",
    );
    await user.selectOptions(
      screen.getByLabelText(t("pt-BR", "theme")),
      "dark",
    );
    await user.click(screen.getByRole("button", { name: t("pt-BR", "save") }));
    await waitFor(() =>
      expect(screen.getByText(t("en", "sessions"))).toBeVisible(),
    );
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText("Editing …/project/test.ts")).toBeVisible();
  });
  it("does not call clear until explicit confirmation and retains failure details", async () => {
    const user = userEvent.setup();
    vi.mocked(bridge.clearHistory).mockRejectedValue("storageUnavailable");
    render(<App initialView={fixture()} />);
    await user.click(
      screen.getByRole("button", { name: t("pt-BR", "settings") }),
    );
    await user.click(
      screen.getByRole("button", { name: t("pt-BR", "clearHistory") }),
    );
    expect(bridge.clearHistory).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: t("pt-BR", "confirmClear") }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t("pt-BR", "storageUnavailable"),
    );
    expect(screen.getByText("public-project")).toBeVisible();
  });
  it("keeps keyboard focus when opening and cancelling history confirmation", async () => {
    const user = userEvent.setup();
    render(<App initialView={fixture()} />);
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const clear = screen.getByRole("button", { name: "Apagar histórico" });
    clear.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "Apagar histórico" }),
    ).toHaveFocus();
    expect(bridge.clearHistory).not.toHaveBeenCalled();
    expect(screen.getByText("public-project")).toBeVisible();
  });
  it("returns focus after confirmed history clearing finishes", async () => {
    const user = userEvent.setup();
    const data = fixture();
    vi.mocked(bridge.clearHistory).mockResolvedValue({
      ...data,
      revision: data.revision + 1,
      sessions: [],
    });
    render(<App initialView={data} />);
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    await user.click(screen.getByRole("button", { name: "Apagar histórico" }));
    await user.click(
      screen.getByRole("button", { name: t("pt-BR", "confirmClear") }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Apagar histórico" }),
      ).toHaveFocus(),
    );
    expect(bridge.clearHistory).toHaveBeenCalledOnce();
    expect(screen.queryByText("public-project")).not.toBeInTheDocument();
  });
  it("ignores reordered snapshots with identical timestamps and releases its listener", async () => {
    let receive: ((value: View) => void) | undefined;
    const stop = vi.fn();
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return stop;
    });
    const data = fixture();
    const app = render(<App initialView={data} />);
    await waitFor(() => expect(receive).toBeDefined());
    receive!({ ...data, revision: data.revision + 1, sessions: [] });
    await waitFor(() =>
      expect(screen.getByText(t("pt-BR", "empty"))).toBeVisible(),
    );
    receive!({ ...data });
    expect(screen.queryByText("public-project")).not.toBeInTheDocument();
    app.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
  it("uses the stated form priority", () => {
    const data = fixture();
    expect(priority([])).toBe("ponto");
    expect(
      priority([
        ...data.sessions,
        { ...data.sessions[0], state: "interrogacao" },
      ]),
    ).toBe("interrogacao");
    expect(
      priority([
        { ...data.sessions[0], state: "mancha" },
        { ...data.sessions[0], state: "divisao" },
      ]),
    ).toBe("mancha");
  });
  it("repositions the focused collapsed drop with arrow keys without reopening", async () => {
    const user = userEvent.setup();
    const data = fixture();
    data.preferences.collapsed = true;
    vi.mocked(bridge.move).mockImplementation(async () => ({
      ...data,
      revision: data.revision + 1,
      preferences: { ...data.preferences, side: "left" },
    }));
    render(<App initialView={data} />);
    const drop = screen.getByRole("button", { name: "Abrir Scribe" });
    expect(drop).toHaveAccessibleDescription(t("pt-BR", "moveHint"));
    drop.focus();
    await user.keyboard("{ArrowLeft}");
    expect(bridge.move).toHaveBeenCalledWith("ArrowLeft");
    expect(bridge.toggle).not.toHaveBeenCalled();
    expect(drop).toHaveFocus();
  });
  it("clears a transient toggle error after recovery and reopening", async () => {
    const user = userEvent.setup();
    const data = fixture();
    vi.mocked(bridge.toggle)
      .mockRejectedValueOnce("configUnavailable")
      .mockResolvedValueOnce({
        ...data,
        revision: data.revision + 1,
        preferences: { ...data.preferences, collapsed: true },
      })
      .mockResolvedValueOnce({ ...data, revision: data.revision + 2 });
    render(<App initialView={data} />);
    screen.getByRole("button", { name: "Recolher janela" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      t("pt-BR", "configUnavailable"),
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("button", { name: "Abrir Scribe" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("button", { name: "Recolher janela" }),
    ).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("transfers focus when a native snapshot changes the panel mode", async () => {
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    render(<App initialView={data} />);
    screen.getByRole("button", { name: "Configurações" }).focus();
    act(() =>
      receive!({
        ...data,
        revision: 2,
        preferences: { ...data.preferences, collapsed: true },
      }),
    );
    expect(screen.getByRole("button", { name: "Abrir Scribe" })).toHaveFocus();
    act(() => receive!({ ...data, revision: 3 }));
    expect(
      screen.getByRole("button", { name: "Recolher janela" }),
    ).toHaveFocus();
  });
  it("restores settings focus after the original opener was removed by a mode change", async () => {
    const user = userEvent.setup();
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    render(<App initialView={data} />);
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    act(() =>
      receive!({
        ...data,
        revision: 2,
        preferences: { ...data.preferences, collapsed: true },
      }),
    );
    expect(screen.getByRole("button", { name: "Abrir Scribe" })).toHaveFocus();
    act(() => receive!({ ...data, revision: 3 }));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    await user.click(
      screen.getByRole("button", { name: "Fechar configurações" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Configurações" }),
      ).toHaveFocus(),
    );
  });
  it("announces a failed move while collapsed and preserves the specific cause", async () => {
    const user = userEvent.setup();
    const data = fixture();
    data.preferences.collapsed = true;
    vi.mocked(bridge.move).mockRejectedValueOnce("configUnavailable");
    render(<App initialView={data} />);
    const drop = screen.getByRole("button", { name: "Abrir Scribe" });
    drop.focus();
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t("pt-BR", "configUnavailable"),
    );
    expect(drop).toHaveAttribute("title", t("pt-BR", "configUnavailable"));
    expect(drop).toHaveAccessibleDescription(
      `${t("pt-BR", "configUnavailable")} ${t("pt-BR", "moveHint")}`,
    );
    expect(
      screen.queryByRole("button", { name: "Recolher janela" }),
    ).not.toBeInTheDocument();
  });
  it("clears the local error when a newer native snapshot confirms recovery", async () => {
    const user = userEvent.setup();
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    vi.mocked(bridge.toggle).mockRejectedValueOnce("configUnavailable");
    render(<App initialView={data} />);
    await user.click(screen.getByRole("button", { name: "Recolher janela" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    act(() =>
      receive!({
        ...data,
        revision: data.revision + 1,
        error: "configUnavailable",
      }),
    );
    expect(screen.getByRole("alert")).toBeVisible();
    act(() => receive!({ ...data, revision: data.revision + 2, error: null }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows the connection hint after five minutes even with restored sessions", async () => {
    vi.useFakeTimers();
    const data = fixture();
    data.sessions[0].lastEventAt = Date.now() - 60000;
    const app = render(<App initialView={data} />);
    try {
      await act(() => vi.advanceTimersByTimeAsync(301000));
      expect(screen.getByText(t("pt-BR", "troubleshoot"))).toBeVisible();
    } finally {
      app.unmount();
      vi.useRealTimers();
    }
  });
  it("remembers receipt of a hook after its completed session leaves the list", async () => {
    vi.useFakeTimers();
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    data.sessions[0].lastEventAt = Date.now() - 60000;
    const app = render(<App initialView={data} />);
    try {
      await act(() => vi.advanceTimersByTimeAsync(1000));
      act(() =>
        receive!({
          ...data,
          revision: data.revision + 1,
          sessions: [{ ...data.sessions[0], lastEventAt: Date.now() }],
        }),
      );
      act(() =>
        receive!({ ...data, revision: data.revision + 2, sessions: [] }),
      );
      await act(() => vi.advanceTimersByTimeAsync(300000));
      expect(
        screen.queryByText(t("pt-BR", "troubleshoot")),
      ).not.toBeInTheDocument();
    } finally {
      app.unmount();
      vi.useRealTimers();
    }
  });
});
