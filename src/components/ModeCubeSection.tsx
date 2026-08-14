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

// Fetch the CRT model as soon as the island loads, before its section reaches
// the viewport, so the monitors are ready on arrival.
useGLTF.preload(monitorModelUrl);

const ANIMATRON_VIDEO_URL = "/media/animatron-demo.optimized.mp4";
const STOP_MOTION_VIDEO_URL = "/media/stopmotion-demo.optimized.mp4";

// CRT layout controls — tweak these two values while tuning the mode section.
// Higher separation moves the monitors farther apart; higher scale enlarges
// both 3D monitors, their inset video surfaces, and the expansion origin.
const CRT_MONITOR_SEPARATION = 1;
const CRT_MONITOR_SCALE = 1.2;
// The base footprint intentionally leaves breathing room between the two CRTs
// and the rounded panel edge. CRT_MONITOR_SCALE is applied on top of this.
const CRT_MONITOR_WIDTH_RATIO = 0.27;
const CRT_MONITOR_HEIGHT_RATIO = 0.35;
const CRT_MONITOR_YAW = THREE.MathUtils.degToRad(15);
const CRT_MONITOR_PITCH = 0.42;
const CRT_MONITOR_ENTRY_YAW = THREE.MathUtils.degToRad(45);
const CRT_MONITOR_ENTRY_PITCH = 0.58;

// Tune the two embedded videos independently. They are mounted beneath the
// GLB's picture-tube node, so they inherit its exact transform at every frame.
const CRT_ANIMATRON_SURFACE = {
  // Left monitor tuning (local to its own picture tube).
  x: -0.025,
  y: 0,
  z: -0.1,
  width: 1.88,
  height: 1.59,
  curvature: -0.05,
  scale: .8,
  entryScale: 1,
  rotationX: 0,
  // The GLB's tube faces -Z. A default Three plane faces +Z, which would make
  // the footage appear mirrored because the camera sees its back face.
  rotationY: Math.PI - 0.15,
  rotationZ: 0,
};
const CRT_STOP_MOTION_SURFACE = {
  // Right monitor tuning is intentionally independent from Animatron.
  x: 0.05,
  y: 0,
  z: -0.1,
  width: 1.88,
  height: 1.59,
  curvature: -0.05,
  scale: .8,
  entryScale: 1,
  rotationX: 0,
  rotationY: Math.PI - 0.15,
  rotationZ: 0,
};

