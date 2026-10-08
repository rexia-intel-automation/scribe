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
function nativeQuestionFixture(): Decision {
  return {
    ...fixture(),
    kind: "nativeQuestion",
    question: null,
    nativeQuestions: [
      {
        header: "Runtime",
        question: "Which runtime should this use?",
        options: [
          { label: "Node", description: "Use the Node runtime." },
          { label: "Bun", description: "Use the Bun runtime." },
        ],
        multiSelect: false,
      },
      {
        header: "Checks",
        question: "Which checks should run?",
        options: [
          { label: "Lint", description: "Check formatting and rules." },
          { label: "Tests", description: "Run the project tests." },
        ],
        multiSelect: true,
      },
    ],
  };
}
function planFixture(canAllow = true): Decision {
  return {
    ...fixture(),
    kind: "plan",
    tool: null,
    question: null,
    target: "# Plan\n\nReview <img src=x onerror=alert(1)> as text.",
    planFilePath: "C:\\work\\plan.md",
    canAllow,
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
  it("collects answers for every native question without preselecting an option", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DecisionCard
        decision={nativeQuestionFixture()}
        language="pt-BR"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    const send = screen.getByRole("button", { name: "Enviar respostas" });
    expect(send).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Node/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Lint/ })).not.toBeChecked();
    expect(screen.getByText("Use the Node runtime.")).toBeVisible();
    expect(
      (
        await axe.run(container, {
          rules: { "color-contrast": { enabled: false } },
        })
      ).violations,
    ).toEqual([]);

    await user.click(screen.getByRole("radio", { name: /Node/ }));
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Tests/ }));
    expect(send).toBeEnabled();
    await user.click(send);

    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "answer",
      answers: [{ options: [0] }, { options: [1] }],
    });
  });
  it("submits explicit native free text as text without selected option indexes", async () => {
    const user = userEvent.setup();
    render(
      <DecisionCard
        decision={{
          ...nativeQuestionFixture(),
          nativeQuestions: [nativeQuestionFixture().nativeQuestions![0]],
        }}
        language="en"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Send answers" })).toBeDisabled();
    await user.click(
      screen.getByRole("radio", { name: "Answer in your own words" }),
    );
    const answer = screen.getByRole("textbox", { name: "Your answer" });
    expect(answer).toHaveAttribute("maxLength", "200");
    await user.type(answer, "Use Deno");
    await user.click(screen.getByRole("button", { name: "Send answers" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "answer",
      answers: [{ options: [], text: "Use Deno" }],
    });
  });
  it("keeps a multi-select free answer exclusive from option indexes", async () => {
    const user = userEvent.setup();
    render(
      <DecisionCard
        decision={nativeQuestionFixture()}
        language="en"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /Node/ }));
    await user.click(screen.getByRole("checkbox", { name: /Tests/ }));
    await user.click(
      screen.getAllByRole("checkbox", {
        name: "Answer in your own words",
      })[0],
    );
    expect(screen.getByRole("checkbox", { name: /Tests/ })).not.toBeChecked();
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "Run smoke tests",
    );
    await user.click(screen.getByRole("button", { name: "Send answers" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "answer",
      answers: [{ options: [0] }, { options: [], text: "Run smoke tests" }],
    });
  });
  it("lets either question switch from free text to an option and drops the text", async () => {
    const user = userEvent.setup();
    render(
      <DecisionCard
        decision={nativeQuestionFixture()}
        language="en"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    await user.click(
      screen.getAllByRole("radio", { name: "Answer in your own words" })[0],
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "Custom runtime",
    );
    await user.click(screen.getByRole("radio", { name: /Bun/ }));
    expect(screen.queryByRole("textbox", { name: "Your answer" })).toBeNull();

    await user.click(
      screen.getByRole("checkbox", { name: "Answer in your own words" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "Run security checks",
    );
    await user.click(screen.getByRole("checkbox", { name: /Lint/ }));
    expect(screen.queryByRole("textbox", { name: "Your answer" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Send answers" }));

    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "answer",
      answers: [{ options: [1] }, { options: [0] }],
    });
  });
  it("resets native answers when the decision ID changes", async () => {
    const user = userEvent.setup();
    const props = {
      language: "en" as const,
      now,
      receive: vi.fn(),
      fail: vi.fn(),
    };
    const first = nativeQuestionFixture();
    const { rerender } = render(<DecisionCard {...props} decision={first} />);
    await user.click(screen.getByRole("radio", { name: /Node/ }));
    rerender(
      <DecisionCard
        {...props}
        decision={{ ...nativeQuestionFixture(), id: "another-decision" }}
      />,
    );
    expect(screen.getByRole("radio", { name: /Node/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Send answers" })).toBeDisabled();
  });
  it("does not send native answers when canAllow is false", async () => {
    const user = userEvent.setup();
    render(
      <DecisionCard
        decision={{ ...nativeQuestionFixture(), canAllow: false }}
        language="en"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /Node/ }));
    await user.click(screen.getByRole("checkbox", { name: /Tests/ }));
    expect(screen.getByRole("button", { name: "Send answers" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Answer in terminal" }),
    );
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "terminal",
    });
  });
  it("renders a plan as inert text and requires a separate timed approval", async () => {
    const user = userEvent.setup();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { container, rerender } = render(
      <DecisionCard
        decision={planFixture()}
        language="pt-BR"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    expect(screen.getByText(/C:\\work\\plan\.md/)).toBeVisible();
    expect(screen.getByText(/Review <img src=x/)).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText(/Sair do modo de planejamento pode restaurar/),
    ).toBeVisible();
    const feedback = screen.getByRole("textbox", {
      name: "Sugestão para o plano (opcional)",
    });
    expect(feedback).toHaveAttribute("maxLength", "200");
    await user.type(feedback, "Add a validation step");
    fireEvent.keyDown(container.querySelector("article")!, { key: "a" });
    expect(bridge.resolveDecision).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Aprovar plano" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "arm",
    });
    const decision = { ...planFixture(), armed: true };
    rerender(
      <DecisionCard
        decision={decision}
        language="pt-BR"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Aprovar plano" }),
    ).toBeDisabled();
    const confirm = screen.getByRole("button", { name: "Confirmar plano" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm, { detail: 2 });
    expect(bridge.resolveDecision).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(confirm).toBeEnabled(), { timeout: 1500 });
    fireEvent.click(confirm, { detail: 2 });
    expect(bridge.resolveDecision).toHaveBeenCalledTimes(1);
    await user.click(confirm);
    expect(bridge.resolveDecision).toHaveBeenLastCalledWith("public", {
      action: "allow",
    });
  });
  it("hides plan approval when canAllow is false", async () => {
    const user = userEvent.setup();
    render(
      <DecisionCard
        decision={planFixture(false)}
        language="en"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Approve plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm plan" })).toBeNull();
    await user.type(
      screen.getByRole("textbox", { name: "Feedback for the plan (optional)" }),
      "Add a rollback step",
    );
    expect(
      screen.getByRole("button", { name: "Continue in terminal" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue planning" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "deny",
      message: "Add a rollback step",
    });
    await user.click(
      screen.getByRole("button", { name: "Continue in terminal" }),
    );
    expect(bridge.resolveDecision).toHaveBeenLastCalledWith("public", {
      action: "terminal",
    });
  });
  it("omits plan feedback when the continue-planning text is blank", async () => {
    const user = userEvent.setup();
    render(
      <DecisionCard
        decision={planFixture()}
        language="en"
        now={now}
        receive={vi.fn()}
        fail={vi.fn()}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Feedback for the plan (optional)" }),
      "   ",
    );
    await user.click(screen.getByRole("button", { name: "Continue planning" }));
    expect(bridge.resolveDecision).toHaveBeenCalledWith("public", {
      action: "deny",
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
