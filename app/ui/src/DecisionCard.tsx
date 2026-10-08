import { useEffect, useRef, useState } from "react";
import { t, type Language } from "./i18n";
import type { Decision, DecisionInput, View } from "./types";
import * as bridge from "./bridge";

export function DecisionCard({
  decision,
  language,
  now,
  receive,
  fail,
}: {
  decision: Decision;
  language: Language;
  now: number;
  receive: (view: View) => void;
  fail: (error: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const canAllow = decision.canAllow !== false;
  useEffect(() => {
    setConfirmReady(false);
    if (!decision.armed) return;
    const timer = window.setTimeout(() => setConfirmReady(true), 1000);
    return () => window.clearTimeout(timer);
  }, [decision.id, decision.armed]);
  const pending = decision.status === "pending" && now < decision.expiresAt;
  async function choose(input: DecisionInput) {
    if (!pending || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      receive(await bridge.resolveDecision(decision.id, input));
    } catch (error) {
      fail(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <article
      className="decision"
      aria-label={`${decision.project}: ${decision.tool ?? decision.question}`}
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
          ) : (
            decision.options.map((option, index) => (
              <button
                key={index}
                disabled={busy}
                onClick={() => void choose({ option: index })}
              >
                {option}
              </button>
            ))
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
