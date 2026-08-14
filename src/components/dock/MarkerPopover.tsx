import { SmoothCorners } from "@lisse/react";
import type { ShadowConfig } from "@lisse/core";
import type { MarkType } from "@highlighters/core";
import { OpacitySlider } from "./OpacitySlider.tsx";
import { playOptionClick } from "../../lib/marker-audio.ts";
import { MARKER_MAX_OPACITY } from "../../selection-style.tsx";

// Lisse ShadowConfig, not box-shadow, so the lift traces the squircle clip-path.
const POPOVER_SHADOW: ShadowConfig = {
  offsetX: 0, offsetY: 6, blur: 14, spread: -6, color: "#000000", opacity: 0.5,
};

const MARK_OPTIONS: { type: MarkType; label: string }[] = [
  { type: "highlight", label: "Highlight" },
  { type: "strike-through", label: "Strike-through" },
  { type: "overline", label: "Overline" },
  { type: "underline", label: "Underline" },
];

const CHIP_W = 58;
const CHIP_H = 38;

// One mark-type option as a real highlighter band. Shape + texture are colour-independent so
// they're memoised; only `--ink` changes and CSS-transitions, no geometry rebuild on a swap.
function MarkOption({
  type,
  label,
  selected,
  color,
  onSelect,
}: {
  type: MarkType;
  label: string;
  selected: boolean;
  color: string;
  onSelect: (next: MarkType) => void;
}) {
  // Keep these deliberately CSS-only. The previous tiny highlighter geometry depended on
  // masks/clip paths that were unreliable at this scale, leaving the option previews blank.
  const strokePosition = type === "overline" ? "top-[9px]" : type === "underline" ? "bottom-[9px]" : "top-1/2 -translate-y-1/2";
  const isHighlight = type === "highlight";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={() => {
        playOptionClick();
        onSelect(type);
      }}
      data-focus-ring
      data-focus-radius="12"
      className="group flex h-[46px] flex-1 items-center justify-center rounded-[12px] bg-transparent transition-colors duration-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
    >
      <span
        className={`relative overflow-hidden rounded-[8px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4),0_3px_10px_rgba(0,0,0,0.18)] transition-all duration-150 group-active:scale-[0.96] ${selected ? "bg-paper" : "bg-[#d7d4d0]"}`}
        style={{ width: CHIP_W, height: CHIP_H }}
      >
        <div
          aria-hidden
          className={`absolute left-[11px] right-[11px] ${strokePosition} ${isHighlight ? "h-[20px] -skew-x-[7deg] rounded-[2px] opacity-55" : "h-[5px] rounded-full opacity-65"}`}
          style={{ backgroundColor: color }}
        />
      </span>
    </button>
  );
}

export function MarkerPopover({
  inkColor,
  opacity,
  markType,
  onOpacity,
  onMarkType,
}: {
  inkColor: string;
  opacity: number;
  markType: MarkType;
  onOpacity: (next: number) => void;
  onMarkType: (next: MarkType) => void;
}) {
  return (
    <SmoothCorners
      asChild
      autoEffects={false}
      corners={{ radius: 41, smoothing: 0.6 }}
      shadow={POPOVER_SHADOW}
    >
      <div
        role="group"
        aria-label="Marker settings"
        className="flex w-[360px] flex-col items-center gap-[18px] bg-ink-800 p-[18px]"
      >
        <div className="flex w-full items-stretch gap-[8px]">
          {MARK_OPTIONS.map((m) => (
            <MarkOption
              key={m.type}
              type={m.type}
              label={m.label}
              selected={m.type === markType}
              color={inkColor}
              onSelect={onMarkType}
            />
          ))}
        </div>
        <OpacitySlider inkColor={inkColor} value={opacity} max={MARKER_MAX_OPACITY} onChange={onOpacity} />
      </div>
    </SmoothCorners>
  );
}
