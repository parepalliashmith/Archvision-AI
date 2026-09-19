import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildHipRoofGeometry } from './roofGeometry.js';
import { getShingleTexture } from './textures.js';
import { TexturedBox } from './Walls.jsx';

// The style preset (houseModel.js) picks the roof SHAPE, not just its color: a hip
// roof (hand-built geometry, see roofGeometry.js) for Traditional/Farmhouse, or a
// flat parapet roof (plain boxes — a slab + a 4-sided rim, already computed in
// houseModel.js's buildFlatRoofModel) for Modern/Contemporary/Compact urban.
export default function Roof({ roof, visible, trimColor = '#f1ede4', wireframe = false, lite = false }) {
  if (roof.type === 'flat') return <FlatRoof roof={roof} visible={visible} trimColor={trimColor} wireframe={wireframe} />;
  return <HipRoof roof={roof} visible={visible} trimColor={trimColor} wireframe={wireframe} lite={lite} />;
}

function FlatRoof({ roof, visible, trimColor, wireframe }) {
  // A flat roof is a membrane/concrete deck, not shingles — real rough-concrete
  // photo, tinted by the style's roof colour. The parapet rim gets a thin
  // coping slab on top (the overhanging cap every real parapet has).
  const span = Math.max(roof.slab.size[0], roof.slab.size[2]);
  return (
    <group visible={visible}>
      <TexturedBox
        size={roof.slab.size}
        position={roof.slab.position}
        kind="concrete"
        color={roof.color}
        tile={span / 3}
        wireframe={wireframe}
      />
      {roof.parapets.map((p, i) => {
        const thin = Math.min(p.size[0], p.size[2]);
        const copingH = Math.min(p.size[1] * 0.25, thin * 0.6);
        const grow = thin * 0.5;
        return (
          <group key={i}>
            <mesh position={p.position} castShadow receiveShadow>
              <boxGeometry args={p.size} />
              <meshStandardMaterial color={roof.color} roughness={0.7} wireframe={wireframe} />
            </mesh>
            <mesh position={[p.position[0], p.position[1] + p.size[1] / 2 + copingH / 2, p.position[2]]} castShadow receiveShadow>
              <boxGeometry args={[p.size[0] + (p.size[0] > p.size[2] ? 0 : grow), copingH, p.size[2] + (p.size[0] > p.size[2] ? grow : 0)]} />
              <meshStandardMaterial color={trimColor} roughness={0.6} wireframe={wireframe} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// DoubleSide keeps the underside cap and the two hip triangles lit correctly
// regardless of exact triangle winding. Fascia boards run around the eaves and a
// ridge cap along the ridge line (when there is one).
function HipRoof({ roof, visible, trimColor, wireframe, lite }) {
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

  const hw = roof.width / 2 + roof.overhang;
  const hd = roof.depth / 2 + roof.overhang;
  const fasciaH = roof.overhang * 0.3;
  const fasciaT = roof.overhang * 0.08;
  const longAxisIsX = roof.width >= roof.depth;
  const ridgeLen = Math.abs(roof.width - roof.depth);
  const ridgeThick = roof.overhang * 0.13;
  const ridgeColor = useMemo(() => new THREE.Color(roof.color).multiplyScalar(0.7).getStyle(), [roof.color]);

  return (
    <group position={roof.center} visible={visible}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={roof.color} map={shingle.map} normalMap={shingle.normalMap} roughnessMap={shingle.roughnessMap} roughness={1} metalness={0.05} side={THREE.DoubleSide} wireframe={wireframe} />
      </mesh>
      {/* Fascia: the board that caps the rafter ends around the whole eave. */}
      {[
        [[0, -fasciaH / 2, -hd], [hw * 2 + fasciaT, fasciaH, fasciaT]],
        [[0, -fasciaH / 2, hd], [hw * 2 + fasciaT, fasciaH, fasciaT]],
        [[-hw, -fasciaH / 2, 0], [fasciaT, fasciaH, hd * 2]],
        [[hw, -fasciaH / 2, 0], [fasciaT, fasciaH, hd * 2]],
      ].map(([position, size], i) => (
        <mesh key={i} position={position} castShadow receiveShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color={trimColor} roughness={0.6} wireframe={wireframe} />
        </mesh>
      ))}
      {!lite && ridgeLen > roof.overhang * 0.5 && (
        <mesh position={[0, roof.height + ridgeThick * 0.25, 0]} castShadow>
          <boxGeometry args={longAxisIsX ? [ridgeLen + ridgeThick, ridgeThick, ridgeThick * 1.6] : [ridgeThick * 1.6, ridgeThick, ridgeLen + ridgeThick]} />
          <meshStandardMaterial color={ridgeColor} roughness={0.8} wireframe={wireframe} />
        </mesh>
      )}
    </group>
  );
}
