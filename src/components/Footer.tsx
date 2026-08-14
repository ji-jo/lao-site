"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import React, { useRef } from "react";
import { CrowdCanvas } from "@/components/ui/skiper-ui/skiper39";
import { FooterSunShader } from "@/components/FooterSunShader";
import { SpotlightLogo } from "@/components/spotlight-logo";

const Footer = () => {
  const ref = useRef<HTMLDivElement>(null);
  const footerCardRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const [sunActive, setSunActive] = React.useState(false);
  const sunTriggeredRef = useRef(false);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  React.useEffect(() => {
    const line = lineRef.current;
    const card = footerCardRef.current;
    if (!line || !card) return;

    let frame = 0;
    const checkForContact = () => {
      frame = 0;
      if (sunTriggeredRef.current) return;
      const svg = line.ownerSVGElement;
      const matrix = svg?.getScreenCTM();
      const cardRect = card.getBoundingClientRect();
      if (!svg || !matrix || cardRect.bottom < 0 || cardRect.top > window.innerHeight) return;

      const totalLength = line.getTotalLength();
      const lineProgress = scrollYProgress.get();
      // This mirrors LinePath's visible stroke length, so a not-yet-drawn
      // portion of the SVG can never trigger the sun.
      const visibleFraction = lineProgress < 0.62
        ? 0.5 + (lineProgress / 0.62) * 0.36
        : 0.86;
      const length = totalLength * visibleFraction;
      const point = svg.createSVGPoint();
      const samples = Math.min(240, Math.max(80, Math.ceil(length / 18)));
      for (let index = 0; index <= samples; index += 1) {
        const pathPoint = line.getPointAtLength((length * index) / samples);
        point.x = pathPoint.x;
        point.y = pathPoint.y;
        const screenPoint = point.matrixTransform(matrix);
        if (
          screenPoint.x >= cardRect.left - 12 &&
          screenPoint.x <= cardRect.right + 12 &&
          Math.abs(screenPoint.y - cardRect.top) <= 17
        ) {
          sunTriggeredRef.current = true;
          setSunActive(true);
          return;
        }
      }
    };
    const requestCheck = () => {
      if (!frame) frame = requestAnimationFrame(checkForContact);
    };
    window.addEventListener("scroll", requestCheck, { passive: true });
    window.addEventListener("resize", requestCheck, { passive: true });
    requestCheck();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestCheck);
      window.removeEventListener("resize", requestCheck);
    };
  }, [scrollYProgress]);

  return (
    <section
      ref={ref}
      className="relative mx-auto flex h-[calc(350vh-500px)] w-full flex-col items-center overflow-x-clip bg-ink-900 px-4 text-text-hi"
    >
      <div className="relative z-10 mt-16 flex w-fit flex-col items-center justify-center gap-5 text-center md:mt-24">
        <h1 className="site-heading relative z-10">
          Draw, animate, <br /> and explain <br />
          with LAO
        </h1>
        <p className="font-body relative z-10 max-w-2xl text-xl text-text">
          Join the waitlist to get early access
        </p>

        <LinePath
          className="pointer-events-none absolute -right-[40%] top-[280px] z-0 text-accent"
          scrollYProgress={scrollYProgress}
          pathRef={lineRef}
        />
      </div>

      <div ref={footerCardRef} className="relative z-10 flex min-h-[420px] w-full max-w-[1200px] translate-y-[200vh] flex-col overflow-hidden rounded-[2rem] bg-ink-800 px-8 pb-12 pt-10 font-body text-text-hi shadow-2xl md:min-h-[560px] lg:px-12">
        <FooterSunShader active={sunActive} className="absolute inset-0 h-full w-full opacity-80" />
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <SpotlightLogo className="m-0 flex w-full justify-center text-center font-display text-[15.5vw] leading-[0.9] tracking-tighter lg:text-[16.6vw]" />
        </div>
        <div className="relative z-10 mt-10 flex w-full flex-col items-start gap-5 font-medium text-text-mid lg:flex-row lg:justify-between">
          <div className="flex w-full items-center justify-between gap-12 uppercase lg:w-fit lg:justify-center">
            <p className="w-fit text-sm">
              Built for <br />
              everyone
            </p>
            <p className="w-fit text-right text-sm lg:text-left">
              Early Access <br /> 2026
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-12 uppercase lg:w-fit lg:justify-center">
            <p className="w-fit text-sm">
              Browser <br /> Based
            </p>
            <p className="w-fit text-right text-sm leading-tight transition-colors hover:text-text-hi lg:text-left">
              <a href="#waitlist">JOIN<br />WAITLIST</a>
            </p>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 h-screen w-screen -translate-x-1/2 overflow-visible">
        <CrowdCanvas src="/images/peeps/all-peeps ori.webp" rows={15} cols={7} count={12} scale={1} />
      </div>
    </section>
  );
};

