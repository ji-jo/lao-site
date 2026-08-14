import broomIconUrl from "../../icons/broom.svg?url";

/**
 * Right-edge action: wipes every mark and brush stroke off the page.
 *
 * The dock only edits style, so the actual clearing is broadcast as a DOM event
 * and picked up by whoever owns marks (SelectionMarker) and strokes
 * (BrushCanvas) — that keeps this button free of cross-component wiring.
 */
export const CLEAR_EVENT = 'lao:clear-annotations';

export function ClearButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Eraser — clear all marks"
      title="Eraser — clear all marks"
      onClick={() => window.dispatchEvent(new CustomEvent(CLEAR_EVENT))}
      data-focus-ring
      data-focus-radius="full"
      className={`group relative grid w-[32px] h-[32px] shrink-0 place-items-center rounded-full hover:bg-white/10 transition-colors ${className}`}
    >
      <span
        aria-hidden="true"
        className="size-[20px] transition-transform duration-150 group-active:scale-[0.92]"
        style={{
          backgroundColor: "var(--color-text-hi)",
          opacity: 0.8,
          WebkitMask: `url("${broomIconUrl}") center / contain no-repeat`,
          mask: `url("${broomIconUrl}") center / contain no-repeat`,
        }}
      />
    </button>
  );
}
