"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Pusher from "pusher-js";
import gsap from "gsap";

type TextPatch = {
  start: number;
  end: number;
  insert: string;
};

const MAX_INSERT_CHARS = 3000;

function computePatch(prev: string, next: string): TextPatch {
  if (prev === next) {
    return { start: 0, end: 0, insert: "" };
  }

  let start = 0;
  const prevLen = prev.length;
  const nextLen = next.length;

  while (start < prevLen && start < nextLen && prev[start] === next[start]) {
    start += 1;
  }

  let prevEnd = prevLen;
  let nextEnd = nextLen;
  while (
    prevEnd > start &&
    nextEnd > start &&
    prev[prevEnd - 1] === next[nextEnd - 1]
  ) {
    prevEnd -= 1;
    nextEnd -= 1;
  }

  return {
    start,
    end: prevEnd,
    insert: next.slice(start, nextEnd),
  };
}

function applyPatch(base: string, patch: TextPatch): string {
  const before = base.slice(0, patch.start);
  const after = base.slice(patch.end);
  return before + patch.insert + after;
}

function splitInsertPatch(patch: TextPatch): TextPatch[] {
  if (
    patch.end !== patch.start ||
    patch.insert.length <= MAX_INSERT_CHARS
  ) {
    return [patch];
  }

  const patches: TextPatch[] = [];
  let offset = 0;
  let cursor = patch.start;

  while (offset < patch.insert.length) {
    const slice = patch.insert.slice(offset, offset + MAX_INSERT_CHARS);
    patches.push({
      start: cursor,
      end: cursor,
      insert: slice,
    });
    cursor += slice.length;
    offset += slice.length;
  }

  return patches;
}

const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY!;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "us2";
const DEBOUNCE_MS = 120;

function useRoomSync(roomId: string) {
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<ReturnType<Pusher["subscribe"]> | null>(null);
  const ignoreLocalCountRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTextRef = useRef("");

  useEffect(() => {
    if (!PUSHER_KEY || !roomId) return;

    prevTextRef.current = "";

    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
    pusherRef.current = pusher;

    const channel = pusher.subscribe(`room-${roomId}`);
    channelRef.current = channel;

    channel.bind(
      "text-update",
      (data: { text?: string; patch?: TextPatch }) => {
        if (ignoreLocalCountRef.current > 0) {
          ignoreLocalCountRef.current -= 1;
          return;
        }

        if (data?.patch) {
          setText((current) => {
            const nextText = applyPatch(current, data.patch as TextPatch);
            prevTextRef.current = nextText;
            return nextText;
          });
        } else if (typeof data?.text === "string") {
          prevTextRef.current = data.text;
          setText(data.text);
        }
      }
    );

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
      const basePatch = computePatch(prevTextRef.current, newText);
      const patches = splitInsertPatch(basePatch);
      prevTextRef.current = newText;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;

        const nonEmpty = patches.filter(
          (p) =>
            !(p.start === 0 && p.end === 0 && p.insert.length === 0)
        );
        if (!nonEmpty.length) return;

        ignoreLocalCountRef.current += nonEmpty.length;

        (async () => {
          try {
            for (const patch of nonEmpty) {
              await fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomId, patch }),
              });
            }
          } catch {
            ignoreLocalCountRef.current = 0;
          }
        })();
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
  const [copied, setCopied] = useState(false);
  const copyIconRef = useRef<HTMLSpanElement | null>(null);
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomId}`
      : "";

  const copyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);

    setCopied(true);

    if (copyIconRef.current) {
      gsap.fromTo(
        copyIconRef.current,
        { y: 4, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.18, ease: "power2.out" }
      );
    }

    window.setTimeout(() => setCopied(false), 1200);
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
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
            }}
          >
            <span
              ref={copyIconRef}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 4,
                border: copied
                  ? "1px solid rgba(34, 211, 199, 0.4)"
                  : "1px solid var(--border)",
                background: copied
                  ? "var(--accent)"
                  : "rgba(15, 23, 42, 0.9)",
                color: copied ? "var(--bg)" : "var(--muted)",
                fontSize: 10,
                transition:
                  "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {copied ? "✓" : ""}
            </span>
            <span>{copied ? "Copied" : "Copy link"}</span>
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
