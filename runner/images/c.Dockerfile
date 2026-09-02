# Sandbox image for the "c" language (see runner/languages.json). Deliberately
# minimal: a C toolchain, util-linux for `script` (pty for interactive Run),
# and runsvc for per-run rlimit enforcement + rusage reporting.
FROM debian:bookworm-slim AS runsvc-build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*
COPY runsvc/runsvc.c /src/runsvc.c
RUN gcc -O2 -Wall -o /runsvc /src/runsvc.c

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libc6-dev util-linux \
  && rm -rf /var/lib/apt/lists/*
COPY --from=runsvc-build /runsvc /usr/local/bin/runsvc
RUN useradd --create-home --uid 10001 runner
USER runner
WORKDIR /work
