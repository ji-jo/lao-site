const FILLED_PATH = "M200,128a71.69,71.69,0,0,1-15.78,44.91L83.09,71.78A71.95,71.95,0,0,1,200,128ZM56,128a71.95,71.95,0,0,0,116.91,56.22L71.78,83.09A71.69,71.69,0,0,0,56,128Zm180,0A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-20,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z";
const OUTLINED_PATH = "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.56,87.56,0,0,1-20.41,56.28L71.72,60.4A88,88,0,0,1,216,128ZM40,128A87.56,87.56,0,0,1,60.41,71.72L184.28,195.6A88,88,0,0,1,40,128Z";

/** Disarms both marker and brush; the filled mark denotes the active default preset. */
export function DefaultToolButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Default tool — no marker or brush"
      aria-pressed={active}
      title="Default tool — no marker or brush"
      onClick={onClick}
      data-focus-ring
      data-focus-radius="full"
      className="group relative grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10 sm:h-[32px] sm:w-[32px]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 256 256"
        className="size-[14px] transition-transform duration-150 group-active:scale-[0.92] sm:size-[18px]"
        fill="var(--color-text-hi)"
      >
        <path d={active ? FILLED_PATH : OUTLINED_PATH} />
      </svg>
    </button>
  );
}
