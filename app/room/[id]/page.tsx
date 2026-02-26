"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Pusher from "pusher-js";

const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY!;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "us2";
const DEBOUNCE_MS = 120;

function useRoomSync(roomId: string) {
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<ReturnType<Pusher["subscribe"]> | null>(null);
  const isLocalUpdate = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!PUSHER_KEY || !roomId) return;

    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
    pusherRef.current = pusher;

    const channel = pusher.subscribe(`room-${roomId}`);
    channelRef.current = channel;

    channel.bind("text-update", (data: { text?: string }) => {
      if (isLocalUpdate.current) {
        isLocalUpdate.current = false;
        return;
      }
      if (typeof data?.text === "string") setText(data.text);
    });

    pusher.connection.bind("connected", () => setConnected(true));
    pusher.connection.bind("disconnected", () => setConnected(false));

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      channel.unbind_all();
      pusher.unsubscribe(`room-${roomId}`);
      pusher.disconnect();
      pusherRef.current = null;
      channelRef.current = null;
    };
  }, [roomId]);

  const broadcast = useCallback(
    (newText: string) => {
      if (!roomId) return;
      setText(newText);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        isLocalUpdate.current = true;
        fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, text: newText }),
        }).catch(() => {
          isLocalUpdate.current = false;
        });
      }, DEBOUNCE_MS);
    },
    [roomId]
  );

  return { text, setText: broadcast, connected };
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = typeof params.id === "string" ? params.id : "";
  const { text, setText, connected } = useRoomSync(roomId);
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomId}`
      : "";

  const copyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    // Could add a small "Copied!" toast here
  }, [shareUrl]);

  if (!roomId) {
    return (
      <main style={{ padding: "2rem", textAlign: "center" }}>
        <p>Invalid room.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            background: "var(--accent)",
            color: "var(--bg)",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Go home
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem",
        maxWidth: "900px",
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <a
            href="/"
            style={{
              color: "var(--muted)",
              fontSize: "0.9rem",
              fontWeight: 500,
            }}
          >
            ← TypePanel
          </a>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: connected ? "var(--accent)" : "var(--muted)",
              opacity: connected ? 1 : 0.5,
            }}
            title={connected ? "Connected" : "Connecting…"}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="text"
            readOnly
            value={shareUrl}
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: "0.8rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              width: "min(420px, 100%)",
            }}
          />
          <button
            type="button"
            onClick={copyLink}
            style={{
              padding: "0.5rem 1.5rem",
              minWidth: "120px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: "0.875rem",
              font: "inherit",
            }}
          >
            Copy link
          </button>
        </div>
      </header>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Start typing… everyone in this room sees it live."
        style={{
          flex: 1,
          minHeight: "60vh",
          width: "100%",
          padding: "1.25rem",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: "15px",
          lineHeight: 1.6,
          resize: "vertical",
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-dim)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      />

      <p
        style={{
          color: "var(--muted)",
          fontSize: "0.8rem",
          marginTop: "0.75rem",
        }}
      >
        No persistence — when everyone leaves, the text is gone. Share the link
        to collaborate live.
      </p>
    </main>
  );
}
