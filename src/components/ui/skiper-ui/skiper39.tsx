"use client";

import { gsap } from "gsap";
import React, { useEffect, useRef, useState } from "react";

const BUST_SRCS = [
  1, 2, 3, 4, 8, 10, 11, 13, 14, 16, 17, 18, 19, 21, 22, 23, 26, 27,
].map((n) => `/images/peeps/bust/peep-${n}.svg`);

interface CrowdCanvasProps {
  srcs?: string[];
  count?: number;
  scale?: number;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const CrowdCanvas = ({
  srcs = BUST_SRCS,
  count = 10,
  scale = 0.72,
}: CrowdCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const randomRange = (min: number, max: number) => min + Math.random() * (max - min);
    const randomIndex = (array: any[]) => randomRange(0, array.length) | 0;
    const removeFromArray = (array: any[], i: number) => array.splice(i, 1)[0];
    const removeItemFromArray = (array: any[], item: any) =>
      removeFromArray(array, array.indexOf(item));
    const removeRandomFromArray = (array: any[]) => removeFromArray(array, randomIndex(array));
    const getRandomFromArray = (array: any[]) => array[randomIndex(array) | 0];

    type Peep = {
      image: HTMLImageElement;
      width: number;
      height: number;
      x: number;
      y: number;
      anchorY: number;
      scaleX: number;
      walk: gsap.core.Timeline | null;
      render: (context: CanvasRenderingContext2D) => void;
    };

    const resetPeep = ({ stage, peep }: { stage: { width: number; height: number }; peep: Peep }) => {
      const direction = Math.random() > 0.5 ? 1 : -1;
      const offsetY = 100 - 250 * gsap.parseEase("power2.in")(Math.random());
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

      return { startX, startY, endX };
    };

    const normalWalk = ({ peep, props }: { peep: Peep; props: { startX: number; startY: number; endX: number } }) => {
      const { startX, startY, endX } = props;
      const xDuration = 10;
      const yDuration = 0.25;
      const tl = gsap.timeline();
      tl.timeScale(randomRange(0.5, 1.5));
      tl.to(peep, { duration: xDuration, x: endX, ease: "none" }, 0);
      tl.to(
        peep,
        {
          duration: yDuration,
          repeat: xDuration / yDuration,
          yoyo: true,
          y: startY - 10,
        },
        0,
      );
      return tl;
    };

    const walks = [normalWalk];

    const createPeep = ({ image }: { image: HTMLImageElement }): Peep => {
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const peep: Peep = {
        image,
        width,
        height,
        x: 0,
        y: 0,
        anchorY: 0,
        scaleX: 1,
        walk: null,
        render: (context) => {
          context.save();
          context.translate(peep.x, peep.y);
          context.scale(peep.scaleX, 1);
          context.drawImage(peep.image, 0, 0, peep.width, peep.height);
          context.restore();
        },
      };
      return peep;
    };

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const stage = { width: 0, height: 0 };
    const allPeeps: Peep[] = [];
    const availablePeeps: Peep[] = [];
    const crowd: Peep[] = [];
    let cancelled = false;
    let initialized = false;
    let isVisible = false;
    let pageVisible = !document.hidden;
    let tickerAttached = false;

    const addPeepToCrowd = () => {
      if (!availablePeeps.length) return null;
      const peep = removeRandomFromArray(availablePeeps) as Peep;
      const walk = getRandomFromArray(walks)({
        peep,
        props: resetPeep({ peep, stage }),
      }).eventCallback("onComplete", () => {
        removePeepFromCrowd(peep);
        addPeepToCrowd();
      });

      peep.walk = walk;
      if (reducedMotion) {
        walk.progress(Math.random());
        walk.pause();
      } else if (!isVisible || !pageVisible) {
        walk.pause();
      }

      crowd.push(peep);
      crowd.sort((a, b) => a.anchorY - b.anchorY);
      return peep;
    };

    const removePeepFromCrowd = (peep: Peep) => {
      removeItemFromArray(crowd, peep);
      availablePeeps.push(peep);
    };

    const render = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      crowd.forEach((peep) => peep.render(ctx));
    };

    const attachTicker = () => {
      if (tickerAttached || reducedMotion || !initialized || !isVisible || !pageVisible) return;
      gsap.ticker.add(render);
      tickerAttached = true;
      crowd.forEach((peep) => peep.walk?.resume());
    };

    const detachTicker = () => {
      if (!tickerAttached) return;
      gsap.ticker.remove(render);
      tickerAttached = false;
      crowd.forEach((peep) => peep.walk?.pause());
    };

    const initCrowd = () => {
      const initialCount = Math.min(count, availablePeeps.length);
      for (let index = 0; index < initialCount; index += 1) {
        const peep = addPeepToCrowd();
        if (peep?.walk && !reducedMotion) peep.walk.progress(Math.random());
      }
    };

    const resize = () => {
      stage.width = canvas.clientWidth;
      stage.height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(stage.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(stage.height * pixelRatio));

      crowd.forEach((peep) => peep.walk?.kill());
      crowd.length = 0;
      availablePeeps.length = 0;
      availablePeeps.push(...allPeeps);
      initCrowd();
      render();
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry?.isIntersecting ?? false;
        if (isVisible) attachTicker();
        else detachTicker();
      },
      { rootMargin: "0px" },
    );
    intersectionObserver.observe(canvas);

    const handleVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) attachTicker();
      else detachTicker();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (!resizeFrame) {
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          if (initialized) resize();
        });
      }
    });
    resizeObserver.observe(canvas);

    void Promise.allSettled(srcs.map(loadImage)).then((results) => {
      if (cancelled) return;
      results.forEach((result) => {
        if (result.status === "fulfilled") allPeeps.push(createPeep({ image: result.value }));
      });
      if (!allPeeps.length) return;
      initialized = true;
      resize();
      attachTicker();
    });

    return () => {
      cancelled = true;
      detachTicker();
      crowd.forEach((peep) => peep.walk?.kill());
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [count, scale, srcs]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
};

const FooterCrowd = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setReady(true);
        observer.disconnect();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="relative z-0 h-[400px] w-full max-w-full shrink-0 overflow-hidden md:absolute md:inset-x-0 md:bottom-0"
      aria-hidden="true"
    >
      {ready ? <CrowdCanvas /> : null}
    </div>
  );
};

const Skiper39 = () => {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-x-0 bottom-0 h-full">
        <CrowdCanvas />
      </div>
    </div>
  );
};

export { CrowdCanvas, FooterCrowd, Skiper39, BUST_SRCS };
