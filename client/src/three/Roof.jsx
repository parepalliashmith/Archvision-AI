import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildHipRoofGeometry } from './roofGeometry.js';
import { getShingleTexture, getShingleTextureForSize } from './textures.js';

// The style preset (houseModel.js) picks the roof SHAPE, not just its color: a hip
// roof (hand-built geometry, see roofGeometry.js) for Traditional/Farmhouse, or a
// flat parapet roof (plain boxes — a slab + a 4-sided rim, already computed in
// houseModel.js's buildFlatRoofModel) for Modern/Contemporary/Compact urban.
export default function Roof({ roof, visible }) {
  if (roof.type === 'flat') return <FlatRoof roof={roof} visible={visible} />;
  return <HipRoof roof={roof} visible={visible} />;
}

function FlatRoof({ roof, visible }) {
  // Textured on the top-facing slab only (what's actually visible from any
  // normal camera angle) — a plain BoxGeometry's side/bottom faces would need
  // a different repeat to look right and are never seen anyway. The parapet
  // rim stays a flat color; it reads as trim, not roofing surface.
  const slab = useMemo(
    () => getShingleTextureForSize(roof.slab.size[0], roof.slab.size[2]),
    [roof.slab.size]
  );
  return (
    <group visible={visible}>
      <mesh position={roof.slab.position} castShadow receiveShadow>
        <boxGeometry args={roof.slab.size} />
        <meshStandardMaterial color={roof.color} map={slab.map} normalMap={slab.normalMap} roughnessMap={slab.roughnessMap} roughness={1} />
      </mesh>
      {roof.parapets.map((p, i) => (
        <mesh key={i} position={p.position} castShadow receiveShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color={roof.color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// DoubleSide keeps the underside cap and the two hip triangles lit correctly
// regardless of exact triangle winding.
function HipRoof({ roof, visible }) {
  const geometry = useMemo(
    () => buildHipRoofGeometry(roof.width, roof.depth, roof.height, roof.overhang),
    [roof.width, roof.depth, roof.height, roof.overhang]
  );
  // World-space UVs, no per-instance repeat needed — see roofGeometry.js and
  // getShingleTexture's header comment.
  const shingle = useMemo(() => getShingleTexture(), []);

  // This BufferGeometry is built by hand in useMemo, not declared as a JSX
  // <bufferGeometry> child — R3F's automatic dispose-on-unmount only covers
  // objects it constructs itself from JSX tags, so a geometry assigned via a
  // plain `geometry` prop needs its GPU buffers freed by hand whenever the
  // memo recomputes (a new design/floor count) or the component unmounts.
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={roof.center} visible={visible} castShadow receiveShadow>
      <meshStandardMaterial color={roof.color} map={shingle.map} normalMap={shingle.normalMap} roughnessMap={shingle.roughnessMap} roughness={1} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}
