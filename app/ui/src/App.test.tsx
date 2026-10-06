import { render, screen, within, waitFor } from "@testing-library/react";
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
    (await screen.findByRole("button", { name: "Abrir Scribe" })).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Recolher janela" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