export default Footer;

const LinePath = ({
  className,
  scrollYProgress,
  pathRef,
}: {
  className: string;
  scrollYProgress: any;
  pathRef: React.RefObject<SVGPathElement | null>;
}) => {
  const pathLength = useTransform(
    scrollYProgress,
    [0, 0.62, 1],
    [0.5, 0.86, 0.86],
  );

  return (
    <svg
      width="1278"
      height="2319"
      viewBox="0 0 1278 2319"
      fill="none"
      overflow="visible"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <motion.path
        ref={pathRef}
        d="M876.605 394.131C788.982 335.917 696.198 358.139 691.836 416.303C685.453 501.424 853.722 498.43 941.95 409.714C1016.1 335.156 1008.64 186.907 906.167 142.846C807.014 100.212 712.699 198.494 789.049 245.127C889.053 306.207 986.062 116.979 840.548 43.3233C743.932 -5.58141 678.027 57.1682 672.279 112.188C666.53 167.208 712.538 172.943 736.353 163.088C760.167 153.234 764.14 120.924 746.651 93.3868C717.461 47.4252 638.894 77.8642 601.018 116.979C568.164 150.908 557 201.079 576.467 246.924C593.342 286.664 630.24 310.55 671.68 302.614C756.114 286.446 729.747 206.546 681.86 186.442C630.54 164.898 492 209.318 495.026 287.644C496.837 334.494 518.402 366.466 582.455 367.287C680.013 368.538 771.538 299.456 898.634 292.434C1007.02 286.446 1192.67 309.384 1242.36 382.258C1266.99 418.39 1273.65 443.108 1247.75 474.477C1217.32 511.33 1149.4 511.259 1096.84 466.093C1044.29 420.928 1029.14 380.576 1033.97 324.172C1038.31 273.428 1069.55 228.986 1117.2 216.384C1152.2 207.128 1188.29 213.629 1194.45 245.127C1201.49 281.062 1132.22 280.104 1100.44 272.673C1065.32 264.464 1044.22 234.837 1032.77 201.413C1019.29 162.061 1029.71 131.126 1056.44 100.965C1086.19 67.4032 1143.96 54.5526 1175.78 86.1513C1207.02 117.17 1186.81 143.379 1156.22 166.691C1112.57 199.959 1052.57 186.238 999.784 155.164C957.312 130.164 899.171 63.7054 931.284 26.3214C952.068 2.12513 996.288 3.87363 1007.22 43.58C1018.15 83.2749 1003.56 122.644 975.969 163.376C948.377 204.107 907.272 255.122 913.558 321.045C919.727 385.734 990.968 497.068 1063.84 503.35C1111.46 507.456 1166.79 511.984 1175.68 464.527C1191.52 379.956 1101.26 334.985 1030.29 377.017C971.109 412.064 956.297 483.647 953.797 561.655C947.587 755.413 1197.56 941.828 936.039 1140.66C745.771 1285.32 321.926 950.737 134.536 1202.19C-6.68295 1391.68 -53.4837 1655.38 131.935 1760.5C478.381 1956.91 1124.19 1515 1201.28 1997.83C1273.66 2451.23 100.805 1864.7 303.794 2668.89C260 2815 350 2945 303.794 3068.89"
        stroke="currentColor"
        strokeWidth="20"
        style={{
          pathLength,
          strokeDashoffset: useTransform(pathLength, (value) => 1 - value),
        }}
      />
    </svg>
  );
};
