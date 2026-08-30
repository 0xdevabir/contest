#include <stdio.h>
/* No output-size enforcement exists yet in runner/judge.js's batch path
   (Phase 3 job) — this case is tracked as known-failing until then. */
int main() {
  for (;;) {
    printf("A");
  }
  return 0;
}
