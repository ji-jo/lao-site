import { useEffect, useMemo, useRef, useState } from 'react';

const CROWD_SPRITE = '/images/peeps/all-peeps.optimized.webp';
const CROWD_COLUMNS = 15;
const CROWD_ROWS = 7;
// The original sprite is 3600 × 2268: each 15 × 7 frame is 240 × 324.
// Cards stay square; the taller source frame is bottom-aligned and crops only at its top.
const CROWD_FRAME_HEIGHT = 135;
const EXCLUDED_CROWD_FRAMES = new Set([12, 24, 25, 35, 60, 62, 63, 65, 70, 75, 85, 87, 98]);
const crowdFrames = Array.from({ length: CROWD_COLUMNS * CROWD_ROWS }, (_, index) => index)
  .filter((index) => !EXCLUDED_CROWD_FRAMES.has(index));

if (typeof window !== 'undefined') {
  const sprite = new Image();
  sprite.decoding = 'async';
  sprite.src = CROWD_SPRITE;
}

const rows = [
  { count: 4, size: 126, gapAfter: 112, gapAfterIndex: 1 },
  { count: 6, size: 112 },
  { count: 6, size: 74, gapAfter: 74, gapAfterIndex: 2 },
  { count: 7, size: 59 },
  { count: 8, size: 37 },
  { count: 6, size: 37 },
  { count: 4, size: 37 },
  { count: 2, size: 37 },
];

type Tile = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  frame: number;
  revealOrder: number;
  scatterX: number;
  scatterY: number;
  scatterRotate: number;
};

function makeTiles(): { tiles: Tile[]; width: number; height: number } {
  const gap = 9;
  const rowWidths = rows.map((row) =>
    row.count * row.size + (row.count - 1) * gap + (row.gapAfter ?? 0),
  );
  const width = Math.max(...rowWidths);
  const tiles: Tile[] = [];
  let y = 0;
  let id = 0;
  let revealOffset = 0;

  rows.forEach((row, rowIndex) => {
    const rowWidth = rowWidths[rowIndex];
    let x = (width - rowWidth) / 2;
    const columns = Array.from({ length: row.count }, (_, index) => index);
    const revealColumns = rowIndex % 2 === 0 ? columns : [...columns].reverse();

    for (let col = 0; col < row.count; col += 1) {
      const seed = (rowIndex * 131 + col * 17 + 7) * 0.618;
      const angle = seed * Math.PI * 2;
      const distance = 490 + ((rowIndex + col * 7) % 6) * 72;

      tiles.push({
        id,
        x,
        y,
        width: row.size,
        height: row.size,
        // Keep the persona copy in place while swapping the Teachers and Product teams faces.
        frame: crowdFrames[(id === 0 ? 1 : id === 1 ? 0 : id) % crowdFrames.length],
        revealOrder: revealOffset + revealColumns.indexOf(col),
        scatterX: Math.cos(angle) * distance,
        scatterY: Math.sin(angle) * distance * 0.72,
        scatterRotate: ((rowIndex * 29 + col * 17) % 54) - 27,
      });
      id += 1;
      x += row.size + gap + (row.gapAfter && col === row.gapAfterIndex ? row.gapAfter : 0);
    }

    revealOffset += row.count;
    y += row.size + gap;
  });

  return { tiles, width, height: y - gap };
}

// Final screen positions for the four large cards, expressed from viewport centre.
const featureTargets = [
  { x: -0.33, y: -0.19, rotate: -8 },
  { x: -0.12, y: 0.08, rotate: 6 },
  { x: 0.12, y: -0.15, rotate: -5 },
  { x: 0.33, y: 0.08, rotate: 8 },
];

const compactFeatureTargets = [
  { x: 0, y: -0.22, rotate: -3 },
  { x: 0, y: -0.06, rotate: 3 },
  { x: 0, y: 0.1, rotate: -2 },
  { x: 0, y: 0.26, rotate: 2 },
];

