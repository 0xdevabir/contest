#include <stdlib.h>
#include <stdio.h>
/* The sandbox must never expose host secrets to a submission — see
   docs/ULTIMATE_PLAN.md §3 F-1. This case is the Docker-path equivalent of
   src/lib/judge.test.ts's local-judge F-1 regression guard. */
int main() {
  const char *v = getenv("DATABASE_URL");
  if (v) printf("%s", v);
  return 0;
}
