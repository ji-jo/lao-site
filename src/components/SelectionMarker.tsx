import { useEffect, useRef } from "react";
import { useSelectionStyle } from "../selection-style.tsx";
import { CLEAR_EVENT } from "./dock/ClearButton.tsx";

// Native range geometry is viewport-relative. Keeping the overlay fixed to the
// viewport avoids the anchor drift the previous renderer had inside Lenis/
// transformed story sections.
export function SelectionMarker(): null {
  const { style } = useSelectionStyle();
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "98",
      pointerEvents: "none",
      overflow: "hidden",
    });
    document.body.appendChild(overlay);

    let frame = 0;
    const clear = () => {
      overlay.replaceChildren();
    };
    const paint = () => {
      frame = 0;
      const active = styleRef.current;
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const anchor = selection?.anchorNode instanceof Element
        ? selection.anchorNode
        : selection?.anchorNode?.parentElement;
      if (
        active.pen !== "slant" || !selection || selection.rangeCount === 0 || !text ||
        anchor?.closest("[aria-label='Highlighter tray'], input, textarea, select, button")
      ) {
        clear();
        return;
      }

      const fragment = document.createDocumentFragment();
      const rects = Array.from(selection.getRangeAt(0).getClientRects());
      for (const rect of rects) {
        if (rect.width < 1 || rect.height < 1) continue;
        const band = document.createElement("div");
        Object.assign(band.style, {
          position: "absolute",
          left: `${rect.left - 2}px`,
          top: `${rect.top + rect.height * 0.12}px`,
          width: `${rect.width + 4}px`,
          height: `${Math.max(10, rect.height * 0.74)}px`,
          background: `linear-gradient(100deg, transparent 0, ${active.color} 4px, ${active.color} calc(100% - 4px), transparent 100%)`,
          opacity: String(active.opacity),
          mixBlendMode: "screen",
          filter: `drop-shadow(0 0 2px ${active.color})`,
          clipPath: "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)",
          transform: "skewX(-4deg)",
        });
        fragment.appendChild(band);
      }
      overlay.replaceChildren(fragment);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onClear = () => {
      window.getSelection()?.removeAllRanges();
      clear();
    };

    document.addEventListener("selectionchange", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener(CLEAR_EVENT, onClear);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener(CLEAR_EVENT, onClear);
      overlay.remove();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("selection-marker-active", style.pen === "slant");
    return () => document.documentElement.classList.remove("selection-marker-active");
  }, [style.pen]);

  return null;
}
