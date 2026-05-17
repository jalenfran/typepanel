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
  const lastSentRef = useRef("");
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
      <main className="fallback">
        <p>Invalid room.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="fallback-button"
        >
          Go home
        </button>
      </main>
    );
  }

  return (
    <main className="room">
      <header className="room-header">
        <a href="/" className="room-brand">
          <span
            className={`status-dot${connected ? " is-connected" : ""}`}
            title={connected ? "Connected" : "Connecting…"}
          />
          <span>← TypePanel</span>
        </a>

        <div className="room-share">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="room-share-input"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copyLink}
            className={`copy-button${copied ? " is-copied" : ""}`}
          >
            <span ref={copyIconRef} className="copy-icon">
              {copied ? "✓" : "⧉"}
            </span>
            <span>{copied ? "Copied" : "Copy link"}</span>
          </button>
        </div>
      </header>

      <div className="room-editor-wrap">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Start typing… everyone in this room sees it live."
          className="room-editor"
          spellCheck={false}
        />
      </div>

      <p className="room-footnote">
        Rooms linger for 3 minutes after everyone leaves. Share the link to collaborate live.
      </p>
    </main>
  );
}
