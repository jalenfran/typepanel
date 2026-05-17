# TypePanel

Live shared typing — like a pastebin where everyone sees the same text in real time. No sign-up, no persistence.

## Quick start

1. **Clone and install**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env.local`
   - For local dev, leave `NEXT_PUBLIC_WS_URL=ws://localhost:4000`.

3. **Run the WebSocket server + app locally**
   ```bash
   # terminal 1 — Rust relay (requires rustup)
   cd server && cargo run
   # terminal 2 — Next.js
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000), click "Create a room", share the URL — anyone with the link sees typing live.

## Deploy on your k3s cluster

There is a `kubernetes/` folder with example manifests:

- `kubernetes/typepanel-namespace.yaml`
- `kubernetes/typepanel-deployment.yaml`
- `kubernetes/typepanel-service.yaml`

High-level flow:

1. Build & push a Docker image for this repo (for example to GHCR).
2. Update `image:` in `kubernetes/typepanel-deployment.yaml`.
3. On your cluster node:
   ```bash
   cd /home/server/projects/TypePanel/kubernetes
   sudo kubectl apply -f typepanel-namespace.yaml
   sudo kubectl apply -f typepanel-deployment.yaml
   sudo kubectl apply -f typepanel-service.yaml
   ```
4. Access via NodePort `http://<node-ip>:30110` or add an nginx vhost that proxies a domain to that port.

## How it works

- Each room is a URL: `/room/[id]`. Everyone in the same URL shares one live [Yjs](https://github.com/yjs/yjs) document.
- The browser uses Yjs + `y-websocket`; concurrent edits merge via CRDT — no patch-clobbering between clients.
- The server is a small Rust binary (`server/`) that speaks the y-websocket protocol, holds one `Doc` per room in memory, and broadcasts updates to peers.
- No database. Rooms linger for 3 minutes after the last client disconnects, then are dropped from memory.
- Per-connection caps: 1 MiB frames, 200 msg/s (burst 400), room ids `[A-Za-z0-9_-]{1,128}`, 50 clients/room, 10 000 rooms total.
