"use client";

import { useEffect, useRef } from "react";

type DotGridSpotlightProps = {
  targetRef: React.RefObject<HTMLElement | null>;
};

/** Cursor-revealed dot grid, adapted for a non-blocking interactive board. */
export function DotGridSpotlight({ targetRef }: DotGridSpotlightProps) {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    const spotlight = spotlightRef.current;
    if (!target || !spotlight) return;

    let frame = 0;
    let nextX = -500;
    let nextY = -500;
    const paint = () => {
      frame = 0;
      spotlight.style.setProperty("--dot-x", `${nextX}px`);
      spotlight.style.setProperty("--dot-y", `${nextY}px`);
      spotlight.style.opacity = nextX < 0 ? "0" : "1";
    };
    const update = (event: PointerEvent) => {
      const bounds = target.getBoundingClientRect();
      nextX = event.clientX - bounds.left;
      nextY = event.clientY - bounds.top;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      nextX = -500;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    target.addEventListener("pointermove", update, { passive: true });
    target.addEventListener("pointerleave", leave, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("pointermove", update);
      target.removeEventListener("pointerleave", leave);
    };
  }, [targetRef]);

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(228,236,247,.19) 0 .5px, transparent .7px)",
          backgroundSize: "8.5px 9.5px",
        }}
      />
      <div
        ref={spotlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(120,177,228,.9) 0 .6px, transparent .85px)",
          backgroundSize: "8.5px 9.5px",
          // Fallback coordinates keep the glow entirely off-canvas before the
          // pointer listener has painted its first position. Without them,
          // the unresolved CSS variables invalidate the mask and expose every
          // blue dot for one frame as the board enters view.
          WebkitMaskImage: "radial-gradient(circle 190px at var(--dot-x, -500px) var(--dot-y, -500px), black 0%, rgba(0,0,0,.82) 28%, transparent 72%)",
          maskImage: "radial-gradient(circle 190px at var(--dot-x, -500px) var(--dot-y, -500px), black 0%, rgba(0,0,0,.82) 28%, transparent 72%)",
        }}
      />
    </>
  );
}
