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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        aria-hidden="true"
        className="size-[20px] transition-transform duration-150 group-active:scale-[0.92]"
        fill="currentColor"
        style={{ color: "var(--color-text-hi)", opacity: 0.8 }}
      >
        <path
          d="M225,80.4,183.6,39a24,24,0,0,0-33.94,0L31,157.66a24,24,0,0,0,0,33.94l30.06,30.06A8,8,0,0,0,66.74,224H216a8,8,0,0,0,0-16h-84.7L225,114.34A24,24,0,0,0,225,80.4ZM213.67,103,160,156.69,107.31,104,161,50.34a8,8,0,0,1,11.32,0l41.38,41.38a8,8,0,0,1,0,11.31Z"
        />
      </svg>
    </button>
  );
}
