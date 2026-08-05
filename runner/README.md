# Contest Hub runner

Compiles and executes untrusted student C code inside a locked-down Docker
container, and streams it to the browser over a WebSocket so programs are
genuinely interactive — a `printf` prompt appears immediately and `scanf` waits
for the student to type.

This exists because Vercel's serverless functions have no C compiler, and
because no HTTP judge can be interactive: they take all stdin upfront and return
finished output.

## Why it feels like a real terminal

The program runs under `script`, which allocates a pty inside the container.
Without a pty the C runtime block-buffers stdout, so `printf("Enter n: ")` would
not reach the browser until the program exited. The pty also echoes typed
characters, which is why the terminal behaves the way a local shell does.

## Requirements

- Linux host with Docker
- Node.js 20+
- ~1 GB RAM is enough for a class-sized load

## Local setup

```bash
cd runner
npm install
npm run build:image          # builds the contest-hub-sandbox image
RUNNER_TOKEN=$(openssl rand -hex 32) npm start
```

Then in the web app's `.env`:

```bash
RUNNER_TOKEN="<the same token>"
NEXT_PUBLIC_RUNNER_URL="http://localhost:8080"
```

Verify:

```bash
npm test                                   # sandbox + security checks
RUNNER_TOKEN=<token> node test-e2e.js      # protocol + auth checks
node test-integration.js                   # app -> runner ticket seam
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `RUNNER_TOKEN` | *(required)* | Shared secret. Also signs browser tickets. |
| `PORT` | `8080` | Listen port |
| `MAX_SESSIONS` | `12` | Concurrent containers before new runs are refused |
| `ALLOWED_ORIGINS` | *(any)* | Comma-separated origins allowed to open a WebSocket |
| `SANDBOX_MEMORY` | `256m` | Per-container memory cap |
| `SANDBOX_CPUS` | `1` | Per-container CPU cap |
| `SANDBOX_TTL_SEC` | `900` | Hard container lifetime |

The service refuses to start without `RUNNER_TOKEN`, so it can never be left
running as an open compute endpoint.

## Security model

Student code is treated as hostile. Each run gets a fresh container with:

- `--network none` — no outbound traffic at all
- `--read-only` rootfs, with `exec` tmpfs only at `/work` and `/tmp`
- `--cap-drop ALL` and `--security-opt no-new-privileges`
- non-root user (uid 10001)
- memory, CPU, and pid (`128`) caps, so fork bombs and allocation loops die
- wall-clock kill, plus a hard container TTL
- output capped at 512 KB per run

Browsers never receive `RUNNER_TOKEN`. The web app mints a 2-minute HMAC ticket
at `/api/run-ticket`; the runner verifies the signature and expiry. Forged and
expired tickets are rejected (covered by `test-e2e.js`).

`test-runner.js` asserts these properties rather than assuming them: it confirms
the network is unreachable, the root filesystem is read-only, infinite loops are
killed, and fork bombs are contained.

## Deploying to a VPS

Any small Ubuntu box works. Below assumes Ubuntu 24.04 and a subdomain such as
`runner.diucode.devabir.me` pointed at the server's IP.

### 1. Install Docker and Node

```bash
curl -fsSL https://get.docker.com | sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Deploy the code

```bash
sudo mkdir -p /opt/contest-hub-runner
# copy this runner/ directory there, then:
cd /opt/contest-hub-runner
npm ci --omit=dev
npm run build:image
```

### 3. Run it as a service

Generate a token with `openssl rand -hex 32` and use the **same value** in the
Vercel project's environment variables.

`/etc/systemd/system/contest-runner.service`:

```ini
[Unit]
Description=Contest Hub runner
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/opt/contest-hub-runner
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=PORT=8080
Environment=RUNNER_TOKEN=<paste-token>
Environment=ALLOWED_ORIGINS=https://diucode.devabir.me
Environment=MAX_SESSIONS=12

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now contest-runner
sudo systemctl status contest-runner
```

### 4. Terminate TLS

Browsers on an HTTPS page cannot open an insecure `ws://` socket, so the runner
must be served over `wss://`. Caddy handles the certificate and the WebSocket
upgrade with no extra configuration:

```bash
sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile`:

```
runner.diucode.devabir.me {
    reverse_proxy localhost:8080
}
```

```bash
sudo systemctl reload caddy
```

### 5. Close the firewall

Only 80/443 need to be public; port 8080 should not be reachable directly.

```bash
sudo ufw allow 22,80,443/tcp
sudo ufw enable
```

### 6. Point the app at it

In Vercel's environment variables:

```
RUNNER_TOKEN=<same token as the service>
NEXT_PUBLIC_RUNNER_URL=https://runner.diucode.devabir.me
```

`NEXT_PUBLIC_RUNNER_URL` is inlined at build time, so **redeploy** after setting
it. The app converts the scheme to `wss://` for the socket and calls
`https://.../judge` server-to-server for Submit.

Check it is live:

```bash
curl https://runner.diucode.devabir.me/health
```

## How the app uses it

- **Run** opens a WebSocket and streams an interactive session into xterm.js.
- **Submit** posts to `/judge` server-to-server and runs every test case in
  batch, so verdicts cannot be tampered with from the browser.

If `NEXT_PUBLIC_RUNNER_URL` and `RUNNER_TOKEN` are absent the app falls back to
Judge0, and then to a local compiler in development, so nothing breaks when the
runner is offline.

## Operating notes

- `GET /health` reports `activeSessions` and `maxSessions` for monitoring.
- Orphaned containers from a crash are reaped on startup and on shutdown.
- Containers are named `ch-*`; `docker ps --filter name=^ch-` shows live runs.
- Each concurrent session is roughly one container at up to `SANDBOX_MEMORY`.
  With the defaults, 12 sessions need ~3 GB; lower `MAX_SESSIONS` on a 1 GB box.
