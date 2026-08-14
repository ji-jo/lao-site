"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";

interface CrowdCanvasProps {
  src: string;
  rows?: number;
  cols?: number;
  count?: number;
  scale?: number;
  maxFps?: number;
  pixelRatio?: number;
  maxPixels?: number;
}

// Keep the registry animation intact while excluding every pose belonging to
// the two unwanted head-covered characters.
const EXCLUDED_FRAMES = new Set([12, 24, 25, 35, 60, 62, 63, 65, 70, 75, 85, 87, 98]);
const spriteRectCache = new Map<string, number[][]>();

const CrowdCanvas = ({
  src,
  rows = 15,
  cols = 7,
  count = 12,
  scale = 1,
  maxFps = 15,
  pixelRatio = 1,
  maxPixels = 360_000,
}: CrowdCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";

    const config = {
      src,
      rows,
      cols,
    };

    // UTILS
    const randomRange = (min: number, max: number) =>
      min + Math.random() * (max - min);
    const randomIndex = (array: any[]) => randomRange(0, array.length) | 0;
    const removeFromArray = (array: any[], i: number) => array.splice(i, 1)[0];
    const removeItemFromArray = (array: any[], item: any) =>
      removeFromArray(array, array.indexOf(item));
    const removeRandomFromArray = (array: any[]) =>
      removeFromArray(array, randomIndex(array));
    const getRandomFromArray = (array: any[]) => array[randomIndex(array) | 0];
    // Restore GSAP's hand-drawn ease without restoring a GSAP timeline for
    // every person. The canvas owns the frame loop, so GSAP never runs its
    // 60fps ticker for this footer.
    const walkEase = gsap.parseEase("power2.inOut");

    // TWEEN FACTORIES
    const resetPeep = ({ stage, peep }: { stage: any; peep: any }) => {
      const direction = Math.random() > 0.5 ? 1 : -1;
      // Never push a character below the canvas edge: the positive offset
      // cropped their lower body in the footer crowd.
      const offsetY = -150 * Math.pow(Math.random(), 2);
      const startY = stage.height - peep.height + offsetY;
      let startX: number;
      let endX: number;

      if (direction === 1) {
        startX = -peep.width;
        endX = stage.width;
        peep.scaleX = 1;
      } else {
        startX = stage.width + peep.width;
        endX = 0;
        peep.scaleX = -1;
      }

      peep.x = startX;
      peep.y = startY;
      peep.anchorY = startY;

      return {
        startX,
        startY,
        endX,
      };
    };

    // TYPES
    type Peep = {
      image: HTMLImageElement;
      rect: number[];
      width: number;
      height: number;
      drawArgs: any[];
      x: number;
      y: number;
      anchorY: number;
      scaleX: number;
      startX: number;
      endX: number;
      walkStart: number;
      walkDuration: number;
      bobCycles: number;
      setRect: (rect: number[]) => void;
      render: (ctx: CanvasRenderingContext2D) => void;
    };

    // FACTORY FUNCTIONS
    const createPeep = ({
      image,
      rect,
      scale,
    }: {
      image: HTMLImageElement;
      rect: number[];
      scale: number;
    }): Peep => {
      const peep: Peep = {
        image,
        rect: [],
        width: 0,
        height: 0,
        drawArgs: [],
        x: 0,
        y: 0,
        anchorY: 0,
        scaleX: 1,
        startX: 0,
        endX: 0,
        walkStart: 0,
        walkDuration: 0,
        bobCycles: 1,
        setRect: (rect: number[]) => {
          peep.rect = rect;
          peep.width = rect[2] * scale;
          peep.height = rect[3] * scale;
          peep.drawArgs = [peep.image, ...rect, 0, 0, peep.width, peep.height];
        },
        render: (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          ctx.translate(peep.x, peep.y);
          ctx.scale(peep.scaleX, 1);
          ctx.drawImage(
            peep.image,
            peep.rect[0],
            peep.rect[1],
            peep.rect[2],
            peep.rect[3],
            0,
            0,
            peep.width,
            peep.height,
          );
          ctx.restore();
        },
      };

      peep.setRect(rect);
      return peep;
    };

    // MAIN
    const img = document.createElement("img");
    const stage = {
      width: 0,
      height: 0,
    };

    const allPeeps: Peep[] = [];
    const availablePeeps: Peep[] = [];
    const crowd: Peep[] = [];
    const sampleSize = 32;
    const sample = document.createElement("canvas");
    sample.width = sampleSize;
    sample.height = sampleSize;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });

    // Some cells in the source sheet are deliberately blank/black. Detect
    // those at runtime rather than ever choosing them as a crowd member.
    const isEmptySpriteCell = (rect: number[]) => {
      if (!sampleContext) return false;

      sampleContext.clearRect(0, 0, sampleSize, sampleSize);
      sampleContext.drawImage(
        img,
        rect[0],
        rect[1],
        rect[2],
        rect[3],
        0,
        0,
        sampleSize,
        sampleSize,
      );

      const pixels = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;
      let brightPixelCount = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 120) {
          brightPixelCount += 1;
          if (brightPixelCount >= 4) return false;
        }
      }

      return true;
    };

    const createPeeps = () => {
      const { rows, cols } = config;
      const { naturalWidth: width, naturalHeight: height } = img;
      const total = rows * cols;
      // Preserve the original sprite convention: `rows` is the horizontal
      // frame count and `cols` is the vertical frame count.
      const rectWidth = width / rows;
      const rectHeight = height / cols;

      const cacheKey = `${src}:${width}x${height}:${rows}x${cols}`;
      let validRects = spriteRectCache.get(cacheKey);
      if (!validRects) {
        validRects = [];
        for (let i = 0; i < total; i++) {
          const rect = [
            (i % rows) * rectWidth,
            Math.floor(i / rows) * rectHeight,
            rectWidth,
            rectHeight,
          ];
          if (!EXCLUDED_FRAMES.has(i) && !isEmptySpriteCell(rect)) validRects.push(rect);
        }
        spriteRectCache.set(cacheKey, validRects);
      }

      validRects.forEach((rect) => {
        allPeeps.push(createPeep({ image: img, rect, scale }));
      });
    };

    const initCrowd = () => {
      const initialCount = Math.min(count, availablePeeps.length);
      for (let index = 0; index < initialCount; index += 1) {
        const peep = addPeepToCrowd();
        if (peep) peep.walkStart -= Math.random() * peep.walkDuration;
      }
    };

    const addPeepToCrowd = () => {
      if (!availablePeeps.length) return null;
      const peep = removeRandomFromArray(availablePeeps);
      const { startX, endX } = resetPeep({ peep, stage });
      peep.startX = startX;
      peep.endX = endX;
      peep.walkStart = motionElapsed;
      // A slow, readable crossing: no frantic movement in the footer.
      peep.walkDuration = 24_000 / randomRange(0.65, 1.05);
      peep.bobCycles = randomRange(1, 1.7);

      crowd.push(peep);
      crowd.sort((a, b) => a.anchorY - b.anchorY);

      return peep;
    };

    const removePeepFromCrowd = (peep: Peep) => {
      removeItemFromArray(crowd, peep);
      availablePeeps.push(peep);
    };

    const requestedPixelRatio = Math.max(0.35, Math.min(window.devicePixelRatio || 1, pixelRatio));
    const frameInterval = 1000 / Math.max(1, maxFps);
    let renderFrame = 0;
    let renderTimer = 0;
    let lastMotionAt = 0;
    let motionElapsed = 0;
    let renderRatio = requestedPixelRatio;
    let initialized = false;
    let isVisible = false;
    let pageVisible = !document.hidden;

    const updateCrowd = (delta: number) => {
      motionElapsed += delta;
      for (let index = crowd.length - 1; index >= 0; index -= 1) {
        const peep = crowd[index];
        const progress = (motionElapsed - peep.walkStart) / peep.walkDuration;
        if (progress >= 1) {
          removePeepFromCrowd(peep);
          addPeepToCrowd();
          continue;
        }
        const easedProgress = walkEase(progress);
        peep.x = gsap.utils.interpolate(peep.startX, peep.endX, easedProgress);
        peep.y = peep.anchorY - Math.abs(Math.sin(easedProgress * Math.PI * peep.bobCycles)) * 7;
      }
    };

    const scheduleRender = (delay = frameInterval) => {
      if (!initialized || !isVisible || !pageVisible || renderFrame || renderTimer) return;
      renderTimer = window.setTimeout(() => {
        renderTimer = 0;
        renderFrame = requestAnimationFrame(render);
      }, delay);
    };

    const render = (now: number) => {
      renderFrame = 0;
      if (!initialized || !isVisible || !pageVisible) return;
      const delta = lastMotionAt ? Math.min(now - lastMotionAt, 100) : 0;
      lastMotionAt = now;
      updateCrowd(delta);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(renderRatio, 0, 0, renderRatio, 0, 0);
      crowd.forEach((peep) => peep.render(ctx));
      scheduleRender();
    };

    const startRendering = () => {
      if (!initialized || !isVisible || !pageVisible) return;
      lastMotionAt = 0;
      scheduleRender(0);
    };

    const stopRendering = () => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      if (renderTimer) window.clearTimeout(renderTimer);
      renderFrame = 0;
      renderTimer = 0;
      lastMotionAt = 0;
    };

    const resize = () => {
      if (!canvas) return;
      const nextWidth = Math.max(1, Math.round(canvas.clientWidth));
      const nextHeight = Math.max(1, Math.round(canvas.clientHeight));
      const nextRenderRatio = Math.max(
        0.35,
        Math.min(requestedPixelRatio, Math.sqrt(maxPixels / (nextWidth * nextHeight))),
      );
      if (
        nextWidth === stage.width
        && nextHeight === stage.height
        && nextRenderRatio === renderRatio
        && crowd.length
      ) return;
      stage.width = nextWidth;
      stage.height = nextHeight;
      renderRatio = nextRenderRatio;
      canvas.width = Math.max(1, Math.round(stage.width * renderRatio));
      canvas.height = Math.max(1, Math.round(stage.height * renderRatio));

      crowd.length = 0;
      availablePeeps.length = 0;
      availablePeeps.push(...allPeeps);

      initCrowd();
      lastMotionAt = 0;
      scheduleRender(0);
    };

    const init = () => {
      createPeeps();
      resize();
      initialized = true;
      startRendering();
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry?.isIntersecting ?? false;
        if (isVisible) startRendering();
        else stopRendering();
      },
      { rootMargin: "0px" },
    );
    intersectionObserver.observe(canvas);

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (!resizeFrame) {
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          resize();
        });
      }
    });
    resizeObserver.observe(canvas);

    const handleVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) startRendering();
      else stopRendering();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    img.decoding = "async";
    img.onload = init;
    img.src = config.src;

    return () => {
      img.onload = null;
      stopRendering();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cols, count, maxFps, maxPixels, pixelRatio, rows, scale, src]);
  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute bottom-0 h-full w-full [contain:strict]" />
  );
};

const Skiper39 = () => {
  return (
    <div className="relative h-full w-full">
      <div className="absolute bottom-0 h-full w-screen">
        <CrowdCanvas src="/images/peeps/all-peeps ori.webp" rows={15} cols={7} count={12} scale={0.8} />
      </div>
    </div>
  );
};

export { CrowdCanvas, Skiper39 };

/**
 * Skiper 39 Canvas_Landing_004 — React + Canvas
 * Inspired by and adapted from https://codepen.io/zadvorsky/pen/xxwbBQV
 * illustration by https://www.openpeeps.com/
 * We respect the original creators. This is an inspired rebuild with our own taste and does not claim any ownership.
 * These animations aren’t associated with the codepen.io . They’re independent recreations meant to study interaction design
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.me
 * Twitter: https://x.com/Gur__vi
 */
