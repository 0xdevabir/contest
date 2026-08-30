# Phase 3 — Judge v2: Engine

> **Execute with**: "execute Phase 3"
> **Effort**: 12–16 days · **Flag**: `judgeV2`
> **Depends on**: Phase 0, 2 · **Unblocks**: 4, 5, 6, 10, 15

---

## Goal

Make the judge **correct, multi-language, and hard**. A declarative language
registry, per-run resource accounting (CPU time, memory, output), real `MLE` and
`OLE` verdicts, pluggable checkers including special judges and interactors, and
a sandbox that survives hostile code.

Explicitly **not** in this phase: queues, workers, Redis, SSE. Those are Phase 4.

## Why split from Phase 4

Judge correctness and judge infrastructure fail in completely different ways and
are debugged with completely different tools. If a verdict goes wrong the week
you also introduced a distributed queue, you cannot tell whether the bug is in
the checker or in a stalled-job retry. Phase 3 is verifiable on one laptop
against a golden corpus. Phase 4 is verifiable under load. Keep them separable.

## Scope

- `src/lib/languages/` registry — C, C++17, C++20, Python 3, Java 17, JS (Node),
  and the ability to add more without touching application code
- Per-language sandbox images and a build script
- Resource accounting: CPU time via `RLIMIT_CPU` + cgroup, memory via cgroup
  `memory.peak` and OOM detection, output via `RLIMIT_FSIZE` and a stream cap
- New verdicts wired end to end: `MLE`, `OLE`, `PA`, `IE`
- Checkers: `EXACT`, `TOKEN`, `FLOAT`, `SPECIAL`, `INTERACTIVE`
- Group-aware execution and partial scoring
- The judge protocol from [Appendix C](../ULTIMATE_PLAN.md#appendix-c--judge-protocol-v1),
  implemented synchronously in this phase and moved behind a queue in Phase 4
- Golden conformance suite expanded to ~60 cases across all languages

---

## Design decisions

### D1 — A language is data

`src/lib/languages/registry.ts`:

```ts
export type LanguageSpec = {
  id: string;                    // "cpp20" — stable, used in submissions forever
  name: string;                  // "C++20 (GCC 13)"
  family: "c" | "cpp" | "python" | "java" | "js" | string;
  version: string;               // "gcc 13.2"
  image: string;                 // "contesthub-sandbox-cpp:2026-08-01"
  sourceFile: string;            // "main.cpp"
  /// null = interpreted; no compile step.
  compile: { argv: string[]; timeoutMs: number; outputFile: string } | null;
  run: { argv: string[] };
  /// Multipliers applied to the problem's declared limits.
  timeFactor: number;            // Python: 3, Java: 2, C/C++: 1
  memoryFactor: number;          // Java: 2 (JVM baseline), others: 1
  /// Extra memory headroom in MB before the cgroup cap (JVM, interpreter heap).
  memoryOverheadMb: number;
  monacoLanguage: string;        // editor syntax mode
  commentPrefix: string;         // used by the fingerprinter (Phase 10)
  enabled: boolean;
  /// Order in the language dropdown.
  order: number;
};
```

Adding Go is: one registry entry, one Dockerfile, one golden test directory.
No application code changes. This is why the Master Plan rejects v1's
"cap at five languages" non-goal.

**Initial registry**:

| id | Name | Compile | timeFactor | memFactor |
|---|---|---|---|---|
| `c` | C11 (GCC 13) | `gcc -O2 -std=c11 -static -o main main.c -lm` | 1 | 1 |
| `cpp17` | C++17 (GCC 13) | `g++ -O2 -std=c++17 -static -o main main.cpp` | 1 | 1 |
| `cpp20` | C++20 (GCC 13) | `g++ -O2 -std=c++20 -static -o main main.cpp` | 1 | 1 |
| `py311` | Python 3.11 | *(precompile to `.pyc` to keep startup out of the time limit)* | 3 | 2 |
| `java17` | Java 17 | `javac Main.java` | 2 | 2 (+256 MB overhead) |
| `js` | Node 22 | none | 2 | 2 |

`-static` for C/C++ matters: it removes the dynamic loader from the hot path,
which is measurably faster and removes a class of `LD_PRELOAD`-shaped tricks.

**Java's filename problem**: Java requires the public class name to match the
file. Convention: the class must be `Main`. The submission is written to
`Main.java` and a clear `CE` message is produced when the class is named
otherwise, rather than a confusing compiler error.

### D2 — CPU time is the limit; wall time is the guard

The current judge kills on wall-clock time. Under a loaded worker, a correct
solution gets a spurious `TLE` — which is the worst possible failure for trust.

- **CPU limit** = `problem.timeLimitMs × language.timeFactor`, enforced by
  `RLIMIT_CPU` (SIGKILL) and measured from cgroup `cpu.stat` `usage_usec`.
- **Wall limit** = `3 × CPU limit + 2 s`, a backstop against a program that
  sleeps or blocks on I/O. Exceeding the wall limit but not CPU is `TLE` with a
  distinguishing `reason: "wall"` in the report.
- Both are reported. Students see CPU time; operators see both.

### D3 — Memory is measured, not guessed

`MLE` today is unreachable (Master Plan F-3). Fix properly:

- Container memory cap = `problem.memoryLimitMb × language.memoryFactor +
  language.memoryOverheadMb`, with `--memory-swap` equal (no swap).
- After each run read cgroup v2 `memory.peak` (or `memory.max_usage_in_bytes` on
  v1) and `memory.events` → `oom_kill`.
- `oom_kill > 0` **or** `peak ≥ limit` → `MLE`, never `RE`.
- Report `maxMemoryKb` on every test, including successful ones. Students should
  see how close they came, and it is the input to Phase 15's difficulty model.

The JVM complicates this: a JVM that cannot allocate throws `OutOfMemoryError`
and exits non-zero *without* an OOM kill. Detect the exception text in stderr and
map it to `MLE` for the `java` family. Documented in the registry as a
per-family `oomStderrPattern`.

### D4 — Output limits are enforced twice

An infinite `printf` loop currently fills a Node string buffer at
`MAX_OUTPUT_BYTES` and keeps running. Two enforcement points:

1. `RLIMIT_FSIZE` inside the container so a program writing to a file dies.
2. A streaming byte counter on stdout; at `outputLimitKb` the process is killed
   and the verdict is `OLE`.

`OLE` is distinct from `WA` because the student's bug is different (a missing
loop terminator, not a wrong formula) and because a `WA` on a truncated diff is
confusing.

