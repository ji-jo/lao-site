# Lao export feature improvement brief

## Goal

Improve Lao's export feature so one animation can be exported reliably as SVG, React/TSX, and JSON. Each format must represent the same animation accurately: visual appearance, layers, paths, transforms, timing, visibility, and loop behavior.

The user should be able to copy any export and paste it into an AI coding agent without needing a special runtime, editor dependency, asset URL, or undocumented format knowledge.

## What I experienced

The visual SVG export was the most useful output because it contained the original paths and animation timing in a browser-renderable format. The React export was essentially the same SVG written as JSX. The JSON was a scene description that cannot render in a browser without a dedicated Lao renderer.

The main problem is not that React or JSON exists. The problem is that the outputs do not clearly state their role, runtime requirements, total animation duration, looping behavior, or the safest way to use them on the web.

Lao should export all three formats from one canonical scene model, then explain the intended use of each one.

---

## Required export outputs

### 1. SVG export

SVG must be the primary browser-ready export for complex vector animations.

Requirements:

- Export a valid standalone SVG document, not a text blob with an unclear extension.
- Include `width`, `height`, `viewBox`, and `preserveAspectRatio="xMidYMid meet"`.
- Preserve all path geometry, fills, strokes, masks, clipping paths, transforms, layer order, opacity, and visibility changes.
- Preserve all animation timing, including SMIL tags such as `<animate>` and `<set>`.
- Preserve `begin`, `dur`, `repeatCount`, `values`, `keyTimes`, `display`, animated `d` path values, IDs, and all references between IDs.
- Include an explicit animation duration and loop mode in the export metadata.
- Support explicit loop choices: `once`, `infinite`, and `ping-pong`.
- Use stable, unique IDs with a per-export prefix so multiple Lao animations can safely appear on the same page.
- Open directly in a browser and render correctly without React, Framer, or JavaScript.

### 2. React / TSX export

React must be a clean, code-editable representation of the same animation.

Requirements:

- Export ordinary TypeScript/React code that compiles in a standard React project.
- Do not include Framer-only imports, `addPropertyControls`, `ControlType`, canvas/editor wrappers, or design-tool runtime code.
- Preserve the same paths, styles, IDs, transforms, and animation behavior as SVG.
- Export a named component plus a default export.
- Include typed props only for meaningful controls such as `className`, `loop`, `paused`, or `playbackRate`.
- Do not add arbitrary property controls just because the source came from a design environment.
- Provide two React modes:
  - **Inline SVG mode:** JSX paths for developers who need to edit individual artwork elements.
  - **External SVG mode:** a lightweight component that loads the generated SVG file for production use when the artwork is large.
- Warn users when inline SVG/JSX output is large enough to meaningfully increase a JavaScript bundle.

### 3. JSON export

JSON must be a documented, lossless Lao scene export intended for editing, validation, and regeneration.

Requirements:

- Include `format` and `version` fields.
- Include canvas `width`, `height`, `viewBox`, `fps`, `frameCount`, `durationMs`, and `loop` mode.
- Include layers, groups, draw order, cels/frames, path geometry, fills, strokes, transforms, opacity, clips, masks, and visibility/timing events.
- Use stable IDs shared across JSON, SVG, and React output where possible.
- Publish a concise schema/specification so an AI agent can understand and validate it.
- Document exactly how the JSON regenerates equivalent SVG and React exports.
- Do not present JSON as directly browser-renderable. It requires a Lao runtime/player to display.

---

## One canonical scene model

SVG, React, and JSON must be generated from one source of truth. They must not be three separately implemented exports.

The canonical scene model must preserve:

- canvas dimensions;
- frame rate and timeline duration;
- layer hierarchy and draw order;
- vector paths and styles;
- transforms and transform origins;
- masks and clipping paths;
- visibility changes;
- animation keyframes and easing;
- loop mode;
- stable IDs.

This prevents visual drift where the SVG looks correct but React or JSON loses timing, transforms, or layers.

---

## Export metadata / manifest

Every export should include or be accompanied by a small manifest. This lets a coding agent understand the export without guessing.

Example:

```json
{
  "format": "lao-export-manifest",
  "version": 1,
  "width": 1920,
  "height": 1920,
  "viewBox": "0 0 1920 1920",
  "fps": 12,
  "frameCount": 14,
  "durationMs": 1167,
  "loop": "once",
  "formats": {
    "svg": { "standalone": true, "usesSmil": true },
    "react": { "mode": "inline-svg" },
    "json": { "schemaVersion": 1 }
  }
}
```

The manifest must accurately state the total duration and loop state. Coding agents should not have to infer this from hundreds of animation tags.

---

## Safe export optimization

Optimization must never change the drawing or timing. Lao should offer these explicit modes:

### Lossless cleanup

Safe operations only:

- remove editor-only metadata;
- remove comments and unnecessary whitespace;
- remove empty groups;
- remove unused definitions;
- remove duplicate data only when it is proven not to affect any frame or reference.

### Visual-verified optimization

Potentially more aggressive operations are allowed only after automatic comparison with the original animation:

- deduplicate styles;
- consolidate safe transforms;
- optimize repeated static path data;
- reduce numeric precision only if frame-by-frame output remains visually identical.

### Never optimize blindly

Do not automatically remove, rewrite, rename, merge, or minify these without full visual and timing verification:

- `<animate>`;
- `<set>`;
- animated `d` values;
- `begin`, `dur`, `repeatCount`, `values`, and `keyTimes`;
- `display` changes;
- IDs used by masks, clips, filters, or animation references;
- invisible frames or hidden layers, because they may become visible later in the timeline.

---

## Required QA before an export is delivered

For every export, Lao should validate:

```text
[ ] SVG is valid standalone XML and opens in a browser.
[ ] React compiles in a normal TypeScript React app without Framer/editor dependencies.
[ ] JSON conforms to the published Lao scene schema.
[ ] SVG, React, and JSON have the same canvas, fps, frame count, duration, and loop mode.
[ ] First frame matches the canonical scene.
[ ] Middle frame matches the canonical scene.
[ ] Final frame matches the canonical scene.
[ ] Loop boundary is clean: final frame to first frame has no flash, timing jump, or missing layer.
[ ] Layer order, masks, clips, transforms, visibility, and colours match the canonical scene.
[ ] Export reports raw size and gzip size.
[ ] Export reports whether it is recommended for inline React or external SVG web delivery.
```

## Expected result

After these changes, a user can copy SVG, React, or JSON directly from Lao and paste it into an AI coding agent. The agent will know exactly what the export is, whether it can render it directly, how it loops, what it depends on, and which format is best for web usage.
