import { useEffect, useId, useRef, useState } from "react";
import { decisionText, t, type Language } from "./i18n";
import type { Decision, DecisionInput, View } from "./types";
import * as bridge from "./bridge";

interface NativeAnswerDraft {
  options: number[];
  freeAnswer: boolean;
  text: string;
}

interface DecisionCardProps {
  decision: Decision;
  language: Language;
  now: number;
  receive: (view: View) => void;
  fail: (error: unknown) => void;
}

const emptyNativeAnswer = (): NativeAnswerDraft => ({
  options: [],
  freeAnswer: false,
  text: "",
});

export function DecisionCard(props: DecisionCardProps) {
  return <DecisionCardContent key={props.decision.id} {...props} />;
}

function DecisionCardContent({
  decision,
  language,
  now,
  receive,
  fail,
}: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const [nativeAnswers, setNativeAnswers] = useState<NativeAnswerDraft[]>([]);
  const [planFeedback, setPlanFeedback] = useState("");
  const controlId = useId();
  const canAllow = decision.canAllow !== false;
  useEffect(() => {
    setConfirmReady(false);
    if (
      (decision.kind !== "permission" && decision.kind !== "plan") ||
      !decision.armed
    )
      return;
    const timer = window.setTimeout(() => setConfirmReady(true), 1000);
    return () => window.clearTimeout(timer);
  }, [decision.id, decision.armed, decision.kind]);
  const pending = decision.status === "pending" && now < decision.expiresAt;
  const nativeQuestions =
    decision.kind === "nativeQuestion" &&
    Array.isArray(decision.nativeQuestions)
      ? decision.nativeQuestions
      : [];
  const nativeQuestionsValid =
    nativeQuestions.length >= 1 &&
    nativeQuestions.length <= 4 &&
    nativeQuestions.every(
      (question) =>
        question !== null &&
        typeof question === "object" &&
        typeof question.question === "string" &&
        typeof question.header === "string" &&
        typeof question.multiSelect === "boolean" &&
        Array.isArray(question.options) &&
        question.options.length >= 2 &&
        question.options.length <= 4 &&
        question.options.every(
          (option) =>
            option !== null &&
            typeof option === "object" &&
            typeof option.label === "string" &&
            typeof option.description === "string",
        ),
    );
  function updateNativeAnswer(
    questionIndex: number,
    update: (answer: NativeAnswerDraft) => NativeAnswerDraft,
  ) {
    setNativeAnswers((current) => {
      const answers = [...current];
      answers[questionIndex] = update(
        answers[questionIndex] ?? emptyNativeAnswer(),
      );
      return answers;
    });
  }

  const nativeAnswersComplete =
    nativeQuestionsValid &&
    nativeQuestions.every((question, index) => {
      const answer = nativeAnswers[index] ?? emptyNativeAnswer();
      if (answer.freeAnswer) {
        return answer.options.length === 0 && answer.text.trim().length > 0;
      }
      return (
        answer.text.length === 0 &&
        answer.options.length > 0 &&
        (question.multiSelect || answer.options.length === 1) &&
        answer.options.every(
          (option) => option >= 0 && option < question.options.length,
        )
      );
    });

  async function choose(input: DecisionInput, clearNativeAnswers = false) {
    if (!pending || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      receive(await bridge.resolveDecision(decision.id, input));
      if (clearNativeAnswers) {
        setNativeAnswers([]);
      }
      if (decision.kind === "plan") setPlanFeedback("");
    } catch (error) {
      fail(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function submitNativeAnswers() {
    if (!nativeQuestionsValid || !nativeAnswersComplete) return;
    const answers = nativeQuestions.map((question, index) => {
      const answer = nativeAnswers[index] ?? emptyNativeAnswer();
      if (answer.freeAnswer) {
        return { options: [], text: answer.text.trim() };
      }
      return { options: [...answer.options] };
    });
    void choose({ action: "answer", answers }, true);
  }

  const description =
    decision.kind === "permission"
      ? (decision.tool ?? decision.question ?? "")
      : decision.kind === "plan"
        ? decisionText(language, "plan")
        : decision.kind === "nativeQuestion"
          ? decisionText(language, "nativeQuestion")
          : (decision.question ?? "");

  return (
    <article
      className="decision"
      aria-label={`${decision.project}: ${description}`}
      onKeyDown={(event) => {
        if (
          !document.hasFocus() ||
          event.repeat ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(
            (event.target as HTMLElement).tagName,
          )
        )
          return;
        if (event.key === "Escape") {
          setExpanded(false);
          return;
        }
        if (!pending || decision.kind !== "permission") return;
        if (event.key.toLowerCase() === "d") {
          event.preventDefault();
          void choose({ action: "deny" });
        }
        if (event.key.toLowerCase() === "a" && canAllow && !decision.risk) {
          event.preventDefault();
          void choose({ action: "allow" });
        }
      }}
    >
      <div className="decision-heading">
        <strong>{decision.project}</strong>
        <time>
          {t(language, "second", {
            count: Math.max(0, Math.floor((now - decision.createdAt) / 1000)),
          })}
        </time>
      </div>
      {decision.kind === "permission" ? (
        <>
          <p>{decision.tool}</p>
          <button
            className="decision-target"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {decision.target}
          </button>
          {expanded && <pre className="decision-full">{decision.target}</pre>}
          {decision.risk && (
            <p className="risk-warning" role="note">
              {t(language, "riskWarning")}
            </p>
          )}
          {!canAllow && <p role="note">{t(language, "hiddenTarget")}</p>}
        </>
      ) : decision.kind === "plan" ? (
        <section
          className="decision-plan"
          aria-label={decisionText(language, "plan")}
        >
          <p className="decision-plan-title">
            {decisionText(language, "plan")}
          </p>
          {decision.planFilePath && (
            <p className="decision-plan-path">
              {decisionText(language, "planPath", {
                path: decision.planFilePath,
              })}
            </p>
          )}
          <pre className="decision-plan-body">{decision.target}</pre>
          {canAllow && (
            <p className="risk-warning" role="note">
              {decisionText(language, "planRiskWarning")}
            </p>
          )}
          {pending && (
            <div className="native-answer-wrap">
              <label htmlFor={`${controlId}-plan-feedback`}>
                {decisionText(language, "planFeedback")}
              </label>
              <textarea
                id={`${controlId}-plan-feedback`}
                maxLength={200}
                value={planFeedback}
                disabled={busy}
                placeholder={decisionText(language, "planFeedbackPlaceholder")}
                onChange={(event) => setPlanFeedback(event.target.value)}
              />
            </div>
          )}
        </section>
      ) : decision.kind === "nativeQuestion" ? (
        <section
          className="native-questions"
          aria-label={decisionText(language, "nativeQuestion")}
        >
          {nativeQuestionsValid ? (
            nativeQuestions.map((question, questionIndex) => {
              const answer =
                nativeAnswers[questionIndex] ?? emptyNativeAnswer();
              const fieldsetId = `${controlId}-question-${questionIndex}`;
              return (
                <fieldset
                  className="native-question"
                  key={questionIndex}
                  disabled={busy || !pending}
                  aria-describedby={`${fieldsetId}-prompt ${fieldsetId}-instruction`}
                >
                  <legend>
                    {question.header ||
                      decisionText(language, "nativeQuestionFallback", {
                        number: questionIndex + 1,
                      })}
                  </legend>
                  <p
                    className="native-question-prompt"
                    id={`${fieldsetId}-prompt`}
                  >
                    {question.question}
                  </p>
                  <p
                    className="native-question-instruction"
                    id={`${fieldsetId}-instruction`}
                  >
                    {decisionText(
                      language,
                      question.multiSelect
                        ? "nativeChooseMany"
                        : "nativeChooseOne",
                    )}
                  </p>
                  <div className="native-options">
                    {question.options.map((option, optionIndex) => {
                      const inputId = `${fieldsetId}-option-${optionIndex}`;
                      const descriptionId = `${inputId}-description`;
                      const selected = answer.options.includes(optionIndex);
                      return (
                        <label
                          className="native-option"
                          key={optionIndex}
                          htmlFor={inputId}
                        >
                          <input
                            id={inputId}
                            type={question.multiSelect ? "checkbox" : "radio"}
                            name={fieldsetId}
                            value={optionIndex}
                            checked={selected}
                            aria-label={option.label}
                            aria-describedby={descriptionId}
                            onChange={(event) => {
                              updateNativeAnswer(questionIndex, (current) => {
                                if (!question.multiSelect) {
                                  return {
                                    options: [optionIndex],
                                    freeAnswer: false,
                                    text: "",
                                  };
                                }
                                const options = event.target.checked
                                  ? [...current.options, optionIndex]
                                  : current.options.filter(
                                      (index) => index !== optionIndex,
                                    );
                                return { options, freeAnswer: false, text: "" };
                              });
                            }}
                          />
                          <span>
                            <span className="native-option-label">
                              {option.label}
                            </span>
                            <span
                              className="native-option-description"
                              id={descriptionId}
                            >
                              {option.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    <label className="native-option native-free-answer">
                      <input
                        type={question.multiSelect ? "checkbox" : "radio"}
                        name={fieldsetId}
                        value="free"
                        checked={answer.freeAnswer}
                        onChange={(event) => {
                          updateNativeAnswer(questionIndex, (current) => ({
                            options: [],
                            freeAnswer: event.target.checked,
                            text: event.target.checked ? current.text : "",
                          }));
                        }}
                      />
                      <span>{decisionText(language, "nativeFreeAnswer")}</span>
                    </label>
                  </div>
                  {answer.freeAnswer && (
                    <div className="native-answer-wrap">
                      <label htmlFor={`${fieldsetId}-answer`}>
                        {decisionText(language, "nativeAnswerLabel")}
                      </label>
                      <textarea
                        id={`${fieldsetId}-answer`}
                        maxLength={200}
                        value={answer.text}
                        placeholder={decisionText(
                          language,
                          "nativeAnswerPlaceholder",
                        )}
                        onChange={(event) =>
                          updateNativeAnswer(questionIndex, (current) => ({
                            ...current,
                            text: event.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </fieldset>
              );
            })
          ) : (
            <p className="native-question-error" role="alert">
              {decisionText(language, "nativeQuestionUnavailable")}
            </p>
          )}
        </section>
      ) : (
        <p>{decision.question}</p>
      )}
      {pending ? (
        <div className="decision-actions">
          {decision.kind === "permission" ? (
            <>
              <button
                className="allow-decision"
                disabled={busy || !canAllow || decision.armed}
                onClick={(event) => {
                  if (event.detail > 1) return;
                  void choose({ action: decision.risk ? "arm" : "allow" });
                }}
              >
                {t(language, "allowOnce")}
              </button>
              {!canAllow && (
                <button
                  disabled={busy}
                  onClick={() => void choose({ action: "terminal" })}
                >
                  {t(language, "answerInTerminal")}
                </button>
              )}
              {canAllow && decision.risk && decision.armed && (
                <button
                  className="confirm-decision"
                  disabled={busy || !confirmReady}
                  onClick={(event) => {
                    if (event.detail > 1) return;
                    void choose({ action: "allow" });
                  }}
                >
                  {t(language, "confirmAllow")}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => void choose({ action: "deny" })}
              >
                {t(language, "deny")}
              </button>
            </>
          ) : decision.kind === "question" ? (
            decision.options.map((option, index) => (
              <button
                key={index}
                disabled={busy}
                onClick={() => void choose({ option: index })}
              >
                {option}
              </button>
            ))
          ) : decision.kind === "nativeQuestion" ? (
            <>
              <button
                disabled={busy}
                onClick={() => void choose({ action: "terminal" })}
              >
                {t(language, "answerInTerminal")}
              </button>
              <button
                className="allow-decision"
                disabled={busy || !canAllow || !nativeAnswersComplete}
                onClick={submitNativeAnswers}
              >
                {decisionText(language, "nativeSend")}
              </button>
            </>
          ) : (
            <>
              {canAllow && (
                <button
                  className="allow-decision"
                  disabled={busy || decision.armed}
                  onClick={(event) => {
                    if (event.detail > 1) return;
                    void choose({ action: "arm" });
                  }}
                >
                  {decisionText(language, "planApprove")}
                </button>
              )}
              {canAllow && decision.armed && (
                <button
                  className="confirm-decision"
                  disabled={busy || !confirmReady}
                  onClick={(event) => {
                    if (event.detail > 1) return;
                    void choose({ action: "allow" });
                  }}
                >
                  {decisionText(language, "planConfirm")}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  const message = planFeedback.trim();
                  void choose({
                    action: "deny",
                    ...(message ? { message } : {}),
                  });
                }}
              >
                {decisionText(language, "planContinue")}
              </button>
              <button
                disabled={busy}
                onClick={() => void choose({ action: "terminal" })}
              >
                {decisionText(language, "planTerminal")}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="decision-status" role="status">
          {t(
            language,
            decision.status === "pending" ? "expired" : decision.status,
          )}
        </p>
      )}
    </article>
  );
}
