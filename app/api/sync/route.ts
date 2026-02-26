import { NextRequest, NextResponse } from "next/server";
import Pusher from "pusher";

type TextPatch = {
  start: number;
  end: number;
  insert: string;
};

const pusher =
  process.env.PUSHER_APP_ID &&
  process.env.PUSHER_KEY &&
  process.env.PUSHER_SECRET &&
  process.env.PUSHER_CLUSTER
    ? new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER,
        useTLS: true,
      })
    : null;

export async function POST(req: NextRequest) {
  if (!pusher) {
    return NextResponse.json(
      { error: "Pusher not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const { roomId, text, patch } = body as {
      roomId?: string;
      text?: string;
      patch?: TextPatch;
    };

    if (!roomId || (!patch && typeof text !== "string")) {
      return NextResponse.json(
        { error: "roomId and patch or text required" },
        { status: 400 }
      );
    }

    const channel = `room-${roomId}`;
    const payload = patch ? { patch } : { text };

    await pusher.trigger(channel, "text-update", payload);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Pusher trigger error:", e);
    return NextResponse.json(
      { error: "Failed to broadcast" },
      { status: 500 }
    );
  }
}
