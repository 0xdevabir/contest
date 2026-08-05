# Sandbox image that untrusted student code is compiled and executed inside.
# Deliberately minimal: a C toolchain, and util-linux for `script`, which gives
# the program a pty so prompts flush immediately instead of sitting in a buffer.
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc libc6-dev util-linux \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 runner

USER runner
WORKDIR /work
