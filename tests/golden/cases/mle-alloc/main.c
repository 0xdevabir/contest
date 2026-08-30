#include <stdlib.h>
#include <string.h>
/* Container memory is capped at 256m (see runner/sandbox.js) — this
   allocation is deliberately larger, and touched so the pages are actually
   committed, to trigger an OOM kill. Phase 0 wires OOM detection into
   judgeTests via Sandbox#wasOomKilled; this case is still tracked as
   known-failing (see tests/golden/golden.test.ts) until Phase 3 replaces the
   pooled-container heuristic with exact per-run cgroup accounting. */
int main() {
  size_t sz = (size_t)1024 * 1024 * 1024;
  char *p = malloc(sz);
  if (!p) return 1;
  memset(p, 1, sz);
  return 0;
}
