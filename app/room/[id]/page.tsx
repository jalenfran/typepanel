"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import gsap from "gsap";

type TextPatch = {
  start: number;
  end: number;
  insert: string;
};

const MAX_INSERT_CHARS = 3000;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "";

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

const DEBOUNCE_MS = 80;

function useRoomSync(roomId: string) {
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last text we've sent to the server (or received from it). Used so we send full cumulative diff, not per-keystroke. */
  const lastSentRef = useRef("");
  /** Latest full text from user input; debounce callback reads this to compute patch. */
  const pendingTextRef = useRef("");

  useEffect(() => {
    if (!WS_URL || !roomId) return;

    lastSentRef.current = "";
    pendingTextRef.current = "";

    const socket = new WebSocket(
      `${WS_URL}?roomId=${encodeURIComponent(roomId)}`
    );
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));

    socket.addEventListener("message", (event) => {
      try {
        const data: { type?: string; text?: string; patch?: TextPatch } =
          JSON.parse(event.data as string);

        if (data.type === "snapshot" && typeof data.text === "string") {
          lastSentRef.current = data.text;
          pendingTextRef.current = data.text;
          setText(data.text);
        } else if (data.type === "patch" && data.patch) {
          setText((current) => {
            const nextText = applyPatch(current, data.patch as TextPatch);
            lastSentRef.current = nextText;
            pendingTextRef.current = nextText;
            return nextText;
          });
        }
      } catch {
        // ignore malformed messages
      }
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
      socketRef.current = null;
      setConnected(false);
    };
  }, [roomId]);

  const broadcast = useCallback(
    (newText: string) => {
      if (!roomId || !socketRef.current) return;
      const socket = socketRef.current;
      if (socket.readyState !== WebSocket.OPEN) return;

      setText(newText);
      pendingTextRef.current = newText;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;

        const current = pendingTextRef.current;
        const basePatch = computePatch(lastSentRef.current, current);
        const patches = splitInsertPatch(basePatch);

        const nonEmpty = patches.filter(
          (p) =>
            !(p.start === 0 && p.end === 0 && p.insert.length === 0)
        );
        if (!nonEmpty.length) return;

        for (const patch of nonEmpty) {
          socket.send(
            JSON.stringify({
              type: "patch",
              roomId,
              patch,
            })
          );
        }
        lastSentRef.current = current;
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
