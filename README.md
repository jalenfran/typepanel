# TypePanel

Live shared typing — like a pastebin where everyone sees the same text in real time. No sign-up, no persistence.

## Quick start

1. **Get Pusher credentials** (free): [dashboard.pusher.com](https://dashboard.pusher.com) → Create app → use “Channels” (not Beams). Copy App ID, Key, Secret, Cluster.

2. **Clone and install**
   ```bash
   npm install
   ```

3. **Environment**
   - Copy `.env.example` to `.env.local`
   - Fill in all values. Use the same Key and Cluster for both `PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_CLUSTER`.

4. **Run**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000), click “Create a room”, share the URL — anyone with the link sees typing live.

## Deploy on Vercel

1. Push this repo to GitHub.
2. In [vercel.com](https://vercel.com): New Project → Import the repo.
3. Add the same env vars in **Settings → Environment Variables**:
   - `PUSHER_APP_ID`
   - `PUSHER_KEY`
   - `PUSHER_SECRET`
   - `PUSHER_CLUSTER`
   - `NEXT_PUBLIC_PUSHER_KEY` (same as `PUSHER_KEY`)
   - `NEXT_PUBLIC_PUSHER_CLUSTER` (same as `PUSHER_CLUSTER`)
4. Deploy. Your live pastebin is live.

## How it works

- Each room is a URL: `/room/[id]`. Everyone in the same URL shares one live document.
- Typing is debounced and sent to a small API route that broadcasts via Pusher.
- No database: when everyone leaves, the content is gone.
