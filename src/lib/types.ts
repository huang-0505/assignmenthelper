export type Category = "ML" | "AI/LLM" | "SQL" | "Python" | "Project";
export type Role = "player" | "referee";
export type Question = {
  id: string;
  category: Category | "BQ";
  difficulty: "Easy" | "Medium" | "Hard";
  prompt: string;
  rubric: string[];
  schema?: string;
  expectedQuery?: string;
};
export type Project = {
  id: string;
  title: string;
  summary: string;
  role: string;
  methods: string;
  metrics: string;
};
export type Settings = {
  timezone: "America/New_York";
  closeHour: number;
  applications: number;
  contacts: number;
  bonusApplications: number;
  bonusContacts: number;
  basePoints: number;
  bonusPoints: number;
  penaltyAmount: number;
  penaltyThreshold: number;
  schedule: (Category | "Alternate")[];
  rewards: { streak: number; text: string }[];
};
export type Grade = {
  score: number | null;
  missing: string[];
  tip: string;
  model: string | null;
  status: "graded" | "pending";
};
export type Answer = {
  id: string;
  text: string;
  submittedAt: string;
  grade: Grade;
  override?: { score: number; reason: string; at: string; by: string };
};
export type BqTask = {
  questionId: string;
  stage: 1 | 2;
  text: string;
  practiced: boolean;
  completedAt?: string;
};
export type Day = {
  date: string;
  closesAt: string;
  settings: Settings;
  applications: number;
  contacts: number;
  logs: {
    id: string;
    kind: "application" | "contact";
    count: number;
    company: string;
    link: string;
    at: string;
  }[];
  question: Question | null;
  answers: Answer[];
  bq: BqTask | null;
  retell?: { questionId: string; practiced: boolean; text: string };
};
export type Audit = {
  id: string;
  at: string;
  actor: string;
  action: string;
  date?: string;
  detail: string;
};
export type GameState = {
  version: 1;
  startedOn: string;
  settings: Settings;
  nextSettings?: Settings;
  days: Record<string, Day>;
  projects: Project[];
  redemptions: { id: string; at: string; amount: number }[];
  audit: Audit[];
};
export type DayStatus =
  "open" | "met" | "gold" | "missed" | "frozen" | "pending" | "waiting";
export type EvaluatedDay = {
  date: string;
  status: DayStatus;
  points: number;
  streak: number;
  freezes: number;
  penalty: number;
  completed: number;
  required: number;
};
export type Summary = {
  days: EvaluatedDay[];
  streak: number;
  bestStreak: number;
  points: number;
  freezes: number;
  pool: number;
  rewards: { id: string; date: string; streak: number; text: string }[];
  bqCompleted: number;
};
export type Snapshot = {
  mode: "demo" | "live";
  role: Role;
  name: string;
  state: GameState;
  summary: Summary;
  today: string;
  serverTime: string;
};
