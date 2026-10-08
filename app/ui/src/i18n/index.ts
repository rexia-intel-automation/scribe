import en from "./en.json";
import pt from "./pt-BR.json";
export type Language = "en" | "pt-BR";
export type Message = keyof typeof en;
const messages = { en, "pt-BR": pt };
const decisionMessages = {
  en: {
    nativeQuestion: "Claude Code question",
    nativeQuestionFallback: "Question {number}",
    nativeQuestionUnavailable:
      "This question cannot be shown. Continue in the terminal.",
    nativeChooseOne: "Choose one option or answer in your own words.",
    nativeChooseMany:
      "Choose one or more options, or answer in your own words.",
    nativeFreeAnswer: "Answer in your own words",
    nativeAnswerLabel: "Your answer",
    nativeAnswerPlaceholder: "Enter your answer (up to 200 characters)",
    nativeSend: "Send answers",
    plan: "Plan",
    planPath: "Plan file: {path}",
    planApprove: "Approve plan",
    planContinue: "Continue planning",
    planFeedback: "Feedback for the plan (optional)",
    planFeedbackPlaceholder:
      "Explain what should change (up to 200 characters)",
    planTerminal: "Continue in terminal",
  },
  "pt-BR": {
    nativeQuestion: "Pergunta do Claude Code",
    nativeQuestionFallback: "Pergunta {number}",
    nativeQuestionUnavailable:
      "Não foi possível mostrar esta pergunta. Continue no terminal.",
    nativeChooseOne: "Escolha uma opção ou escreva sua própria resposta.",
    nativeChooseMany:
      "Escolha uma ou mais opções ou escreva sua própria resposta.",
    nativeFreeAnswer: "Responder com minhas palavras",
    nativeAnswerLabel: "Sua resposta",
    nativeAnswerPlaceholder: "Escreva sua resposta (até 200 caracteres)",
    nativeSend: "Enviar respostas",
    plan: "Plano",
    planPath: "Arquivo do plano: {path}",
    planApprove: "Aprovar plano",
    planContinue: "Continuar planejando",
    planFeedback: "Sugestão para o plano (opcional)",
    planFeedbackPlaceholder: "Explique o que deve mudar (até 200 caracteres)",
    planTerminal: "Continuar no terminal",
  },
} as const;
export type DecisionMessage = keyof (typeof decisionMessages)["en"];
export function decisionText(
  language: Language,
  key: DecisionMessage,
  values: Record<string, string | number> = {},
) {
  return decisionMessages[language][key].replace(
    /\{(\w+)\}/g,
    (_, name: string) => String(values[name] ?? ""),
  );
}
export function t(
  language: Language,
  key: Message,
  values: Record<string, string | number> = {},
) {
  return (
    messages[language][key] ?? messages[language].bridgeUnavailable
  ).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
export function action(text: string, language: Language) {
  const exact: [Message, Message][] = [
    ["actionStartSource", "initialAction"],
    ["actionThinkingSource", "thinkingAction"],
    ["actionTurnSource", "turnAction"],
    ["actionDoneSource", "doneAction"],
    ["actionRestartSource", "restartAction"],
    ["actionPermissionSource", "permissionAction"],
    ["actionWaitingSource", "waitingAction"],
  ];
  for (const [source, target] of exact)
    if (text === t(language, source)) return t(language, target);
  const rules: [Message, Message, string][] = [
    ["actionEditingPattern", "editingAction", "value"],
    ["actionFailedPattern", "failedAction", "value"],
    ["actionToolDonePattern", "toolDoneAction", "value"],
    ["actionAgentsPattern", "agentsAction", "count"],
    ["actionQuietPattern", "noNews", "count"],
  ];
  for (const [pattern, target, key] of rules) {
    const match = new RegExp(t(language, pattern)).exec(text);
    if (match) return t(language, target, { [key]: match[1] });
  }
  return text;
}
