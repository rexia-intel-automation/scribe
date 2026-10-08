import en from "./en.json";
import pt from "./pt-BR.json";
export type Language = "en" | "pt-BR";
export type Message = keyof typeof en;
const messages = { en, "pt-BR": pt };
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
