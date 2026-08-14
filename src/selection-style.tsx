import {
  createContext,
  useCallback,
  use,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HighlightOptions, MarkType } from "@highlighters/core";

// The dock's drawing tools; shared by the toolbar, selection marker, and canvas.
export type PenTip = "slant" | "round" | "fine" | "brush" | "eraser";

// The live, user-chosen selection style the dock controls.
export interface SelectionStyle {
  color: string;
  pen: PenTip;
  /** The active pen's opacity (`opacityByPen[pen]`). */
  opacity: number;
  /** Per-pen ink opacity: each marker keeps its own. */
  opacityByPen: Record<PenTip, number>;
  markType: MarkType;
}

// Matches the dock's default swatch so dock and paint agree from frame one.
// Fluorescent red. The upstream default is a brown tuned for a light page; on
// this dark surface it multiplies down to nothing.
export const DEFAULT_INK = "#ff2d3f";
export const DEFAULT_OPACITY = 0.35; // marker default
export const MARKER_MAX_OPACITY = 0.85;
export const DEFAULT_MARK_TYPE: MarkType = "highlight";
const DEFAULT_OPACITY_BY_PEN: Record<PenTip, number> = {
  slant: DEFAULT_OPACITY,
  round: DEFAULT_OPACITY,
  fine: DEFAULT_OPACITY,
  brush: 0.95,
  eraser: 1,
};

interface SelectionStyleContextValue {
  style: SelectionStyle;
  setColor: (color: string) => void;
  setPen: (pen: PenTip) => void;
  setOpacity: (opacity: number) => void;
  setMarkType: (markType: MarkType) => void;
}

const SelectionStyleContext = createContext<SelectionStyleContextValue | null>(
  null,
);

/** Holds the dock's selection style so it drives the live SelectionMarker. */
export function SelectionStyleProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState(DEFAULT_INK);
  // Freehand brush is the first tool users see and the one standing up in the dock.
  const [pen, setPen] = useState<PenTip>("brush");
  const [opacityByPen, setOpacityByPen] =
    useState<Record<PenTip, number>>(DEFAULT_OPACITY_BY_PEN);
  const [markType, setMarkType] = useState<MarkType>(DEFAULT_MARK_TYPE);
  // The slider edits the active pen's opacity, leaving others untouched.
  const setOpacity = useCallback(
    (next: number) => setOpacityByPen((m) => ({
      ...m,
      // The marker must remain translucent even at the slider's end stop.
      [pen]: Math.min(pen === "slant" ? MARKER_MAX_OPACITY : 1, Math.max(0, next)),
    })),
    [pen],
  );
  const value = useMemo<SelectionStyleContextValue>(
    () => ({
      style: { color, pen, opacity: opacityByPen[pen], opacityByPen, markType },
      setColor,
      setPen,
      setOpacity,
      setMarkType,
    }),
    [color, pen, opacityByPen, markType, setOpacity],
  );
  return (
    <SelectionStyleContext.Provider value={value}>
      {children}
    </SelectionStyleContext.Provider>
  );
}

export function useSelectionStyle(): SelectionStyleContextValue {
  const ctx = use(SelectionStyleContext);
  if (!ctx) {
    throw new Error(
      "useSelectionStyle must be used within a SelectionStyleProvider",
    );
  }
  return ctx;
}

// Every line end overshoots the text by 7-10px (8.5 +/- 1.5), ends seeded separately.
const END_SWING = { overshoot: 8.5, overshootJitter: 1.5 } as const;

// The broad nib every pen shares.
const NIB = { width: 24, thickness: 16, ...END_SWING } as const;

// Map a dock pen to its core nib: slant = chisel (per-line jitter), round = bullet, fine = fine point.
export function penToTip(pen: PenTip): Pick<HighlightOptions, "tip"> {
  switch (pen) {
    case "round":
      return { tip: { type: "bullet", angle: 0, ...NIB } };
    case "fine":
      return { tip: { type: "fine", angle: 0, ...NIB } };
    case "slant":
    default:
      return { tip: { type: "chisel", angle: 8, angleJitter: 5, ...NIB } };
  }
}

// The colour/nib-independent house style, shared by SelectionMarker and the popover previews so
// previews paint exactly what gets used; the dock layers colour, tip, opacity, and markType on top.
export const BASE_SELECTION_OPTIONS: HighlightOptions = {
  markType: "highlight",
  opacity: DEFAULT_OPACITY,
  // `vivid: "screen"` lifts the ink onto its own layer instead of multiplying
  // into the near-black page, which is what keeps a marker readable on dark.
  blendMode: "multiply",
  vivid: "screen",
  edge: { waviness: 1, frequency: 30, roughness: 0.12, cap: "round", radius: 3 },
  ink: { streakiness: 0.35, dryout: 0.08, startEndBuildup: 0.25, feathering: 0.12 },
  glow: { enabled: true, intensity: 0.35, spread: 5 },
  snap: "glyph",
};
