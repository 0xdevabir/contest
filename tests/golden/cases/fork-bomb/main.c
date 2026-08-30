#include <unistd.h>
/* Must be contained by the sandbox's --pids-limit (runner/sandbox.js). Once
   fork() starts failing (EAGAIN, pid cap hit) the program exits non-zero. */
int main() {
  for (;;) {
    pid_t pid = fork();
    if (pid < 0) return 1;
  }
}
