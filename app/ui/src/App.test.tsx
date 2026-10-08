import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import * as bridge from "./bridge";
import { t, action } from "./i18n";
import { priority, type Decision, type Preferences, type View } from "./types";
vi.mock("./bridge", async () => {
  const actual = await vi.importActual<typeof import("./bridge")>("./bridge");
  return {
    ...actual,
    observe: vi.fn(async () => () => {}),
    savePreferences: vi.fn(),
    toggle: vi.fn(),
    resolveDecision: vi.fn(),
    move: vi.fn(),
    drag: vi.fn(),
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
        title: null,
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
function pendingDecision(id: string): Decision {
  const createdAt = Date.now();
  return {
    id,
    sessionId: "public",
    project: "public-project",
    kind: "permission",
    tool: "Bash",
    target: "echo public",
    question: null,
    options: [],
    risk: false,
    armed: false,
    status: "pending",
    createdAt,
    expiresAt: createdAt + 120000,
    resolvedAt: null,
  };
}
beforeEach(() => vi.clearAllMocks());
describe("session window", () => {
  it("shows a custom title while keeping the project name visible", () => {
    const data = fixture();
    data.sessions[0].title = "Release prep";
    render(<App initialView={data} />);
    expect(screen.getByText("Release prep")).toBeVisible();
    expect(screen.getByText("public-project")).toBeVisible();
  });
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
  it("uses singular and plural pending-decision labels", async () => {
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    data.preferences.language = "en";
    data.decisions = [pendingDecision("one")];
    render(<App initialView={data} />);
    expect(
      screen.getByRole("heading", { name: "1 decision waiting" }),
    ).toHaveAttribute("aria-live", "polite");

    await waitFor(() => expect(receive).toBeDefined());
    act(() =>
      receive!({
        ...data,
        revision: data.revision + 1,
        decisions: [pendingDecision("one"), pendingDecision("two")],
      }),
    );
    expect(
      screen.getByRole("heading", { name: "2 decisions waiting" }),
    ).toHaveAttribute("aria-live", "polite");
  });
  it("keeps resolved and expired cards without announcing zero pending decisions", async () => {
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    data.preferences.language = "en";
    data.decisions = [pendingDecision("answered")];
    render(<App initialView={data} />);
    await waitFor(() => expect(receive).toBeDefined());

    const resolved = {
      ...data.decisions[0],
      status: "denied" as const,
      resolvedAt: Date.now(),
    };
    act(() =>
      receive!({
        ...data,
        revision: data.revision + 1,
        decisions: [resolved],
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Permissions and questions" }),
    ).not.toHaveAttribute("aria-live");
    expect(screen.getByText("echo public")).toBeVisible();
    expect(screen.queryByText(/0 decisions waiting/)).not.toBeInTheDocument();

    const expired = {
      ...pendingDecision("expired"),
      expiresAt: Date.now() - 1000,
    };
    act(() =>
      receive!({
        ...data,
        revision: data.revision + 2,
        decisions: [expired],
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Permissions and questions" }),
    ).not.toHaveAttribute("aria-live");
    expect(screen.getByText("echo public")).toBeVisible();
    expect(screen.getByText("Expired: answer in the terminal")).toBeVisible();
    expect(screen.queryByText(/0 decisions waiting/)).not.toBeInTheDocument();
  });
  it("translates persisted system actions while preserving user reports", () => {
    expect(action("Editando …/project/file.ts", "en")).toBe(
      "Editing …/project/file.ts",
    );
    expect(action("Falhou: Bash", "en")).toBe("Failed: Bash");
    expect(action("sem notícias há 12 min", "en")).toBe("No news for 12 min");
    expect(action("Fez uma pergunta", "en")).toBe("Asked a question");
    expect(action("Esperando sua aprovação do plano", "en")).toBe(
      "Waiting for plan approval",
    );
    expect(action("Fez uma pergunta", "pt-BR")).toBe("Fez uma pergunta");
    expect(action("Esperando sua aprovação do plano", "pt-BR")).toBe(
      "Esperando sua aprovação do plano",
    );
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
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const dropColor = screen.getByLabelText("Drop color");
    expect(
      within(dropColor)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Clay", "Blue", "Green", "Wine", "Ochre"]);
  });
  it("saves the selected drop palette and restores it for a collapsed view", async () => {
    const user = userEvent.setup();
    const data = fixture();
    let savedView: View | undefined;
    vi.mocked(bridge.savePreferences).mockImplementation(
      async (preferences) => {
        savedView = {
          ...data,
          revision: data.revision + 1,
          preferences,
        };
        return savedView;
      },
    );
    const app = render(<App initialView={data} />);
    const originalForms = [...app.container.querySelectorAll("canvas")].map(
      (canvas) => canvas.getAttribute("aria-label"),
    );
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const dropColor = screen.getByLabelText("Cor da gota");
    expect(
      within(dropColor)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Terracota", "Azul", "Verde", "Vinho", "Ocre"]);
    await user.selectOptions(dropColor, "blue");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(document.documentElement.dataset.dropColor).toBe("blue"),
    );
    expect(bridge.savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ dropColor: "blue" }),
    );
    expect(
      [...app.container.querySelectorAll("canvas")].map((canvas) =>
        canvas.getAttribute("aria-label"),
      ),
    ).toEqual(originalForms);
    expect(savedView?.preferences.dropColor).toBe("blue");

    app.unmount();
    render(
      <App
        initialView={{
          ...savedView!,
          preferences: { ...savedView!.preferences, collapsed: true },
        }}
      />,
    );
    await waitFor(() =>
      expect(document.documentElement.dataset.dropColor).toBe("blue"),
    );
    expect(screen.getByRole("button", { name: "Abrir Scribe" })).toBeVisible();
  });
  it("normalizes an older preference snapshot without dropColor to clay", async () => {
    const user = userEvent.setup();
    const data = fixture();
    delete (data.preferences as Partial<Preferences>).dropColor;
    render(<App initialView={data} />);
    await waitFor(() =>
      expect(document.documentElement.dataset.dropColor).toBe("clay"),
    );
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    expect(screen.getByLabelText("Cor da gota")).toHaveValue("clay");
  });
  it("normalizes additional risk patterns on save and tolerates older preferences", async () => {
    const user = userEvent.setup();
    const data = fixture();
    delete (data.preferences as Partial<Preferences>).riskPatterns;
    vi.mocked(bridge.savePreferences).mockImplementation(
      async (preferences) => ({
        ...data,
        revision: data.revision + 1,
        preferences,
      }),
    );
    render(<App initialView={data} />);
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const patterns = screen.getByRole("textbox", {
      name: t("pt-BR", "riskPatterns"),
    });
    expect(patterns).toHaveValue("");
    expect(screen.getByText(t("pt-BR", "riskPatternsHint"))).toHaveTextContent(
      "continuam ativos",
    );
    await user.selectOptions(
      screen.getByLabelText(t("pt-BR", "theme")),
      "dark",
    );
    fireEvent.change(patterns, {
      target: { value: "  suspicious  \n\nPowerShell\n" },
    });
    await user.click(screen.getByRole("button", { name: t("pt-BR", "save") }));

    expect(bridge.savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "dark",
        riskPatterns: ["suspicious", "PowerShell"],
      }),
    );
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("dark"),
    );
  });
  it("allows 2,048 pattern bytes without counting line separators", async () => {
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
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const patterns = Array.from(
      { length: 16 },
      (_, index) => `${String(index).padStart(2, "0")}${"é".repeat(63)}`,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: t("pt-BR", "riskPatterns") }),
      { target: { value: patterns.join("\n") } },
    );
    await user.click(screen.getByRole("button", { name: t("pt-BR", "save") }));

    expect(bridge.savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ riskPatterns: patterns }),
    );
  });
  it("reports each invalid risk-pattern limit without discarding the settings draft", async () => {
    const user = userEvent.setup();
    const data = fixture();
    render(<App initialView={data} />);
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const patterns = screen.getByRole("textbox", {
      name: t("pt-BR", "riskPatterns"),
    });
    const invalidPatterns = [
      {
        value: "PowerShell\npowershell",
        error: "riskPatternsDuplicate",
      },
      { value: "bad\u200Epattern", error: "riskPatternsControl" },
      {
        value: "é".repeat(65),
        error: "riskPatternsEntryTooLong",
      },
      {
        value: Array.from(
          { length: 33 },
          (_, index) => `pattern-${index}`,
        ).join("\n"),
        error: "riskPatternsTooMany",
      },
      {
        value: Array.from(
          { length: 17 },
          (_, index) => `${String(index).padStart(2, "0")}${"é".repeat(63)}`,
        ).join("\n"),
        error: "riskPatternsTotalTooLong",
      },
    ] as const;

    await user.selectOptions(
      screen.getByLabelText(t("pt-BR", "theme")),
      "dark",
    );
    for (const invalid of invalidPatterns) {
      fireEvent.change(patterns, { target: { value: invalid.value } });
      await user.click(
        screen.getByRole("button", { name: t("pt-BR", "save") }),
      );
      expect(screen.getByRole("alert")).toHaveTextContent(
        t("pt-BR", invalid.error),
      );
      expect(screen.getByRole("dialog")).toBeVisible();
      expect(screen.getByLabelText(t("pt-BR", "theme"))).toHaveValue("dark");
      expect(patterns).toHaveValue(invalid.value);
    }
    expect(bridge.savePreferences).not.toHaveBeenCalled();
    expect(screen.getByText("public-project")).toBeVisible();
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
  it("does not steal focus moved by the user while clearing fails asynchronously", async () => {
    const user = userEvent.setup();
    let reject!: (cause: string) => void;
    vi.mocked(bridge.clearHistory).mockReturnValue(
      new Promise<View>((_, fail) => {
        reject = fail;
      }),
    );
    render(<App initialView={fixture()} />);
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    await user.click(screen.getByRole("button", { name: "Apagar histórico" }));
    await user.click(
      screen.getByRole("button", { name: t("pt-BR", "confirmClear") }),
    );
    const language = screen.getByLabelText(t("pt-BR", "language"));
    await user.click(language);
    await act(async () => reject("storageUnavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t("pt-BR", "storageUnavailable"),
    );
    expect(language).toHaveFocus();
    expect(screen.getByText("public-project")).toBeVisible();
  });
  it("keeps a new settings draft open when a closed modal finishes saving", async () => {
    const user = userEvent.setup();
    const data = fixture();
    let resolve!: (next: View) => void;
    vi.mocked(bridge.savePreferences).mockReturnValue(
      new Promise<View>((done) => {
        resolve = done;
      }),
    );
    render(<App initialView={data} />);
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    await user.click(screen.getByRole("button", { name: t("pt-BR", "save") }));
    await user.click(
      screen.getByRole("button", { name: "Fechar configurações" }),
    );
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const retention = screen.getByLabelText(t("pt-BR", "retention"));
    retention.focus();
    fireEvent.change(retention, { target: { value: "27" } });
    await act(async () =>
      resolve({
        ...data,
        revision: 2,
        preferences: { ...data.preferences, theme: "dark" },
      }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(retention).toHaveValue(27);
    expect(retention).toHaveFocus();
    expect(document.documentElement.dataset.theme).toBe("dark");
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
  it("starts drag only for primary pointer gestures, including pen and touch", () => {
    const data = fixture();
    data.preferences.collapsed = true;
    render(<App initialView={data} />);
    const drop = screen.getByRole("button", { name: "Abrir Scribe" });
    drop.setPointerCapture = vi.fn();
    vi.mocked(bridge.drag).mockResolvedValue();

    fireEvent.pointerDown(drop, {
      button: 0,
      isPrimary: false,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(drop, {
      isPrimary: false,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 10,
    });
    expect(bridge.drag).not.toHaveBeenCalled();

    for (const [pointerId, pointerType] of [
      [2, "mouse"],
      [3, "pen"],
      [4, "touch"],
    ] as const) {
      fireEvent.pointerDown(drop, {
        button: 0,
        isPrimary: true,
        pointerId,
        pointerType,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(drop, {
        isPrimary: true,
        pointerId,
        pointerType,
        clientX: 20,
        clientY: 10,
      });
      expect(bridge.drag).toHaveBeenCalledTimes(pointerId - 1);
      fireEvent.pointerUp(drop, { isPrimary: true, pointerId, pointerType });
    }
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
  it("focuses pending notification decisions without activating them", async () => {
    const user = userEvent.setup();
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    data.decisions = [pendingDecision("pending-notification")];
    const { container } = render(<App initialView={data} />);
    await waitFor(() => expect(receive).toBeDefined());
    const focusTarget = container.querySelector<HTMLDivElement>(
      ".decision-focus-target",
    )!;
    const scrollIntoView = vi.fn();
    focusTarget.scrollIntoView = scrollIntoView;

    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const firstLanguage = screen.getByLabelText(t("pt-BR", "language"));
    firstLanguage.focus();
    act(() =>
      receive!({
        ...data,
        revision: 2,
        notificationDecisionId: "pending-notification",
      }),
    );
    await waitFor(() => expect(focusTarget).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(bridge.resolveDecision).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const language = screen.getByLabelText(t("pt-BR", "language"));
    language.focus();
    act(() =>
      receive!({
        ...data,
        revision: 3,
        decisions: data.decisions,
      }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(language).toHaveFocus();

    act(() =>
      receive!({
        ...data,
        revision: 4,
        notificationDecisionId: "pending-notification",
      }),
    );
    await waitFor(() => expect(focusTarget).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bridge.resolveDecision).not.toHaveBeenCalled();
  });
  it("ignores a stale notification decision ID without moving focus or closing settings", async () => {
    const user = userEvent.setup();
    let receive: ((value: View) => void) | undefined;
    vi.mocked(bridge.observe).mockImplementation(async (callback) => {
      receive = callback;
      return () => {};
    });
    const data = fixture();
    data.decisions = [pendingDecision("different-pending-decision")];
    const { container } = render(<App initialView={data} />);
    await waitFor(() => expect(receive).toBeDefined());
    const focusTarget = container.querySelector<HTMLDivElement>(
      ".decision-focus-target",
    )!;
    await user.click(screen.getByRole("button", { name: "Configurações" }));
    const language = screen.getByLabelText(t("pt-BR", "language"));
    language.focus();

    act(() =>
      receive!({
        ...data,
        revision: 2,
        notificationDecisionId: "stale-decision",
      }),
    );

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(language).toHaveFocus();
    expect(focusTarget).not.toHaveFocus();
    expect(bridge.resolveDecision).not.toHaveBeenCalled();
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