const MOBILE_FEATURE_GAP = 24;
const MOBILE_FEATURE_INSET = 24;
const MOBILE_FEATURE_KICKER = 108;

const featureCopy = [
  {
    title: 'Teachers',
    description: 'Turn a lesson or whiteboard explanation into a loop your class can replay.',
  },
  {
    title: 'Product teams',
    description: 'Make a feature, flow, or product decision understandable in seconds.',
  },
  {
    title: 'Designers & Engineers',
    description: 'Bring interaction, prototypes, and presentation moments to life.',
  },
  {
    title: 'Creators',
    description: 'Give a story the movement that makes people stop.',
  },
];

export default function PicturaAudienceSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const heartRef = useRef<HTMLDivElement>(null);
  const laoHeartRef = useRef<HTMLObjectElement>(null);
  const heartProgressRef = useRef(0);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isSpriteReady, setIsSpriteReady] = useState(false);
  const { tiles, width, height } = useMemo(makeTiles, []);

  useEffect(() => {
    let cancelled = false;
    const sprite = new Image();
    const markReady = () => {
      if (!cancelled) setIsSpriteReady(true);
    };
    sprite.onload = () => {
      const decoded = sprite.decode?.();
      if (decoded) decoded.then(markReady, markReady);
      else markReady();
    };
    sprite.onerror = markReady;
    sprite.src = CROWD_SPRITE;
    if (sprite.complete && sprite.naturalWidth > 0) {
      const decoded = sprite.decode?.();
      if (decoded) decoded.then(markReady, markReady);
      else markReady();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsRevealed(true);
        observer.disconnect();
      },
      { threshold: 0.18 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    let previousProgress = -1;
    let previousWidth = 0;
    let previousHeight = 0;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const update = () => {
      frame = 0;
      const section = sectionRef.current;
      const heart = heartRef.current;
      if (!section || !heart) return;

      const sectionBounds = section.getBoundingClientRect();
      const scrollDistance = Math.max(sectionBounds.height - window.innerHeight, 1);
      const rawProgress = Math.min(1, Math.max(0, -sectionBounds.top / scrollDistance));
      const progress = reduceMotion.matches ? 0 : Math.min(1, Math.max(0, (rawProgress - 0.06) / 0.88));
      const eased = progress * progress * (3 - 2 * progress);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const useCompactFeatureLayout = viewportWidth <= 900;
      const useMobileFeatureLayout = viewportWidth <= 767;

      if (
        Math.abs(progress - previousProgress) < 0.0005
        && viewportWidth === previousWidth
        && viewportHeight === previousHeight
      ) return;

      previousProgress = progress;
      previousWidth = viewportWidth;
      previousHeight = viewportHeight;

      // Scrub the hand-drawn heart with the section scroll position. Moving
      // back up rewinds the SVG through the same drawing path.
      const heartCompletion = Math.min(1, Math.max(0, (eased - 0.7) / 0.3));
      heartProgressRef.current = heartCompletion;
      const laoHeart = laoHeartRef.current;
      if (laoHeart) {
        laoHeart.style.opacity = (heartCompletion * 0.7).toFixed(3);
        laoHeart.style.transform = `translate3d(-50%, -50%, 0) scale(${(0.78 + heartCompletion * 0.08).toFixed(3)})`;

        const heartSvg = laoHeart.contentDocument?.documentElement as SVGSVGElement | null;
        if (heartSvg) {
          heartSvg.pauseAnimations();
          heartSvg.setCurrentTime(heartCompletion * 3.2);
        }
      }

      const heartBounds = heart.getBoundingClientRect();
      const scaleX = heartBounds.width / width;
      const scaleY = heartBounds.height / height;
      const mobileStackT = Math.min(1, Math.max(0, progress / 0.32));
      const mobileFeatureEased = mobileStackT * mobileStackT * (3 - 2 * mobileStackT);

      tiles.forEach((tile) => {
        const element = tileRefs.current[tile.id];
        if (!element) return;

        if (tile.id < featureTargets.length) {
          const initialX = (tile.x + tile.width / 2 - width / 2) * scaleX;
          const initialY = (tile.y + tile.height / 2 - height / 2) * scaleY;
          const target = (useCompactFeatureLayout ? compactFeatureTargets : featureTargets)[tile.id];
          const featureEased = useMobileFeatureLayout ? mobileFeatureEased : eased;
          let moveX = (viewportWidth * target.x - initialX) / scaleX;
          let moveY = (viewportHeight * target.y - initialY) / scaleY;
          let rotate = target.rotate;
          let scale = useCompactFeatureLayout ? 1 + eased * 0.1 : 1 + eased * 0.36;

          if (useMobileFeatureLayout) {
            const cardSize = tile.width * scaleX;
            const stackHeight = featureTargets.length * cardSize
              + (featureTargets.length - 1) * MOBILE_FEATURE_GAP;
            const stackTop = Math.max(
              MOBILE_FEATURE_KICKER,
              (viewportHeight - stackHeight) / 2,
            );
            const targetX = MOBILE_FEATURE_INSET + cardSize / 2 - viewportWidth / 2;
            const targetY = stackTop
              + tile.id * (cardSize + MOBILE_FEATURE_GAP)
              + cardSize / 2
              - viewportHeight / 2;
            // Screen-space deltas: dividing by scaleX overshoots on a shrunk heart.
            moveX = targetX - initialX;
            moveY = targetY - initialY;
            rotate = 0;
            scale = 1;
          }

          element.style.transform = `translate3d(${(moveX * featureEased).toFixed(2)}px, ${(moveY * featureEased).toFixed(2)}px, 0) rotate(${(rotate * featureEased).toFixed(2)}deg) scale(${scale.toFixed(4)})`;
          element.style.opacity = '1';
          element.style.zIndex = '6';
          element.style.setProperty('--feature-copy-opacity', Math.min(1, Math.max(0, (featureEased - 0.2) / 0.35)).toFixed(3));
          element.style.setProperty('--feature-copy-offset', `${(Math.max(0, 1 - featureEased) * 12).toFixed(2)}px`);
        } else {
          element.style.transform = `translate3d(${(tile.scatterX * eased).toFixed(2)}px, ${(tile.scatterY * eased).toFixed(2)}px, 0) rotate(${(tile.scatterRotate * eased).toFixed(2)}deg) scale(${(1 - eased * 0.24).toFixed(4)})`;
          element.style.opacity = (1 - eased).toFixed(3);
        }
      });

    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [height, tiles, width]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="audience-heading"
      className={`pictura-audience relative z-10 bg-ink-900 ${isRevealed && isSpriteReady ? 'is-revealed' : ''}`}
    >
      <div className="pictura-pin">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(69,51,104,.30),transparent_27%),radial-gradient(circle_at_50%_52%,rgba(103,62,22,.13),transparent_58%)]" />

        <p className="pictura-kicker">Who it&apos;s for</p>
        <h2 id="audience-heading" className="sr-only">Who LAO is for</h2>

        <div className="pictura-side-copy pictura-side-copy-left" aria-hidden="true">
          <span>Animation</span>
          <span>is for anyone</span>
        </div>

        <div
          ref={heartRef}
          className="pictura-heart"
          style={{ aspectRatio: `${width} / ${height}` }}
          aria-label="A heart of portraits assembling from top to bottom"
        >
          <img
            src={CROWD_SPRITE}
            alt=""
            aria-hidden="true"
            fetchPriority="low"
            decoding="async"
            className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          />
          {tiles.map((tile) => (
            (() => {
              const column = tile.frame % CROWD_COLUMNS;
              const row = Math.floor(tile.frame / CROWD_COLUMNS);
              // Preserve the crop of the four feature portraits while scaling
              // down the shift for mini squares so their lower rows remain in view.
              const portraitOffset = Math.min(24, Math.round(tile.height * 0.22));

              return (
                <div
                  key={tile.id}
                  ref={(element) => { tileRefs.current[tile.id] = element; }}
                  className={`pictura-tile ${tile.id < featureTargets.length ? `pictura-feature-tile pictura-feature-tile-${tile.id}` : ''}`}
                  style={{
                    left: `${(tile.x / width) * 100}%`,
                    top: `${(tile.y / height) * 100}%`,
                    width: `${(tile.width / width) * 100}%`,
                    height: `${(tile.height / height) * 100}%`,
                    ['--tile-delay' as string]: `${0.08 + tile.revealOrder * 0.042}s`,
                  }}
                >
                  <div className="pictura-tile-reveal">
                    <div
                      className="pictura-crowd-portrait"
                      style={{
                        left: `-${column * 100}%`,
                        top: `calc(100% - ${(row + 1) * CROWD_FRAME_HEIGHT}% + ${portraitOffset}px)`,
                      }}
                    />
                  </div>
                  {tile.id < featureCopy.length && (
                    <div className="pictura-feature-copy" aria-hidden="true">
                      <span className="pictura-feature-title">{featureCopy[tile.id].title}</span>
                      <span className="pictura-feature-description">{featureCopy[tile.id].description}</span>
                    </div>
                  )}
                </div>
              );
            })()
          ))}

          {isRevealed && (
            <object
              ref={laoHeartRef}
              className="pictura-lao-heart"
              data="/assets/who-mini-heart.optimized.svg"
              type="image/svg+xml"
              aria-hidden="true"
              tabIndex={-1}
              onLoad={(event) => {
                const heartSvg = event.currentTarget.contentDocument?.documentElement as SVGSVGElement | null;
                if (!heartSvg) return;

                heartSvg.pauseAnimations();
                heartSvg.setCurrentTime(heartProgressRef.current * 3.2);
              }}
            />
          )}
        </div>

        <div className="pictura-side-copy pictura-side-copy-right" aria-hidden="true">
          <span>Animate</span>
          <span>to communicate</span>
        </div>
      </div>

      <style>{`
        .pictura-audience { height: 238vh; min-height: 1520px; isolation: isolate; }
        .pictura-pin { position: sticky; top: 0; height: 100vh; height: 100svh; min-height: 620px; overflow: clip; background: var(--color-ink-900, #0e0e0e); }
        .pictura-kicker { position: absolute; z-index: 8; top: clamp(92px,12vh,132px); left: 50%; margin: 0; transform: translateX(-50%); font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.48); }

        .pictura-heart { position: absolute; z-index: 2; top: 48%; left: 50%; width: min(48vw,660px); transform: translate(-50%,-50%); }
        .pictura-tile { position: absolute; z-index: 2; transform-origin: center; }
        .pictura-tile-reveal { width: 100%; height: 100%; overflow: hidden; background: #161616; opacity: 0; transform: translate3d(0,-54px,0) scale(.94); filter: blur(10px); }
        .pictura-crowd-portrait { position: absolute; width: 1500%; max-width: none; aspect-ratio: 3600 / 2268; background: url('/images/peeps/all-peeps.optimized.webp') 0 0 / 100% 100% no-repeat; }
        .is-revealed .pictura-tile-reveal { animation: picturaTileIn .84s cubic-bezier(.22,1,.36,1) var(--tile-delay) both; }
        .pictura-feature-tile .pictura-tile-reveal { box-shadow: 0 28px 76px rgba(0,0,0,.4); }
        .pictura-feature-copy { position: absolute; top: calc(100% + 13px); left: 0; width: min(260px, 210%); display: grid; gap: 6px; opacity: var(--feature-copy-opacity, 0); transform: translate3d(0,var(--feature-copy-offset,12px),0); color: rgba(255,255,255,.94); pointer-events: none; text-align: left; }
        .pictura-feature-title { font-family: var(--font-display,Georgia,serif); font-size: clamp(20px,1.75vw,30px); font-weight: 400; line-height: .95; letter-spacing: -.035em; text-wrap: balance; }
        .pictura-feature-description { max-width: 32ch; font-family: var(--font-sans,Arial,sans-serif); font-size: clamp(12px,.82vw,15px); font-weight: 400; line-height: 1.42; color: rgba(255,255,255,.66); text-wrap: pretty; }

        .pictura-lao-heart { position: absolute; z-index: 5; left: 50%; top: calc(48.8% + 48px); display: block; width: 16%; aspect-ratio: 1; overflow: visible; border: 0; opacity: 0; filter: brightness(0) saturate(100%) invert(86%) sepia(19%) saturate(749%) hue-rotate(292deg) brightness(101%) contrast(93%); transform: translate3d(-50%,-50%,0) scale(.78); transform-origin: center; pointer-events: none; }

        .pictura-side-copy { position: absolute; z-index: 7; bottom: clamp(52px,8vh,90px); display: flex; width: min(30vw,430px); flex-direction: column; opacity: 0; transform: translate3d(0,20px,0); font-family: var(--font-display,Georgia,serif); font-size: clamp(31px,4vw,58px); font-weight: 400; line-height: .94; letter-spacing: -.035em; color: #dedede; text-wrap: balance; }
        .pictura-side-copy-left { left: clamp(24px,5vw,84px); text-align: left; align-items: flex-start; }
        .pictura-side-copy-right { right: clamp(24px,5vw,84px); text-align: right; align-items: flex-end; }
        .is-revealed .pictura-side-copy { animation: picturaCopyIn .8s cubic-bezier(.22,1,.36,1) 1.62s both; }

        @keyframes picturaTileIn { from { opacity: 0; transform: translate3d(0,-54px,0) scale(.94); filter: blur(10px); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); filter: blur(0); } }
        @keyframes picturaPixelIn { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
        @keyframes picturaCopyIn { from { opacity: 0; transform: translate3d(0,20px,0); filter: blur(7px); } to { opacity: 1; transform: translate3d(0,0,0); filter: blur(0); } }

        @media (max-width: 900px) {
          .pictura-audience { height: 215vh; min-height: 1320px; }
          .pictura-pin { min-height: 600px; }
          .pictura-kicker { top: 84px; }
          .pictura-heart { top: 50%; width: min(86vw,620px); }
          .pictura-side-copy { top: 128px; bottom: auto; width: calc(50% - 40px); font-size: clamp(16px,4vw,24px); }
          .pictura-side-copy-left { left: 24px; }
          .pictura-side-copy-right { right: 24px; }
          .pictura-feature-copy { top: calc(100% + 10px); left: 50%; width: min(50vw, 190px); gap: 4px; text-align: center; transform: translate3d(-50%,var(--feature-copy-offset,12px),0); }
          .pictura-feature-title { font-size: clamp(18px,3.4vw,24px); }
          .pictura-feature-description { font-size: 11px; line-height: 1.35; }
          /* On a small viewport the long stagger leaves a conspicuous field of
             empty squares while the section is already on screen. Reveal the
             full portrait mosaic together instead. */
          .is-revealed .pictura-tile-reveal { animation-delay: 0ms; }
        }

        @media (max-width: 767px) {
          .pictura-side-copy { display: none; }
          .pictura-feature-copy { top: 50%; left: calc(100% + 14px); width: min(42vw, 170px); gap: 0; text-align: left; transform: translate3d(0,-50%,0); }
          .pictura-feature-description { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pictura-tile-reveal,
          .pictura-side-copy { animation-duration: .01ms !important; animation-delay: 0ms !important; }
        }
      `}</style>
    </section>
  );
}
