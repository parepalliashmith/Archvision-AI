import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, SoftShadows, Sky } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { buildHouseModel } from '../three/houseModel.js';
import HouseScene from '../three/HouseScene.jsx';
import SceneController from '../three/SceneController.jsx';
import BuildAnimation from '../three/BuildAnimation.jsx';
import { computeRoomPoses } from '../three/roomCamera.js';

// Day / Sunset / Night presets driving the Sky shader + light rig. Deliberately
// NOT per-window point lights for night (real per-frame cost multiplied by
// every window in the house) — see Walls.jsx's emissive-glass trick instead,
// which this drives via the `nightMode` boolean passed to HouseScene.
const LIGHTING_PRESETS = {
  day: { turbidity: 6, rayleigh: 1.2, mieCoefficient: 0.006, mieDirectionalG: 0.8, sunElevation: 0.55, hemi: 0.9, sunIntensity: 0.9, sunColor: '#ffffff', clearColor: '#dfe9f0', exposure: 1 },
  sunset: { turbidity: 10, rayleigh: 2.4, mieCoefficient: 0.012, mieDirectionalG: 0.85, sunElevation: 0.12, hemi: 0.55, sunIntensity: 0.75, sunColor: '#ff9c5c', clearColor: '#3a2a2c', exposure: 1.05 },
  night: { turbidity: 2, rayleigh: 0.3, mieCoefficient: 0.001, mieDirectionalG: 0.7, sunElevation: -0.15, hemi: 0.16, sunIntensity: 0.1, sunColor: '#7d9bd6', clearColor: '#0a0e1a', exposure: 0.85 },
};

// Real Poly Haven HDRIs (drei's built-in preset list) chosen to match each
// lighting mode's mood — 'sunset'/'night' are literal matches, 'park' is the
// closest bright-outdoor-daylight preset drei ships for 'day'.
const HDRI_PRESETS = { day: 'park', sunset: 'sunset', night: 'night' };

// "Generate House Tour Video" script — a fixed sequence of the same tweened
// camera presets a user could click by hand, played back-to-back and
// recorded. `duration` is the tween time (ms), `hold` is how long the camera
// sits still at that preset afterward so the shot reads as a real beat, not
// a blur. One step forces night mode partway through, the one moment the
// video shows off the day/sunset/night system.
const TOUR_SCRIPT = [
  { label: 'Exterior — aerial view', preset: 'aerial', duration: 2500, hold: 2000 },
  { label: 'Exterior — front', preset: 'front', duration: 2000, hold: 1500 },
  { label: 'Exterior — front-left', preset: 'front-left', duration: 2000, hold: 1500 },
  { label: 'Entrance', preset: 'entrance', duration: 2000, hold: 2000 },
  { label: 'Interior, evening', preset: 'interior', duration: 2000, hold: 2500, lightingMode: 'night' },
  { label: 'Exterior — side', preset: 'side', duration: 2000, hold: 1500 },
  { label: 'Isometric hero shot', preset: 'iso', duration: 2000, hold: 2000 },
];

