# Contest Hub — Story Problem Authoring Brief

Give this entire file to Claude (or any LLM). It must output **one valid JSON file** you can drop into this repo and import.

## Goal

Generate **80 unique** programming problems (acceptable range: 50–100) that are:

- **Story-based** (short narrative → clear task), Bangladesh university / campus flavor
- Solvable in **C** (stdio I/O)
- Autogradable with **exact/token** output (no interactive, no special judge)
- Fresh: do **not** copy titles/statements from classic OJ clones; invent original scenarios

## Output file

Write exactly:

```
data/story-problems-batch.json
```

Top-level shape must match Contest Hub’s `ProblemBank` (`src/lib/types.ts`).

## JSON schema (required)

```json
{
  "meta": {
    "title": "Contest Hub Story Batch",
    "subtitle": "Story-driven C practice — campus narratives",
    "language": "C",
    "sets": 10,
    "problemsPerSet": 8,
    "total": 80,
    "tiers": [
      "VERY EASY",
      "EASY",
      "MEDIUM",
      "MEDIUM-HARD",
      "HARD",
      "VERY HARD",
      "EXTREME"
    ]
  },
  "sets": [
    {
      "set": 1,
      "title": "Campus Orientation — I/O & Arithmetic",
      "problems": [
        {
          "id": "story1-q1",
          "question": 1,
          "title": "Short Title",
          "difficulty": "VERY EASY"
        }
      ]
    }
  ],
  "problems": {
    "story1-q1": { "...full problem object..." }
  }
}
```

### Each problem object (all fields required unless marked optional)

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique slug: `story{set}-q{question}` e.g. `story3-q5` |
| `set` | number | 1…N |
| `question` | number | 1…problems-in-set |
| `title` | string | ≤60 chars, no spoilers |
| `difficulty` | enum | Exactly one of: `VERY EASY`, `EASY`, `MEDIUM`, `MEDIUM-HARD`, `HARD`, `VERY HARD`, `EXTREME` |
| `setTitle` | string | Same as parent set’s `title` |
| `topic` | string | Short topic label (used for tags) |
| `source` | string | Always `"generated"` |
| `statement` | string | 2–5 sentences story + 1 sentence task. Markdown OK. No Input/Output sections here. |
| `input` | string | Exact input format |
| `output` | string | Exact output format |
| `constraints` | string | Bounds; use `10^9` style |
| `sampleInput` | string | Must match first sample test |
| `sampleOutput` | string | Must match first sample test |
| `tests` | array | ≥4 cases; ≥1 with `"sample": true` |
| `starterCode` | string | Always the C stub below |
| `timeLimitMs` | number | Default `2000` |
| `memoryLimitMb` | number | Default `256` |
| `openEnded` | boolean | optional; omit or `false` |

### Starter code (copy verbatim)

```c
#include <stdio.h>

int main() {
    // your code here
    return 0;
}
```

### Test case object

```json
{ "input": "3 5\n", "output": "8\n", "sample": true }
```

- Include trailing newlines consistently on multi-line I/O.
- Hidden tests: omit `sample` or set `"sample": false`.
- Cover: sample, edge (min/max), typical, trap (zeros, empties where allowed, odd/even lengths).
- Outputs must be **deterministic** and whitespace-stable (TOKEN checker). Prefer single-space separation; no trailing spaces on lines.

## Difficulty mix (for 80 problems)

| Tier | Count | Sets |
|---|---|---|
| VERY EASY | 12 | early sets |
| EASY | 14 | |
| MEDIUM | 16 | |
| MEDIUM-HARD | 14 | |
| HARD | 12 | |
| VERY HARD | 8 | |
| EXTREME | 4 | late sets only |

If generating a different total in 50–100, keep roughly the same proportions.

## Curriculum sets (suggested titles — rename OK if coherent)

