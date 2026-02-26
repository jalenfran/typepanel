"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";

function randomRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (heroRef.current) {
        gsap.from(heroRef.current, {
          opacity: 0,
          y: 24,
          duration: 0.7,
          ease: "power3.out",
        });
      }
      if (buttonRef.current) {
        gsap.from(buttonRef.current, {
          scale: 0.96,
          opacity: 0,
          duration: 0.6,
          delay: 0.15,
          ease: "back.out(1.6)",
        });
      }
    });
    return () => ctx.revert();
  }, []);

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
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34, 211, 199, 0.12) 0%, transparent 55%)",
      }}
    >
      <div
        ref={heroRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(2.2rem, 5.5vw, 3.2rem)",
            letterSpacing: "-0.03em",
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
          ref={buttonRef}
          type="button"
          onClick={createRoom}
          style={{
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: "1rem",
            padding: "0.9rem 1.9rem",
            borderRadius: "999px",
            border: "1px solid rgba(34, 211, 199, 0.4)",
            background:
              "radial-gradient(circle at 0 0, rgba(34, 211, 199, 0.35), var(--accent))",
            color: "var(--bg)",
            cursor: "pointer",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.8)",
          }}
          onMouseDown={(e) => {
            gsap.to(e.currentTarget, {
              scale: 0.97,
              duration: 0.08,
              ease: "power2.out",
            });
          }}
          onMouseUp={(e) => {
            gsap.to(e.currentTarget, {
              scale: 1,
              duration: 0.14,
              ease: "power2.out",
            });
          }}
        >
          Create a room
        </button>
        <p
          style={{
            color: "var(--muted)",
            fontSize: "0.875rem",
            marginTop: "2rem",
          }}
        >
          Share the room URL — everyone sees the same text as you type.
        </p>
      </div>
    </main>
  );
}
