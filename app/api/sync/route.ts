// Legacy route no longer used now that we rely on the standalone
// WebSocket server. Keeping a tiny stub so existing deployments
// don't break if something still calls /api/sync.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: false, message: "Sync moved to WebSocket" });
}
