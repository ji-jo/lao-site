import { useEffect, useRef } from "react";

const vertexShader = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Adapted directly from the supplied Framer shader. The Framer-only controls
// are intentionally removed; this version has one fixed footer treatment.
const fragmentShader = `
  precision highp float;

  uniform vec2 uRes;
  uniform float uTime;
  uniform float uReveal;

  float sdHex(vec2 p, float r) {
    const vec2 k1 = vec2(-0.866025, 0.5);
    const float k2 = 0.577350;
    p = abs(p);
    p -= 2.0 * min(dot(k1, p), 0.0) * k1;
    p -= vec2(clamp(p.x, -k2 * r, k2 * r), r);
    return length(p) * sign(p.y);
  }

  float ghost(vec2 p, float r, float softness, float rotation) {
    float c = cos(rotation), s = sin(rotation);
    vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    float d = sdHex(rotated, r);
    float inside = clamp(-d / max(r, 0.0001), 0.0, 1.0);
    float soft = r * mix(0.05, 0.52, softness);
    float mask = 1.0 - smoothstep(-soft * 0.3, soft, d);
    float limb = exp(-inside * inside * mix(3.2, 0.75, softness)) * mix(0.78, 0.36, softness);
    float halo = exp(-max(0.0, d) / (r * mix(0.40, 1.80, softness))) * mix(0.05, 0.16, softness);
    return mask * (limb + mix(0.08, 0.20, softness)) + halo;
  }

  void main() {
    // WebGL's Y origin is at the canvas bottom. Using uRes.y anchors the sun
    // at the visual top edge of the footer card.
    vec2 p = (gl_FragCoord.xy - vec2(uRes.x * 0.5, uRes.y)) / max(uRes.x, uRes.y);
    float r = length(p);
    float a = atan(p.y, p.x);

    // Supplied component's ray and core maths, with its warm palette baked in.
    float sharpness = 17.0;
    float primary = pow(max(0.0, cos(a * 7.0 + uTime * 0.32)), sharpness);
    float secondary = pow(max(0.0, cos(a * 11.0 - uTime * 0.18)), sharpness * 1.15) * 0.22;
    float shimmer = pow(max(0.0, cos(a * 4.0 + uTime * 0.10)), sharpness * 0.7) * 0.12;
    float rays = (primary + secondary + shimmer) * exp(-r / 0.56);
    float core = exp(-r * r * mix(90.0, 1.2, 0.25)) * 4.0;
    float sun = (core + rays * 0.82) * 0.34 * uReveal;

    vec3 coreColor = vec3(0.77, 0.88, 0.96);
    vec3 midColor = vec3(0.06, 0.26, 0.42);
    vec3 edgeColor = vec3(0.0, 0.12, 0.22);
    vec3 sunColor = r < 0.5
      ? mix(coreColor, midColor, r * 2.0)
      : mix(midColor, edgeColor, (r - 0.5) * 2.0);

    // Lens-flare axis and hexagonal ghost chain from the supplied shader.
    vec2 direction = vec2(cos(-0.785398), sin(-0.785398));
    float along = dot(p, direction);
    float perpendicular = length(p - along * direction);
    float streak = exp(-perpendicular * perpendicular * (2500.0 + sin(uTime * 2.1) * 180.0))
      / (abs(along) * 8.0 + 0.038) * (0.050 + sin(uTime * 3.2) * 0.018);
    float base = 0.0475;
    vec3 flare = vec3(0.0);
    for (int i = 1; i <= 6; i++) {
      float t = float(i) / 7.0;
      float drift = sin(uTime * (0.3 + t) + t * 6.28) * 0.018;
      vec2 center = p - direction * (t * 0.85 + drift);
      float strength = ghost(center, base * (0.25 + t), t, uTime * (0.12 + t * 0.2));
      vec3 flareColor = mix(vec3(0.59, 0.75, 0.88), vec3(0.0, 0.20, 0.35), t);
      flare += strength * flareColor * (0.10 + t * 0.13) * uReveal;
    }
    flare += streak * midColor * 0.24 * uReveal;

    float sunAlpha = clamp(sun, 0.0, 1.0);
    vec3 finalRgb = min(sunColor * sunAlpha + flare * 0.38, vec3(1.0));
    float finalAlpha = min(1.0, sunAlpha + dot(flare, vec3(0.233)));
    gl_FragColor = vec4(finalRgb, finalAlpha);
  }
`;

function drawFallback(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const radius = Math.min(width, height) * 0.46;
  const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, radius);
  gradient.addColorStop(0, "rgba(255, 250, 220, .85)");
  gradient.addColorStop(0.16, "rgba(255, 216, 74, .42)");
  gradient.addColorStop(0.56, "rgba(240, 192, 64, .10)");
  gradient.addColorStop(1, "rgba(240, 192, 64, 0)");
  context.clearRect(0, 0, width, height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

/** A self-contained sun/rays shader for the footer card. */
export function FooterSunShader({ className = "", active = false }: { className?: string; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const requestRenderRef = useRef<() => void>(() => undefined);
  activeRef.current = active;

  useEffect(() => requestRenderRef.current(), [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
    let frame = 0;
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    let isVisible = false;
    let pageVisible = !document.hidden;
    let lastRenderAt = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1);
      const maxPixels = 700_000;
      const requestedWidth = Math.max(1, Math.round(bounds.width * scale));
      const requestedHeight = Math.max(1, Math.round(bounds.height * scale));
      const pixelScale = Math.min(1, Math.sqrt(maxPixels / (requestedWidth * requestedHeight)));
      canvas.width = Math.max(1, Math.round(requestedWidth * pixelScale));
      canvas.height = Math.max(1, Math.round(requestedHeight * pixelScale));
      if (!gl) drawFallback(canvas);
      requestRenderRef.current();
    };

    if (!gl) {
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      return () => resizeObserver?.disconnect();
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      drawFallback(canvas);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      drawFallback(canvas);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "uRes");
    const time = gl.getUniformLocation(program, "uTime");
    const reveal = gl.getUniformLocation(program, "uReveal");

    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const startedAt = performance.now();
    let glowProgress = activeRef.current ? 1 : 0;
    const render = (now = performance.now()) => {
      frame = 0;
      if (!isVisible || !pageVisible) return;
      if (!reducedMotion && now - lastRenderAt < 1000 / 24) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastRenderAt = now;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, (now - startedAt) / 1000);
      glowProgress = reducedMotion
        ? (activeRef.current ? 1 : 0)
        : glowProgress + ((activeRef.current ? 1 : 0) - glowProgress) * 0.085;
      gl.uniform1f(reveal, glowProgress);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reducedMotion) frame = requestAnimationFrame(render);
    };
    const requestRender = () => {
      if (isVisible && pageVisible && !frame) frame = requestAnimationFrame(render);
    };
    requestRenderRef.current = requestRender;
    intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry?.isIntersecting ?? false;
        if (isVisible) requestRender();
        else if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { rootMargin: "20% 0px 20% 0px" },
    );
    intersectionObserver.observe(canvas);
    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) requestRender();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(frame);
      requestRenderRef.current = () => undefined;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none block mix-blend-screen ${className}`} />;
}
