import { useEffect, useRef } from 'react';

const CARDS = [
  { text: 'Open it', enterStart: 0, enterDistance: 0.18, rotationZ: -3, zOffset: 0, targetPctX: 22, targetPctY: 34 },
  { text: 'Draw it', enterStart: 0.22, enterDistance: 0.18, rotationZ: 0, zOffset: 24, targetPctX: 50, targetPctY: 50 },
  { text: 'Already moving', enterStart: 0.44, enterDistance: 0.18, rotationZ: 3, zOffset: 48, targetPctX: 73, targetPctY: 67 },
] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smootherstep = (value: number) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export default function ThreeScrollCards() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const cardSizesRef = useRef(CARDS.map(() => ({ width: 0, height: 0 })));

  useEffect(() => {
    let frame = 0;
    let active = false;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    const measure = () => {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        cardSizesRef.current[index] = {
          width: card.offsetWidth,
          height: card.offsetHeight,
        };
      });
    };

    const updateCards = () => {
      frame = 0;
      if (!active) return;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const travel = Math.max(1, rect.height - viewportHeight);
      const globalProgress = clamp(-rect.top / travel);

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const config = CARDS[index];
        const localProgress = clamp((globalProgress - config.enterStart) / config.enterDistance);
        const entered = smootherstep(localProgress);
        const { width: cardWidth, height: cardHeight } = cardSizesRef.current[index];
        const startX = -cardWidth * 0.72;
        const targetX = viewportWidth * (config.targetPctX / 100) - cardWidth / 2;
        const targetY = viewportHeight * (config.targetPctY / 100) - cardHeight / 2;
        const x = startX + (targetX - startX) * entered;
        const rotationY = 46 * (1 - entered);
        const isVisible = index === 0 || globalProgress >= config.enterStart;

        card.style.opacity = isVisible ? String(index === 0 ? 1 : clamp(localProgress * 5)) : '0';
        card.style.visibility = isVisible ? 'visible' : 'hidden';
        card.style.transform = `translate3d(${x}px, ${targetY}px, ${config.zOffset}px) rotateY(${rotationY}deg) rotateZ(${config.rotationZ}deg)`;
      });
    };

    const scheduleUpdate = () => {
      if (active && !frame) frame = requestAnimationFrame(updateCards);
    };

    const handleResize = () => {
      measure();
      scheduleUpdate();
    };

    measure();
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        active = entry?.isIntersecting ?? false;
        if (active) scheduleUpdate();
        else if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: '50% 0px 50% 0px' },
    );
    if (containerRef.current) intersectionObserver.observe(containerRef.current);

    const resizeObserver = new ResizeObserver(handleResize);
    cardRefs.current.forEach((card) => card && resizeObserver.observe(card));

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative z-10 h-full w-full pointer-events-none">
      <div className="sticky top-0 h-[100dvh] w-full overflow-hidden [perspective:1100px]">
        {CARDS.map((card, index) => (
          <article
            key={card.text}
            ref={(node) => { cardRefs.current[index] = node; }}
            className="absolute left-0 top-0 flex h-[clamp(190px,24vw,315px)] w-[clamp(250px,31vw,420px)] items-center justify-center rounded-[18px] border border-white/10 bg-[#303030] px-8 text-center font-display text-[clamp(28px,3vw,42px)] text-[#e8e4dc] shadow-[0_26px_70px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.09)] [backface-visibility:hidden] [transform-style:preserve-3d] will-change-transform"
            style={{
              opacity: index === 0 ? 1 : 0,
              visibility: index === 0 ? 'visible' : 'hidden',
              transform: `translate3d(-72%, ${card.targetPctY}vh, ${card.zOffset}px) rotateY(46deg) rotateZ(${card.rotationZ}deg)`,
              zIndex: index + 1,
            }}
          >
            {card.text}
          </article>
        ))}
      </div>
    </div>
  );
}
