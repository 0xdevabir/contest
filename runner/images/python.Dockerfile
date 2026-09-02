# Sandbox image for py311 (see runner/languages.json). Source is precompiled
# to .pyc before judging (D1) to keep interpreter startup out of the time
# limit; runsvc still wraps the run step for rlimit + rusage.
FROM debian:bookworm-slim AS runsvc-build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*
COPY runsvc/runsvc.c /src/runsvc.c
RUN gcc -O2 -Wall -o /runsvc /src/runsvc.c

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 util-linux \
 && rm -rf /var/lib/apt/lists/*
COPY --from=runsvc-build /runsvc /usr/local/bin/runsvc
RUN useradd --create-home --uid 10001 runner
USER runner
WORKDIR /work
