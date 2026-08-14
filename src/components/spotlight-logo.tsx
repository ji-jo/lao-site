"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { useCallback, useRef } from "react";

type SpotlightLogoProps = {
  className?: string;
  text?: string;
};

/**
 * Cursor-tracking spotlight treatment adapted from @ncdai/spotlight-logo.
 * The original registry component contains the author's personal SVG mark;
 * this version deliberately uses LAO's own wordmark instead.
 */
export function SpotlightLogo({ className = "", text = "lao.lt" }: SpotlightLogoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const cursorX = useMotionValue(-500);
  const cursorY = useMotionValue(-500);
  const spotlightX = useSpring(cursorX, { stiffness: 520, damping: 42, mass: 0.25 });
  const spotlightY = useSpring(cursorY, { stiffness: 520, damping: 42, mass: 0.25 });
  const highlight = useMotionTemplate`radial-gradient(circle 34% at ${spotlightX}px ${spotlightY}px, #d8edff 0%, #5e8fb6 28%, #0b3151 53%, transparent 72%)`;

  const trackPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType === "touch") return;
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;
    cursorX.set(event.clientX - bounds.left);
    cursorY.set(event.clientY - bounds.top);
  }, [cursorX, cursorY, reduceMotion]);

  const clearPointer = useCallback(() => {
    cursorX.set(-500);
    cursorY.set(-500);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      ref={ref}
      aria-label="lao.lt"
      role="img"
      className="relative inline-grid cursor-default select-none place-items-center"
      onPointerMove={trackPointer}
      onPointerLeave={clearPointer}
      whileTap={reduceMotion ? undefined : { scale: 0.975 }}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
    >
      <span className={className}>{text}</span>
      {!reduceMotion && (
        <motion.span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-clip-text text-transparent ${className}`}
          style={{ backgroundImage: highlight }}
        >
          {text}
        </motion.span>
      )}
    </motion.div>
  );
}