1. Campus Orientation — I/O & Arithmetic  
2. Club Fair — Conditionals & Strings  
3. Lab Week — Loops & Patterns  
4. Midterm Prep — Arrays & Frequency  
5. Sports Day — Sorting & Searching  
6. Hackathon Night — Prefix Sums & Ranges  
7. Library Quest — Strings Intermediate  
8. Inter-Dept Contest — Greedy & Constructive  
9. Finals Pressure — Graphs / Recursion / DP intro  
10. Mock ICPC — Mixed Hard Stories  

Each set: **8 problems**, rising difficulty within the set.

## Story writing rules

1. Open with a named character + concrete campus situation (DIU / Bangladeshi uni vibe OK: hostel, club fair, lab viva, rickshaw fare, hall mess, contest room).
2. Names: rotate — e.g. Fahim, Nusrat, Priya, Arif, Sadia, Rafiq, Mehnaz, Tanvir, Lamiya, Karim. Do not reuse the same name+plot combo.
3. After the story, one clear computational task in plain language.
4. Statement must stand alone: a solver never needs external knowledge beyond the Input/Output/Constraints fields.
5. No violence, politics, religion, or real exam leaks. Keep problems friendly and exam-appropriate.
6. Prefer **single-test-file** problems (one input → one output), not multi-query unless clearly specified.
7. For floats: specify precision (e.g. “print with exactly 2 decimal places”).
8. For YES/NO: specify exact casing (`YES` / `NO`).

## Topics to cover (spread across the batch)

I/O, arithmetic, conditionals, loops, arrays, frequency maps, strings, sorting, binary search, prefix sums, greedy, basic number theory (GCD/primes), recursion, simple BFS/DFS, intro DP, matrices, stacks/queues (via arrays), bit tricks (easy), constructive.

Avoid: interactive problems, floating EPS-only checkers, graphics, file I/O, multithreading.

## Uniqueness checklist

Before finishing, verify:

- [ ] All `id`s unique and match `story{set}-q{question}`
- [ ] Every `problems[id]` appears in `sets[].problems`
- [ ] `meta.total` === number of problem objects
- [ ] No two problems share the same algorithmic task with only names changed
- [ ] Every sample I/O matches a `tests[]` entry with `"sample": true`
- [ ] Each problem has ≥3 hidden tests with correct expected output
- [ ] Constraints are consistent with sample + hidden tests
- [ ] Valid JSON (no trailing commas, no comments)

## Full example (one problem)

```json
{
  "id": "story1-q1",
  "set": 1,
  "question": 1,
  "title": "Rickshaw Fare Total",
  "difficulty": "VERY EASY",
  "setTitle": "Campus Orientation — I/O & Arithmetic",
  "topic": "I/O & Arithmetic",
  "source": "generated",
  "statement": "First-year student Nusrat takes a rickshaw from the main gate to her hall every morning. Today the meter shows two amounts: the base fare A and a small tip she wants to add B. Help her print the total she should pay. Read two integers A and B and print A + B.",
  "input": "A single line with two space-separated integers A and B.",
  "output": "A single integer: A + B.",
  "constraints": "0 ≤ A, B ≤ 10^9",
  "sampleInput": "40 10",
  "sampleOutput": "50",
  "tests": [
    { "input": "40 10", "output": "50", "sample": true },
    { "input": "0 0", "output": "0" },
    { "input": "1000000000 1000000000", "output": "2000000000" },
    { "input": "1 999", "output": "1000" }
  ],
  "starterCode": "#include <stdio.h>\n\nint main() {\n    // your code here\n    return 0;\n}\n",
  "timeLimitMs": 2000,
  "memoryLimitMb": 256
}
```

## How humans import after you generate

1. Save JSON as `data/story-problems-batch.json`.
2. Merge into `data/problems.json` (or replace if starting fresh) so slugs do not collide with existing `setN-qM` ids.
3. Run: `npx tsx scripts/migrations/0004-import-problem-bank.ts`  
   (requires ADMIN user from `npm run db:seed`; import is idempotent by slug).

## Generation instruction (do this now)

Produce the complete `story-problems-batch.json` with **80** story problems following this brief.  
Return **only valid JSON** for the file contents (no markdown fences if writing the file directly).  
If you must stream in chunks, keep the final merged file valid JSON.
