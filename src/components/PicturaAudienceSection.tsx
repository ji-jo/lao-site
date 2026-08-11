import { useEffect, useMemo, useRef, useState } from 'react';

const imageUrl = (index: number, small = false) =>
  `https://qclay.design/lovable/pictura/${small ? 'person_small' : 'person'}/person${index}.png`;

const portraitNumbers = Array.from({ length: 44 }, (_, index) => index + 1).filter((index) => index !== 8);

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
  image: string;
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
        image: imageUrl(portraitNumbers[id % portraitNumbers.length]),
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

const featureCopy = [
  {
    title: 'Teachers',
    description: 'Turn the thing you keep redrawing on the whiteboard into a loop you reuse every term.',
  },
  {
    title: 'Explainers & writers',
    description: 'A moving diagram beats three paragraphs.',
  },
  {
    title: 'Designers',
    description: 'Build assets and loops in minutes instead of scheduling them.',
  },
  {
    title: 'Content creators',
    description: 'Add animation to your stories',
  },
];

export default function PicturaAudienceSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const heartRef = useRef<HTMLDivElement>(null);
  const laoHeartRef = useRef<HTMLObjectElement>(null);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const { tiles, width, height } = useMemo(makeTiles, []);

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

      if (
        Math.abs(progress - previousProgress) < 0.0005
        && viewportWidth === previousWidth
        && viewportHeight === previousHeight
      ) return;

      previousProgress = progress;
      previousWidth = viewportWidth;
      previousHeight = viewportHeight;

      const heartBounds = heart.getBoundingClientRect();
      const scaleX = heartBounds.width / width;
      const scaleY = heartBounds.height / height;

      tiles.forEach((tile) => {
        const element = tileRefs.current[tile.id];
        if (!element) return;

        if (tile.id < featureTargets.length) {
          const target = featureTargets[tile.id];
          const initialX = (tile.x + tile.width / 2 - width / 2) * scaleX;
          const initialY = (tile.y + tile.height / 2 - height / 2) * scaleY;
          const targetX = viewportWidth * target.x;
          const targetY = viewportHeight * target.y;
          const moveX = (targetX - initialX) / scaleX;
          const moveY = (targetY - initialY) / scaleY;
          const scale = 1 + eased * 0.36;
          element.style.transform = `translate3d(${(moveX * eased).toFixed(2)}px, ${(moveY * eased).toFixed(2)}px, 0) rotate(${(target.rotate * eased).toFixed(2)}deg) scale(${scale.toFixed(4)})`;
          element.style.opacity = '1';
          element.style.zIndex = '6';
          element.style.setProperty('--feature-copy-opacity', Math.min(1, Math.max(0, (eased - 0.2) / 0.35)).toFixed(3));
          element.style.setProperty('--feature-copy-offset', `${(Math.max(0, 1 - eased) * 12).toFixed(2)}px`);
        } else {
          element.style.transform = `translate3d(${(tile.scatterX * eased).toFixed(2)}px, ${(tile.scatterY * eased).toFixed(2)}px, 0) rotate(${(tile.scatterRotate * eased).toFixed(2)}deg) scale(${(1 - eased * 0.24).toFixed(4)})`;
          element.style.opacity = (1 - eased).toFixed(3);
        }
      });

      if (laoHeartRef.current) {
        laoHeartRef.current.style.transform = `translate3d(-50%, -50%, 0) scale(${(0.86 + eased * 1.42).toFixed(4)})`;

        const heartSvg = laoHeartRef.current.contentDocument?.documentElement as SVGSVGElement | null;
        if (heartSvg) {
          heartSvg.pauseAnimations();
          const heartProgress = reduceMotion.matches ? 1 : rawProgress;
          heartSvg.setCurrentTime(0.28 + heartProgress * (17.3333333333 - 0.28));
        }
      }
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
      className={`pictura-audience relative z-10 bg-ink-900 ${isRevealed ? 'is-revealed' : ''}`}
    >
      <div className="pictura-pin">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(69,51,104,.30),transparent_27%),radial-gradient(circle_at_50%_52%,rgba(103,62,22,.13),transparent_58%)]" />

        <p className="pictura-kicker">Who it&apos;s for</p>
        <h2 id="audience-heading" className="sr-only">Animation is for anyone. Animate to communicate.</h2>

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
          {tiles.map((tile) => (
            <div
              key={tile.id}
              ref={(element) => { tileRefs.current[tile.id] = element; }}
              className={`pictura-tile ${tile.id < featureTargets.length ? 'pictura-feature-tile' : ''}`}
              style={{
                left: `${(tile.x / width) * 100}%`,
                top: `${(tile.y / height) * 100}%`,
                width: `${(tile.width / width) * 100}%`,
                height: `${(tile.height / height) * 100}%`,
                ['--tile-delay' as string]: `${0.08 + tile.revealOrder * 0.042}s`,
              }}
            >
              <div className="pictura-tile-reveal">
                <img src={tile.image} alt="" loading="lazy" decoding="async" draggable={false} />
              </div>
              {tile.id < featureCopy.length && (
                <div className="pictura-feature-copy" aria-hidden="true">
                  <span className="pictura-feature-title">{featureCopy[tile.id].title}</span>
                  <span className="pictura-feature-description">{featureCopy[tile.id].description}</span>
                </div>
              )}
            </div>
          ))}

          <object
            ref={laoHeartRef}
            className="pictura-lao-heart"
            data="/assets/who-mini-heart.svg"
            type="image/svg+xml"
            aria-hidden="true"
            tabIndex={-1}
            onLoad={(event) => {
              const heartSvg = event.currentTarget.contentDocument?.documentElement as SVGSVGElement | null;
              const section = sectionRef.current;
              if (!heartSvg || !section) return;

              const sectionBounds = section.getBoundingClientRect();
              const scrollDistance = Math.max(sectionBounds.height - window.innerHeight, 1);
              const progress = Math.min(1, Math.max(0, -sectionBounds.top / scrollDistance));
              heartSvg.pauseAnimations();
              heartSvg.setCurrentTime(0.28 + progress * (17.3333333333 - 0.28));
            }}
          />
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
        .pictura-tile img { display: block; width: 100%; height: 100%; object-fit: cover; user-select: none; pointer-events: none; }
        .is-revealed .pictura-tile-reveal { animation: picturaTileIn .84s cubic-bezier(.22,1,.36,1) var(--tile-delay) both; }
        .pictura-feature-tile .pictura-tile-reveal { box-shadow: 0 28px 76px rgba(0,0,0,.4); }
        .pictura-feature-copy { position: absolute; top: calc(100% + 13px); left: 0; width: min(260px, 210%); display: grid; gap: 6px; opacity: var(--feature-copy-opacity, 0); transform: translate3d(0,var(--feature-copy-offset,12px),0); color: rgba(255,255,255,.94); pointer-events: none; text-align: left; }
        .pictura-feature-title { font-family: var(--font-display,Georgia,serif); font-size: clamp(20px,1.75vw,30px); font-weight: 400; line-height: .95; letter-spacing: -.035em; text-wrap: balance; }
        .pictura-feature-description { max-width: 32ch; font-family: var(--font-sans,Arial,sans-serif); font-size: clamp(12px,.82vw,15px); font-weight: 400; line-height: 1.42; color: rgba(255,255,255,.66); text-wrap: pretty; }

        .pictura-lao-heart { position: absolute; z-index: 0; left: 50%; top: calc(48.8% + 48px); display: block; width: 16%; aspect-ratio: 1; overflow: visible; border: 0; opacity: .7; filter: brightness(0) saturate(100%) invert(86%) sepia(19%) saturate(749%) hue-rotate(292deg) brightness(101%) contrast(93%); transform: translate3d(-50%,-50%,0) scale(.86); transform-origin: center; will-change: transform; pointer-events: none; }

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
          .pictura-kicker { top: 88px; }
          .pictura-heart { top: 43%; width: min(86vw,620px); }
          .pictura-side-copy { bottom: 32px; width: calc(50% - 30px); font-size: clamp(21px,5vw,30px); }
          .pictura-side-copy-left { left: 20px; }
          .pictura-side-copy-right { right: 20px; }
          .pictura-feature-copy { top: calc(100% + 10px); width: min(210px, 225%); gap: 4px; }
          .pictura-feature-title { font-size: clamp(18px,3.4vw,24px); }
          .pictura-feature-description { font-size: 11px; line-height: 1.35; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pictura-tile-reveal,
          .pictura-side-copy { animation-duration: .01ms !important; animation-delay: 0ms !important; }
        }
      `}</style>
    </section>
  );
}
