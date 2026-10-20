import type { CoachMood, StudyRules } from "./study";
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
/** Which daily tasks the streak needs. The others only earn points. */
export type CoreTasks = {
  applications: boolean;
  contacts: boolean;
  interview: boolean;
  bq: boolean;
  episodes: boolean;
};
export type TaskKey = keyof CoreTasks;
export type Settings = {
  timezone: "America/New_York";
  closeHour: number;
  applications: number;
  contacts: number;
  /** Missing on snapshots from before the split, when every task was required. */
  core?: CoreTasks;
  /** Weekly outreach targets; reaching one earns bonusPoints once that week. 0 = none. */
  weeklyApplications?: number;
  weeklyContacts?: number;
  /** English listening: watch exactly this many TV episodes a day. 0 or missing = not required. */
  episodes?: number;
  /** Interview questions a day. Missing on days from before there were several: one. */
  questions?: number;
  bonusApplications: number;
  bonusContacts: number;
  basePoints: number;
  bonusPoints: number;
  penaltyAmount: number;
  penaltyThreshold: number;
  schedule: (Category | "Alternate")[];
  /** Each weekday's question categories, Sunday first, one per question. Missing: all from `schedule`. */
  mix?: (Category | "Alternate")[][];
  rewards: { streak: number; text: string }[];
  /** Optional Study Mode; missing on snapshots saved before it existed. */
  study?: StudyRules;
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
/** One interview question of the day and her attempts at it. */
export type InterviewItem = {
  question: Question;
  answers: Answer[];
  /** Set when this is a weak answer from that earlier question, back for a second try. */
  retryOf?: string;
};
export type VocabMark = "know" | "learn";
/** One day's words: earlier words she was still learning, back for review, then new ones. */
export type VocabDay = {
  review: string[];
  fresh: string[];
  /** Her answer for each word she went through: knows it already, or is still learning it. */
  marks: Record<string, VocabMark>;
};
export type BqTask = {
  questionId: string;
  stage: 1 | 2;
  text: string;
  practiced: boolean;
  completedAt?: string;
  /** A recording of her telling the story, kept in private storage for the referee to hear. */
  voice?: { at: string; seconds: number; mime: string };
};
export type Day = {
  date: string;
  closesAt: string;
  settings: Settings;
  applications: number;
  contacts: number;
  episodes?: number;
  episodeNote?: string;
  logs: {
    id: string;
    kind: "application" | "contact";
    count: number;
    company: string;
    link: string;
    at: string;
    /** She pasted the job description; the text itself lives in private storage. */
    jd?: { at: string; chars: number };
  }[];
  question: Question | null;
  /** Set when today's question is a weak answer from that earlier day, back for a second try. */
  retryOf?: string;
  answers: Answer[];
  /** The day's other interview questions; the first one is `question` / `answers` above. */
  more?: InterviewItem[];
  /** The referee gave her the day off: it neither counts nor breaks the streak. */
  excused?: { reason: string; at: string; by: string };
  /** The daily words, a bonus task. Missing on days from before it existed. */
  vocab?: VocabDay;
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
export type WeeklyPlan = {
  weekOf: string;
  goal: string;
  outreach: string;
  focus: string;
  days: string[];
  success: string;
  updatedAt: string;
};
export type GameState = {
  weeklyPlans?: Record<string, WeeklyPlan>;
  version: 1;
  startedOn: string;
  /** Claimed by the first name entered at the player entrance; later entries must match it. */
  playerName?: string;
  settings: Settings;
  nextSettings?: Settings;
  days: Record<string, Day>;
  projects: Project[];
  /** How many new words she wants a day; she sets it herself. */
  vocab?: { perDay: number };
  /** Dollar rewards granted separately from points and the penalty fund. */
  rewardBalance?: number;
  redemptions: { id: string; at: string; amount: number }[];
  audit: Audit[];
  /** Study Mode coach: the referee's lines and photo versions (photos live in private storage). */
  coach?: {
    lines?: Partial<Record<CoachMood, string>>;
    photos?: Partial<Record<CoachMood, string>>;
    /** One line from the referee, shown on her Today page until it is changed or cleared. */
    note?: { text: string; at: string };
  };
};
export type DayStatus =
  | "open"
  | "met"
  | "gold"
  | "missed"
  | "frozen"
  | "excused"
  | "pending"
  | "waiting";
export type EvaluatedDay = {
  date: string;
  status: DayStatus;
  points: number;
  streak: number;
  freezes: number;
  penalty: number;
  completed: number;
  required: number;
  study: { passed: number; failed: number };
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