### D5 — Checkers are programs, and the sane default is `TOKEN`

| Type | Semantics |
|---|---|
| `EXACT` | Byte-identical after normalising `\r\n` → `\n` and stripping one trailing newline |
| `TOKEN` | Split both on whitespace, compare token sequences. The default: it forgives trailing spaces and line-ending differences, which are never the point of the problem. |
| `FLOAT` | Token-wise; numeric tokens compare with `abs(a-b) ≤ eps ∨ abs(a-b)/max(1,abs(b)) ≤ eps` |
| `SPECIAL` | A compiled checker program run as `checker input expected output` → exit 0 = AC, 1 = WA, 2 = PE, with a message on stdout. testlib-compatible exit codes so setters can reuse existing checkers. |
| `INTERACTIVE` | An interactor process; the submission's stdin/stdout are wired to it through pipes with a shared deadline |

Checkers run **in the sandbox**, not on the worker host. A special judge is
teacher-authored code and therefore untrusted — the same rules apply as to
student code, minus the network isolation being optional (it is not; it is
mandatory).

Checker compilation is cached by source hash so a contest with 500 submissions to
one special-judge problem compiles the checker once.

### D6 — Warm container pool, cold per-run workspace

Per-run `docker create` + `start` costs 300–800 ms. Across 20 tests that is
dominant. But a persistent container across *submissions* risks state leakage
between students.

Middle ground, and the reason the existing `Sandbox` class is the right base:

- One warm container **per language per worker slot**, created at startup.
- Each submission gets a fresh workspace directory inside the container's tmpfs,
  created and `rm -rf`'d around the run.
- The container is destroyed and recreated after `N` submissions (default 50) or
  on any anomaly, bounding the leakage window.
- Each run executes as `docker exec` with its own `RLIMIT_*` set via a small
  `runsvc` wrapper inside the image.

Measure both approaches in this phase and record the numbers in the phase notes;
if per-run creation turns out to be under 100 ms on the target host, prefer the
simpler cold path and say so.

