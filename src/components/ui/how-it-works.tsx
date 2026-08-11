"use client";

import React from "react";

export interface Step {
  title: string;
  description: string;
  colorTheme?: "orange" | "blue" | "purple";
  colors?: {
    bg: string;
    text: string;
    border: string;
  };
}

export interface StepPosition {
  className?: string;
  rotate?: string;
}

export interface HowItWorksProps {
  features?: Step[];
  className?: string;
  /** Kept for API compatibility with earlier versions of this component. */
  stepPositions?: StepPosition[];
}

type Point = { x: number; y: number };
type DragState = {
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  origin: Point;
};

const WIDE_LAYOUT: Point[] = [
  { x: 0.18, y: 0.27 },
  { x: 0.69, y: 0.23 },
  { x: 0.31, y: 0.72 },
  { x: 0.79, y: 0.69 },
  { x: 0.52, y: 0.48 },
];

const NARROW_LAYOUT: Point[] = [
  { x: 0.5, y: 0.24 },
  { x: 0.5, y: 0.46 },
  { x: 0.5, y: 0.68 },
  { x: 0.5, y: 0.89 },
  { x: 0.5, y: 0.57 },
];

const CARD_ROTATIONS = [-3.5, 2.8, -2.1, 3.2, -1.4];
const THREAD_COLORS = ["#ff6078", "#f5eee0", "#ff6078", "#48618d"];

const DEFAULT_FEATURES: Step[] = [
  {
    title: "Create Account",
    description: "Sign up in minutes and get started.",
    colorTheme: "orange",
  },
  {
    title: "Verify Identity",
    description: "Complete your profile verification.",
    colorTheme: "blue",
  },
  {
    title: "Select Plan",
    description: "Choose the plan that fits your goal.",
    colorTheme: "purple",
  },
  {
    title: "Track Growth",
    description: "Keep an eye on your progress.",
    colorTheme: "orange",
  },
];

const THEME = {
  orange: { accent: "#ef603f", wash: "#fff1dc", border: "#e9cda7" },
  blue: { accent: "#48618d", wash: "#edf3fb", border: "#c8d3e2" },
  purple: { accent: "#765f98", wash: "#f2edf7", border: "#d7cae1" },
};

