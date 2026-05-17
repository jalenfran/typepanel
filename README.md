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
   # terminal 1
   npm run server
   # terminal 2
   npm run dev
   ```
   ```bash
   # open http://localhost:3000
   ```
   Open [http://localhost:3000](http://localhost:3000), click “Create a room”, share the URL — anyone with the link sees typing live.

## Deploy on Vercel

1. Push this repo to GitHub.
2. In [vercel.com](https://vercel.com): New Project → Import the repo.
3. In **Settings → Environment Variables**, set:
   - `NEXT_PUBLIC_WS_URL` to your Railway WebSocket URL, e.g. `wss://your-railway-app.up.railway.app`
4. Deploy. Your live pastebin is live.

## Deploy the WebSocket server on Railway

1. Push the same repo to GitHub (or reuse the one from above).
2. In [railway.app](https://railway.app): New Project → Deploy from GitHub → pick this repo.
3. For the Railway service:
   - Build command: `npm install`
   - Start command: `npm run server`
4. Once deployed, copy the public URL (e.g. `wss://my-typepanel-ws.up.railway.app`) and plug it into `NEXT_PUBLIC_WS_URL` on Vercel.

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

- Each room is a URL: `/room/[id]`. Everyone in the same URL shares one live document.
- Typing is debounced and sent over a WebSocket connection; the server applies the patch and broadcasts it to every other client in the room.
- No database. Rooms linger for 3 minutes after the last client disconnects (so a refresh doesn't lose work), then are dropped from memory.
