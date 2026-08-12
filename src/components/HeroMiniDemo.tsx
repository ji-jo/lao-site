import { useEffect, useRef, useState } from "react";

const DEMO_WIDTH = 1282;
const DEMO_HEIGHT = 914;
const DEMO_SRC = "/lao-demo/index.html";

type LaoDemoWheelMessage = {
  type: "lao-demo-wheel";
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
};

type LaoDemoPointerDetail = {
  clientX: number;
  clientY: number;
};

export default function HeroMiniDemo() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pointerBoundsRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const fitDemo = () => {
      // Use the stable layout box rather than getBoundingClientRect(). The
      // latter includes the laptop lid's opening transform, so measuring while
      // the lid is closed permanently shrinks the studio inside the screen.
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      setScale(Math.max(width / DEMO_WIDTH, height / DEMO_HEIGHT));
    };

    const observer = new ResizeObserver(fitDemo);
    observer.observe(viewport);
    fitDemo();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const LINE_HEIGHT = 16;
    const PAGE_WIDTH = window.innerWidth;
    const PAGE_HEIGHT = window.innerHeight;

    const onMessage = (event: MessageEvent<LaoDemoWheelMessage>) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.type !== "lao-demo-wheel"
      ) {
        return;
      }

      // Accept same-origin prod embeds and localhost:5180 demo during local work.
      // (event.origin check alone blocked cross-port wheel forwarding.)

      let { deltaX, deltaY } = event.data;
      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

      const mode = event.data.deltaMode ?? 0;
      if (mode === 1) {
        deltaX *= LINE_HEIGHT;
        deltaY *= LINE_HEIGHT;
      } else if (mode === 2) {
        deltaX *= PAGE_WIDTH;
        deltaY *= PAGE_HEIGHT;
      }

      window.scrollBy({
        left: deltaX,
        top: deltaY,
        behavior: "auto",
      });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let frameWindow: Window | null = null;

    const syncPointerBounds = () => {
      const { left, top, width, height } = iframe.getBoundingClientRect();
      pointerBoundsRef.current = { left, top, width, height };
    };

    const relayPointerPosition = (event: MouseEvent) => {
      const rect = pointerBoundsRef.current;
      if (rect.width <= 0 || rect.height <= 0) return;

      // The studio is scaled inside the MacBook screen. Convert the iframe's
      // local mouse coordinates back to the visible viewport coordinates so
      // the parent hint follows the real pointer precisely.
      const detail: LaoDemoPointerDetail = {
        clientX: rect.left + event.clientX * (rect.width / DEMO_WIDTH),
        clientY: rect.top + event.clientY * (rect.height / DEMO_HEIGHT),
      };
      window.dispatchEvent(new CustomEvent<LaoDemoPointerDetail>("lao-demo-pointermove", { detail }));
    };

    const relayPointerLeave = () => window.dispatchEvent(new Event("lao-demo-pointerleave"));

    const connectPointerRelay = () => {
      frameWindow?.removeEventListener("mousemove", relayPointerPosition);
      frameWindow?.removeEventListener("mouseleave", relayPointerLeave);
      frameWindow = iframe.contentWindow;
      frameWindow?.addEventListener("mousemove", relayPointerPosition, { passive: true });
      frameWindow?.addEventListener("mouseleave", relayPointerLeave);
    };

    iframe.addEventListener("load", connectPointerRelay);
    const resizeObserver = new ResizeObserver(syncPointerBounds);
    resizeObserver.observe(iframe);
    window.addEventListener("scroll", syncPointerBounds, { passive: true, capture: true });
    syncPointerBounds();
    connectPointerRelay();
    return () => {
      iframe.removeEventListener("load", connectPointerRelay);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", syncPointerBounds, true);
      frameWindow?.removeEventListener("mousemove", relayPointerPosition);
      frameWindow?.removeEventListener("mouseleave", relayPointerLeave);
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className="absolute inset-0 overflow-hidden rounded-2xl bg-black"
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: DEMO_WIDTH,
          height: DEMO_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        <iframe
          ref={iframeRef}
          src={DEMO_SRC}
          title="Interactive LAO studio demo"
          width={DEMO_WIDTH}
          height={DEMO_HEIGHT}
          loading="eager"
          allow="autoplay"
          scrolling="no"
          className="block h-[914px] w-[1282px] border-0 max-md:pointer-events-none"
        />
      </div>
    </div>
  );
}
