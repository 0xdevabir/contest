import { describe, it, expect } from "vitest";
import { diffStandings } from "./diff";
import type { ScoreboardRow } from "../scoring/types";

function row(userId: string, over: Partial<ScoreboardRow> = {}): ScoreboardRow {
  return {
    rank: 1,
    userId,
    name: userId,
    institutionId: null,
    institutionShortName: null,
    solved: 0,
    penalty: 0,
    points: 0,
    cells: {},
    ...over,
  };
}

describe("diffStandings", () => {
  it("with no previous version, every row is 'changed'", () => {
    const rows = [row("u1"), row("u2")];
    const diff = diffStandings(null, rows, 1);
    expect(diff.changed.map((r) => r.id).sort()).toEqual(["u1", "u2"]);
    expect(diff.removed).toEqual([]);
  });

  it("only includes rows whose stats actually moved", () => {
    const previous = [row("u1", { solved: 1, rank: 1 }), row("u2", { solved: 0, rank: 2 })];
    const next = [row("u1", { solved: 1, rank: 1 }), row("u2", { solved: 1, rank: 1 })];
    const diff = diffStandings(previous, next, 2);
    expect(diff.changed.map((r) => r.id)).toEqual(["u2"]);
  });

  it("produces no changed rows when nothing moved", () => {
    const rows = [row("u1", { solved: 2, penalty: 40 })];
    const diff = diffStandings(rows, rows, 3);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("reports a row present before but absent now as removed", () => {
    const previous = [row("u1"), row("u2")];
    const next = [row("u1")];
    const diff = diffStandings(previous, next, 4);
    expect(diff.removed).toEqual(["u2"]);
  });

  it("detects a cell-only change (e.g. a new solve) even if solved/penalty repeat", () => {
    const previous = [row("u1", { cells: { p1: { attempts: 1, solved: false, solvedAtMin: null, firstBlood: false } } })];
    const next = [row("u1", { cells: { p1: { attempts: 2, solved: false, solvedAtMin: null, firstBlood: false } } })];
    const diff = diffStandings(previous, next, 5);
    expect(diff.changed).toHaveLength(1);
  });
});
