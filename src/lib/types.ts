export type Difficulty =
  | "VERY EASY"
  | "EASY"
  | "MEDIUM"
  | "MEDIUM-HARD"
  | "HARD"
  | "VERY HARD"
  | "EXTREME";

export type TestCase = {
  input: string;
  output: string;
  sample?: boolean;
};

export type Problem = {
  id: string;
  set: number;
  question: number;
  title: string;
  difficulty: Difficulty;
  setTitle: string;
  topic?: string;
  source?: "authored" | "generated";
  statement: string;
  input: string;
  output: string;
  constraints: string;
  sampleInput: string;
  sampleOutput: string;
  tests: TestCase[];
  starterCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  openEnded?: boolean;
};

export type SetSummary = {
  set: number;
  title: string;
  problems: {
    id: string;
    question: number;
    title: string;
    difficulty: Difficulty;
  }[];
};

export type CategoryProblem = {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic?: string;
  source?: "authored" | "generated";
  set: number;
  question: number;
};

export type CategorySummary = {
  tier: Difficulty;
  count: number;
  problems: CategoryProblem[];
};

export type ProblemBank = {
  meta: {
    title: string;
    subtitle: string;
    language: string;
    sets: number;
    problemsPerSet: number;
    total: number;
    tiers?: Difficulty[];
    problemsPerTier?: number;
  };
  sets: SetSummary[];
  categories?: CategorySummary[];
  problems: Record<string, Problem>;
};

export type JudgeVerdict =
  | "AC"
  | "WA"
  | "CE"
  | "RE"
  | "TLE"
  | "MLE"
  | "SKIP"
  | "ERROR";

export type TestResult = {
  index: number;
  verdict: JudgeVerdict;
  timeMs: number;
  stdout: string;
  stderr: string;
  expected?: string;
  sample?: boolean;
};

export type JudgeResponse = {
  ok: boolean;
  verdict: JudgeVerdict;
  compileStderr?: string;
  results: TestResult[];
  message?: string;
  stdout?: string;
  stderr?: string;
  timeMs?: number;
};

export type ProblemSolver = {
  userId: string;
  name: string;
  university: string;
  firstSolvedAt: string;
};