### D7 — Test data is injected, never baked

Hidden tests are written into the container's tmpfs immediately before the run
and deleted after. They never exist in an image layer, never persist, and are not
readable by a later submission. The submission's program is given stdin as a
pipe, not a file path, so it cannot open the test file even during its own run.

---

## Sandbox hardening (delta on the current implementation)

The existing `runner/sandbox.js` is already good. Additions:

| Control | Current | Add |
|---|---|---|
| Network | `--network none` ✅ | Also deny at host firewall for defence in depth |
| Memory | `--memory` + `--memory-swap` ✅ | Read back `memory.peak` and `oom_kill` |
| PIDs | `--pids-limit 128` ✅ | Lower to 64 for non-Java, keep 128 for JVM |
| Capabilities | `--cap-drop ALL` ✅ | — |
| Privilege | `--security-opt no-new-privileges` ✅ | — |
| Rootfs | `--read-only` ✅ | — |
| Seccomp | Docker default | Custom profile denying `ptrace`, `mount`, `keyctl`, `bpf`, `perf_event_open`, `userfaultfd`, `clone` with new namespaces |
| CPU | `--cpus 1` ✅ | Add `--cpuset-cpus` pinning per slot to reduce measurement noise |
| ulimits | none | `--ulimit cpu=`, `--ulimit fsize=`, `--ulimit nofile=64`, `--ulimit nproc=` |
| Time source | wall clock | cgroup `cpu.stat` |
| Cleanup | container TTL | Explicit workspace wipe per run + orphan reaper (exists) |
| Image provenance | `latest` | Pinned digests; images built in CI and tagged by date |

Optionally evaluate **gVisor** (`--runtime=runsc`) in this phase. It closes the
kernel-exploit class almost entirely at a 10–30% CPU cost. Recommendation: make
it a config flag (`SANDBOX_RUNTIME`), default off, enabled for public
anonymous traffic where the trust level is lowest. Record the measured overhead.

---

## Architecture of the engine

```
src/lib/judge/
  index.ts            # public API: judgeSubmission(), runCustom()
  protocol.ts         # JudgeJob / JudgeReport types + zod schemas (Appendix C)
  engine.ts           # orchestrates: compile → per-group run → check → score
  scoring.ts          # group scoring, dependsOn resolution, PA/AC decision
  checkers/
    index.ts          # dispatch by CheckerType
    exact.ts token.ts float.ts special.ts interactive.ts
  languages/
    registry.ts       # LanguageSpec[] + lookup helpers
    images.ts         # image name resolution, digest pinning
  backends/
    index.ts          # backend selection + fallback chain
    local.ts          # dev-only in-process (gated by ALLOW_INSECURE_LOCAL_JUDGE)
    runner.ts         # HTTP to the runner service (current default)
    judge0.ts         # remote fallback (existing remote-judge.ts, refactored)
```

`engine.ts` is the pure orchestration and is unit-testable against a **fake
backend** that returns scripted per-test outcomes. That fake is what makes group
scoring, `dependsOn`, and early-stop logic testable without Docker.

### Execution algorithm

```
compile(source, language) → binary | CE
for group in groups ordered by `order`:
    if group.dependsOn is unsatisfied: record SKIPPED, score 0, continue
    for case in group.cases ordered by `order`:
        outcome = run(binary, case.input, limits)
        if outcome is TLE/MLE/RE/OLE: record; if group.stopOnFail: break
        verdict = check(case.expected, outcome.stdout, checker)
        record; if verdict != AC and group.stopOnFail: break
    group.score = all cases AC ? group.points : 0     # binary groups
overall.score = Σ group.score
overall.verdict =
    all groups full        → AC
    some groups full       → PA
    else                   → the first non-AC case verdict, in group order
```

**Binary groups** (all-or-nothing per group) is the IOI convention and the right
default. A per-case-proportional mode is a `TestGroup.scoreMode` field for later;
do not build it now.

`stopOnFirstFail` at the job level (for contests, to save CPU) short-circuits the
whole loop after the first non-AC. Teacher rejudges and the publish gate set it
`false` so every failing test is visible.

---

## Sandbox images

`runner/images/` — one Dockerfile per family, all built from `debian:bookworm-slim`
for a shared base layer.

