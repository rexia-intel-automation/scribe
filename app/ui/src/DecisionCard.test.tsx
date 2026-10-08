import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DecisionCard } from "./DecisionCard";
import * as bridge from "./bridge";
import type { Decision } from "./types";
import axe from "axe-core";
vi.mock("./bridge", async () => ({
  ...(await vi.importActual<typeof import("./bridge")>("./bridge")),
  resolveDecision: vi.fn(),
}));
const now = Date.now();
function fixture(): Decision {
  return {
    id: "public",
    sessionId: "one",
    project: "public-project",
    kind: "permission",
    tool: "Bash",
    target: "echo public",
    question: null,
    options: [],
    risk: false,
    armed: false,
    status: "pending",
    createdAt: now,
    expiresAt: now + 120000,
    resolvedAt: null,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(bridge.resolveDecision).mockResolvedValue(bridge.initial);
});
describe("human decision card", () => {
  it("sends allow and deny through the desktop bridge", async () => {
    const user = userEvent.setup();
    const receive = vi.fn();
    render(
      <DecisionCard
        decision={fixture()}
        language="pt-BR"
        now={now}
        receive={receive}
        fail={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Permitir uma vez" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "allow",
    });
    await user.click(screen.getByRole("button", { name: "Negar" }));
    expect(bridge.resolveDecision).toHaveBeenLastCalledWith("public", {
      action: "deny",
    });
    expect(receive).toHaveBeenCalled();
  });
  it("arms a risk separately and disables the allow shortcut", async () => {
    const user = userEvent.setup();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const props = {
      language: "pt-BR" as const,
      now,
      receive: vi.fn(),
      fail: vi.fn(),
    };
    const decision = { ...fixture(), risk: true };
    const { rerender } = render(
      <DecisionCard {...props} decision={decision} />,
    );
    const button = screen.getByRole("button", { name: "Permitir uma vez" });
    fireEvent.keyDown(button, { key: "a" });
    expect(bridge.resolveDecision).not.toHaveBeenCalled();
    await user.click(button);
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "arm",
    });
    rerender(
      <DecisionCard {...props} decision={{ ...decision, armed: true }} />,
    );
    const confirm = screen.getByRole("button", {
      name: "Confirmar permissão",
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm, { detail: 2 });
    expect(bridge.resolveDecision).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(confirm).toBeEnabled(), { timeout: 1500 });
    fireEvent.click(confirm, { detail: 2 });
    expect(bridge.resolveDecision).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Confirmar permissão" }),
    );
    expect(bridge.resolveDecision).toHaveBeenLastCalledWith("public", {
      action: "allow",
    });
  });
  it("requires the terminal when the target is hidden and blocks the allow shortcut", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    render(
      <DecisionCard
        decision={{ ...fixture(), canAllow: false, risk: true }}
        language="pt-BR"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Permitir uma vez" }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("button", { name: "Negar" }), {
      key: "a",
    });
    expect(bridge.resolveDecision).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Responda a este pedido no terminal/),
    ).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Responder no terminal" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "terminal",
    });
  });
  it("does not act without focus or after expiration", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const props = {
      language: "pt-BR" as const,
      now,
      receive: vi.fn(),
      fail: vi.fn(),
    };
    const { rerender } = render(
      <DecisionCard {...props} decision={fixture()} />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Negar" }), {
      key: "d",
    });
    expect(bridge.resolveDecision).not.toHaveBeenCalled();
    rerender(
      <DecisionCard {...props} now={now + 120001} decision={fixture()} />,
    );
    expect(
      screen.queryByRole("button", { name: "Permitir uma vez" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Expirou");
  });
  it("returns the selected question index and exposes accessible controls", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DecisionCard
        decision={{
          ...fixture(),
          kind: "question",
          question: "Qual opção?",
          options: ["A", "B"],
        }}
        language="pt-BR"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    expect(
      (
        await axe.run(container, {
          rules: { "color-contrast": { enabled: false } },
        })
      ).violations,
    ).toEqual([]);
    await user.click(screen.getByRole("button", { name: "B" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      option: 1,
    });
  });
  it("prevents repeated submissions and reports bridge failure", async () => {
    let reject!: (error: unknown) => void;
    vi.mocked(bridge.resolveDecision).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const fail = vi.fn();
    render(
      <DecisionCard
        decision={fixture()}
        language="pt-BR"
        now={now}
        receive={vi.fn()}
        fail={fail}
      />,
    );
    const button = screen.getByRole("button", { name: "Negar" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(bridge.resolveDecision).toHaveBeenCalledTimes(1);
    reject("decisionUnavailable");
    await waitFor(() =>
      expect(fail).toHaveBeenCalledWith("decisionUnavailable"),
    );
  });
});
