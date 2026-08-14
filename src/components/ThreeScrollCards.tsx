import { useEffect, useRef, useState } from 'react';
import OpenItLaoAnimation from './OpenItLaoAnimation';

const CARDS = [
  { text: 'Open Lao', enterStart: 0, enterDistance: 0.18, rotationZ: -3, zOffset: 0, targetPctX: 22, targetPctY: 34, offsetX: 72 },
  { text: 'Sketch', enterStart: 0.22, enterDistance: 0.18, rotationZ: 0, zOffset: 24, targetPctX: 50, targetPctY: 50, offsetX: 0 },
  { text: '& Action', enterStart: 0.44, enterDistance: 0.18, rotationZ: 3, zOffset: 48, targetPctX: 73, targetPctY: 67, offsetX: 0 },
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
  const [isSectionActive, setIsSectionActive] = useState(false);
  const [openCardSettled, setOpenCardSettled] = useState(false);
  const [sketchCardSettled, setSketchCardSettled] = useState(false);
  const [actionCardSettled, setActionCardSettled] = useState(false);
  const [actionAnimationComplete, setActionAnimationComplete] = useState(false);

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
      const openCard = CARDS[0];
      const shouldPlayOpenAnimation = globalProgress >= openCard.enterStart + openCard.enterDistance;
      if (shouldPlayOpenAnimation) setOpenCardSettled(true);
      const sketchCard = CARDS[1];
      const shouldPlaySketchAnimation = globalProgress >= sketchCard.enterStart + sketchCard.enterDistance;
      if (shouldPlaySketchAnimation) setSketchCardSettled(true);
      const actionCard = CARDS[2];
      const shouldPlayActionAnimation = globalProgress >= actionCard.enterStart + actionCard.enterDistance;
      if (shouldPlayActionAnimation) setActionCardSettled(true);

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const config = CARDS[index];
        const localProgress = clamp((globalProgress - config.enterStart) / config.enterDistance);
        const entered = smootherstep(localProgress);
        const { width: cardWidth, height: cardHeight } = cardSizesRef.current[index];
        const startX = -cardWidth * 1.35;
        const targetX = viewportWidth * (config.targetPctX / 100) - cardWidth / 2 + config.offsetX;
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
        setIsSectionActive((previous) => previous === active ? previous : active);
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

  useEffect(() => {
    if (!actionCardSettled) return;

    const timeout = window.setTimeout(() => {
      setActionAnimationComplete(true);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [actionCardSettled]);

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
              transform: `translate3d(-140%, ${card.targetPctY}vh, ${card.zOffset}px) rotateY(46deg) rotateZ(${card.rotationZ}deg)`,
              zIndex: index + 1,
            }}
          >
            {index === 0 || index === 1 || index === 2 ? (
              <>
                {/* The outer frame only clips at the bottom; its extended top preserves
                    the full illustration while leaving the title area clear. */}
                <div className="absolute inset-x-7 top-[-160px] bottom-[76px] overflow-hidden">
                  <div className="absolute inset-x-0 top-[166px] bottom-0 flex items-center justify-center">
                    {(
                      (index === 0 && openCardSettled)
                      || (index === 1 && sketchCardSettled)
                      || (index === 2 && actionCardSettled)
                    ) ? (
                      <OpenItLaoAnimation
                        className="aspect-square h-full w-auto max-w-none origin-center scale-[1.6]"
                        src={index === 0
                          ? '/media/open-it-lao-animation.svg'
                          : index === 1
                            ? '/media/sketch-lao-animation.svg'
                            : actionAnimationComplete
                              ? '/media/action-lao-frame-1.svg'
                              : '/media/action-lao-animation.svg'}
                      />
                    ) : null}
                  </div>
                </div>

                <span className="absolute inset-x-4 bottom-4 text-center leading-none">
                  {card.text}
                </span>
              </>
            ) : card.text}
          </article>
        ))}
      </div>
    </div>
  );
}
