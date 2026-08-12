"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import clsx from "clsx";
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMotionValue } from "framer-motion";
import type { MotionValue } from "framer-motion";
import * as THREE from "three";
import { ScrollObserver } from "@/components/ScrollObserver";
import monitorModelUrl from "../../assets/3D/Monitor/Monitor 2/crt_monitor.optimized.glb?url";

const ANIMATRON_VIDEO_URL = "/media/animatron-demo.mp4";
const STOP_MOTION_VIDEO_URL = "/media/stopmotion-demo.mp4";

type ScreenRect = { left: number; top: number; width: number; height: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

function ModeCube({
  side,
  label,
  progress,
  screenOverlayRef,
  screenRectRef,
}: {
  side: -1 | 1;
  label: string;
  progress: MotionValue<number>;
  screenOverlayRef: MutableRefObject<HTMLVideoElement | null>;
  screenRectRef?: MutableRefObject<ScreenRect | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const originalScreenMaterialRef = useRef<THREE.Material | THREE.Material[] | null>(null);
  const { camera, viewport, size: canvasSize, invalidate } = useThree();
  const panelPadding = THREE.MathUtils.clamp(canvasSize.width * 0.03, 16, 40);
  const panelPixelWidth = Math.min(canvasSize.width - panelPadding * 2, 1200);
  const panelPixelHeight = Math.max(420, panelPixelWidth * (2 / 3));
  const panelWidth = viewport.width * (panelPixelWidth / canvasSize.width);
  const panelHeight = viewport.height * (panelPixelHeight / canvasSize.height);
  const width = panelWidth * 0.34;
  const height = panelHeight * 0.39;
  const targetX = side * panelWidth * 0.16;
  const targetY = -panelHeight * 0.22;
  const { scene } = useGLTF(monitorModelUrl);

  useEffect(() => {
    document.documentElement.dataset.monitorReady = "true";
    window.dispatchEvent(new Event("lao:monitor-ready"));
  }, []);

  const monitor = useMemo(() => {
    const object = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());

    object.position.sub(center);
    let screen: THREE.Mesh<THREE.BufferGeometry> | null = null;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material?.name === "Material.004") {
          screen = child as THREE.Mesh<THREE.BufferGeometry>;
        }
      }
    });

    // The exported CRT glass has no UV attribute (the original material was a
    // flat colour), so VideoTexture has nothing to sample and renders black.
    // Generate UVs from the screen's local XY bounds. Its GLB transform mirrors
    // local X, hence max→min produces visual left→right across the glass.
    if (screen && !screen.geometry.attributes.uv) {
      const screenGeometry = screen.geometry.clone();
      screenGeometry.computeBoundingBox();
      const screenBounds = screenGeometry.boundingBox;
      const positions = screenGeometry.attributes.position;
      if (screenBounds && positions) {
        const spanX = Math.max(THREE.MathUtils.EPSILON, screenBounds.max.x - screenBounds.min.x);
        const spanY = Math.max(THREE.MathUtils.EPSILON, screenBounds.max.y - screenBounds.min.y);
        const uvs = new Float32Array(positions.count * 2);
        for (let index = 0; index < positions.count; index += 1) {
          uvs[index * 2] = (screenBounds.max.x - positions.getX(index)) / spanX;
          uvs[index * 2 + 1] = (positions.getY(index) - screenBounds.min.y) / spanY;
        }
        screenGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        screen.geometry = screenGeometry;
      }
    }

    return { object, size, screen };
  }, [scene]);

  const modelScale = Math.min(width / monitor.size.x, height / monitor.size.y) * 0.92;
  const labelTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ef2b26";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = '700 122px "Redaction 35", Georgia, serif';
      context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width * 0.94);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }, [label]);

  useEffect(() => () => labelTexture.dispose(), [labelTexture]);
  useEffect(() => () => {
    if (monitor.screen && originalScreenMaterialRef.current) {
      monitor.screen.material = originalScreenMaterialRef.current;
    }
    screenTextureRef.current?.dispose();
  }, [monitor]);
  useEffect(() => {
    const video = screenOverlayRef.current;
    if (!video) return;

    let cancelled = false;
    let videoFrame = 0;
    let animationFrame = 0;

    const requestNextFrame = () => {
      if (cancelled) return;
      const canvas = screenCanvasRef.current;
      const texture = screenTextureRef.current;
      if (canvas && texture && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const context = canvas.getContext("2d", { alpha: false });
        if (context && video.videoWidth > 0 && video.videoHeight > 0) {
          const sourceAspect = video.videoWidth / video.videoHeight;
          let sourceX = 0;
          let sourceY = 0;
          let sourceWidth = video.videoWidth;
          let sourceHeight = video.videoHeight;
          if (sourceAspect > 1) {
            sourceWidth = video.videoHeight;
            sourceX = (video.videoWidth - sourceWidth) / 2;
          } else if (sourceAspect < 1) {
            sourceHeight = video.videoWidth;
            sourceY = (video.videoHeight - sourceHeight) / 2;
          }
          context.drawImage(
            video,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          texture.needsUpdate = true;
        }
      }
      invalidate();
      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrame = video.requestVideoFrameCallback(requestNextFrame);
      } else {
        animationFrame = requestAnimationFrame(requestNextFrame);
      }
    };

    requestNextFrame();
    return () => {
      cancelled = true;
      if (videoFrame && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(videoFrame);
      }
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [invalidate, screenOverlayRef]);
  const labelOffsetX = (viewport.width / canvasSize.width) * (side === -1 ? -10 : 15);

  useFrame(() => {
    const cube = groupRef.current;
    if (!cube) return;

    const entered = THREE.MathUtils.smootherstep(progress.get(), 0, 1);
    const startX = side * (viewport.width / 2 + width * 0.58);
    cube.position.x = THREE.MathUtils.lerp(startX, targetX, entered);
    cube.position.y = targetY;
    cube.rotation.x = THREE.MathUtils.lerp(0.58, 0.42, entered);
    cube.rotation.y = THREE.MathUtils.lerp(
      side * THREE.MathUtils.degToRad(60),
      side * THREE.MathUtils.degToRad(15),
      entered,
    );
    cube.rotation.z = THREE.MathUtils.lerp(side * 0.06, 0, entered);

    // Copy decoded frames into a CanvasTexture and map it onto the exact CRT
    // glass mesh. CanvasTexture is reliable even when the source video lives
    // off-canvas, unlike direct VideoTexture uploads in some browsers.
    if (monitor.screen && !screenTextureRef.current && screenOverlayRef.current) {
      const screenCanvas = document.createElement("canvas");
      screenCanvas.width = 512;
      screenCanvas.height = 512;
      const texture = new THREE.CanvasTexture(screenCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      originalScreenMaterialRef.current = monitor.screen.material;
      monitor.screen.material = new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        side: THREE.DoubleSide,
        // Material.003 is the opaque black face that sits just in front of
        // this inner picture tube in the export. Render the picture tube last
        // without depth testing so the video is visible, while its smaller
        // geometry still leaves the original black bezel around it.
        depthTest: false,
        depthWrite: false,
      });
      monitor.screen.material.needsUpdate = true;
      monitor.screen.renderOrder = 10;
      screenCanvasRef.current = screenCanvas;
      screenTextureRef.current = texture;
    }

    if (monitor.screen) {
      const geometry = monitor.screen.geometry;
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (bounds) {
        cube.updateMatrixWorld(true);
        const z = bounds.max.z;
        const corners = [
          new THREE.Vector3(bounds.min.x, bounds.min.y, z),
          new THREE.Vector3(bounds.max.x, bounds.min.y, z),
          new THREE.Vector3(bounds.max.x, bounds.max.y, z),
          new THREE.Vector3(bounds.min.x, bounds.max.y, z),
        ].map((point) => monitor.screen!.localToWorld(point).project(camera));
        const xs = corners.map((point) => (point.x * 0.5 + 0.5) * canvasSize.width);
        const ys = corners.map((point) => (-point.y * 0.5 + 0.5) * canvasSize.height);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        const rect = { left, top, width: right - left, height: bottom - top };
        if (side === -1 && screenRectRef) screenRectRef.current = rect;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={monitor.object} scale={modelScale} />
      <mesh position={[labelOffsetX, -height * 0.57, monitor.size.z * modelScale * 0.12]}>
        <planeGeometry args={[width * 0.72, width * 0.18]} />
        <meshBasicMaterial map={labelTexture} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function SceneInvalidator({ progress }: { progress: MotionValue<number> }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate();
    return progress.on("change", () => invalidate());
  }, [invalidate, progress]);

  return null;
}

function CubeScene({
  progress,
  animatronScreenRef,
  stopMotionScreenRef,
  screenRectRef,
}: {
  progress: MotionValue<number>;
  animatronScreenRef: MutableRefObject<HTMLVideoElement | null>;
  stopMotionScreenRef: MutableRefObject<HTMLVideoElement | null>;
  screenRectRef: MutableRefObject<ScreenRect | null>;
}) {
  return (
    <>
      <SceneInvalidator progress={progress} />
      <ambientLight intensity={2.2} />
      <directionalLight position={[0, 8, 10]} intensity={1.15} color="#ffffff" />
      <directionalLight position={[-7, 1, 6]} intensity={0.4} color="#b6cbe6" />
      <ModeCube side={-1} label="Animatron" progress={progress} screenOverlayRef={animatronScreenRef} screenRectRef={screenRectRef} />
      <ModeCube side={1} label="Stop motion" progress={progress} screenOverlayRef={stopMotionScreenRef} />
    </>
  );
}

function FallbackMonitor({ side, progress }: { side: -1 | 1; progress: MotionValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport, size: canvasSize } = useThree();
  const panelPadding = THREE.MathUtils.clamp(canvasSize.width * 0.03, 16, 40);
  const panelPixelWidth = Math.min(canvasSize.width - panelPadding * 2, 1200);
  const panelPixelHeight = Math.max(420, panelPixelWidth * (2 / 3));
  const panelWidth = viewport.width * (panelPixelWidth / canvasSize.width);
  const panelHeight = viewport.height * (panelPixelHeight / canvasSize.height);
  const width = panelWidth * 0.34;
  const height = panelHeight * 0.39;
  const depth = width * 0.28;
  const targetX = side * panelWidth * 0.16;
  const targetY = -panelHeight * 0.22;

  useFrame(() => {
    const monitor = groupRef.current;
    if (!monitor) return;
    const entered = THREE.MathUtils.smootherstep(progress.get(), 0, 1);
    const startX = side * (viewport.width / 2 + width * 0.58);
    monitor.position.x = THREE.MathUtils.lerp(startX, targetX, entered);
    monitor.position.y = targetY;
    monitor.rotation.x = THREE.MathUtils.lerp(0.58, 0.42, entered);
    monitor.rotation.y = THREE.MathUtils.lerp(
      side * THREE.MathUtils.degToRad(60),
      side * THREE.MathUtils.degToRad(15),
      entered,
    );
    monitor.rotation.z = THREE.MathUtils.lerp(side * 0.06, 0, entered);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[width * 0.86, height * 0.72, depth]} />
        <meshBasicMaterial color="#dedbd2" />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.012]}>
        <planeGeometry args={[width * 0.68, height * 0.5]} />
        <meshBasicMaterial color="#111111" />
      </mesh>
      <mesh position={[0, -height * 0.47, 0]}>
        <boxGeometry args={[width * 0.12, height * 0.2, depth * 0.2]} />
        <meshBasicMaterial color="#cbc8bf" />
      </mesh>
      <mesh position={[0, -height * 0.59, 0]}>
        <boxGeometry args={[width * 0.42, height * 0.05, depth * 0.55]} />
        <meshBasicMaterial color="#cbc8bf" />
      </mesh>
    </group>
  );
}

function MonitorLoadingScene({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      <FallbackMonitor side={-1} progress={progress} />
      <FallbackMonitor side={1} progress={progress} />
    </>
  );
}

export default function ModeCubeSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasLayerRef = useRef<HTMLDivElement>(null);
  const screenOverlayLayerRef = useRef<HTMLDivElement>(null);
  const copyLayerRef = useRef<HTMLDivElement>(null);
  const blueBackdropRef = useRef<HTMLDivElement>(null);
  const expandingVideoRef = useRef<HTMLDivElement>(null);
  const secondVideoLayerRef = useRef<HTMLDivElement>(null);
  const animatronScreenRef = useRef<HTMLVideoElement>(null);
  const stopMotionScreenRef = useRef<HTMLVideoElement>(null);
  const animatronVideoRef = useRef<HTMLVideoElement>(null);
  const stopMotionVideoRef = useRef<HTMLVideoElement>(null);
  const screenRectRef = useRef<ScreenRect | null>(null);
  const latestProgressRef = useRef(0);
  const animatronPlayedRef = useRef(false);
  const stopMotionCrtPlayedRef = useRef(false);
  const stopMotionPlayedRef = useRef(false);
  const cubeProgress = useMotionValue(0);
  const stepRef = useRef(0);
  const [activeStep, setActiveStep] = useState(0);
  const [animatronAvailable, setAnimatronAvailable] = useState(false);
  const [animatronAspectRatio, setAnimatronAspectRatio] = useState(1);
  const [stopMotionAspectRatio, setStopMotionAspectRatio] = useState(1);

  const captureAnimatronVideo = useCallback((video: HTMLVideoElement | null) => {
    animatronVideoRef.current = video;
    if (video?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setAnimatronAvailable(true);
    }
  }, []);

  const captureStopMotionVideo = useCallback((video: HTMLVideoElement | null) => {
    stopMotionVideoRef.current = video;
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;
    let isNear = false;

    const updateStickyProgress = () => {
      frame = 0;
      if (!isNear) return;

      const rect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const stickyTravel = Math.max(1, rect.height - viewportHeight);
      const stickyProgress = THREE.MathUtils.clamp(-rect.top / stickyTravel, 0, 1);
      latestProgressRef.current = stickyProgress;
      const nextStep = stickyProgress >= 0.24 ? 3 : stickyProgress >= 0.12 ? 2 : stickyProgress >= 0.03 ? 1 : 0;
      if (nextStep !== stepRef.current) {
        stepRef.current = nextStep;
        setActiveStep(nextStep);
      }

      const nextCubeProgress = THREE.MathUtils.clamp((stickyProgress - 0.12) / 0.22, 0, 1);
      if (Math.abs(nextCubeProgress - cubeProgress.get()) > 0.0001) {
        cubeProgress.set(nextCubeProgress);
      }

      const expansion = smoothstep(clamp01((stickyProgress - 0.36) / 0.24));
      // Animatron has completed its expansion by 0.60. Begin the Stop Motion
      // card immediately after that, leaving enough sticky travel for it to
      // rise visibly from the bottom before this scene releases.
      const secondEntrance = smoothstep(clamp01((stickyProgress - 0.6) / 0.12));
      const viewportWidth = window.innerWidth;
      const safeInlineMargin = 16;
      const safeBlockMargin = 16;
      // Phone: exactly 16px at both edges. Tablet/desktop: a true 640px cap.
      // Short landscape viewports can shrink further to preserve the source
      // ratio without clipping the card vertically.
      const fullVideoWidth = Math.min(
        640,
        viewportWidth - safeInlineMargin * 2,
        (viewportHeight - safeBlockMargin * 2) * animatronAspectRatio,
      );
      const fullVideoHeight = fullVideoWidth / animatronAspectRatio;
      const fullLeft = (viewportWidth - fullVideoWidth) / 2;
      const fullTop = (viewportHeight - fullVideoHeight) / 2;
      const origin = screenRectRef.current ?? {
        left: viewportWidth * 0.28,
        top: viewportHeight * 0.55,
        width: Math.max(96, viewportWidth * 0.16),
        height: Math.max(80, viewportWidth * 0.135),
      };

      if (blueBackdropRef.current) {
        const haloPadding = Math.min(108, Math.max(48, fullVideoWidth * 0.16));
        blueBackdropRef.current.style.width = `${fullVideoWidth + haloPadding * 2}px`;
        blueBackdropRef.current.style.height = `${fullVideoHeight + haloPadding * 2}px`;
        blueBackdropRef.current.style.opacity = String(expansion * 0.35);
        blueBackdropRef.current.style.transform = `translate3d(${fullLeft - haloPadding}px, ${fullTop - haloPadding}px, 0)`;
      }
      const oldSceneOpacity = String(1 - smoothstep(clamp01(expansion * 1.35)));
      if (panelRef.current) panelRef.current.style.opacity = oldSceneOpacity;
      if (canvasLayerRef.current) canvasLayerRef.current.style.opacity = oldSceneOpacity;
      if (screenOverlayLayerRef.current) screenOverlayLayerRef.current.style.opacity = oldSceneOpacity;
      if (copyLayerRef.current) copyLayerRef.current.style.opacity = oldSceneOpacity;

      if (expandingVideoRef.current) {
        const x = THREE.MathUtils.lerp(origin.left, fullLeft, expansion);
        const y = THREE.MathUtils.lerp(origin.top, fullTop, expansion);
        const scaleX = THREE.MathUtils.lerp(origin.width / fullVideoWidth, 1, expansion);
        const scaleY = THREE.MathUtils.lerp(origin.height / fullVideoHeight, 1, expansion);
        expandingVideoRef.current.style.width = `${fullVideoWidth}px`;
        expandingVideoRef.current.style.height = `${fullVideoHeight}px`;
        expandingVideoRef.current.style.opacity = String(smoothstep(clamp01(expansion * 5)));
        expandingVideoRef.current.style.borderRadius = "16px";
        expandingVideoRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`;
      }

      if (secondVideoLayerRef.current) {
        const overlapY = fullTop + fullVideoHeight * (viewportWidth < 640 ? 0.16 : 0.12);
        const secondVideoWidth = Math.min(
          640,
          viewportWidth - safeInlineMargin * 2,
          Math.max(1, viewportHeight - overlapY - safeBlockMargin) * stopMotionAspectRatio,
        );
        const secondVideoHeight = secondVideoWidth / stopMotionAspectRatio;
        const desiredSecondX = fullLeft + fullVideoWidth * (viewportWidth < 640 ? 0.04 : 0.08);
        const secondX = THREE.MathUtils.clamp(
          desiredSecondX,
          safeInlineMargin,
          viewportWidth - secondVideoWidth - safeInlineMargin,
        );
        const secondTargetY = Math.min(overlapY, viewportHeight - secondVideoHeight - safeBlockMargin);
        const secondY = THREE.MathUtils.lerp(viewportHeight + 32, secondTargetY, secondEntrance);
        const secondRotation = viewportWidth < 640 ? 0 : THREE.MathUtils.lerp(0, -3, secondEntrance);
        secondVideoLayerRef.current.style.width = `${secondVideoWidth}px`;
        secondVideoLayerRef.current.style.height = `${secondVideoHeight}px`;
        secondVideoLayerRef.current.style.opacity = String(secondEntrance);
        secondVideoLayerRef.current.style.transform = `translate3d(${secondX}px, ${secondY}px, 0) rotate(${secondRotation}deg)`;
      }

      // Start both previews as their CRTs are revealed. They remain muted and
      // loop continuously while the mode sequence is in view.
      if (stickyProgress >= 0.12 && !animatronPlayedRef.current && animatronVideoRef.current) {
        animatronPlayedRef.current = true;
        animatronVideoRef.current.currentTime = 0;
        if (animatronScreenRef.current) {
          animatronScreenRef.current.currentTime = 0;
          void animatronScreenRef.current.play().catch(() => undefined);
        }
        void animatronVideoRef.current.play().catch(() => undefined);
      }
      if (stickyProgress >= 0.12 && !stopMotionCrtPlayedRef.current && stopMotionVideoRef.current) {
        stopMotionCrtPlayedRef.current = true;
        if (stopMotionVideoRef.current.readyState === HTMLMediaElement.HAVE_NOTHING) {
          stopMotionVideoRef.current.load();
        }
        stopMotionVideoRef.current.currentTime = 0;
        if (stopMotionScreenRef.current) {
          stopMotionScreenRef.current.currentTime = 0;
          void stopMotionScreenRef.current.play().catch(() => undefined);
        }
        void stopMotionVideoRef.current.play().catch(() => {
          stopMotionCrtPlayedRef.current = false;
        });
      }
      if (stickyProgress >= 0.6 && !stopMotionPlayedRef.current && stopMotionVideoRef.current) {
        stopMotionPlayedRef.current = true;
        if (stopMotionVideoRef.current.readyState === HTMLMediaElement.HAVE_NOTHING) {
          stopMotionVideoRef.current.load();
        }
        stopMotionVideoRef.current.currentTime = 0;
        void stopMotionVideoRef.current.play().catch(() => {
          stopMotionPlayedRef.current = false;
        });
      }
    };

    const scheduleUpdate = () => {
      if (isNear && !frame) frame = requestAnimationFrame(updateStickyProgress);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isNear = entry?.isIntersecting ?? false;
        if (isNear) scheduleUpdate();
        else if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: "60% 0px 60% 0px" },
    );
    observer.observe(section);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [animatronAspectRatio, cubeProgress, stopMotionAspectRatio]);

  return (
    <section ref={sectionRef} id="modes" className="relative z-[90] h-[460vh] bg-ink-900">
      <ScrollObserver className="sticky top-0 h-[100dvh] w-full overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center px-[clamp(16px,3vw,40px)]">
          <div ref={panelRef} className="aspect-[3/2] min-h-[420px] w-full max-w-[1200px] rounded-[40px] bg-[#dddddd] will-change-[opacity]" />
        </div>

        <div ref={canvasLayerRef} className="pointer-events-none absolute inset-0 z-10 will-change-[opacity]">
          <Canvas
            camera={{ position: [0, 0, 10], fov: 38 }}
            dpr={1}
            frameloop="demand"
            gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
            className="h-full w-full"
            style={{ background: "transparent" }}
          >
            <Suspense fallback={<MonitorLoadingScene progress={cubeProgress} />}>
              <CubeScene
                progress={cubeProgress}
                animatronScreenRef={animatronScreenRef}
                stopMotionScreenRef={stopMotionScreenRef}
                screenRectRef={screenRectRef}
              />
            </Suspense>
          </Canvas>
        </div>

        <div
          ref={screenOverlayLayerRef}
          aria-hidden="true"
          className="pointer-events-none fixed left-[-10000px] top-0 -z-10 h-[256px] w-[256px] opacity-0"
        >
          <video
            ref={animatronScreenRef}
            src={ANIMATRON_VIDEO_URL}
          muted
          loop
          playsInline
            preload="auto"
            aria-hidden="true"
            className="h-full w-full"
          />
          <video
            ref={stopMotionScreenRef}
            src={STOP_MOTION_VIDEO_URL}
          muted
          loop
          playsInline
            preload="auto"
            aria-hidden="true"
            className="h-full w-full"
          />
        </div>

        <div ref={copyLayerRef} className="absolute inset-0 z-20 flex items-center justify-center px-[clamp(16px,3vw,40px)] will-change-[opacity]">
          <div className="relative aspect-[3/2] min-h-[420px] w-full max-w-[1200px]">
            <ScrollObserver.TriggerGroup className="pointer-events-none absolute inset-x-0 top-[7.5%] z-10 px-5 text-center text-[#090909]">
              {[
                "Animation should not be complicated",
                "That’s why we made the product",
                "Lao has two modes",
              ].map((line, index) => {
                const isActive = activeStep >= index + 1;
                const isLast = index === 2;
                return (
                  <ScrollObserver.Trigger key={line} className={clsx("relative", isLast && "mt-[clamp(38px,5.6vw,66px)]")}>
                    {() => (
                      <>
                        <p className={clsx({ "opacity-0": !isActive }, "absolute inset-0 m-0 font-display transition duration-700", isLast ? "text-[clamp(29px,3.4vw,42px)] leading-none" : "text-[clamp(32px,4.1vw,48px)] leading-[1.12]")}>
                          {line}
                        </p>
                        <p className={clsx("invisible relative m-0 font-display", isLast ? "text-[clamp(29px,3.4vw,42px)] leading-none" : "text-[clamp(32px,4.1vw,48px)] leading-[1.12]")}>
                          {line}
                        </p>
                      </>
                    )}
                  </ScrollObserver.Trigger>
                );
              })}
            </ScrollObserver.TriggerGroup>
          </div>
        </div>

        <div
          ref={blueBackdropRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-[25] rounded-[32px] bg-[#0b5f95]/25 opacity-0 blur-[48px] will-change-[transform,opacity] [transform-origin:0_0]"
        />

        <div
          ref={expandingVideoRef}
          className="pointer-events-none absolute left-0 top-0 z-30 overflow-visible rounded-[16px] opacity-0 will-change-[transform,opacity,border-radius] [transform-origin:0_0]"
          aria-label="Animatron product preview"
        >
          <div className="absolute inset-0 overflow-hidden rounded-[16px] bg-[#050505] shadow-[0_14px_34px_2px_rgba(0,49,83,.28)] [corner-shape:squircle]">
            {!animatronAvailable && (
              <div className="absolute inset-0 grid place-items-center px-4 text-center font-mono text-[10px] uppercase tracking-[.1em] text-white/45">
                Add animatron-demo.mp4
              </div>
            )}
            <video
              ref={captureAnimatronVideo}
              src={ANIMATRON_VIDEO_URL}
              muted
              loop
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  setAnimatronAspectRatio(video.videoWidth / video.videoHeight);
                }
              }}
              onCanPlay={() => {
                setAnimatronAvailable(true);
                if (latestProgressRef.current >= 0.12 && animatronVideoRef.current?.paused) {
                  void animatronVideoRef.current.play().catch(() => undefined);
                }
              }}
              onError={() => setAnimatronAvailable(false)}
              className={clsx("h-full w-full object-cover", animatronAvailable ? "opacity-100" : "opacity-0")}
            />
          </div>
          <p className="pointer-events-none absolute inset-x-0 top-full z-10 mt-3 whitespace-nowrap text-center font-display text-[24px] font-normal leading-none text-[#ef2b26]">
            Animatron
          </p>
        </div>

        <div
          ref={secondVideoLayerRef}
          className="pointer-events-none absolute left-0 top-0 z-40 overflow-visible rounded-[16px] opacity-0 will-change-[transform,opacity] [transform-origin:50%_50%]"
          aria-label="Stop-motion product preview"
        >
          <div className="absolute inset-0 overflow-hidden rounded-[16px] bg-[#050505] shadow-[0_28px_80px_rgba(0,0,0,.48)] [corner-shape:squircle]">
            <video
              ref={captureStopMotionVideo}
              src={STOP_MOTION_VIDEO_URL}
              muted
              loop
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  setStopMotionAspectRatio(video.videoWidth / video.videoHeight);
                }
              }}
              onCanPlay={() => {
                if (latestProgressRef.current >= 0.12 && stopMotionVideoRef.current?.paused) {
                  void stopMotionVideoRef.current.play().catch(() => undefined);
                }
              }}
              className="h-full w-full object-cover"
            />
          </div>
          <p className="pointer-events-none absolute inset-x-0 top-full z-10 mt-3 whitespace-nowrap text-center font-display text-[24px] font-normal leading-none text-[#ef2b26]">
            Stop motion
          </p>
        </div>
      </ScrollObserver>
    </section>
  );
}