```dockerfile
# runner/images/cpp.Dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      g++ libc6-dev libstdc++-12-dev util-linux \
 && rm -rf /var/lib/apt/lists/*
COPY runsvc /usr/local/bin/runsvc
RUN useradd --create-home --uid 10001 runner
USER runner
WORKDIR /work
```

`runsvc` is a ~120-line C or Go helper that sets `RLIMIT_CPU`, `RLIMIT_FSIZE`,
`RLIMIT_NPROC`, `RLIMIT_NOFILE`, `RLIMIT_STACK`, then `execve`s the target and
reports `rusage` on exit as a single JSON line on fd 3. Doing this inside the
container is far more accurate than measuring from the host and is how every
serious judge does it.

`runner/build-images.sh` builds all images, tags them by date, and writes the
digests into `runner/images.lock.json` which the registry reads. CI builds and
pushes them; workers never build.

**Image size discipline**: the C/C++ image is ~180 MB, Python ~120 MB, Java
~330 MB. Keep them separate rather than one multi-toolchain image — a single
image would be ~700 MB, slow to pull on every worker, and would let a Python
submission invoke `gcc`.

---

## Schema changes

Small; the heavy lifting was Phase 2.

```prisma
enum Verdict {
  AC WA PA CE RE TLE MLE OLE IE SKIP ERROR PENDING JUDGING
}

model Submission {
  // ...existing
  language         String   @default("c")   // now a registry id, validated
  score            Int      @default(0)
  maxScore         Int      @default(0)
  maxCpuMs         Int?
  maxWallMs        Int?
  maxMemoryKb      Int?
  compileMs        Int?
  judgeImage       String?                  // provenance: which image judged this
  judgeProtocol    Int      @default(1)
  // report Json?  (added Phase 0) — now conforms to JudgeReport

  @@index([problemRefId, language, verdict])
}
```

`ALTER TYPE Verdict ADD VALUE` for `PA`, `OLE`, `IE`, `PENDING`, `JUDGING` —
non-transactional, same pattern as the Phase 1 role migration. `ERROR` is kept
forever for historical rows; a small mapping in the UI shows old `ERROR` rows as
"Internal error".

Backfill: `score = (verdict = 'AC') ? 100 : 0`, `maxScore = 100` for existing
rows so pre-Phase-3 submissions sort sensibly alongside new ones.

---

## Language rollout order

Ship languages incrementally rather than all six at once. Each is a golden-suite
milestone:

1. **C** — parity with today. The whole golden corpus must produce identical
   verdicts to the current judge (except the deliberate `MLE`/`OLE` improvements).
   This is the regression gate for the entire rewrite.
2. **C++17/20** — same toolchain family, near-zero marginal risk.
3. **Python 3.11** — first interpreted language; validates `timeFactor`,
   startup-cost handling, and that `RecursionError` maps to `RE` not `WA`.
4. **Java 17** — the hardest: JVM startup, memory overhead, `OutOfMemoryError`
   detection, the `Main` class convention.
5. **Node** — cheap after Python.

Do not start language *n+1* until language *n*'s golden suite is green.

---

## Frontend surfaces

| Component | Work |
|---|---|
| `components/CodeEditor.tsx` | Language dropdown from the registry; Monaco mode switch; per-language starter code from `ProblemVersion.starterCode`; remember the user's last language in `User.preferredLanguage` |
| `components/ProblemWorkspace.tsx` | Verdict panel extended: `PA` with score, `MLE` with peak memory, `OLE`, `IE` with a "this was our fault, retrying" message; per-test table showing group, verdict, CPU ms, memory |
| `components/contest/ContestDashboard.tsx` | Partial-score cells for `PA` |
| `app/profile/submissions/page.tsx` | Language column, score column |
| `app/admin/submissions/[id]/page.tsx` | Full report viewer: per-group, per-test, image provenance, both time measurements |
| `components/problem/LanguageBadges.tsx` *(new)* | Which languages a problem allows (contest rules can restrict) |

