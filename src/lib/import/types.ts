/** One row of an ImportJob's per-item outcome report (D3). */
export type ImportItemOutcome = {
  item: string;
  ok: boolean;
  problemId?: string;
  slug?: string;
  message?: string;
  warnings?: string[];
};

export type ImportResult = {
  total: number;
  imported: number;
  failed: number;
  report: ImportItemOutcome[];
};
