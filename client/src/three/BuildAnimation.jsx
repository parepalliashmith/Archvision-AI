import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
// A touch of overshoot on the furniture/landscape pop — settles just past 1
// then eases back, the "pops into place" feel item 18 asks for on doors/
// windows/furniture, without needing per-object choreography.
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

const STRUCTURAL_FRACTION = 0.72; // rest of the duration is the furniture/landscape pop

// The signature "blueprint becomes a building" reveal (spec section 18).
// Rather than choreographing 15 discrete steps per element, one shared
// THREE.Plane clipping plane sweeps upward through the whole structural
// group — walls, interior walls, floors, stairs, roof all genuinely rise out
// of the ground together, roof last, since it's physically the highest
// geometry. Furniture and landscaping (their own ref'd groups in
// HouseScene.jsx) pop in with a quick scale-up once the structural sweep
// finishes. No opacity/transparency anywhere — avoids the depth-sorting
// artifacts a fade-based reveal would risk with this much overlapping
// geometry (established concern from earlier work on this viewer).
export default function BuildAnimation({ groupRef, furnitureGroupRef, landscapeGroupRef, playKey, sceneControllerRef, skipRef, onDone }) {
  const planeRef = useRef(null);
  const stateRef = useRef(null); // { start, duration, minY, maxY, materials, done }

  useEffect(() => {
    if (!groupRef.current || playKey == null) return;
    if (!planeRef.current) planeRef.current = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

    const box = new THREE.Box3().setFromObject(groupRef.current);
    const minY = box.min.y;
    const maxY = box.max.y;
    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) return;

    const materials = new Set();
    groupRef.current.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => materials.add(m));
    });
    materials.forEach((m) => { m.clippingPlanes = [planeRef.current]; });
    planeRef.current.constant = minY - 0.5;

    if (furnitureGroupRef?.current) furnitureGroupRef.current.scale.setScalar(0.001);
    if (landscapeGroupRef?.current) landscapeGroupRef.current.scale.setScalar(0.001);

    if (skipRef) skipRef.current = false;
    const duration = 2600;
    stateRef.current = { start: performance.now(), duration, minY, maxY, materials, done: false };

    // Camera sweep: start at the flattened top-down "blueprint" pose instantly,
    // then tween to the final hero angle over the same window as the reveal —
    // arrives right as the structure finishes rising.
    sceneControllerRef.current?.setCameraView('top', { duration: 0 });
    sceneControllerRef.current?.setCameraView('iso', { duration });

    return () => {
      materials.forEach((m) => { m.clippingPlanes = []; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  useFrame(() => {
    const s = stateRef.current;
    if (!s || s.done) return;
    const skipped = skipRef?.current;
    const elapsed = skipped ? s.duration : performance.now() - s.start;
    const t = Math.min(1, elapsed / s.duration);

    if (t < STRUCTURAL_FRACTION) {
      const structuralT = easeOutCubic(t / STRUCTURAL_FRACTION);
      planeRef.current.constant = THREE.MathUtils.lerp(s.minY - 0.5, s.maxY + 0.6, structuralT);
    } else {
      planeRef.current.constant = s.maxY + 0.6;
      const popT = easeOutBack(Math.min(1, (t - STRUCTURAL_FRACTION) / (1 - STRUCTURAL_FRACTION)));
      if (furnitureGroupRef?.current) furnitureGroupRef.current.scale.setScalar(Math.max(0.001, popT));
      if (landscapeGroupRef?.current) landscapeGroupRef.current.scale.setScalar(Math.max(0.001, popT));
    }

    if (t >= 1) {
      s.done = true;
      s.materials.forEach((m) => { m.clippingPlanes = []; });
      if (furnitureGroupRef?.current) furnitureGroupRef.current.scale.setScalar(1);
      if (landscapeGroupRef?.current) landscapeGroupRef.current.scale.setScalar(1);
      onDone?.();
    }
  });

  return null;
}
