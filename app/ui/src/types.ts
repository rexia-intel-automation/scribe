import type { Language } from "./i18n";
export const forms = [
  "respingo",
  "gota",
  "orbita",
  "pena",
  "interrogacao",
  "mancha",
  "ampulheta",
  "divisao",
  "selo",
  "ponto",
] as const;
export type Form = (typeof forms)[number];
export interface Step {
  at: number;
  tool: string | null;
  summary: string;
  ok: boolean | null;
}
export interface Session {
  id: string;
  project: string;
  cwd: string;
  origin: string | null;
  state: Exclude<Form, "ponto">;
  action: string;
  startedAt: number;
  lastEventAt: number;
  endedAt: number | null;
  steps: Step[];
}
export interface Preferences {
  language: Language;
  theme: "light" | "dark" | "auto";
  shortcut: string;
  notifications: boolean;
  retentionDays: number;
  completedMinutes: number;
  port: number;
  collapsed: boolean;
  side: "left" | "right";
  y: number | null;
  monitor: string | null;
}
export interface View {
  at: number;
  sessions: Session[];
  preferences: Preferences;
  error: string | null;
}
const priorities: Record<Form, number> = {
  interrogacao: 5,
  mancha: 4,
  pena: 3,
  orbita: 3,
  divisao: 3,
  ampulheta: 2,
  gota: 1,
  respingo: 1,
  selo: 1,
  ponto: 0,
};
export function priority(sessions: Session[]): Form {
  return sessions.reduce<Form>(
    (best, s) => (priorities[s.state] > priorities[best] ? s.state : best),
    "ponto",
  );
}