// R3F's <Canvas> measures its container via the react-use-measure package, which is
// ResizeObserver-only — it never renders anything (not even a first frame) until that
// observer reports a non-zero size. That's normally invisible, but some embedding
// contexts (certain sandboxed iframes, some extension/preview-panel content-script
// contexts) suspend ResizeObserver delivery — and, separately, the native `resize`
// window event it also listens for — for a document they consider non-visible/
// off-screen, even though the page's own layout and plain JS timers keep running fine.
// When that happens the canvas is permanently stuck at the browser's un-measured
// default (300x150) and nothing ever renders, with no error of any kind. Confirmed by
// direct testing: a bare `new ResizeObserver(cb).observe(div)` never invoked `cb` in
// that context, while `setTimeout`/`setInterval` fired normally — so a polling-based
// polyfill (using only timers) sidesteps the problem entirely. react-use-measure
// explicitly supports swapping in a polyfill for exactly this class of environment.
class PollingResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.interval = null;
    this.lastFired = null;
    this.lastSeen = null;
  }
  observe(element) {
    this.element = element;
    // Poll frequently, but only ever fire the callback once a measured size has
    // been stable across two consecutive polls. During mount, layout can settle
    // through several transient widths in quick succession (fonts/images loading,
    // sibling panels mounting, the entrance animation's own reflow) — a real
    // ResizeObserver naturally coalesces that churn via the browser's own rAF
    // batching, but a naive poll-and-fire-on-every-change polyfill instead feeds
    // WebGLRenderer.setSize() a rapid burst of distinct sizes. Each call
    // reallocates the GL drawing buffer, and enough reallocations in a short
    // window makes the browser/GPU treat it as resource exhaustion and force a
    // "WebGLRenderer: Context Lost" — confirmed by reproducing it directly:
    // six resizes inside ~1.2s reliably killed the context. Requiring one extra
    // poll of stability (150ms) before committing a size fixes that while still
    // reacting fast to genuine size changes (e.g. a real window resize).
    this.interval = window.setInterval(() => {
      const rect = element.getBoundingClientRect();
      const size = `${rect.width}x${rect.height}`;
      if (size === this.lastSeen && size !== this.lastFired) {
        this.lastFired = size;
        this.callback([{ target: element, contentRect: rect }]);
      }
      this.lastSeen = size;
    }, 150);
    // Fire once immediately too, so a healthy environment doesn't wait for the
    // debounce window on the very first measurement.
    const rect = element.getBoundingClientRect();
    this.lastFired = `${rect.width}x${rect.height}`;
    this.lastSeen = this.lastFired;
    this.callback([{ target: element, contentRect: rect }]);
  }
  unobserve() {
    this.disconnect();
  }
  disconnect() {
    if (this.interval) window.clearInterval(this.interval);
    this.interval = null;
  }
}

// A reasonable starting camera pose computed straight from the layout's own
// width/depth/height (no Three.js scene needed yet) so the very first frame already
// looks framed, instead of a jarring snap from some default (0,0,5)-ish position once
// SceneController's precise bounding-box-based framing kicks in a moment later.
function approxInitialCamera(model) {
  if (!model) return { fov: 45, near: 0.1, far: 500, position: [10, 8, 10] };
  const { width: W, depth: D, totalHeight: H } = model;
  const maxDim = Math.max(W, D);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 700;
  const dist = (Math.max(maxDim, H * 1.5) * 1.3 + 4) * (narrow ? 1.45 : 1);
  return {
    fov: 45,
    near: 0.1,
    far: 500,
    position: [W / 2 + dist * 0.7, dist * 0.55 + H * 0.3, D / 2 + dist * 0.9],
  };
}

// Wraps the R3F scene as a React component, keeping the EXACT same imperative-ref
// contract the old plain-Three.js viewer had (setRoofVisible, setWireframe,
// setCameraView, setFloorFilter, setTopDown, enterWalkthrough, exitWalkthrough,
// isWalkthrough) so CreateDesign.jsx needs zero changes.
//
// Static geometry (walls/rooms/roof/furniture/stairs) is declarative JSX built off a
// memoized `model` — see three/houseModel.js for the actual 2D->3D mapping math and
// three/HouseScene.jsx for how it becomes meshes. Roof visibility, wireframe, and floor
// isolation are plain React state flowing down as props/visible flags — no imperative
// code needed for any of that. Camera framing and the walkthrough are the one
// deliberately imperative piece, in three/SceneController.jsx (see its header comment
// for why).
// drei's <SoftShadows> patches THREE.ShaderChunk.shadowmap_pars_fragment — a
// single module-level string shared by every WebGL context on the page, not
// something scoped per-canvas — by capturing the chunk's current value as
// "original" and appending its PCSS GLSL on top of it. That's only safe to do
// once: this app can have more than one HouseViewer3D mounted at the same
// time (e.g. Home's hero preview alongside an expanded sample-design panel),
// and a second instance's effect would capture the ALREADY-patched chunk as
// its own "original," so mounting <SoftShadows> a second time appends the
// same GLSL functions again — "function already has a body" fragment-shader
// compile errors, which break shader compilation for every material on the
// page (a solid white canvas everywhere, not just the offending viewer),
// until a full reload. Every HouseViewer3D wants the effect (it's a genuine
// global patch, not per-canvas state), but only the first one mounted should
// ever render <SoftShadows> itself; this ref-based claim (safe under
// StrictMode's double-render — refs persist across it) makes that
// deterministic regardless of mount order or how many viewers are on screen.
let softShadowsClaimed = false;

