"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import gsap from "gsap";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "";

type DeltaOp = {
  retain?: number;
  insert?: string | object;
  delete?: number;
};

// Map a cursor position from the pre-edit Y.Text to the post-edit Y.Text.
// Insertions exactly at the cursor stay to the right of it (left-bias).
function transformPosition(pos: number, delta: DeltaOp[]): number {
  let result = pos;
  let cursor = 0;
  for (const op of delta) {
    if (op.retain != null) {
      cursor += op.retain;
    } else if (op.insert != null) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;
      if (cursor < pos) result += len;
    } else if (op.delete != null) {
      if (cursor < pos) {
        result -= Math.min(op.delete, pos - cursor);
      }
      cursor += op.delete;
    }
  }
  return result;
}

function useRoomSync(roomId: string) {
  const [text, setTextState] = useState("");
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(0);
  const ytextRef = useRef<Y.Text | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(
    null
  );

  useEffect(() => {
    if (!WS_URL || !roomId) return;

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");
    const provider = new WebsocketProvider(WS_URL, roomId, ydoc);
    ytextRef.current = ytext;

    const handleStatus = ({ status }: { status: string }) => {
      setConnected(status === "connected");
    };
    provider.on("status", handleStatus);

    // Make sure we appear in our own awareness map so the count includes us.
    provider.awareness.setLocalState({});
    const handleAwareness = () => {
      setPeers(provider.awareness.getStates().size);
    };
    provider.awareness.on("change", handleAwareness);
    handleAwareness();

    const handleObserve = (event: Y.YTextEvent, txn: Y.Transaction) => {
      if (!txn.local) {
        const ta = textareaRef.current;
        if (ta) {
          const delta = event.delta as DeltaOp[];
          pendingSelectionRef.current = {
            start: transformPosition(ta.selectionStart, delta),
            end: transformPosition(ta.selectionEnd, delta),
          };
        }
      }
      setTextState(ytext.toString());
    };
    ytext.observe(handleObserve);
    setTextState(ytext.toString());

    return () => {
      ytext.unobserve(handleObserve);
      provider.awareness.off("change", handleAwareness);
      provider.off("status", handleStatus);
      provider.destroy();
      ydoc.destroy();
      ytextRef.current = null;
      setConnected(false);
      setPeers(0);
    };
  }, [roomId]);

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const ta = textareaRef.current;
    if (pending && ta) {
      ta.setSelectionRange(pending.start, pending.end);
      pendingSelectionRef.current = null;
    }
  }, [text]);

  const setText = useCallback((next: string) => {
    const ytext = ytextRef.current;
    if (!ytext) return;
    const current = ytext.toString();
    if (current === next) return;

    let start = 0;
    const prevLen = current.length;
    const nextLen = next.length;
    while (
      start < prevLen &&
      start < nextLen &&
      current[start] === next[start]
    ) {
      start++;
    }
    let prevEnd = prevLen;
    let nextEnd = nextLen;
    while (
      prevEnd > start &&
      nextEnd > start &&
      current[prevEnd - 1] === next[nextEnd - 1]
    ) {
      prevEnd--;
      nextEnd--;
    }
    const inserted = next.slice(start, nextEnd);
    const deleted = prevEnd - start;

    ytext.doc!.transact(() => {
      if (deleted > 0) ytext.delete(start, deleted);
      if (inserted) ytext.insert(start, inserted);
    });
  }, []);

  return { text, setText, connected, peers, textareaRef };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = typeof params.id === "string" ? params.id : "";
  const { text, setText, connected, peers, textareaRef } = useRoomSync(roomId);
  const [copied, setCopied] = useState(false);
  const copyIconRef = useRef<HTMLSpanElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomId}`
      : "";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [textareaRef]);

  const copyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);

    setCopied(true);

    if (copyIconRef.current && !reducedMotion) {
      gsap.fromTo(
        copyIconRef.current,
        { y: 4, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.18, ease: "power2.out" }
      );
    }

    window.setTimeout(() => setCopied(false), 1200);
  }, [shareUrl, reducedMotion]);

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

        {connected && peers > 0 ? (
          <span className="presence-pill" title="People in this room">
            <span className="presence-dot" />
            {peers} here
          </span>
        ) : null}

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
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Start typing… everyone in this room sees it live."
          className="room-editor"
          spellCheck={false}
        />
      </div>

      <p className="room-footnote">
        <span className="room-footnote-count">{text.length.toLocaleString()} chars</span>
        <span className="room-footnote-sep">·</span>
        <span>Rooms linger for 3 minutes after everyone leaves</span>
      </p>
    </main>
  );
}