function makeThreadPath(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const sag = Math.min(92, Math.max(42, distance * 0.16));

  return [
    `M ${from.x.toFixed(1)} ${from.y.toFixed(1)}`,
    `C ${(from.x + dx * 0.28).toFixed(1)} ${(from.y + dy * 0.25 + sag).toFixed(1)},`,
    `${(from.x + dx * 0.72).toFixed(1)} ${(from.y + dy * 0.75 + sag).toFixed(1)},`,
    `${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
  ].join(" ");
}

export default function HowItWorks({
  features,
  className = "",
}: HowItWorksProps) {
  const data = features?.length ? features : DEFAULT_FEATURES;
  const boardRef = React.useRef<HTMLDivElement>(null);
  const pinRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const dragRef = React.useRef<DragState | null>(null);
  const pointerRef = React.useRef<Point>({ x: 0, y: 0 });
  const frameRef = React.useRef<number | null>(null);
  const hasPositionedRef = React.useRef(false);

  const [positions, setPositions] = React.useState<Point[]>(() =>
    data.map((_, index) => WIDE_LAYOUT[index % WIDE_LAYOUT.length]),
  );
  const [pinPoints, setPinPoints] = React.useState<Point[]>([]);
  const [isVisible, setIsVisible] = React.useState(false);
  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null);

  const measurePins = React.useCallback(() => {
    const board = boardRef.current;
    if (!board) return;

    const boardRect = board.getBoundingClientRect();
    const next = pinRefs.current.slice(0, data.length).map((pin) => {
      if (!pin) return { x: 0, y: 0 };
      const rect = pin.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - boardRect.left,
        y: rect.top + rect.height / 2 - boardRect.top,
      };
    });

    setPinPoints(next);
  }, [data.length]);

  React.useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    if (!hasPositionedRef.current) {
      const layout = board.clientWidth < 680 ? NARROW_LAYOUT : WIDE_LAYOUT;
      setPositions(data.map((_, index) => layout[index % layout.length]));
      hasPositionedRef.current = true;
    }

    measurePins();
    const observer = new ResizeObserver(measurePins);
    observer.observe(board);
    return () => observer.disconnect();
  }, [data, measurePins]);

  React.useLayoutEffect(() => {
    measurePins();
  }, [positions, measurePins]);

  React.useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { threshold: 0.14 },
    );
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  React.useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const applyPointerPosition = React.useCallback(() => {
    frameRef.current = null;
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board) return;

    const card = pinRefs.current[drag.index]?.closest<HTMLElement>(
      "[data-note-card]",
    );
    if (!card) return;

    const boardRect = board.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const halfWidth = cardRect.width / boardRect.width / 2;
    const halfHeight = cardRect.height / boardRect.height / 2;
    const x = Math.min(
      1 - halfWidth,
      Math.max(
        halfWidth,
        drag.origin.x + (pointerRef.current.x - drag.startX) / boardRect.width,
      ),
    );
    const y = Math.min(
      1 - halfHeight,
      Math.max(
        halfHeight,
        drag.origin.y + (pointerRef.current.y - drag.startY) / boardRect.height,
      ),
    );

    setPositions((current) => {
      const next = [...current];
      next[drag.index] = { x, y };
      return next;
    });
  }, []);

  const onPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
  ) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: positions[index],
    };
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setDraggingIndex(index);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(applyPointerPosition);
    }
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    applyPointerPosition();
    dragRef.current = null;
    setDraggingIndex(null);
  };

  const nudgeCard = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    const direction: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = direction[event.key];
    if (!delta) return;
    event.preventDefault();
    const amount = event.shiftKey ? 0.04 : 0.015;
    setPositions((current) => {
      const next = [...current];
      const point = current[index];
      next[index] = {
        x: Math.min(0.9, Math.max(0.1, point.x + delta.x * amount)),
        y: Math.min(0.9, Math.max(0.1, point.y + delta.y * amount)),
      };
      return next;
    });
  };

  return (
    <section className={`relative px-4 md:px-8 ${className}`}>
      <div
        ref={boardRef}
        className="relative mx-auto h-[980px] w-full max-w-[1120px] overflow-hidden rounded-[28px] border border-white/10 md:h-[760px]"
        style={{
          backgroundColor: "#151412",
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,.045) 0 1px, transparent 1.5px), radial-gradient(circle at 75% 65%, rgba(218,177,118,.04) 0 1px, transparent 1.5px), linear-gradient(115deg, rgba(255,255,255,.018), transparent 38%)",
          backgroundSize: "17px 19px, 23px 29px, 100% 100%",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.06), inset 0 0 90px rgba(0,0,0,.38)",
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-black/30 px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-white/55 md:top-7"
          style={{ fontFamily: '"Departure Mono", ui-monospace, monospace' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff6078]" />
          Drag a note — the thread stays pinned
        </div>

        {pinPoints.length === data.length && data.length > 1 && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[4] h-full w-full"
            viewBox={`0 0 ${boardRef.current?.clientWidth || 1120} ${boardRef.current?.clientHeight || 760}`}
            preserveAspectRatio="none"
          >
            {pinPoints.slice(0, -1).map((from, index) => {
              const path = makeThreadPath(from, pinPoints[index + 1]);
              const delay = `${index * 100 + 160}ms`;
              const revealed = isVisible;
              return (
                <g key={`${data[index].title}-${data[index + 1].title}`}>
                  <path
                    d={path}
                    fill="none"
                    pathLength={1}
                    stroke="rgba(0,0,0,.52)"
                    strokeLinecap="round"
                    strokeWidth="5"
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: revealed ? 0 : 1,
                      transition: `stroke-dashoffset 650ms cubic-bezier(.22,1,.36,1) ${delay}`,
                    }}
                  />
                  <path
                    d={path}
                    fill="none"
                    pathLength={1}
                    stroke={THREAD_COLORS[index % THREAD_COLORS.length]}
                    strokeLinecap="round"
                    strokeWidth="2.25"
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: revealed ? 0 : 1,
                      transition: `stroke-dashoffset 650ms cubic-bezier(.22,1,.36,1) ${delay}`,
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {data.map((step, index) => {
          const point = positions[index] || WIDE_LAYOUT[index % WIDE_LAYOUT.length];
          const theme = THEME[step.colorTheme || "blue"];
          const isDragging = draggingIndex === index;

          return (
            <div
              key={step.title}
              data-note-card
              role="group"
              aria-label={`Step ${index + 1}: ${step.title}. Drag to reposition.`}
              tabIndex={0}
              className="absolute cursor-grab select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#ff6078] active:cursor-grabbing"
              style={{
                width: "min(270px, calc(100% - 32px))",
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                zIndex: isDragging ? 30 : 8 + index,
                transform: `translate(-50%, -50%) rotate(${CARD_ROTATIONS[index % CARD_ROTATIONS.length]}deg)`,
              }}
              onPointerDown={(event) => onPointerDown(event, index)}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onLostPointerCapture={() => {
                dragRef.current = null;
                setDraggingIndex(null);
              }}
              onKeyDown={(event) => nudgeCard(event, index)}
            >
              <div
                className="relative min-h-[180px] rounded-[3px] border px-6 pb-6 pt-9 text-[#25231f] shadow-[0_16px_30px_rgba(0,0,0,.34)] transition-[opacity,transform,box-shadow] duration-500 ease-out"
                style={{
                  backgroundColor: step.colors?.bg || theme.wash,
                  backgroundImage:
                    "radial-gradient(circle at 18% 24%, rgba(78,60,36,.08) 0 .7px, transparent .9px), repeating-linear-gradient(0deg, rgba(87,70,48,.025) 0 1px, transparent 1px 5px)",
                  backgroundSize: "11px 13px, 100% 5px",
                  borderColor: step.colors?.border || theme.border,
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible
                    ? `translateY(0) scale(${isDragging ? 1.025 : 1})`
                    : "translateY(26px) scale(.97)",
                  transitionDelay: `${index * 100}ms`,
                  boxShadow: isDragging
                    ? "0 24px 44px rgba(0,0,0,.5)"
                    : "0 16px 30px rgba(0,0,0,.34)",
                }}
              >
                <span
                  ref={(node) => {
                    pinRefs.current[index] = node;
                  }}
                  aria-hidden="true"
                  className="absolute left-1/2 top-[-9px] z-10 h-[22px] w-[22px] -translate-x-1/2 rounded-full border border-black/25 shadow-[0_5px_8px_rgba(0,0,0,.38)]"
                  style={{
                    background:
                      "radial-gradient(circle at 35% 28%, #ffd1d8 0 8%, #ff6078 28%, #a91e39 78%, #641022 100%)",
                  }}
                />

                <div className="mb-5 flex items-center justify-between border-b border-black/10 pb-3 font-mono text-[10px] uppercase tracking-[0.13em] text-black/45">
                  <span>Step {String(index + 1).padStart(2, "0")}</span>
                  <span>LAO file</span>
                </div>
                <h3 className="m-0 font-display text-[29px] font-normal leading-none text-[#22201d]">
                  {step.title}
                </h3>
                <p className="mb-0 mt-4 max-w-[28ch] text-[14px] leading-[1.55] text-[#4f4a42]">
                  {step.description}
                </p>
                <span
                  aria-hidden="true"
                  className="absolute bottom-3 right-4 font-mono text-[10px]"
                  style={{ color: step.colors?.text || theme.accent }}
                >
                  {String(index + 1).padStart(2, "0")} / {String(data.length).padStart(2, "0")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
