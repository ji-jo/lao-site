import { useEffect, useRef } from 'react';
import { useSelectionStyle } from '../selection-style';
import { CLEAR_EVENT } from './dock/ClearButton';
import highlighterCursorUrl from '../icons/sf/highlighter-fill.svg?url';
import brushCursorUrl from '../icons/sf/paint-brush-fill.svg?url';
import eraserCursorUrl from '../icons/sf/eraser-fill.svg?url';
import type { PenTip } from '../selection-style';

type Pt = { x: number; y: number; w: number };
type StrokeTool = 'marker' | 'brush' | 'eraser';
type Stroke = { mode: 'paint' | 'erase'; tool: StrokeTool; color: string; alpha: number; pts: Pt[] };

/** Base nib width in px; pressure and speed scale around this. */
const BASE_W = 7;

const TOOL_CURSORS: Record<PenTip, string> = {
  slant: `url("${highlighterCursorUrl}") 6 27, text`,
  round: `url("${highlighterCursorUrl}") 6 27, text`,
  fine: `url("${highlighterCursorUrl}") 6 27, text`,
  brush: `url("${brushCursorUrl}") 5 28, crosshair`,
  eraser: `url("${eraserCursorUrl}") 7 26, crosshair`,
};

/**
 * Freehand drawing surface for the dock's brush pen.
 *
 * The canvas is fixed to the viewport and never sized from the document — an
 * earlier version sized itself to `scrollHeight`, which grew the page and
 * retriggered its own ResizeObserver. Strokes are stored in page coordinates
 * and redrawn offset by scroll, so drawings stay anchored to the content.
 *
 * Strokes are variable-width: each point carries its own half-width taken from
 * stylus pressure (or, for a mouse, from pointer speed) and the stroke is
 * filled as a tapered outline through midpoint quadratics, so there are no
 * straight segments and no hard chisel ends.
 */
