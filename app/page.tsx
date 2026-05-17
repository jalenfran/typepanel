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
    <main className="home">
      <div ref={heroRef} className="home-hero">
        <h1 className="home-title">TypePanel</h1>
        <p className="home-tag">
          Live shared typing — no sign-up, no persistence.
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={createRoom}
          className="home-cta"
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
        <p className="home-footnote">
          Share the room URL — everyone sees the same text as you type.
        </p>
      </div>
    </main>
  );
}
