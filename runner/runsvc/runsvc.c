/*
 * runsvc — the per-run rlimit-and-rusage wrapper baked into every sandbox
 * image (runner/images/*.Dockerfile). See docs/phases/PHASE-03-judge-engine.md
 * "Sandbox images". Measuring CPU time and memory from inside the container
 * via wait4()'s rusage is far more accurate than measuring from the host,
 * and is how every serious judge does it.
 *
 * Usage: runsvc <cpuSeconds> <fsizeBytes> <nprocLimit> <outFile> -- <argv...>
 *
 * The child sets its own rlimits then execve()s the target. The parent
 * wait4()s and writes a single JSON line to <outFile> with the exit status
 * and resource usage. A file is used instead of a dedicated fd (the design
 * note's original idea) because `docker exec` does not expose extra fds to
 * the host process driving it — the host reads the file back with a second
 * `docker exec cat` instead, which is a small, well-understood primitive.
 *
 * Deliberately small and dependency-free: this file is the whole trusted
 * base running inside the same namespace as untrusted student code.
 */
#include <sys/resource.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>

static void die(const char *msg) {
  fprintf(stderr, "runsvc: %s: %s\n", msg, strerror(errno));
  exit(127);
}

int main(int argc, char **argv) {
  if (argc < 6) {
    fprintf(stderr, "usage: runsvc <cpuSeconds> <fsizeBytes> <nprocLimit> <outFile> -- <argv...>\n");
    return 2;
  }

  long cpu_seconds = strtol(argv[1], NULL, 10);
  long fsize_bytes = strtol(argv[2], NULL, 10);
  long nproc_limit = strtol(argv[3], NULL, 10);
  const char *out_file = argv[4];

  int sep = 5;
  if (strcmp(argv[sep], "--") != 0) {
    fprintf(stderr, "runsvc: expected '--' before the target argv\n");
    return 2;
  }
  char **target_argv = &argv[sep + 1];
  if (target_argv[0] == NULL) {
    fprintf(stderr, "runsvc: no target argv given\n");
    return 2;
  }

  pid_t pid = fork();
  if (pid < 0) die("fork");

  if (pid == 0) {
    /* Child: rlimits apply to this process and everything it execve()s.
       RLIMIT_CPU sends SIGXCPU then SIGKILL at the hard limit — the parent
       distinguishes a CPU-limit kill from a wall-clock kill by checking
       ru_utime against this same cpu_seconds value. */
    struct rlimit rl;

    rl.rlim_cur = rl.rlim_max = (rlim_t)cpu_seconds;
    if (setrlimit(RLIMIT_CPU, &rl) != 0) die("setrlimit(CPU)");

    rl.rlim_cur = rl.rlim_max = (rlim_t)fsize_bytes;
    if (setrlimit(RLIMIT_FSIZE, &rl) != 0) die("setrlimit(FSIZE)");

    rl.rlim_cur = rl.rlim_max = (rlim_t)nproc_limit;
    setrlimit(RLIMIT_NPROC, &rl); /* best-effort: not namespaced on cgroup v2 hosts */

    rl.rlim_cur = rl.rlim_max = 64;
    setrlimit(RLIMIT_NOFILE, &rl);

    rl.rlim_cur = rl.rlim_max = 64L * 1024 * 1024; /* 64 MB thread stack cap */
    setrlimit(RLIMIT_STACK, &rl);

    execvp(target_argv[0], target_argv);
    die("execvp"); /* only reached on failure */
  }

  int status = 0;
  struct rusage usage;
  memset(&usage, 0, sizeof(usage));
  if (wait4(pid, &status, 0, &usage) < 0) die("wait4");

  long user_ms = usage.ru_utime.tv_sec * 1000 + usage.ru_utime.tv_usec / 1000;
  long sys_ms = usage.ru_stime.tv_sec * 1000 + usage.ru_stime.tv_usec / 1000;
  long cpu_ms = user_ms + sys_ms;
  /* ru_maxrss is KB on Linux, bytes on macOS — the sandbox images are always
     Linux, so this assumes KB; a host-side dev shim never uses this binary. */
  long max_rss_kb = usage.ru_maxrss;

  int exited = WIFEXITED(status);
  int exit_code = exited ? WEXITSTATUS(status) : -1;
  int signaled = WIFSIGNALED(status);
  int term_signal = signaled ? WTERMSIG(status) : 0;
  /* A CPU-limit kill (SIGXCPU/SIGKILL after RLIMIT_CPU's hard limit) always
     shows measured CPU time at or past the limit; a wall-clock kill from the
     host (which does not touch rlimits) leaves CPU time comfortably under
     it — this is the signal src/lib/judge/backends/runner.ts uses to set
     the D2 TLE `reason: "wall"` distinction. */
  int cpu_limited = signaled && (term_signal == SIGXCPU || term_signal == SIGKILL) && cpu_ms >= cpu_seconds * 1000;

  FILE *f = fopen(out_file, "w");
  if (!f) die("fopen(outFile)");
  fprintf(
      f,
      "{\"exited\":%s,\"exitCode\":%d,\"signaled\":%s,\"termSignal\":%d,"
      "\"cpuLimited\":%s,\"cpuMs\":%ld,\"maxRssKb\":%ld}\n",
      exited ? "true" : "false", exit_code, signaled ? "true" : "false", term_signal,
      cpu_limited ? "true" : "false", cpu_ms, max_rss_kb);
  fclose(f);

  return exited ? exit_code : 1;
}