export function BrushCanvas() {
  const { style } = useSelectionStyle();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const colorRef = useRef(style.color);
  const alphaRef = useRef(style.opacity);
  const toolRef = useRef(style.pen);
  const activeRef = useRef(style.active);
  colorRef.current = style.color;
  alphaRef.current = style.opacity;
  toolRef.current = style.pen;
  activeRef.current = style.active;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--drawing-tool-cursor', style.active ? TOOL_CURSORS[style.pen] : 'auto');
    return () => {
      root.style.removeProperty('--drawing-tool-cursor');
    };
  }, [style.active, style.pen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill the tapered outline: up one side through midpoint quadratics, back
    // down the other, with round caps at both ends. Quadratics keep the spine
    // curved, so no segment ever reads as a straight line.
    const traceStroke = (s: Stroke, ox: number, oy: number) => {
      const p = s.pts;
      // Marker freehand deliberately ignores the hand's intermediate movement:
      // it resolves to one clean, straight chisel band from press to release.
      // The blunt ends mimic a real highlighter and never wobble or taper.
      if (s.tool === 'marker') {
        const first = p[0];
        const last = p[p.length - 1] ?? first;
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const length = Math.hypot(dx, dy) || 1;
        const tx = dx / length;
        const ty = dy / length;
        const nx = -ty;
        const ny = tx;
        const half = first.w;
        // Parallel slanted cuts, like a chisel nib held at one fixed angle.
        const chisel = 5;
        const point = (base: Pt, normal: number, along: number) => ({
          x: base.x - ox + nx * normal + tx * along,
          y: base.y - oy + ny * normal + ty * along,
        });
        const startTop = point(first, half, -chisel);
        const endTop = point(last, half, -chisel);
        const endBottom = point(last, -half, chisel);
        const startBottom = point(first, -half, chisel);
        ctx.beginPath();
        ctx.moveTo(startTop.x, startTop.y);
        ctx.lineTo(endTop.x, endTop.y);
        ctx.lineTo(endBottom.x, endBottom.y);
        ctx.lineTo(startBottom.x, startBottom.y);
        ctx.closePath();
        ctx.fill();
        return;
      }
      if (p.length < 2) {
        if (p.length === 1) {
          ctx.beginPath();
          ctx.arc(p[0].x - ox, p[0].y - oy, p[0].w, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      const side = (sign: number) => {
        const out: { x: number; y: number }[] = [];
        for (let i = 0; i < p.length; i++) {
          const prev = p[i - 1] ?? p[i];
          const next = p[i + 1] ?? p[i];
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          // Normal to the local direction, scaled by this point's width.
          out.push({
            x: p[i].x - ox + (-dy / len) * p[i].w * sign,
            y: p[i].y - oy + (dx / len) * p[i].w * sign,
          });
        }
        return out;
      };
      const run = (pts: { x: number; y: number }[], start: boolean) => {
        if (start) ctx.moveTo(pts[0].x, pts[0].y);
        else ctx.lineTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
      };
      const a = side(1);
      const b = side(-1).reverse();
      const head = p[p.length - 1];
      const tail = p[0];

      ctx.beginPath();
      run(a, true);
      ctx.arc(head.x - ox, head.y - oy, head.w, 0, Math.PI * 2); // round leading cap
      run(b, false);
      ctx.arc(tail.x - ox, tail.y - oy, tail.w, 0, Math.PI * 2); // round trailing cap
      ctx.closePath();
      ctx.fill();
    };

    let raf = 0;
    const redraw = () => {
      raf = 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const ox = window.scrollX;
      const oy = window.scrollY;
      for (const s of strokes.current) {
        ctx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over';
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        // A marker is broad and even, like the text highlighter. The brush
        // keeps the pressure/speed taper below, so the two tools do not feel
        // like the same pen with a different icon.
        ctx.shadowColor = s.tool === 'marker' ? s.color : 'transparent';
        ctx.shadowBlur = s.tool === 'marker' ? 2 : 0;
        traceStroke(s, ox, oy);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(redraw);
    };
    const scheduleScrollRedraw = () => {
      // Until somebody draws, scrolling cannot change this transparent canvas.
      // Clearing the entire viewport on every scroll frame was a large hidden
      // cost on the default page experience.
      if (strokes.current.length > 0) schedule();
    };
    redraw();

    let current: Stroke | null = null;
    let lastT = 0;
    let lastW = BASE_W;

    // Stylus reports real pressure; a mouse always reports 0.5, so fall back to
    // speed — fast strokes thin out, slow ones sit heavier, like a real nib.
    const widthFor = (e: PointerEvent, prev: Pt | undefined) => {
      // Erasing should have a predictable footprint instead of inheriting the
      // brush's pressure/speed taper.
      if (toolRef.current === 'eraser') return 14;
      // Marker freehand uses an even, wide band to match text highlighting —
      // never the brush's tapered pressure response.
      if (toolRef.current === 'slant') return 10;
      let target: number;
      if (e.pointerType === 'pen' && e.pressure > 0) {
        target = BASE_W * (0.25 + e.pressure * 1.5);
      } else {
        const now = performance.now();
        const dt = Math.max(1, now - lastT);
        lastT = now;
        const dist = prev ? Math.hypot(e.clientX + window.scrollX - prev.x, e.clientY + window.scrollY - prev.y) : 0;
        const speed = dist / dt; // px per ms
        target = BASE_W * (1.35 - Math.min(1, speed / 2.2) * 0.85);
      }
      // Ease toward the target so width never steps abruptly mid-stroke.
      lastW += (target - lastW) * 0.35;
      return Math.max(0.6, lastW / 2);
    };

    const isUiTarget = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;
      // The brush is global so it can draw over normal page content, but it
      // must never take ownership of a gesture meant to move a file card,
      // operate the dock, submit a form, or follow a link.
      return Boolean(
        element?.closest(
          "[aria-label='Highlighter tray'],[data-note-card],[data-brush-ignore],button,input,textarea,select,a,[role='button'],[role='slider']",
        ),
      );
    };

    const startsOnText = (x: number, y: number) => {
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
      };
      const range = doc.caretRangeFromPoint?.(x, y);
      const node = range?.startContainer ?? doc.caretPositionFromPoint?.(x, y)?.offsetNode ?? null;
      return node?.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim());
    };

    let activePointerId: number | null = null;

    const down = (e: PointerEvent) => {
      if (!activeRef.current) return;
      const tool = toolRef.current;
      if (tool !== 'brush' && tool !== 'eraser' && tool !== 'slant') return;
      if (!e.isPrimary || e.button !== 0 || activePointerId !== null) return;
      if (isUiTarget(e.target)) return;
      // On real text, preserve native selection for the highlighter overlay.
      // On blank space, the same marker becomes a direct chisel stroke.
      if (tool === 'slant' && startsOnText(e.clientX, e.clientY)) return;
      e.preventDefault();
      activePointerId = e.pointerId;
      lastT = performance.now();
      lastW = tool === 'eraser' ? 28 : BASE_W;
      current = {
        mode: tool === 'eraser' ? 'erase' : 'paint',
        tool: tool === 'eraser' ? 'eraser' : tool === 'slant' ? 'marker' : 'brush',
        color: colorRef.current,
        alpha: tool === 'eraser' ? 1 : tool === 'slant' ? Math.min(0.85, alphaRef.current) : alphaRef.current,
        pts: [{ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, w: widthFor(e, undefined) }],
      };
      strokes.current.push(current);
      schedule();
    };
    const move = (e: PointerEvent) => {
      if (!current || activePointerId !== e.pointerId) return;
      // If another component cancelled the pointer gesture, stop cleanly
      // rather than continuing a stroke on later pointer movement.
      if (e.buttons === 0) {
        current = null;
        activePointerId = null;
        return;
      }
      // Coalesced events give the full sub-frame path, so fast strokes stay smooth.
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const prev = current.pts[current.pts.length - 1];
        current.pts.push({
          x: ev.clientX + window.scrollX,
          y: ev.clientY + window.scrollY,
          w: widthFor(ev as PointerEvent, prev),
        });
      }
      schedule();
    };
    const up = (e?: PointerEvent) => {
      if (e && activePointerId !== e.pointerId) return;
      current = null;
      activePointerId = null;
    };
    const clear = () => {
      strokes.current = [];
      schedule();
    };

    // Listen on the window, not the canvas. The canvas stays click-through so
    // text is selectable in marker mode, yet empty page areas can still draw.
    window.addEventListener('pointerdown', down, { capture: true, passive: false });
    window.addEventListener('pointermove', move, { capture: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    window.addEventListener('scroll', scheduleScrollRedraw, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener(CLEAR_EVENT, clear);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      window.removeEventListener('scroll', scheduleScrollRedraw);
      window.removeEventListener('resize', schedule);
      window.removeEventListener(CLEAR_EVENT, clear);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-[95] h-full w-full"
      style={{ pointerEvents: 'none' }}
    />
  );
}
