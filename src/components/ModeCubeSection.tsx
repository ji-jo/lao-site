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

// CRT layout controls â€” tweak these two values while tuning the mode section.
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
    // local X, hence maxâ†’min produces visual leftâ†’right across the glass.
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
    // At the 60Â° entry angle both width and depth project horizontally. Clear
    // their combined footprint so a monitor never appears before the entrance.
    const startX = side * (viewport.width / 2 + visualMonitorWidth * 0.72 + visualMonitorDepth * 0.42 + 0.2);
    cube.position.x = THREE.MathUtils.lerp(startX, targetX, entered);
    cube.position.y = targetY;
    cube.rotation.x = THREE.MathUtils.lerp(CRT_MONITOR_ENTRY_PITCH, CRT_MONITOR_PITCH, entered);
    cube.rotation.y = THREE.MathUtils.lerp(side * CRT_MONITOR_ENTRY_YAW, side * CRT_MONITOR_YAW, entered);
    cube.rotation.z = THREE.MathUtils.lerp(side * 0.06, 0, entered);

    const surfaceScale = THREE.MathUtils.lerp(surface.entryScale, 1, entered);
    displaySurfaceRef.current?.scale.copy(displaySurfaceBaseScaleRef.current).multiplyScalar(surfaceScale);

    // Use the actual visible video planeâ€”not the GLB's unused black glassâ€”to
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
        <meshBasicMÛ}8¶‰žËkºwµç|€À¸ÈÐ¤¤ì4(€€€€€€¼¼¹¥µ…ÑÉ½¸¡…Ì½µÁ±•Ñ•¥ÑÌ•áÁ…¹Í¥½¸‰ä€À¸ØÀ¸	•¥¸Ñ¡”MÑ½À5½Ñ¥½¸4(€€€€€€¼¼…É¥µµ•‘¥…Ñ•±ä…™Ñ•ÈÑ¡…Ð°±•…Ù¥¹œ•¹½Õ ÍÑ¥­äÑÉ…Ù•°™½È¥ÐÑ¼4(€€€€€€¼¼É¥Í”Ù¥Í¥‰±ä™É½´Ñ¡”‰½ÑÑ½´‰•™½É”Ñ¡¥ÌÍ•¹”É•±•…Í•Ì¸4(€€€€€½¹ÍÐÍ•½¹‘¹ÑÉ…¹”€ôÍµ½½Ñ¡ÍÑ•À¡±…µÀÀÄ ¡ÍÑ¥­åAÉ½É•ÍÌ€´€À¸Ø¤€¼€À¸ÄÈ¤¤ì4(€€€€€½¹ÍÐÙ¥•ÝÁ½ÉÑ]¥‘Ñ €ôÝ¥¹‘½Ü¹¥¹¹•É]¥‘Ñ ì4(€€€€€½¹ÍÐÍ…™•%¹±¥¹•5…É¥¸€ô€ÄØì4(€€€€€½¹ÍÐÍ…™•	±½­5…É¥¸€ô€ÄØì4(€€€€€€¼¼A¡½¹”è•á…Ñ±ä€ÄÙÁà…Ð‰½Ñ •‘•Ì¸Q…‰±•Ð½‘•Í­Ñ½Àè„ÑÉÕ”€ØÐÁÁà…À¸4(€€€€€€¼¼M¡½ÉÐ±…¹‘Í…Á”Ù¥•ÝÁ½ÉÑÌ…¸Í¡É¥¹¬™ÕÉÑ¡•ÈÑ¼ÁÉ•Í•ÉÙ”Ñ¡”Í½ÕÉ”4(€€€€€€¼¼É…Ñ¥¼Ý¥Ñ¡½ÕÐ±¥ÁÁ¥¹œÑ¡”…ÉÙ•ÉÑ¥…±±ä¸4(€€€€€½¹ÍÐ™Õ±±Y¥‘•½]¥‘Ñ €ô5…Ñ ¹µ¥¸ 4(€€€€€€€€ØÐÀ°4(€€€€€€€Ù¥•ÝÁ½ÉÑ]¥‘Ñ €´Í…™•%¹±¥¹•5…É¥¸€¨€È°4(€€€€€€€€¡Ù¥•ÝÁ½ÉÑ!•¥¡Ð€´Í…™•	±½­5…É¥¸€¨€È¤€¨…¹¥µ…ÑÉ½¹ÍÁ•ÑI…Ñ¥¼°4(€€€€€€¤ì4(€€€€€½¹ÍÐ™Õ±±Y¥‘•½!•¥¡Ð€ô™Õ±±Y¥‘•½]¥‘Ñ €¼…¹¥µ…ÑÉ½¹ÍÁ•ÑI…Ñ¥¼ì4(€€€€€½¹ÍÐ™Õ±±1•™Ð€ô€¡Ù¥•ÝÁ½ÉÑ]¥‘Ñ €´™Õ±±Y¥‘•½]¥‘Ñ ¤€¼€Èì4(€€€€€½¹ÍÐ™Õ±±Q½À€ô€¡Ù¥•ÝÁ½ÉÑ!•¥¡Ð€´™Õ±±Y¥‘•½!•¥¡Ð¤€¼€Èì4(€€€€€½¹ÍÐ½É¥¥¸€ôÍÉ••¹I•ÑI•˜¹ÕÉÉ•¹Ð€üüì4(€€€€€€€±•™ÐèÙ¥•ÝÁ½ÉÑ]¥‘Ñ €¨€À¸Èà°4(€€€€€€€Ñ½ÀèÙ¥•ÝÁ½ÉÑ!•¥¡Ð€¨€À¸ÔÔ°4(€€€€€€€Ý¥‘Ñ è5…Ñ ¹µ…à äØ°Ù¥•ÝÁ½ÉÑ]¥‘Ñ €¨€À¸ÄØ¤°4(€€€€€€€¡•¥¡Ðè5…Ñ ¹µ…à àÀ°Ù¥•ÝÁ½ÉÑ]¥‘Ñ €¨€À¸ÄÌÔ¤°4(€€€€€ôì4(4(€€€€€¥˜€¡‰±Õ•	…­‘É½ÁI•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€½¹ÍÐ¡…±½A…‘‘¥¹œ€ô5…Ñ ¹µ¥¸ ÄÀà°5…Ñ ¹µ…à Ðà°™Õ±±Y¥‘•½]¥‘Ñ €¨€À¸ÄØ¤¤ì4(€€€€€€€‰±Õ•	…­‘É½ÁI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹Ý¥‘Ñ €ô€‘í™Õ±±Y¥‘•½]¥‘Ñ €¬¡…±½A…‘‘¥¹œ€¨€ÉõÁá€ì4(€€€€€€€‰±Õ•	…­‘É½ÁI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹¡•¥¡Ð€ô€‘í™Õ±±Y¥‘•½!•¥¡Ð€¬¡…±½A…‘‘¥¹œ€¨€ÉõÁá€ì4(€€€€€€€‰±Õ•	…­‘É½ÁI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹½Á…¥Ñä€ôMÑÉ¥¹œ¡•áÁ…¹Í¥½¸€¨€À¸ÌÔ¤ì4(€€€€€€€‰±Õ•	…­‘É½ÁI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹ÑÉ…¹Í™½É´€ôÑÉ…¹Í±…Ñ”Í ‘í™Õ±±1•™Ð€´¡…±½A…‘‘¥¹õÁà°€‘í™Õ±±Q½À€´¡…±½A…‘‘¥¹õÁà°€À¥€ì4(€€€€€ô4(€€€€€½¹ÍÐ½±‘M•¹•=Á…¥Ñä€ôMÑÉ¥¹œ Ä€´Íµ½½Ñ¡ÍÑ•À¡±…µÀÀÄ¡•áÁ…¹Í¥½¸€¨€Ä¸ÌÔ¤¤¤ì4(€€€€€¥˜€¡Á…¹•±I•˜¹ÕÉÉ•¹Ð¤Á…¹•±I•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹½Á…¥Ñä€ô½±‘M•¹•=Á…¥Ñäì4(€€€€€¥˜€¡…¹Ù…Í1…å•ÉI•˜¹ÕÉÉ•¹Ð¤…¹Ù…Í1…å•ÉI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹½Á…¥Ñä€ô½±‘M•¹•=Á…¥Ñäì4(€€€€€¥˜€¡ÍÉ••¹=Ù•É±…å1…å•ÉI•˜¹ÕÉÉ•¹Ð¤ÍÉ••¹=Ù•É±…å1…å•ÉI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹½Á…¥Ñä€ô½±‘M•¹•=Á…¥Ñäì4(€€€€€¥˜€¡½Áå1…å•ÉI•˜¹ÕÉÉ•¹Ð¤½Áå1…å•ÉI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹½Á…¥Ñä€ô½±‘M•¹•=Á…¥Ñäì4(4(€€€€€¥˜€¡•áÁ…¹‘¥¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€½¹ÍÐà€ôQ!I¹5…Ñ¡UÑ¥±Ì¹±•ÉÀ¡½É¥¥¸¹±•™Ð°™Õ±±1•™Ð°•áÁ…¹Í¥½¸¤ì4(€€€€€€€½¹ÍÐä€ôQ!I¹5…Ñ¡UÑ¥±Ì¹±•ÉÀ¡½É¥¥¸¹Ñ½À°™Õ±±Q½À°•áÁ…¹Í¥½¸¤ì4(€€€€€€€½¹ÍÐÍ…±•`€ôQ!I¹5…Ñ¡UÑ¥±Ì¹±•ÉÀ¡½É¥¥¸¹Ý¥‘Ñ €¼™Õ±±Y¥‘•½]¥‘Ñ °€Ä°•áÁ…¹Í¥½¸¤ì4(€€€€€€€½¹ÍÐÍ…±•d€ôQ!I¹5…Ñ¡UÑ¥±Ì¹±•ÉÀ¡½É¥¥¸¹¡•¥¡Ð€¼™Õ±±Y¥‘•½!•¥¡Ð°€Ä°•áÁ…¹Í¥½¸¤ì4(€€€€€€€•áÁ…¹‘¥¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹Ý¥‘Ñ €ô€‘í™Õ±±Y¥‘•½]¥‘Ñ¡õÁá€ì4(€€€€€€€•áÁ…¹‘¥¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹¡•¥¡Ð€ô€‘í™Õ±±Y¥‘•½!•¥¡ÑõÁá€ì4(€€€€€€€•áÁ…¹‘¥¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹½Á…¥Ñä€ôMÑÉ¥¹œ¡Íµ½½Ñ¡ÍÑ•À¡±…µÀÀÄ¡•áÁ…¹Í¥½¸€¨€Ô¤¤¤ì4(€€€€€€€•áÁ…¹‘¥¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹‰½É‘•ÉI…‘¥ÕÌ€ô€ˆÄÙÁàˆì4(€€€€€€€•áÁ…¹‘¥¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹ÑÉ…¹Í™½É´€ôÑÉ…¹Í±…Ñ”Í ‘íáõÁà°€‘íåõÁà°€À¤Í…±” ‘íÍ…±•aô°€‘íÍ…±•eô¥€ì4(€€€€€ô4(4(€€€€€¥˜€¡Í•½¹‘Y¥‘•½1…å•ÉI•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€½¹ÍÐ½Ù•É±…Ád€ô™Õ±±Q½À€¬™Õ±±Y¥‘•½!•¥¡Ð€¨€¡Ù¥•ÝÁ½ÉÑ]¥‘Ñ €ð€ØÐÀ€ü€À¸ÄØ€è€À¸ÄÈ¤ì4(€€€€€€€½¹ÍÐÍ•½¹‘Y¥‘•½]¥‘Ñ €ô5…Ñ ¹µ¥¸ 4(€€€€€€€€€€ØÐÀ°4(€€€€€€€€€Ù¥•ÝÁ½ÉÑ]¥‘Ñ €´Í…™•%¹±¥¹•5…É¥¸€¨€È°4(€€€€€€€€€5…Ñ ¹µ…à Ä°Ù¥•ÝÁ½ÉÑ!•¥¡Ð€´½Ù•É±…Ád€´Í…™•	±½­5…É¥¸¤€¨ÍÑ½Á5½Ñ¥½¹ÍÁ•ÑI…Ñ¥¼°4(€€€€€€€€¤ì4(€€€€€€€½¹ÍÐÍ•½¹‘Y¥‘•½!•¥¡Ð€ôÍ•½¹‘Y¥‘•½]¥‘Ñ €¼ÍÑ½Á5½Ñ¥½¹ÍÁ•ÑI…Ñ¥¼ì4(€€€€€€€½¹ÍÐ‘•Í¥É•‘M•½¹‘`€ô™Õ±±1•™Ð€¬™Õ±±Y¥‘•½]¥‘Ñ €¨€¡Ù¥•ÝÁ½ÉÑ]¥‘Ñ €ð€ØÐÀ€ü€À¸ÀÐ€è€À¸Àà¤ì4(€€€€€€€½¹ÍÐÍ•½¹‘`€ôQ!I¹5…Ñ¡UÑ¥±Ì¹±…µÀ 4(€€€€€€€€€‘•Í¥É•‘M•½¹‘`°4(€€€€€€€€€Í…™•%¹±¥¹•5…É¥¸°4(€€€€€€€€€Ù¥•ÝÁ½ÉÑ]¥‘Ñ €´Í•½¹‘Y¥‘•½]¥‘Ñ €´Í…™•%¹±¥¹•5…É¥¸°4(€€€€€€€€¤ì4(€€€€€€€½¹ÍÐÍ•½¹‘Q…É•Ñd€ô5…Ñ ¹µ¥¸¡½Ù•É±…Ád°Ù¥•ÝÁ½ÉÑ!•¥¡Ð€´Í•½¹‘Y¥‘•½!•¥¡Ð€´Í…™•	±½­5…É¥¸¤ì4(€€€€€€€½¹ÍÐÍ•½¹‘d€ôQ!I¹5…Ñ¡UÑ¥±Ì¹±•ÉÀ¡Ù¥•ÝÁ½ÉÑ!•¥¡Ð€¬€ÌÈ°Í•½¹‘Q…É•Ñd°Í•½¹‘¹ÑÉ…¹”¤ì4(€€€€€€€½¹ÍÐÍ•½¹‘I½Ñ…Ñ¥½¸€ôÙ¥•ÝÁ½ÉÑ]¥‘Ñ €ð€ØÐÀ€ü€À€èQ!I¹5…Ñ¡UÑ¥±Ì¹±•ÉÀ À°€´Ì°Í•½¹‘¹ÑÉ…¹”¤ì4(€€€€€€€Í•½¹‘Y¥‘•½1…å•ÉI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹Ý¥‘Ñ €ô€‘íÍ•½¹‘Y¥‘•½]¥‘Ñ¡õÁá€ì4(€€€€€€€Í•½¹‘Y¥‘•½1…å•ÉI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹¡•¥¡Ð€ô€‘íÍ•½¹‘Y¥‘•½!•¥¡ÑõÁá€ì4(€€€€€€€Í•½¹‘Y¥‘•½1…å•ÉI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹½Á…¥Ñä€ôMÑÉ¥¹œ¡Í•½¹‘¹ÑÉ…¹”¤ì4(€€€€€€€Í•½¹‘Y¥‘•½1…å•ÉI•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹ÑÉ…¹Í™½É´€ôÑÉ…¹Í±…Ñ”Í ‘íÍ•½¹‘aõÁà°€‘íÍ•½¹‘eõÁà°€À¤É½Ñ…Ñ” ‘íÍ•½¹‘I½Ñ…Ñ¥½¹õ‘•œ¥€ì4(€€€€€ô4(4(€€€€€€¼¼MÑ…ÉÐ‰½Ñ ÁÉ•Ù¥•ÝÌ…ÌÑ¡•¥ÈIQÌ…É”É•Ù•…±•¸Q¡•äÉ•µ…¥¸µÕÑ•…¹4(€€€€€€¼¼±½½À½¹Ñ¥¹Õ½ÕÍ±äÝ¡¥±”Ñ¡”µ½‘”Í•ÅÕ•¹”¥Ì¥¸Ù¥•Ü¸4(€€€€€¥˜€¡ÍÑ¥­åAÉ½É•ÍÌ€øô€À¸ÄÈ€˜˜€……¹¥µ…ÑÉ½¹A±…å•‘I•˜¹ÕÉÉ•¹Ð€˜˜…¹¥µ…ÑÉ½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€…¹¥µ…ÑÉ½¹A±…å•‘I•˜¹ÕÉÉ•¹Ð€ôÑÉÕ”ì4(€€€€€€€…¹¥µ…ÑÉ½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÕÉÉ•¹ÑQ¥µ”€ô€Àì4(€€€€€€€¥˜€¡…¹¥µ…ÑÉ½¹MÉ••¹I•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€€€…¹¥µ…ÑÉ½¹MÉ••¹I•˜¹ÕÉÉ•¹Ð¹ÕÉÉ•¹ÑQ¥µ”€ô€Àì4(€€€€€€€€€Ù½¥…¹¥µ…ÑÉ½¹MÉ••¹I•˜¹ÕÉÉ•¹Ð¹Á±…ä ¤¹…Ñ   ¤€ôøÕ¹‘•™¥¹•¤ì4(€€€€€€€ô4(€€€€€€€Ù½¥…¹¥µ…ÑÉ½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹Á±…ä ¤¹…Ñ   ¤€ôøÕ¹‘•™¥¹•¤ì4(€€€€€ô4(€€€€€¥˜€¡ÍÑ¥­åAÉ½É•ÍÌ€øô€À¸ÄÈ€˜˜€…ÍÑ½Á5½Ñ¥½¹ÉÑA±…å•‘I•˜¹ÕÉÉ•¹Ð€˜˜ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€ÍÑ½Á5½Ñ¥½¹ÉÑA±…å•‘I•˜¹ÕÉÉ•¹Ð€ôÑÉÕ”ì4(€€€€€€€¥˜€¡ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹É•…‘åMÑ…Ñ”€ôôô!Q515•‘¥…±•µ•¹Ð¹!Y}9=Q!%9¤ì4(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹±½… ¤ì4(€€€€€€€ô4(€€€€€€€ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÕÉÉ•¹ÑQ¥µ”€ô€Àì4(€€€€€€€¥˜€¡ÍÑ½Á5½Ñ¥½¹MÉ••¹I•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹MÉ••¹I•˜¹ÕÉÉ•¹Ð¹ÕÉÉ•¹ÑQ¥µ”€ô€Àì4(€€€€€€€€€Ù½¥ÍÑ½Á5½Ñ¥½¹MÉ••¹I•˜¹ÕÉÉ•¹Ð¹Á±…ä ¤¹…Ñ   ¤€ôøÕ¹‘•™¥¹•¤ì4(€€€€€€€ô4(€€€€€€€Ù½¥ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹Á±…ä ¤¹…Ñ   ¤€ôøì4(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹ÉÑA±…å•‘I•˜¹ÕÉÉ•¹Ð€ô™…±Í”ì4(€€€€€€€ô¤ì4(€€€€€ô4(€€€€€¥˜€¡ÍÑ¥­åAÉ½É•ÍÌ€øô€À¸Ø€˜˜€…ÍÑ½Á5½Ñ¥½¹A±…å•‘I•˜¹ÕÉÉ•¹Ð€˜˜ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€€€ÍÑ½Á5½Ñ¥½¹A±…å•‘I•˜¹ÕÉÉ•¹Ð€ôÑÉÕ”ì4(€€€€€€€¥˜€¡ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹É•…‘åMÑ…Ñ”€ôôô!Q515•‘¥…±•µ•¹Ð¹!Y}9=Q!%9¤ì4(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹±½… ¤ì4(€€€€€€€ô4(€€€€€€€ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹ÕÉÉ•¹ÑQ¥µ”€ô€Àì4(€€€€€€€Ù½¥ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹Á±…ä ¤¹…Ñ   ¤€ôøì4(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹A±…å•‘I•˜¹ÕÉÉ•¹Ð€ô™…±Í”ì4(€€€€€€€ô¤ì4(€€€€€ô4(€€€ôì4(4(€€€½¹ÍÐÍ¡•‘Õ±•UÁ‘…Ñ”€ô€ ¤€ôøì4(€€€€€¥˜€¡¥Í9•…È€˜˜€…™É…µ”¤™É…µ”€ôÉ•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”¡ÕÁ‘…Ñ•MÑ¥­åAÉ½É•ÍÌ¤ì4(€€€ôì4(4(€€€½¹ÍÐ½‰Í•ÉÙ•È€ô¹•Ü%¹Ñ•ÉÍ•Ñ¥½¹=‰Í•ÉÙ•È 4(€€€€€€¡m•¹ÑÉåt¤€ôøì(€€€€€€€¥Í9•…È€ô•¹ÑÉäü¹¥Í%¹Ñ•ÉÍ•Ñ¥¹œ€üü™…±Í”ì(€€€€€€€Í•ÑI•¹‘•ÉÑ¥Ù”¡¥Í9•…È¤ì(€€€€€€€¥˜€¡¥Í9•…È¤ì(€€€€€€€€€Í¡•‘Õ±•UÁ‘…Ñ” ¤ì(€€€€€€€ô•±Í”ì(€€€€€€€€€¥˜€¡™É…µ”¤ì(€€€€€€€€€€€…¹•±¹¥µ…Ñ¥½¹É…µ”¡™É…µ”¤ì(€€€€€€€€€€€™É…µ”€ô€Àì(€€€€€€€€€ô(€€€€€€€€€…¹¥µ…ÑÉ½¹MÉ••¹I•˜¹ÕÉÉ•¹Ðü¹Á…ÕÍ” ¤ì(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹MÉ••¹I•˜¹ÕÉÉ•¹Ðü¹Á…ÕÍ” ¤ì(€€€€€€€€€…¹¥µ…ÑÉ½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ðü¹Á…ÕÍ” ¤ì(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ðü¹Á…ÕÍ” ¤ì(€€€€€€€€€…¹¥µ…ÑÉ½¹A±…å•‘I•˜¹ÕÉÉ•¹Ð€ô™…±Í”ì(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹ÉÑA±…å•‘I•˜¹ÕÉÉ•¹Ð€ô™…±Í”ì(€€€€€€€€€ÍÑ½Á5½Ñ¥½¹A±…å•‘I•˜¹ÕÉÉ•¹Ð€ô™…±Í”ì(€€€€€€€ô(€€€€€ô°4(€€€€€ìÉ½½Ñ5…É¥¸è€ˆÄÀÀ”€ÁÁà€ÄÀÀ”€ÁÁàˆô°(€€€€¤ì4(€€€½‰Í•ÉÙ•È¹½‰Í•ÉÙ”¡Í•Ñ¥½¸¤ì4(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰ÍÉ½±°ˆ°Í¡•‘Õ±•UÁ‘…Ñ”°ìÁ…ÍÍ¥Ù”èÑÉÕ”ô¤ì4(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰É•Í¥é”ˆ°Í¡•‘Õ±•UÁ‘…Ñ”°ìÁ…ÍÍ¥Ù”èÑÉÕ”ô¤ì4(4(€€€É•ÑÕÉ¸€ ¤€ôøì4(€€€€€…¹•±¹¥µ…Ñ¥½¹É…µ”¡™É…µ”¤ì4(€€€€€½‰Í•ÉÙ•È¹‘¥Í½¹¹•Ð ¤ì4(€€€€€Ý¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•È ‰ÍÉ½±°ˆ°Í¡•‘Õ±•UÁ‘…Ñ”¤ì4(€€€€€Ý¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•È ‰É•Í¥é”ˆ°Í¡•‘Õ±•UÁ‘…Ñ”¤ì4(€€€ôì4(€ô°m…¹¥µ…ÑÉ½¹ÍÁ•ÑI…Ñ¥¼°Õ‰•AÉ½É•ÍÌ°ÍÑ½Á5½Ñ¥½¹ÍÁ•ÑI…Ñ¥½t¤ì4(4(€É•ÑÕÉ¸€ 4(€€€€ñÍ•Ñ¥½¸É•˜õíÍ•Ñ¥½¹I•™ô¥ô‰µ½‘•Ìˆ±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”èµläÁt µlÐØÁÙ¡t‰œµ¥¹¬´äÀÀˆø4(€€€€€€ñMÉ½±±=‰Í•ÉÙ•È±…ÍÍ9…µ”ô‰ÍÑ¥­äÑ½À´À µlÄÀÁ‘Ù¡tÜµ™Õ±°½Ù•É™±½Üµ¡¥‘‘•¸ˆø4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”¥¹Í•Ð´À™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÁàµm±…µÀ ÄÙÁà°ÍÙÜ°ÐÁÁà¥tˆø4(€€€€€€€€€€ñ‘¥ØÉ•˜õíÁ…¹•±I•™ô±…ÍÍ9…µ”ô‰…ÍÁ•ÐµlÌ¼Étµ¥¸µ µlÐÈÁÁátÜµ™Õ±°µ…àµÜµlÄÈÀÁÁátÉ½Õ¹‘•µlÐÁÁát‰œµl‘‘‘‘‘‘tÝ¥±°µ¡…¹”µm½Á…¥Ñåtˆ€¼ø4(€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€ñ‘¥ØÉ•˜õí…¹Ù…Í1…å•ÉI•™ô±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”¥¹Í•Ð´Àè´ÄÀÝ¥±°µ¡…¹”µm½Á…¥Ñåtˆø4(€€€€€€€€€€ñ…¹Ù…Ì4(€€€€€€€€€€€…µ•É„õíìÁ½Í¥Ñ¥½¸èlÀ°€À°€ÄÁt°™½Øè€Ìàõô4(€€€€€€€€€€€‘ÁÈõìÅô4(€€€€€€€€€€€™É…µ•±½½Àô‰‘•µ…¹ˆ4(€€€€€€€€€€€°õíì…±Á¡„èÑÉÕ”°…¹Ñ¥…±¥…Ìè™…±Í”°Á½Ý•ÉAÉ•™•É•¹”è€‰¡¥ µÁ•É™½Éµ…¹”ˆõô4(€€€€€€€€€€€±…ÍÍ9…µ”ô‰ µ™Õ±°Üµ™Õ±°ˆ4(€€€€€€€€€€€ÍÑå±”õíì‰…­É½Õ¹è€‰ÑÉ…¹ÍÁ…É•¹Ðˆõô4(€€€€€€€€€€ø4(€€€€€€€€€€€€ñMÕÍÁ•¹Í”™…±±‰…¬õìñ5½¹¥Ñ½É1½…‘¥¹M•¹”ÁÉ½É•ÍÌõíÕ‰•AÉ½É•ÍÍô€¼ùôø4(€€€€€€€€€€€€€€ñÕ‰•M•¹”4(€€€€€€€€€€€€€€€ÁÉ½É•ÍÌõíÕ‰•AÉ½É•ÍÍô4(€€€€€€€€€€€€€€€…¹¥µ…ÑÉ½¹MÉ••¹I•˜õí…¹¥µ…ÑÉ½¹MÉ••¹I•™ô4(€€€€€€€€€€€€€€€ÍÑ½Á5½Ñ¥½¹MÉ••¹I•˜õíÍÑ½Á5½Ñ¥½¹MÉ••¹I•™ô(€€€€€€€€€€€€€€€ÍÉ••¹I•ÑI•˜õíÍÉ••¹I•ÑI•™ô(€€€€€€€€€€€€€€€É•¹‘•ÉÑ¥Ù”õíÉ•¹‘•ÉÑ¥Ù•ô(€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€ð½MÕÍÁ•¹Í”ø4(€€€€€€€€€€ð½…¹Ù…Ìø4(€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€ñ‘¥Ø4(€€€€€€€€€É•˜õíÍÉ••¹=Ù•É±…å1…å•ÉI•™ô4(€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ4(€€€€€€€€€±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”™¥á•±•™Ðµl´ÄÀÀÀÁÁátÑ½À´À€µè´ÄÀ µlÈÔÙÁátÜµlÈÔÙÁát½Á…¥Ñä´Àˆ4(€€€€€€€€ø4(€€€€€€€€€€ñÙ¥‘•¼4(€€€€€€€€€€€É•˜õí…¹¥µ…ÑÉ½¹MÉ••¹I•™ô4(€€€€€€€€€€€ÍÉŒõí9%5QI=9}Y%=}UI1ô4(€€€€€€€€€€€µÕÑ•4(€€€€€€€€€€€±½½À4(€€€€€€€€€€€Á±…åÍ%¹±¥¹”4(€€€€€€€€€€€ÁÉ•±½…ô‰µ•Ñ…‘…Ñ„ˆ(€€€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ4(€€€€€€€€€€€±…ÍÍ9…µ”ô‰ µ™Õ±°Üµ™Õ±°ˆ4(€€€€€€€€€€¼ø4(€€€€€€€€€€ñÙ¥‘•¼4(€€€€€€€€€€€É•˜õíÍÑ½Á5½Ñ¥½¹MÉ••¹I•™ô4(€€€€€€€€€€€ÍÉŒõíMQ=A}5=Q%=9}Y%=}UI1ô4(€€€€€€€€€€€µÕÑ•4(€€€€€€€€€€€±½½À4(€€€€€€€€€€€Á±…åÍ%¹±¥¹”4(€€€€€€€€€€€ÁÉ•±½…ô‰µ•Ñ…‘…Ñ„ˆ(€€€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ4(€€€€€€€€€€€±…ÍÍ9…µ”ô‰ µ™Õ±°Üµ™Õ±°ˆ4(€€€€€€€€€€¼ø4(€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€ñ‘¥ØÉ•˜õí½Áå1…å•ÉI•™ô±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”¥¹Í•Ð´Àè´ÈÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÁàµm±…µÀ ÄÙÁà°ÍÙÜ°ÐÁÁà¥tÝ¥±°µ¡…¹”µm½Á…¥Ñåtˆø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”…ÍÁ•ÐµlÌ¼Étµ¥¸µ µlÐÈÁÁátÜµ™Õ±°µ…àµÜµlÄÈÀÁÁátˆø4(€€€€€€€€€€€€ñMÉ½±±=‰Í•ÉÙ•È¹QÉ¥•ÉÉ½ÕÀ±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”¥¹Í•Ðµà´ÀÑ½ÀµlÜ¸Ô•tè´ÄÀÁà´ÔÑ•áÐµ•¹Ñ•ÈÑ•áÐµlŒÀäÀäÀåtˆø4(€€€€€€€€€€€€€íl4(€€€€€€€€€€€€€€€€‰¹¥µ…Ñ¥½¸Í¡½Õ±¹½Ð‰”½µÁ±¥…Ñ•ˆ°4(€€€€€€€€€€€€€€€€‰Q¡…ÓŠeÌÝ¡äÝ”µ…‘”Ñ¡”ÁÉ½‘ÕÐˆ°4(€€€€€€€€€€€€€€€€‰1…¼¡…ÌÑÝ¼µ½‘•Ìˆ°4(€€€€€€€€€€€€€t¹µ…À ¡±¥¹”°¥¹‘•à¤€ôøì4(€€€€€€€€€€€€€€€½¹ÍÐ¥ÍÑ¥Ù”€ô…Ñ¥Ù•MÑ•À€øô¥¹‘•à€¬€Äì4(€€€€€€€€€€€€€€€½¹ÍÐ¥Í1…ÍÐ€ô¥¹‘•à€ôôô€Èì4(€€€€€€€€€€€€€€€É•ÑÕÉ¸€ 4(€€€€€€€€€€€€€€€€€€ñMÉ½±±=‰Í•ÉÙ•È¹QÉ¥•È­•äõí±¥¹•ô±…ÍÍ9…µ”õí±Íà ‰É•±…Ñ¥Ù”ˆ°¥Í1…ÍÐ€˜˜€‰µÐµm±…µÀ ÌáÁà°Ô¸ÙÙÜ°ØÙÁà¥tˆ¥ôø4(€€€€€€€€€€€€€€€€€€€ì ¤€ôø€ 4(€€€€€€€€€€€€€€€€€€€€€€ðø4(€€€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”õí±Íà¡ì€‰½Á…¥Ñä´Àˆè€…¥ÍÑ¥Ù”ô°€‰…‰Í½±ÕÑ”¥¹Í•Ð´À´´À™½¹Ðµ‘¥ÍÁ±…äÑÉ…¹Í¥Ñ¥½¸‘ÕÉ…Ñ¥½¸´ÜÀÀˆ°¥Í1…ÍÐ€ü€‰Ñ•áÐµm±…µÀ ÈåÁà°Ì¸ÑÙÜ°ÐÉÁà¥t±•…‘¥¹œµ¹½¹”ˆ€è€‰Ñ•áÐµm±…µÀ ÌÉÁà°Ð¸ÅÙÜ°ÐáÁà¥t±•…‘¥¹œµlÄ¸ÄÉtˆ¥ôø4(€€€€€€€€€€€€€€€€€€€€€€€€€í±¥¹•ô4(€€€€€€€€€€€€€€€€€€€€€€€€ð½Àø4(€€€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”õí±Íà ‰¥¹Ù¥Í¥‰±”É•±…Ñ¥Ù”´´À™½¹Ðµ‘¥ÍÁ±…äˆ°¥Í1…ÍÐ€ü€‰Ñ•áÐµm±…µÀ ÈåÁà°Ì¸ÑÙÜ°ÐÉÁà¥t±•…‘¥¹œµ¹½¹”ˆ€è€‰Ñ•áÐµm±…µÀ ÌÉÁà°Ð¸ÅÙÜ°ÐáÁà¥t±•…‘¥¹œµlÄ¸ÄÉtˆ¥ôø4(€€€€€€€€€€€€€€€€€€€€€€€€€í±¥¹•ô4(€€€€€€€€€€€€€€€€€€€€€€€€ð½Àø4(€€€€€€€€€€€€€€€€€€€€€€ð¼ø4(€€€€€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€€€€€ð½MÉ½±±=‰Í•ÉÙ•È¹QÉ¥•Èø4(€€€€€€€€€€€€€€€€¤ì4(€€€€€€€€€€€€€ô¥ô4(€€€€€€€€€€€€ð½MÉ½±±=‰Í•ÉÙ•È¹QÉ¥•ÉÉ½ÕÀø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€ñ‘¥Ø4(€€€€€€€€€É•˜õí‰±Õ•	…­‘É½ÁI•™ô4(€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ4(€€€€€€€€€±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”±•™Ð´ÀÑ½À´ÀèµlÈÕtÉ½Õ¹‘•µlÌÉÁát‰œµlŒÁˆÕ˜äÕt¼ÈÔ½Á…¥Ñä´À‰±ÕÈµlÐáÁátÝ¥±°µ¡…¹”µmÑÉ…¹Í™½É´±½Á…¥ÑåtmÑÉ…¹Í™½É´µ½É¥¥¸èÁ|Átˆ4(€€€€€€€€¼ø4(4(€€€€€€€€ñ‘¥Ø4(€€€€€€€€€É•˜õí•áÁ…¹‘¥¹Y¥‘•½I•™ô4(€€€€€€€€€±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”±•™Ð´ÀÑ½À´Àè´ÌÀ½Ù•É™±½ÜµÙ¥Í¥‰±”É½Õ¹‘•µlÄÙÁát½Á…¥Ñä´ÀÝ¥±°µ¡…¹”µmÑÉ…¹Í™½É´±½Á…¥Ñä±‰½É‘•ÈµÉ…‘¥ÕÍtmÑÉ…¹Í™½É´µ½É¥¥¸èÁ|Átˆ4(€€€€€€€€€…É¥„µ±…‰•°ô‰¹¥µ…ÑÉ½¸ÁÉ½‘ÕÐÁÉ•Ù¥•Üˆ4(€€€€€€€€ø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”¥¹Í•Ð´À½Ù•É™±½Üµ¡¥‘‘•¸É½Õ¹‘•µlÄÙÁát‰œµlŒÀÔÀÔÀÕtÍ¡…‘½ÜµlÁ|ÄÑÁá|ÌÑÁá|ÉÁá}É‰„ À°Ðä°àÌ°¸Èà¥tm½É¹•ÈµÍ¡…Á”éÍÅÕ¥É±•tˆø4(€€€€€€€€€€€ì……¹¥µ…ÑÉ½¹Ù…¥±…‰±”€˜˜€ 4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”¥¹Í•Ð´ÀÉ¥Á±…”µ¥Ñ•µÌµ•¹Ñ•ÈÁà´ÐÑ•áÐµ•¹Ñ•È™½¹Ðµµ½¹¼Ñ•áÐµlÄÁÁátÕÁÁ•É…Í”ÑÉ…­¥¹œµl¸Å•µtÑ•áÐµÝ¡¥Ñ”¼ÐÔˆø4(€€€€€€€€€€€€€€€‘…¹¥µ…ÑÉ½¸µ‘•µ¼¹µÀÐ4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€ñÙ¥‘•¼4(€€€€€€€€€€€€€É•˜õí…ÁÑÕÉ•¹¥µ…ÑÉ½¹Y¥‘•½ô4(€€€€€€€€€€€€€ÍÉŒõí9%5QI=9}Y%=}UI1ô4(€€€€€€€€€€€€€µÕÑ•4(€€€€€€€€€€€€€±½½À4(€€€€€€€€€€€€€Á±…åÍ%¹±¥¹”4(€€€€€€€€€€€€€ÁÉ•±½…ô‰µ•Ñ…‘…Ñ„ˆ(€€€€€€€€€€€€€½¹1½…‘•‘5•Ñ…‘…Ñ„õì¡•Ù•¹Ð¤€ôøì4(€€€€€€€€€€€€€€€½¹ÍÐÙ¥‘•¼€ô•Ù•¹Ð¹ÕÉÉ•¹ÑQ…É•Ðì4(€€€€€€€€€€€€€€€¥˜€¡Ù¥‘•¼¹Ù¥‘•½]¥‘Ñ €ø€À€˜˜Ù¥‘•¼¹Ù¥‘•½!•¥¡Ð€ø€À¤ì4(€€€€€€€€€€€€€€€€€Í•Ñ¹¥µ…ÑÉ½¹ÍÁ•ÑI…Ñ¥¼¡Ù¥‘•¼¹Ù¥‘•½]¥‘Ñ €¼Ù¥‘•¼¹Ù¥‘•½!•¥¡Ð¤ì4(€€€€€€€€€€€€€€€ô4(€€€€€€€€€€€€€õô4(€€€€€€€€€€€€€½¹…¹A±…äõì ¤€ôøì4(€€€€€€€€€€€€€€€Í•Ñ¹¥µ…ÑÉ½¹Ù…¥±…‰±”¡ÑÉÕ”¤ì4(€€€€€€€€€€€€€€€¥˜€¡±…Ñ•ÍÑAÉ½É•ÍÍI•˜¹ÕÉÉ•¹Ð€øô€À¸ÄÈ€˜˜…¹¥µ…ÑÉ½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ðü¹Á…ÕÍ•¤ì4(€€€€€€€€€€€€€€€€€Ù½¥…¹¥µ…ÑÉ½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹Á±…ä ¤¹…Ñ   ¤€ôøÕ¹‘•™¥¹•¤ì4(€€€€€€€€€€€€€€€ô4(€€€€€€€€€€€€€õô4(€€€€€€€€€€€€€½¹ÉÉ½Èõì ¤€ôøÍ•Ñ¹¥µ…ÑÉ½¹Ù…¥±…‰±”¡™…±Í”¥ô4(€€€€€€€€€€€€€±…ÍÍ9…µ”õí±Íà ‰ µ™Õ±°Üµ™Õ±°½‰©•Ðµ½Ù•Èˆ°…¹¥µ…ÑÉ½¹Ù…¥±…‰±”€ü€‰½Á…¥Ñä´ÄÀÀˆ€è€‰½Á…¥Ñä´Àˆ¥ô4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”¥¹Í•Ðµà´ÀÑ½Àµ™Õ±°è´ÄÀµÐ´ÌÝ¡¥Ñ•ÍÁ…”µ¹½ÝÉ…ÀÑ•áÐµ•¹Ñ•È™½¹Ðµ‘¥ÍÁ±…äÑ•áÐµlÈÑÁát™½¹Ðµ¹½Éµ…°±•…‘¥¹œµ¹½¹”Ñ•áÐµl•˜ÉˆÈÙtˆø4(€€€€€€€€€€€¹¥µ…ÑÉ½¸4(€€€€€€€€€€ð½Àø4(€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€ñ‘¥Ø4(€€€€€€€€€É•˜õíÍ•½¹‘Y¥‘•½1…å•ÉI•™ô4(€€€€€€€€€±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”±•™Ð´ÀÑ½À´Àè´ÐÀ½Ù•É™±½ÜµÙ¥Í¥‰±”É½Õ¹‘•µlÄÙÁát½Á…¥Ñä´ÀÝ¥±°µ¡…¹”µmÑÉ…¹Í™½É´±½Á…¥ÑåtmÑÉ…¹Í™½É´µ½É¥¥¸èÔÀ•|ÔÀ•tˆ4(€€€€€€€€€…É¥„µ±…‰•°ô‰MÑ½Àµµ½Ñ¥½¸ÁÉ½‘ÕÐÁÉ•Ù¥•Üˆ4(€€€€€€€€ø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”¥¹Í•Ð´À½Ù•É™±½Üµ¡¥‘‘•¸É½Õ¹‘•µlÄÙÁát‰œµlŒÀÔÀÔÀÕtÍ¡…‘½ÜµlÁ|ÈáÁá|àÁÁá}É‰„ À°À°À°¸Ðà¥tm½É¹•ÈµÍ¡…Á”éÍÅÕ¥É±•tˆø4(€€€€€€€€€€€€ñÙ¥‘•¼4(€€€€€€€€€€€€€É•˜õí…ÁÑÕÉ•MÑ½Á5½Ñ¥½¹Y¥‘•½ô4(€€€€€€€€€€€€€ÍÉŒõíMQ=A}5=Q%=9}Y%=}UI1ô4(€€€€€€€€€€€€€µÕÑ•4(€€€€€€€€€€€€€±½½À4(€€€€€€€€€€€€€Á±…åÍ%¹±¥¹”4(€€€€€€€€€€€€€ÁÉ•±½…ô‰µ•Ñ…‘…Ñ„ˆ(€€€€€€€€€€€€€½¹1½…‘•‘5•Ñ…‘…Ñ„õì¡•Ù•¹Ð¤€ôøì4(€€€€€€€€€€€€€€€½¹ÍÐÙ¥‘•¼€ô•Ù•¹Ð¹ÕÉÉ•¹ÑQ…É•Ðì4(€€€€€€€€€€€€€€€¥˜€¡Ù¥‘•¼¹Ù¥‘•½]¥‘Ñ €ø€À€˜˜Ù¥‘•¼¹Ù¥‘•½!•¥¡Ð€ø€À¤ì4(€€€€€€€€€€€€€€€€€Í•ÑMÑ½Á5½Ñ¥½¹ÍÁ•ÑI…Ñ¥¼¡Ù¥‘•¼¹Ù¥‘•½]¥‘Ñ €¼Ù¥‘•¼¹Ù¥‘•½!•¥¡Ð¤ì4(€€€€€€€€€€€€€€€ô4(€€€€€€€€€€€€€õô4(€€€€€€€€€€€€€½¹…¹A±…äõì ¤€ôøì4(€€€€€€€€€€€€€€€¥˜€¡±…Ñ•ÍÑAÉ½É•ÍÍI•˜¹ÕÉÉ•¹Ð€øô€À¸ÄÈ€˜˜ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ðü¹Á…ÕÍ•¤ì4(€€€€€€€€€€€€€€€€€Ù½¥ÍÑ½Á5½Ñ¥½¹Y¥‘•½I•˜¹ÕÉÉ•¹Ð¹Á±…ä ¤¹…Ñ   ¤€ôøÕ¹‘•™¥¹•¤ì4(€€€€€€€€€€€€€€€ô4(€€€€€€€€€€€€€õô4(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ µ™Õ±°Üµ™Õ±°½‰©•Ðµ½Ù•Èˆ4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”¥¹Í•Ðµà´ÀÑ½Àµ™Õ±°è´ÄÀµÐ´ÌÝ¡¥Ñ•ÍÁ…”µ¹½ÝÉ…ÀÑ•áÐµ•¹Ñ•È™½¹Ðµ‘¥ÍÁ±…äÑ•áÐµlÈÑÁát™½¹Ðµ¹½Éµ…°±•…‘¥¹œµ¹½¹”Ñ•áÐµl•˜ÉˆÈÙtˆø4(€€€€€€€€€€€MÑ½Àµ½Ñ¥½¸4(€€€€€€€€€€ð½Àø4(€€€€€€€€ð½‘¥Øø4(€€€€€€ð½MÉ½±±=‰Í•ÉÙ•Èø4(€€€€ð½Í•Ñ¥½¸ø4(€€¤ì4)ô4