Language restriction: `ContestRules.languages` already exists and defaults to
`["c"]`. Change the default to all enabled languages, and make the contest editor
a multi-select. A "C only" lab exam remains one checkbox away — which is exactly
what a first-semester course wants.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | `engine.ts` against a fake backend: group scoring, `dependsOn` skipping, `stopOnFail` semantics, PA vs AC vs first-failure verdict selection |
| Unit | Each checker: `TOKEN` forgives trailing whitespace; `FLOAT` epsilon at the boundary; `EXACT` rejects a trailing space; `SPECIAL` exit-code mapping |
| Unit | Registry: unknown language → `ValidationError`; disabled language rejected; limits scaled by factors |
| Golden | ~60 directories: 10 scenarios × 6 languages. Scenarios: `ac`, `wa`, `tle-cpu`, `tle-wall-sleep`, `mle-alloc`, `ole-spam`, `re-segv`, `re-divzero`, `ce-syntax`, `fork-bomb` |
| Golden | Security cases (all languages): `env-read` prints nothing; `net-egress` fails; `file-escape` cannot read `/etc/shadow` or the test file; `ptrace` denied by seccomp |
| Regression | The full C corpus produces identical verdicts to the pre-Phase-3 judge |
| Perf | Compile+run of a trivial C program ≤ 900 ms end to end on the reference host; a 20-test judge ≤ 3 s |
| Perf | Measured warm-pool vs cold-create cost, recorded in the phase notes |
| Fuzz | 500 random byte sequences as "source" in each language — none may crash the worker or leave an orphaned container |

The security golden cases are the most valuable tests in the repository. They
must run in CI on every change to `runner/**` or `src/lib/judge/**`.

---

## Acceptance criteria

1. A correct solution to the same problem in C, C++, Python, Java and JS all
   receive `AC`, with time limits scaled per language.
2. A program allocating 2 GB against a 256 MB limit receives `MLE` with a
   reported peak, in every language.
3. An infinite-output program receives `OLE`, not `WA` or a hung worker.
4. A busy-loop receives `TLE` measured in **CPU** time; a `sleep(60)` program
   receives `TLE` flagged as a wall-clock breach.
5. A submission cannot read any environment variable, open a network socket,
   read another submission's files, or read hidden test data.
6. A subtask problem with groups worth 30/70 returns `PA` with `score: 30` when
   only the first subtask passes.
7. A special judge (testlib exit codes) is compiled once and reused across
   submissions.
8. Adding a hypothetical seventh language requires only a registry entry, a
   Dockerfile and a golden directory — demonstrated by actually adding Go behind
   `enabled: false`.
9. The C golden corpus is verdict-identical to the pre-phase judge.

## Rollback

`judgeV2` flag routes submissions back to the Phase 0 judge path. Because
`Submission.language` is written on every row, rolled-back rows remain
interpretable. Verdicts already written are not recomputed — a rollback stops new
judging on the new engine, it does not rewrite history.

## Risks

| Risk | Mitigation |
|---|---|
| Verdict drift on existing problems | The C regression corpus is a blocking gate; any drift must be explained and accepted case by case |
| Java memory overhead makes existing limits unusable | `memoryFactor` + `memoryOverheadMb` per language; validate against real solutions during rollout step 4 |
| Python too slow for tight limits | `timeFactor: 3` and precompiled `.pyc`; teachers can raise limits per problem |
| Warm pool leaks state between submissions | Fresh workspace per run + container recycling every N runs + a golden test that writes a file in run 1 and asserts it is absent in run 2 |
| Seccomp profile breaks a legitimate program | Roll out the profile in log-only mode first, review denials, then enforce |
| Image drift between workers | Digest pinning in `images.lock.json`; workers refuse to start on a mismatch |
| gVisor overhead unacceptable | Off by default; measured and documented before any decision |

## Definition of done

- [ ] Language registry with 6 enabled languages + Go behind a disabled flag
- [ ] Per-language images built in CI, digest-pinned
- [ ] `runsvc` enforcing rlimits inside the container; rusage reported
- [ ] CPU time, wall time, peak memory and output size reported per test
- [ ] `MLE`, `OLE`, `PA`, `IE` reachable and correct in every language
- [ ] All five checker types implemented; special judges cached by source hash
- [ ] Group scoring with `dependsOn` and `stopOnFail`
- [ ] Seccomp profile enforced; security golden cases green
- [ ] ~60 golden cases green in CI; C regression corpus verdict-identical
- [ ] Language selector shipped; contest language restriction working
- [ ] Master Plan F-3 marked resolved
