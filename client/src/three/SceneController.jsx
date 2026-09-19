import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { buildWallColliders, resolveWallCollision } from './collision.js';

// The one deliberately imperative corner of this viewer: camera framing and the
// first-person walkthrough. Everything else (walls, rooms, roof, furniture, stairs) is
// plain declarative JSX in HouseScene.jsx, driven by React props/state; camera math and
// a per-frame keyboard-driven mutation loop fight the declarative model no matter how
// you slice it, so rather than force it into JSX this reaches for the raw camera/gl
// objects via useThree() and ports the previous plain-Three.js controller's
// OrbitControls + PointerLockControls logic over nearly as-is — same instances, same
// math, same event wiring — which minimizes behavioral-regression risk on the trickiest,
// most-already-debugged part of the whole system. In particular the Pointer Lock
// rejection handling below (a real bug fixed once already) is preserved exactly: lock()
// can reject (embedded iframe, dismissed permission prompt, ...) and that must never
// become an unhandled promise rejection, and WASD movement must keep working from the
// keyboard alone even when the lock itself failed — only mouse-look is lost in that case.
//
// R3F already runs a render loop every frame (frameloop="always" by default), so this
// hooks into that via useFrame instead of running a second requestAnimationFrame loop
// of its own — the one thing the original had to do manually that R3F now does for us.
// Ease-out cubic — a natural "fast start, gentle settle" curve for camera
// tweens, matching the CSS --ease-premium curve used elsewhere in the app's
// design system (same visual language, just evaluated in JS since this drives
// a Three.js object property, not a CSS transition).
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Slow start AND slow finish — for recorded videos, where easeOutCubic's abrupt
// start reads as a jerk at the beginning of every shot.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const SceneController = forwardRef(function SceneController({ groupRef, model, onWalkthroughChange, autoRotate, onUserInteract }, ref) {
  const { camera, gl } = useThree();
  const orbitRef = useRef(null);
  const plRef = useRef(null);
  const walkingRef = useRef(false);
  const moveRef = useRef({ f: false, b: false, l: false, r: false, u: false, d: false });
  const modelRef = useRef(model);
  modelRef.current = model;
  // The active camera tween, if any — a plain ref (not state) since it's read
  // and mutated every frame in useFrame, which state updates aren't suited for.
  const tweenRef = useRef(null);
  // Flat wall-AABB list for walkthrough collision (collision.js) — rebuilt only
  // when the model itself changes (see effect below), not every frame.
  const collidersRef = useRef([]);

  useEffect(() => {
    collidersRef.current = buildWallColliders(model);
  }, [model]);

  // OrbitControls: created once against this canvas's camera/DOM element, same
  // damping/limits as the old viewer.
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1;
    controls.maxDistance = 160;
    // A hero/showcase viewer can pass autoRotate for a slow, cinematic idle turn —
    // OrbitControls' own built-in rotation, so a user drag still takes over instantly
    // (autoRotate pauses while the user is interacting, per three.js's own behavior).
    controls.autoRotate = !!autoRotate;
    controls.autoRotateSpeed = 0.6;
    // 'start' only fires on genuine user interaction (pointer/touch/wheel), never
    // from our own programmatic controls.update() calls — the right signal both to
    // cancel a mid-flight tween the user is fighting, and (via onUserInteract) to
    // let the build-in intro animation know it should skip straight to the end.
    const onStart = () => {
      tweenRef.current = null;
      onUserInteract?.();
    };
    controls.addEventListener('start', onStart);
    orbitRef.current = controls;
    return () => {
      controls.removeEventListener('start', onStart);
      controls.dispose();
      orbitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useEffect(() => {
    if (orbitRef.current) orbitRef.current.autoRotate = !!autoRotate;
  }, [autoRotate]);

  const onKeyDown = useCallback((e) => {
    const move = moveRef.current;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') move.f = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') move.b = true;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') move.l = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') move.r = true;
    if (e.code === 'Space') move.u = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') move.d = true;
  }, []);

  const onKeyUp = useCallback((e) => {
    const move = moveRef.current;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') move.f = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') move.b = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') move.l = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') move.r = false;
    if (e.code === 'Space') move.u = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') move.d = false;
  }, []);

  function bounds() {
    const box = new THREE.Box3().setFromObject(groupRef.current);
    return { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
  }

  // Pure pose math, separated from setCameraView itself so the tween below can
  // animate TOWARD a pose without duplicating this per preset. Recomputed fresh
  // on every call (never memoized) since floor-filtering and per-design
  // geometry changes shift what's actually in the scene.
  function computePose(preset) {
    const { size, center } = bounds();
    const maxDim = Math.max(size.x, size.z);
    // Back off when the viewer is narrow (phones): the vertical FOV is fixed, so a
    // near-square or portrait canvas sees far less horizontally and crops the house.
    const fit = Math.min(2, Math.max(1, 1.6 / (camera.aspect || 1.6)));
    const dist = (Math.max(maxDim, size.y * 1.5) * 1.3 + 4) * fit;
    const eyeY = size.y * 0.45;
    const targetY = size.y * 0.4;

    if (preset === 'top') {
      // Much higher than the other presets — a "top" view is meant to read like
      // an architectural plan, and a *perspective* camera only close enough to
      // fill the frame has a real, visible viewing angle: sightlines to anything
      // off-center (e.g. the parking/garden pads, which sit to the sides, not
      // under the roof) travel obliquely past whatever's elevated near the
      // house on their way down — including the roof itself — even though
      // neither actually overlaps at ground level. Found via testing: at the
      // previous height, a ground point 6 units off-center was already
      // rendering ~5 units "behind" its true position by the time the ray
      // passed roof height. Going much higher flattens that same angle sharply
      // (mostly stays this side of true orthographic, without switching the
      // camera type) so off-center ground features stop grazing tall geometry.
      return { position: [center.x, dist * 4.5, center.z + 0.001], target: [center.x, 0, center.z] };
    }
    if (preset === 'aerial') {
      // A 3/4 birds-eye rather than 'top's straight-down plan view — high and
      // angled, the "drone shot" architectural establishing angle.
      return { position: [center.x + dist * 0.9, dist * 2.1, center.z + dist * 0.9], target: [center.x, size.y * 0.3, center.z] };
    }
    if (preset === 'front') return { position: [center.x, eyeY, center.z + dist], target: [center.x, targetY, center.z] };
    if (preset === 'rear') return { position: [center.x, eyeY, center.z - dist], target: [center.x, targetY, center.z] };
    if (preset === 'side') return { position: [center.x + dist, eyeY, center.z], target: [center.x, targetY, center.z] };
    if (preset === 'front-left') return { position: [center.x - dist * 0.72, eyeY, center.z + dist * 0.72], target: [center.x, targetY, center.z] };
    if (preset === 'front-right') return { position: [center.x + dist * 0.72, eyeY, center.z + dist * 0.72], target: [center.x, targetY, center.z] };
    if (preset === 'entrance') {
      // A close, low, entrance-facing composition — uses the entrance door's
      // own facing direction (houseModel.js's OUTWARD convention: north/-z,
      // south/+z, west/-x, east/+x) rather than the generic 'front' distance,
      // so it actually reads as a doorway close-up, not just another full shot.
      const wall = modelRef.current?.entranceWall;
      const dir = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[wall] || [0, 1];
      const closeDist = Math.max(3, maxDim * 0.38);
      return {
        position: [center.x + dir[0] * closeDist, size.y * 0.28, center.z + dir[1] * closeDist],
        target: [center.x, size.y * 0.22, center.z],
      };
    }
    if (preset === 'interior') {
      // Eye-height, standing near the entrance looking into the house — for
      // the render-capture sequence's "Interior" shot. Walls/roof use default
      // FrontSide materials (not double-sided), so this can see "through" a
      // far exterior wall's back face from inside; accepted as a scoped
      // limitation rather than doubling every material's render cost.
      const wall = modelRef.current?.entranceWall;
      const dir = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[wall] || [0, 1];
      const eyeHeight = modelRef.current?.dims?.eyeHeight ?? 1.65;
      const standIn = Math.min(maxDim * 0.3, dist * 0.35);
      return {
        position: [center.x + dir[0] * standIn, eyeHeight, center.z + dir[1] * standIn],
        target: [center.x - dir[0] * dist, eyeHeight, center.z - dir[1] * dist],
      };
    }
    // 'iso' / default
    return {
      position: [center.x + dist * 0.7, dist * 0.55 + size.y * 0.3, center.z + dist * 0.9],
      target: [center.x, size.y / 2, center.z],
    };
  }

  // Shared tween-application, split out from setCameraView so a pose can come
  // from either a named preset (computePose) or an arbitrary explicit pose
  // (setCameraPose, below — the per-room framing used by "Generate Video for
  // Each Room" has no business living in computePose's named-preset list).
  // duration in ms; 0 snaps instantly (used for the render-capture sequence,
  // which needs the pose settled before reading pixels, not mid-tween).
  const tweenTo = useCallback((pose, duration = 650, ease = 'out') => {
    if (!groupRef.current || !orbitRef.current) return;
    const controls = orbitRef.current;
    if (!duration) {
      camera.position.set(...pose.position);
      controls.target.set(...pose.target);
      controls.update();
      tweenRef.current = null;
      return;
    }
    tweenRef.current = {
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...pose.position),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...pose.target),
      start: performance.now(),
      duration,
      ease,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, groupRef]);

  const setCameraView = useCallback((preset, { duration = 650, ease } = {}) => {
    tweenTo(computePose(preset), duration, ease);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweenTo]);

  const setCameraPose = useCallback((pose, { duration = 650, ease } = {}) => {
    tweenTo(pose, duration, ease);
  }, [tweenTo]);

  function ensurePointerLockControls() {
    if (!plRef.current) {
      const pl = new PointerLockControls(camera, gl.domElement);
      pl.addEventListener('unlock', () => {
        walkingRef.current = false;
        if (orbitRef.current) orbitRef.current.enabled = true;
        onWalkthroughChange?.(false);
      });
      plRef.current = pl;
    }
    return plRef.current;
  }

  const enterWalkthrough = useCallback(() => {
    if (!groupRef.current) return;
    const { center } = bounds();
    const pl = ensurePointerLockControls();
    walkingRef.current = true;
    if (orbitRef.current) orbitRef.current.enabled = false;
    const eyeHeight = modelRef.current?.dims.eyeHeight ?? 1.65;
    camera.position.set(center.x, eyeHeight, center.z);
    camera.lookAt(center.x, eyeHeight, center.z - 1);
    tweenRef.current = null;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // Deliberately NOT calling pl.lock() here: three.js's PointerLockControls.lock()
    // just does `this.domElement.requestPointerLock()` without returning the result,
    // so a promise it rejects (browsers implementing the Promise-based Pointer Lock
    // spec) becomes unhandled with no way for a caller to catch it — confirmed by
    // actually exercising this in a sandboxed/cross-origin embed, which is exactly the
    // case this guard exists for. Calling requestPointerLock() ourselves gets us the
    // real promise to catch; PointerLockControls still tracks lock/unlock/error via its
    // own document-level 'pointerlockchange'/'pointerlockerror' listeners regardless of
    // who requested the lock, so pl.isLocked and the 'unlock' event both keep working.
    // Either way, WASD keeps working via the keyboard listeners above even when the
    // lock itself is refused — only mouse-look is lost in that case.
    try {
      const result = gl.domElement.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* ignore */
    }
    onWalkthroughChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, groupRef, onKeyDown, onKeyUp, onWalkthroughChange]);

  const exitWalkthrough = useCallback(() => {
    walkingRef.current = false;
    if (orbitRef.current) orbitRef.current.enabled = true;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    if (plRef.current?.isLocked) plRef.current.unlock();
  }, [onKeyDown, onKeyUp]);

  // The whole normal-vs-walkthrough branch, ported verbatim: only one of the two ever
  // drives the camera in a given frame.
  useFrame((_, delta) => {
    if (walkingRef.current && plRef.current) {
      const dims = modelRef.current?.dims;
      if (dims) {
        // moveForward/moveRight rotate by the camera's own orientation regardless of
        // whether the pointer is actually locked, so WASD keeps working even when the
        // Pointer Lock API itself was refused — only mouse-look is lost in that case.
        const speed = (modelRef.current.unitScale ?? 1) * dims.walkSpeed * delta;
        const m = moveRef.current;
        const pl = plRef.current;
        if (m.f) pl.moveForward(speed);
        if (m.b) pl.moveForward(-speed);
        if (m.l) pl.moveRight(-speed);
        if (m.r) pl.moveRight(speed);
        if (m.u) camera.position.y += speed;
        if (m.d) camera.position.y -= speed;
        resolveWallCollision(camera.position, collidersRef.current, dims.collisionRadius ?? 0.5);
      }
    } else if (orbitRef.current) {
      const tween = tweenRef.current;
      if (tween) {
        const t = Math.min(1, (performance.now() - tween.start) / tween.duration);
        const e = (tween.ease === 'inOut' ? easeInOutCubic : easeOutCubic)(t);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
        orbitRef.current.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
        if (t >= 1) tweenRef.current = null;
      }
      orbitRef.current.update();
    }
  });

  // Full teardown on unmount (this runs on every navigation away from the page, so a
  // leak here compounds fast): drop the keyboard listeners and dispose the pointer-lock
  // controls' own document-level listeners too (the old viewer never disposed these —
  // a small pre-existing leak this fixes along the way).
  useEffect(() => {
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      plRef.current?.dispose?.();
      plRef.current = null;
    };
  }, [onKeyDown, onKeyUp]);

  useImperativeHandle(ref, () => ({
    setCameraView,
    // Explicit {position, target} tween, for per-room framing (roomCamera.js)
    // that has no named preset — same tween mechanism as setCameraView.
    setCameraPose,
    setTopDown: (on) => setCameraView(on ? 'top' : 'iso'),
    enterWalkthrough,
    exitWalkthrough,
    isWalkthrough: () => walkingRef.current,
    // Lets a scripted camera sequence (the tour-video export) stop the
    // user's own drag/zoom from fighting or canceling its tweens mid-
    // recording — the caller re-enables this when the sequence finishes.
    setControlsEnabled: (enabled) => { if (orbitRef.current) orbitRef.current.enabled = enabled; },
  }), [setCameraView, setCameraPose, enterWalkthrough, exitWalkthrough]);

  return null;
});

export default SceneController;
