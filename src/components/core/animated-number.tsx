import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type AnimatedNumberProps = {
  value: number;
  className?: string;
  springOptions?: {
    bounce?: number;
    duration?: number;
  };
};

/**
 * A deliberately sequential number readout. It never pads digits or skips the
 * integers between the currently displayed number and a new value.
 */
export function AnimatedNumber({ value, className, springOptions }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const displayedRef = useRef(0);
  const targetRef = useRef(0);

  useEffect(() => {
    targetRef.current = Math.max(0, Math.round(value));
  }, [value]);

  useEffect(() => {
    const interval = Math.max(10, Math.min(28, Math.round((springOptions?.duration ?? 420) / 100)));
    const timer = window.setInterval(() => {
      const current = displayedRef.current;
      const target = targetRef.current;
      if (current === target) return;

      const next = current + (target > current ? 1 : -1);
      displayedRef.current = next;
      setDisplayValue(next);
    }, interval);

    return () => window.clearInterval(timer);
  }, [springOptions?.duration]);

  return <span className={cn("tabular-nums", className)}>{displayValue}</span>;
}