type ScreenRect = { left: number; top: number; width: number; height: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

function createCurvedCrtGeometry(width: number, height: number, curvature: number) {
  const geometry = new THREE.PlaneGeometry(width, height, 18, 10);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const horizontal = positions.getX(index) / (width * 0.5);
    // The picture tube bows forward through its centre. Keeping the corners at
    // zero locks the video edge to the opening while the middle follows CRT's
    // subtle horizontal bulge.
    positions.setZ(index, -curvature * (1 - horizontal * horizontal));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function ModeCube({
  side,
  label,
  progress,
  screenOverlayRef,
  screenRectRef,
  renderActive,
}: {
  side: -1 | 1;
  label: string;
  progress: MotionValue<number>;
  screenOverlayRef: MutableRefObject<HTMLVideoElement | null>;
  screenRectRef?: MutableRefObject<ScreenRect | null>;
  renderActive: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const displaySurfaceRef = useRef<THREE.Mesh<THREE.BufferGeometry>>(null);
  const displaySurfaceBaseScaleRef = useRef(new THREE.Vector3(1, 1, 1));
  const { camera, viewport, size: canvasSize, invalidate } = useThree();
  const panelPadding = THREE.MathUtils.clamp(canvasSize.width * 0.03, 16, 40);
  const panelPixelWidth = Math.min(canvasSize.width - panelPadding * 2, 1200);
  const panelPixelHeight = Math.max(420, panelPixelWidth * (2 / 3));
  const panelWidth = viewport.width * (panelPixelWidth / canvasSize.width);
  const panelHeight = viewport.height * (panelPixelHeight / canvasSize.height);
  const width = panelWidth * CRT_MONITOR_WIDTH_RATIO;
  const height = panelHeight * CRT_MONITOR_HEIGHT_RATIO;
  const targetY = -panelHeight * 0.22;
  const surface = side === -1 ? CRT_ANIMATRON_SURFACE : CRT_STOP_MOTION_SURFACE;
  const { scene } = useGLTF(monitorModelUrl);
  // The monitor export's glass has no usable UV data, so we render a curved
  // video surface inside the exact picture-tube node instead.
  const screenCanvas = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 400;
    return canvas;
  }, []);
  const screenTexture = useMemo(() => {
    const texture = new THREE.CanvasTexture(screenCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }, [screenCanvas]);

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
        child.castShadow = false;
        child.receiveShadow = false;
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

    // A subdivided, gently curved surface keeps the footage inside the CRT
    // opening but gives it the same tube-like bow as the monitor face.
    if (screen) {
      const displaySurface = new THREE.Mesh(
        createCurvedCrtGeometry(surface.width, surface.height, surface.curvature),
        new THREE.MeshBasicMaterial({
          map: screenTexture,
          toneMapped: false,
          // The GLB glass itself is an opaque black material. Draw this video
          // surface after it, while its geometry remains clipped to the tube.
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      displaySurface.scale.setScalar(surface.scale);
      displaySurface.position.set(surface.x, surface.y, surface.z);
      displaySurface.rotateX(surface.rotationX);
      displaySurface.rotateY(surface.rotationY);
      displaySurface.rotateZ(surface.rotationZ);
      displaySurface.renderOrder = 20;
      displaySurface.frustumCulled = false;
      screen.add(displaySurface);
      displaySurfaceRef.current = displaySurface;
      displaySurfaceBaseScaleRef.current.copy(displaySurface.scale);
    }

    return { object, size, screen };
  }, [scene, screenTexture, surface]);

  const modelScale = Math.min(width / monitor.size.x, height / monitor.size.y) * 0.92 * CRT_MONITOR_SCALE;
  // Keep a readable gap between the CRTs using their real scaled width. This
  // means enlarging CRT_MONITOR_SCALE also expands their resting separation.
  const visualMonitorWidth = monitor.size.x * modelScale;
  const visualMonitorDepth = monitor.size.z * modelScale;
  const targetX = side * (visualMonitorWidth * 0.62 + panelWidth * 0.03) * CRT_MONITOR_SEPARATION;
  const labelTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ef2b26";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = '700 61px "Redaction 35", Georgia, serif';
      context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width * 0.94);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }, [label]);

  useEffect(() => () => labelTexture.dispose(), [labelTexture]);
  useEffect(() => () => screenTexture.dispose(), [screenTexture]);
  useEffect(() => {
    if (!renderActive) return;
    const video = screenOverlayRef.current;
    if (!video) return;

    let cancelled = false;
    let videoFrame = 0;
    let animationFrame = 0;

    const requestNextFrame = () => {
      if (cancelled) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const context = screenCanvas.getContext("2d", { alpha: false });
        if (context && video.videoWidth > 0 && video.videoHeight > 0) {
          const sourceAspect = video.videoWidth / video.videoHeight;
          const targetAspect = screenCanvas.width / screenCanvas.height;
          let sourceX = 0;
          let sourceY = 0;
          let sourceWidth = video.videoWidth;
          let sourceHeight = video.videoHeight;
          if (sourceAspect > targetAspect) {
            sourceWidth = video.videoHeight * targetAspect;
            sourceX = (video.videoWidth - sourceWidth) / 2;
          } else if (sourceAspect < targetAspect) {
            sourceHeight = video.videoWidth / targetAspect;
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
            screenCanvas.width,
            screenCanvas.height,
          );
          screenTexture.needsUpdate = true;
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
  }, [invalidate, renderActive, screenOverlayRef, screenCanvas, screenTexture]);
  const labelOffsetX = (viewport.width / canvasSize.width) * (side === -1 ? -10 : 15);

  useFrame(() => {
    const cube = groupRef.current;
    if (!cube) return;

    const entered = THREE.MathUtils.smootherstep(progress.get(), 0, 1);
    // At the 60° entry angle both width and depth project horizontally. Clear
    // their combined footprint so a monitor never appears before the entrance.
    const startX = side * (viewport.width / 2 + visualMonitorWidth * 0.72 + visualMonitorDepth * 0.42 + 0.2);
    cube.position.x = THREE.MathUtils.lerp(startX, targetX, entered);
    cube.position.y = targetY;
    cube.rotation.x = THREE.MathUtils.lerp(CRT_MONITOR_ENTRY_PITCH, CRT_MONITOR_PITCH, entered);
    cube.rotation.y = THREE.MathUtils.lerp(side * CRT_MONITOR_ENTRY_YAW, side * CRT_MONITOR_YAW, entered);
    cube.rotation.z = THREE.MathUtils.lerp(side * 0.06, 0, entered);

    const surfaceScale = THREE.MathUtils.lerp(surface.entryScale, 1, entered);
    displaySurfaceRef.current?.scale.copy(displaySurfaceBaseScaleRef.current).multiplyScalar(surfaceScale);

    // Use the actual visible video plane—not the GLB's unused black glass—to
    // seed the expanded Animatron video. This keeps the handoff anchored when
    // CRT_MONITOR_SCALE or the surface coordinates are adjusted.
    const displaySurface = displaySurfaceRef.current;
    if (displaySurface && side === -1 && screenRectRef) {
      cube.updateMatrixWorld(true);
      displaySurface.geometry.computeBoundingBox();
      const screenBounds = displaySurface.geometry.boundingBox;
      if (!screenBounds) return;
      const corners = [
        new THREE.Vector3(screenBounds.min.x, screenBounds.min.y, screenBounds.min.z),
        new THREE.Vector3(screenBounds.max.x, screenBounds.min.y, screenBounds.min.z),
        new THREE.Vector3(screenBounds.max.x, screenBounds.max.y, screenBounds.max.z),
        new THREE.Vector3(screenBounds.min.x, screenBounds.max.y, screenBounds.max.z),
      ].map((point) => displaySurface.localToWorld(point).project(camera));
      const xs = corners.map((point) => (point.x * 0.5 + 0.5) * canvasSize.width);
      const ys = corners.map((point) => (-point.y * 0.5 + 0.5) * canvasSize.height);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      screenRectRef.current = { left, top, width: right - left, height: bottom - top };
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
  renderActive,
}: {
  progress: MotionValue<number>;
  animatronScreenRef: MutableRefObject<HTMLVideoElement | null>;
  stopMotionScreenRef: MutableRefObject<HTMLVideoElement | null>;
  screenRectRef: MutableRefObject<ScreenRect | null>;
  renderActive: boolean;
}) {
  return (
    <>
      <SceneInvalidator progress={progress} />
      <ambientLight intensity={2.2} />
      <directionalLight position={[0, 8, 10]} intensity={1.15} color="#ffffff" />
      <directionalLight position={[-7, 1, 6]} intensity={0.4} color="#b6cbe6" />
      <ModeCube side={-1} label="Animatron" progress={progress} screenOverlayRef={animatronScreenRef} screenRectRef={screenRectRef} renderActive={renderActive} />
      <ModeCube side={1} label="Stop motion" progress={progress} screenOverlayRef={stopMotionScreenRef} renderActive={renderActive} />
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
  const width = panelWidth * CRT_MONITOR_WIDTH_RATIO;
  const height = panelHeight * CRT_MONITOR_HEIGHT_RATIO;
  const depth = width * 0.28;
  const visualMonitorWidth = width * 0.86 * CRT_MONITOR_SCALE;
  const visualMonitorDepth = depth * CRT_MONITOR_SCALE;
  const targetX = side * (visualMonitorWidth * 0.62 + panelWidth * 0.03) * CRT_MONITOR_SEPARATION;
  const targetY = -panelHeight * 0.22;

  useFrame(() => {
    const monitor = groupRef.current;
    if (!monitor) return;
    const entered = THREE.MathUtils.smootherstep(progress.get(), 0, 1);
    const startX = side * (viewport.width / 2 + visualMonitorWidth * 0.72 + visualMonitorDepth * 0.42 + 0.2);
    monitor.position.x = THREE.MathUtils.lerp(startX, targetX, entered);
    monitor.position.y = targetY;
    monitor.rotation.x = THREE.MathUtils.lerp(CRT_MONITOR_ENTRY_PITCH, CRT_MONITOR_PITCH, entered);
    monitor.rotation.y = THREE.MathUtils.lerp(side * CRT_MONITOR_ENTRY_YAW, side * CRT_MONITOR_YAW, entered);
    monitor.rotation.z = THREE.MathUtils.lerp(side * 0.06, 0, entered);
  });

  return (
    <group ref={groupRef} scale={CRT_MONITOR_SCALE}>
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
  const [renderActive, setRenderActive] = useState(false);

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
        setRenderActive(isNear);
        if (isNear) {
          scheduleUpdate();
        } else {
          if (frame) {
            cancelAnimationFrame(frame);
            frame = 0;
          }
          animatronScreenRef.current?.pause();
          stopMotionScreenRef.current?.pause();
          animatronVideoRef.current?.pause();
          stopMotionVideoRef.current?.pause();
          animatronPlayedRef.current = false;
          stopMotionCrtPlayedRef.current = false;
          stopMotionPlayedRef.current = false;
        }
      },
      { rootMargin: "100% 0px 100% 0px" },
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
                renderActive={renderActive}
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
            preload="metadata"
            aria-hidden="true"
            className="h-full w-full"
          />
          <video
            ref={stopMotionScreenRef}
            src={STOP_MOTION_VIDEO_URL}
            muted
            loop
            playsInline
            preload="metadata"
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
              preload="metadata"
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
              preload="metadata"
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
