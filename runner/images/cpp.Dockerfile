# Sandbox image shared by cpp17 and cpp20 (see runner/languages.json) — same
# GCC toolchain, distinguished only by the -std flag passed at compile time.
FROM debian:bookworm-slim AS runsvc-build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*
COPY runsvc/runsvc.c /src/runsvc.c
RUN gcc -O2 -Wall -o /runsvc /src/runsvc.c

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      g++ libc6-dev libstdc++-12-dev util-linux \
 && rm -rf /var/lib/apt/lists/*
COPY --from=runsvc-build /runsvc /usr/local/bin/runsvc
RUN useradd --create-home --uid 10001 runner
USER runner
WORKDIR /work
