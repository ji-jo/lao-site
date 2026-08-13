import { useEffect, useRef } from 'react';
import { useSelectionStyle } from '../selection-style';
import { CLEAR_EVENT } from './dock/ClearButton';
import highlighterCursorUrl from '../icons/sf/highlighter-fill.svg?url';
import brushCursorUrl from '../icons/sf/paint-brush-fill.svg?url';
import eraserCursorUrl from '../icons/sf/eraser-fill.svg?url';
import type { PenTip } from '../selection-style';

type Pt = { x: number; y: number; w: number };
type Stroke = { mode: 'paint' | 'erase'; color: string; alpha: number; pts: Pt[] };

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
  colorRef.current = style.color;
  alphaRef.current = style.opacity;
  toolRef.current = style.pen;

  useEffect(() => {
    document.documentElement.style.setProperty('--drawing-tool-cursor', TOOL_CURSORS[style.pen]);
    return () => document.documentElement.style.removeProperty('--drawing-tool-cursor');
  }, [style.pen]);

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
        traceStroke(s, ox, oy);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
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

    const down = (e: PointerEvent) => {
      const tool = toolRef.current;
      if (tool !== 'brush' && tool !== 'eraser') return;
      lastT = performance.now();
      lastW = tool === 'eraser' ? 28 : BASE_W;
      current = {
        mode: tool === 'eraser' ? 'erase' : 'paint',
        color: colorRef.current,
        alpha: tool === 'eraser' ? 1 : alphaRef.current,
        pts: [{ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, w: widthFor(e, undefined) }],
      };
      strokes.current.push(current);
      canvas.setPointerCapture(e.pointerId);
      schedule();
    };
    const move = (e: PointerEvent) => {
      if (!current) return;
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
    const up = () => {
      current = null;
    };
    const clear = () => {
      strokes.current = [];
      schedule();
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('scroll', scheduleScrollRedraw, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener(CLEAR_EVENT, clear);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('scroll', scheduleScrollRedraw);
      window.removeEventListener('resize', schedule);
      window.removeEventListener(CLEAR_EVENT, clear);
    };
  }, []);

  const active = style.pen === 'brush' || style.pen === 'eraser';
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-40 h-full w-full"
      style={{ pointerEvents: active ? 'auto' : 'none', cursor: active ? TOOL_CURSORS[style.pen] : 'auto' }}
    />
  );
}
