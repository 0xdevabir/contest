# worker/Dockerfile — the judge worker itself, not the sandbox images it
# orchestrates. Runs `tsx` directly against src/lib/judge/* rather than a
# separate build step, matching the "one codebase, two entry points" design
# in docs/phases/DONE__PHASE-04-judge-queue.md.
#
# The worker container needs the Docker CLI (not a Docker daemon — it talks
# to the host's daemon via the mounted socket) to spin up sibling sandbox
# containers. See worker/README.md for the docker.sock mount and the "this
# VPS runs nothing else" security note before deploying this anywhere.
FROM node:22-bookworm-slim

# Docker CLI only (no dockerd) — the daemon is the host's, reached via the
# socket bind-mounted at run time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# --include=dev: tsx/typescript/prisma CLI are devDependencies but this
# image runs source directly with tsx rather than a compiled build step.
RUN npm ci --include=dev
COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
CMD ["npx", "tsx", "worker/src/index.ts"]
