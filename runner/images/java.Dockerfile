# Sandbox image for java17 (see runner/languages.json). Largest image
# (~330 MB) — kept separate from the other toolchains (D-image-size
# discipline) rather than folded into one multi-toolchain image.
FROM debian:bookworm-slim AS runsvc-build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*
COPY runsvc/runsvc.c /src/runsvc.c
RUN gcc -O2 -Wall -o /runsvc /src/runsvc.c

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless util-linux \
 && rm -rf /var/lib/apt/lists/*
COPY --from=runsvc-build /runsvc /usr/local/bin/runsvc
RUN useradd --create-home --uid 10001 runner
USER runner
WORKDIR /work