// Phones and low-spec machines get a lighter render: no ambient-occlusion/bloom
// post-processing, no soft-shadow filtering, a smaller shadow map, capped pixel
// density and no HDRI download. A touch-primary pointer (phones/tablets), few CPU
// cores or little device memory are the signals — evaluated once at load.
const IS_LOW_POWER_DEVICE = typeof window !== 'undefined' && (
  window.matchMedia?.('(pointer: coarse)').matches ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
  (navigator.deviceMemory && navigator.deviceMemory <= 4)
);

const HouseViewer3D = forwardRef(function HouseViewer3D({ layout, height = 420, onWalkthroughExit, autoRotate = false, skipIntro = false, enablePostFX = true, lite = IS_LOW_POWER_DEVICE }, ref) {
  const ownsSoftShadowsRef = useRef(null);
  if (ownsSoftShadowsRef.current === null) {
    ownsSoftShadowsRef.current = !lite && !softShadowsClaimed;
    if (ownsSoftShadowsRef.current) softShadowsClaimed = true;
  }
  const [roofVisible, setRoofVisibleState] = useState(true);
  const [wireframe, setWireframeState] = useState(false);
  const [floorFilter, setFloorFilterState] = useState(null);
  const [lightingMode, setLightingModeState] = useState('day');

  const groupRef = useRef(null);
  const furnitureGroupRef = useRef(null);
  const landscapeGroupRef = useRef(null);
  const sceneControllerRef = useRef(null);
  const exitCbRef = useRef(onWalkthroughExit);
  exitCbRef.current = onWalkthroughExit;
  // Set once by Canvas's onCreated below; captureRenders() (outside the R3F
  // tree) needs direct access to the live gl/camera to read pixels back out.
  const glRef = useRef(null);
  const cameraRef = useRef(null);
  // Cinematic build-in skip signal — a plain ref (read every frame in
  // BuildAnimation's useFrame, no re-render needed) flipped by SceneController
  // the instant the user actually drags/zooms/scrolls the canvas.
  const introSkipRef = useRef(skipIntro);

  const model = useMemo(() => (layout ? buildHouseModel(layout) : null), [layout]);
  // Memoized on `model` (not recomputed every render) so this doesn't fight the user's
  // own orbiting: Canvas's `camera` prop is reactively re-applied on every render, and
  // a fresh object reference each time would silently reset the camera whenever any
  // unrelated state (wireframe, roof toggle, floor filter) changes.
  const initialCamera = useMemo(() => approxInitialCamera(model), [model]);

  const handleWalkthroughChange = useCallback((active) => {
    if (!active) exitCbRef.current?.();
  }, []);

  const handleUserInteract = useCallback(() => {
    introSkipRef.current = true;
  }, []);

  // "Generate Architectural Render" (spec section 21): snaps the camera + a
  // forced lighting mode through a fixed sequence, reading real pixels back
  // out of the SAME live scene each time — never a separately generated
  // image. Camera/lighting are restored to what they were before the call.
  const captureRenders = useCallback(async () => {
    const gl = glRef.current, camera = cameraRef.current, sc = sceneControllerRef.current;
    if (!gl || !camera || !sc || !model) return [];
    const prevMode = lightingMode;
    const prevPos = camera.position.clone();
    const shots = [
      { label: 'Front', preset: 'front' },
      { label: 'Aerial', preset: 'aerial' },
      { label: 'Side', preset: 'side' },
      { label: 'Night', preset: 'front-left', night: true },
      { label: 'Interior', preset: 'interior' },
    ];
    const results = [];
    for (const shot of shots) {
      if (shot.night) setLightingModeState('night');
      else if (prevMode !== 'day') setLightingModeState('day');
      sc.setCameraView(shot.preset, { duration: 0 });
      // Two rAFs: one for React to commit the lighting-mode state change into
      // the scene, one for the renderer to actually draw that committed frame
      // before toDataURL reads the canvas back.
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      results.push({ label: shot.label, dataUrl: gl.domElement.toDataURL('image/png') });
    }
    setLightingModeState(prevMode);
    camera.position.copy(prevPos);
    sc.setCameraView('iso', { duration: 0 });
    return results;
  }, [model, lightingMode]);

  // "Generate House Tour Video": records the SAME live canvas MediaRecorder
  // already sees frame-by-frame — postprocessing, real PBR materials, HDRI
  // reflections all included, never a separately generated clip — while
  // playing TOUR_SCRIPT through the existing tweened setCameraView(). Camera/
  // lighting/controls are all restored once the recording stops.
  const generateTourVideo = useCallback(async (onProgress) => {
    const gl = glRef.current, camera = cameraRef.current, sc = sceneControllerRef.current;
    if (!gl || !camera || !sc || !model) return null;

    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
      (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
    );
    if (!mimeType) {
      throw new Error('This browser cannot record video (MediaRecorder/WebM is unsupported).');
    }

    const prevMode = lightingMode;
    const prevPos = camera.position.clone();
    let currentMode = lightingMode;
    sc.setControlsEnabled(false);

    const stream = gl.domElement.captureStream(lite ? 30 : 60);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: lite ? 6_000_000 : 12_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();

    try {
      for (const step of TOUR_SCRIPT) {
        onProgress?.(step.label);
        const targetMode = step.lightingMode || prevMode;
        if (targetMode !== currentMode) {
          setLightingModeState(targetMode);
          currentMode = targetMode;
        }
        sc.setCameraView(step.preset, { duration: step.duration, ease: 'inOut' });
        await new Promise((res) => setTimeout(res, step.duration + step.hold));
      }
    } finally {
      recorder.stop();
      await stopped;
      setLightingModeState(prevMode);
      camera.position.copy(prevPos);
      sc.setCameraView('iso', { duration: 0 });
      sc.setControlsEnabled(true);
    }

    const blob = new Blob(chunks, { type: 'video/webm' });
    return { url: URL.createObjectURL(blob), blob };
  }, [model, lightingMode, lite]);

  // "Generate Video for Each Room": same recording mechanism as
  // generateTourVideo above, run once per room instead of once for a fixed
  // whole-house script — a separate downloadable clip per room, not one
  // continuous video split up. Each room gets its own MediaRecorder, framed
  // via roomCamera.js's computeRoomPoses (a short pan across that room only,
  // distinct from SceneController's house-level named presets).
  const generateRoomVideos = useCallback(async (onProgress) => {
    const gl = glRef.current, camera = cameraRef.current, sc = sceneControllerRef.current;
    if (!gl || !camera || !sc || !model) return [];

    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
      (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
    );
    if (!mimeType) {
      throw new Error('This browser cannot record video (MediaRecorder/WebM is unsupported).');
    }

    const prevPos = camera.position.clone();
    const prevFloorFilter = floorFilter;
    sc.setControlsEnabled(false);

    const results = [];
    try {
      for (const floor of model.floors) {
        for (const r of floor.rooms) {
          onProgress?.(r.room.name);

          setFloorFilterState(floor.level);
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

          const { start, end } = computeRoomPoses(r.room, floor.yBase, model.dims);
          sc.setCameraPose(start, { duration: 0 });
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

          const stream = gl.domElement.captureStream(lite ? 30 : 60);
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: lite ? 6_000_000 : 12_000_000 });
          const chunks = [];
          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
          const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
          recorder.start();

          sc.setCameraPose(end, { duration: 4000, ease: 'inOut' });
          await new Promise((res) => setTimeout(res, 4500));

          recorder.stop();
          await stopped;
          const blob = new Blob(chunks, { type: 'video/webm' });
          results.push({ roomName: r.room.name, floorLevel: floor.level, url: URL.createObjectURL(blob) });
        }
      }
    } finally {
      setFloorFilterState(prevFloorFilter);
      camera.position.copy(prevPos);
      sc.setCameraView('iso', { duration: 0 });
      sc.setControlsEnabled(true);
    }

    return results;
  }, [model, floorFilter, lite]);

  useImperativeHandle(ref, () => ({
    setRoofVisible: (v) => setRoofVisibleState(v),
    setWireframe: (v) => setWireframeState(v),
    setCameraView: (preset, opts) => sceneControllerRef.current?.setCameraView(preset, opts),
    setTopDown: (v) => sceneControllerRef.current?.setTopDown(v),
    setFloorFilter: (level) => setFloorFilterState(level),
    setLightingMode: (mode) => setLightingModeState(mode),
    captureRenders,
    generateTourVideo,
    generateRoomVideos,
    enterWalkthrough: () => {
      setFloorFilterState(0); // force the ground floor so upper floors don't occlude the view
      sceneControllerRef.current?.enterWalkthrough();
    },
    exitWalkthrough: () => sceneControllerRef.current?.exitWalkthrough(),
    isWalkthrough: () => sceneControllerRef.current?.isWalkthrough() ?? false,
  }), [captureRenders, generateTourVideo, generateRoomVideos]);

  // A static-ish target object for the directional light: three.js only recomputes a
  // light's direction from `target.matrixWorld`, which only auto-updates while the
  // target is part of the traversed scene graph — since attach="target" assigns it as
  // a property rather than a scene child, we update its matrix by hand once whenever
  // the house's footprint (and therefore its center) changes.
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    if (!model) return;
    sunTarget.position.set(model.width / 2, 0, model.depth / 2);
    sunTarget.updateMatrixWorld();
  }, [model, sunTarget]);

  // onCreated only fires once per Canvas mount, so clearColor/exposure need
  // their own effect to actually react to lightingMode changes afterward.
  useEffect(() => {
    const preset = LIGHTING_PRESETS[lightingMode] || LIGHTING_PRESETS.day;
    if (glRef.current) {
      glRef.current.setClearColor(preset.clearColor);
      glRef.current.toneMappingExposure = preset.exposure;
    }
  }, [lightingMode]);

  const maxDim = model ? Math.max(model.width, model.depth) : 10;
  const lp = LIGHTING_PRESETS[lightingMode] || LIGHTING_PRESETS.day;
  // Sun height scales with the preset's elevation (day high, sunset low, night
  // just below where 'day' sits) relative to day's own baseline — keeps the
  // same X/Z direction (so shadows always fall the same way) while the sun
  // arcs up/down for the different times of day.
  const sunY = Math.max(maxDim * 0.18, (maxDim * 1.2 + (model?.totalHeight ?? 0)) * (lp.sunElevation / LIGHTING_PRESETS.day.sunElevation));
  const sunPosition = model
    ? [model.width / 2 + maxDim, sunY, model.depth / 2 + maxDim * 0.5]
    : [10, sunY, 10];
  const shadowExtent = maxDim * 0.75 + 2;
  // AO sample radius scales with house size (not a fixed magic number) — a
  // design 3x the size of another needs a proportionally larger radius to
  // read as contact shadows rather than either invisible or blown-out.
  const aoRadius = Math.max(0.5, maxDim * 0.05);

  return (
    <div style={{ width: '100%', height, borderRadius: 10, overflow: 'hidden', background: '#dfe9f0' }}>
      <Canvas
        shadows
        dpr={lite ? [1, 1.5] : [1, 2]}
        camera={initialCamera}
        resize={{ polyfill: PollingResizeObserver }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(lp.clearColor);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          // Required for BuildAnimation's rising clip-plane reveal — off by
          // default in three.js since per-object clippingPlanes are otherwise
          // ignored entirely, regardless of what's assigned to a material.
          gl.localClippingEnabled = true;
          gl.toneMappingExposure = lp.exposure;
          glRef.current = gl;
          cameraRef.current = camera;
        }}
      >
        {/* Percentage-closer soft shadows — a real quality upgrade over the old
            default hard shadow map, still zero extra network requests. Only
            the instance that claimed ownership (see softShadowsClaimed above)
            ever mounts this — the patch it applies is global, so every other
            viewer's materials pick it up automatically without needing their
            own copy. */}
        {ownsSoftShadowsRef.current && <SoftShadows size={20} samples={12} focus={0.6} />}

        {/* A real physically-based atmospheric sky (three.js's own Sky shader,
            wrapped by drei) instead of a flat clear-color background — fully
            procedural, no HDRI/image file. Same sun direction as the directional
            light below, so the sky's bright spot and the shadows agree. Params
            come from LIGHTING_PRESETS — the Preetham sky model reads a
            below-horizon sun (night's negative-ish elevation) as a dark,
            deep-blue dome on its own, no separate starfield needed. */}
        <Sky sunPosition={sunPosition} turbidity={lp.turbidity} rayleigh={lp.rayleigh} mieCoefficient={lp.mieCoefficient} mieDirectionalG={lp.mieDirectionalG} />

        <hemisphereLight args={[0xffffff, 0x8a8a7a, lp.hemi]} />
        <directionalLight
          castShadow
          intensity={lp.sunIntensity}
          color={lp.sunColor}
          position={sunPosition}
          shadow-mapSize-width={lite ? 1024 : 2048}
          shadow-mapSize-height={lite ? 1024 : 2048}
          shadow-camera-left={-shadowExtent}
          shadow-camera-right={shadowExtent}
          shadow-camera-top={shadowExtent}
          shadow-camera-bottom={-shadowExtent}
          shadow-camera-near={0.5}
          shadow-camera-far={maxDim * 4 + 50}
          shadow-bias={-0.0004}
        >
          <primitive object={sunTarget} attach="target" />
        </directionalLight>

        {/* Real photographed HDRI (drei's built-in preset system — fetches a
            genuine Poly Haven HDRI from drei's own CDN mirror, standard
            practice in production R3F apps, not a hack) so PBR materials —
            the glass windows, the new real-photo wall/floor textures —
            get real reflections instead of a flat hand-placed light panel.
            background={false} keeps this HDRI reflection-only: the visible
            sky stays the <Sky> shader above, which already drives the day/
            sunset/night look. */}
        {!lite && <Environment preset={HDRI_PRESETS[lightingMode] || HDRI_PRESETS.day} background={false} />}

        {model && (
          <HouseScene
            groupRef={groupRef}
            model={model}
            roofVisible={roofVisible}
            wireframe={wireframe}
            floorFilter={floorFilter}
            nightMode={lightingMode === 'night'}
            furnitureGroupRef={furnitureGroupRef}
            landscapeGroupRef={landscapeGroupRef}
            lite={lite}
          />
        )}

        <SceneController
          ref={sceneControllerRef}
          groupRef={groupRef}
          model={model}
          onWalkthroughChange={handleWalkthroughChange}
          autoRotate={autoRotate}
          onUserInteract={handleUserInteract}
        />

        {!skipIntro && model && (
          <BuildAnimation
            groupRef={groupRef}
            furnitureGroupRef={furnitureGroupRef}
            landscapeGroupRef={landscapeGroupRef}
            playKey={model}
            sceneControllerRef={sceneControllerRef}
            skipRef={introSkipRef}
          />
        )}

        {/* Game-quality visual pass: N8AO gives contact shadows real depth
            (previously flat under furniture/eaves), Bloom pays off the
            emissive night windows/lanterns the lighting system already
            drives, Vignette adds cinematic framing. `multisampling` on the
            composer itself replaces the default canvas MSAA that
            EffectComposer otherwise bypasses. captureRenders()' toDataURL
            still reads the composer's own final output on this same canvas,
            so render capture keeps working unchanged. */}
        {enablePostFX && !lite && (
          <EffectComposer multisampling={4} enableNormalPass={false}>
            <N8AO aoRadius={aoRadius} intensity={2.5} quality="performance" halfRes distanceFalloff={1} />
            <Bloom mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.2} intensity={0.6} />
            <Vignette eskil={false} offset={0.15} darkness={0.55} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
});

export default HouseViewer3D;
