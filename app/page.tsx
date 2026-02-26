"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

function randomRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const router = useRouter();

  const createRoom = useCallback(() => {
    router.push(`/room/${randomRoomId()}`);
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34, 211, 199, 0.08) 0%, transparent 50%)",
      }}
    >
      <h1
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 700,
          fontSize: "clamp(2rem, 5vw, 3rem)",
          letterSpacing: "-0.02em",
          marginBottom: "0.5rem",
        }}
      >
        TypePanel
      </h1>
      <p
        style={{
          color: "var(--muted)",
          fontSize: "1.1rem",
          marginBottom: "2.5rem",
          textAlign: "center",
        }}
      >
        Live shared typing — no sign-up, no persistence
      </p>
      <button
        type="button"
        onClick={createRoom}
        style={{
          fontFamily: "inherit",
          fontWeight: 600,
          fontSize: "1rem",
          padding: "0.875rem 1.75rem",
          borderRadius: "10px",
          border: "none",
          background: "var(--accent)",
          color: "var(--bg)",
          cursor: "pointer",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 8px 24px rgba(34, 211, 199, 0.35)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        Create a room
      </button>
      <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "2rem" }}>
        Share the room URL — everyone sees the same text as you type.
      </p>
    </main>
  );
}
