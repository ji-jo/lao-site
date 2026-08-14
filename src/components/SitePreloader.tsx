import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/core/animated-number";
import { Component as PencilLoader } from "@/components/ui/loader-1";
import wordmarkUrl from "../../assets/wordmark.svg?url";
import palmUrl from "../../assets/palm.svg?url";
import cursorUrl from "../../assets/cursor-mac.svg?url";

const ASSET_SHARE = 0.8;
const FONT_SHARE = 0.1;
const PAGE_SHARE = 0.1;
const CRITICAL_ASSETS = [wordmarkUrl, palmUrl, cursorUrl];

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

async function waitForWindowLoad() {
  if (document.readyState === "complete") return;
  await new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
}

export default function SitePreloader() {
  const [progress, setProgress] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const progressRef = useRef(0);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("is-preloading");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const preventScroll = (event: Event) => event.preventDefault();
    const preventScrollKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventScrollKey);

    let cancelled = false;
    const startedAt = performance.now();
    let assetRatio = 0;
    let fontsReady = false;
    let pageReady = false;

    const publish = () => {
      if (cancelled) return;
      const next = clampPercent(
        (assetRatio * ASSET_SHARE
          + Number(fontsReady) * FONT_SHARE
          + Number(pageReady) * PAGE_SHARE) * 100,
      );
      const monotonic = Math.max(progressRef.current, next);
      progressRef.current = monotonic;
      setProgress(monotonic);
    };

    const preloadAssets = async () => {
      const responses = await Promise.all(
        CRITICAL_ASSETS.map(async (url) => {
          const response = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
          if (!response.ok) throw new Error(`Unable to preload ${url}: ${response.status}`);
          return {
            response,
            total: Number(response.headers.get("content-length")) || 1,
            loaded: 0,
          };
        }),
      );

      const totalBytes = responses.reduce((sum, item) => sum + item.total, 0);
      const updateAssetRatio = () => {
        assetRatio = responses.reduce((sum, item) => sum + item.loaded, 0) / totalBytes;
        publish();
      };

      await Promise.all(
        responses.map(async (item) => {
          const reader = item.response.body?.getReader();
          if (!reader) {
            await item.response.arrayBuffer();
            item.loaded = item.total;
            updateAssetRatio();
            return;
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            item.loaded = Math.min(item.total, item.loaded + value.byteLength);
            updateAssetRatio();
          }
          item.loaded = item.total;
          updateAssetRatio();
        }),
      );
    };

    const finish = async () => {
      try {
        await Promise.all([
          preloadAssets(),
          document.fonts.ready.then(() => { fontsReady = true; publish(); }),
          waitForWindowLoad().then(() => { pageReady = true; publish(); }),
        ]);
      } catch (error) {
        console.error("Critical asset preload failed; continuing with rendered fallbacks.", error);
      }

      // Keep the preloader around long enough for the visible counter to count
      // through each integer, even when the browser serves files from cache.
      const minimumDisplay = Math.max(0, 2_300 - (performance.now() - startedAt));
      await new Promise((resolve) => window.setTimeout(resolve, minimumDisplay));
      if (cancelled) return;

      progressRef.current = 100;
      setProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      if (cancelled) return;
      setIsLeaving(true);
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      if (cancelled) return;

      html.classList.remove("is-preloading");
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventScrollKey);
      setIsVisible(false);
    };

    void finish();
    return () => {
      cancelled = true;
      html.classList.remove("is-preloading");
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventScrollKey);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`site-preloader ${isLeaving ? "site-preloader--leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading site assets: ${progress}%`}
    >
      <div className="site-preloader__content">
        <PencilLoader className="site-preloader__pencil" />
        <output className="site-preloader__progress" aria-label={`${progress} percent loaded`}>
          <AnimatedNumber
            value={progress}
            springOptions={{ bounce: 0, duration: 1_800 }}
          />
          %
        </output>
        <p className="site-preloader__label">Preparing the canvas</p>
      </div>
    </div>
  );
}
