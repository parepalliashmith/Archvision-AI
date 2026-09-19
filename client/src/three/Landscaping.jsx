import { useMemo } from 'react';
import { getPoolTileTexture, getRawSet } from './textures.js';

// Deterministic string -> small int, so every tree/bush gets its own stable
// variation (leaf tint, cluster layout) without Math.random — the same design
// must always render identically.
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

const LEAF_GREENS = ['#4a7c3a', '#55893f', '#3f7035', '#5b9146', '#4c8040', '#468038'];
const FROND_GREENS = ['#3f7d3f', '#4a8a45', '#377537'];

// Palm tree: a tapered trunk with real bark texture, and a crown of drooping
// fronds — each frond is two segments (a raised inner part and a more steeply
// drooping outer part) so it arcs like a real palm leaf instead of a stiff plank.
function PalmTree({ tree, wireframe }) {
  const { position, trunk, fronds } = tree;
  const bark = useMemo(() => getRawSet('bark'), []);
  const seed = useMemo(() => hashSeed(tree.key), [tree.key]);
  const frondItems = useMemo(
    () => Array.from({ length: fronds.count }, (_, i) => ({
      angle: (i / fronds.count) * Math.PI * 2 + (seed % 7) * 0.1,
      tilt: 0.55 + (i % 3) * 0.1,
      color: FROND_GREENS[(i + seed) % FROND_GREENS.length],
    })),
    [fronds.count, seed]
  );
  const L = fronds.length;
  return (
    <group position={position}>
      <mesh position={[0, trunk.height / 2, 0]} castShadow>
        <cylinderGeometry args={[trunk.radiusTop, trunk.radiusBase, trunk.height, 10]} />
        <meshStandardMaterial color="#b59a78" map={bark.map} normalMap={bark.normalMap} roughnessMap={bark.roughnessMap} roughness={1} wireframe={wireframe} />
      </mesh>
      {frondItems.map((f, i) => (
        <group key={i} position={[0, fronds.atY, 0]} rotation={[0, f.angle, 0]}>
          <mesh position={[0, L * 0.04, L * 0.24]} rotation={[-0.25 + f.tilt * 0.3, 0, 0]} castShadow>
            <boxGeometry args={[L * 0.14, L * 0.03, L * 0.5]} />
            <meshStandardMaterial color={f.color} roughness={0.8} wireframe={wireframe} />
          </mesh>
          <mesh position={[0, -L * 0.2, L * 0.62]} rotation={[f.tilt * 1.5, 0, 0]} castShadow>
            <boxGeometry args={[L * 0.11, L * 0.025, L * 0.5]} />
            <meshStandardMaterial color={f.color} roughness={0.8} wireframe={wireframe} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Ornamental tree: a barked trunk plus a canopy built from the main spheres AND a
// ring of smaller satellite blobs in slightly different greens — a lumpy,
// irregular silhouette like real foliage instead of two clean balls.
function OrnamentalTree({ tree, wireframe, lite }) {
  const { position, trunk, canopy } = tree;
  const bark = useMemo(() => getRawSet('bark'), []);
  const seed = useMemo(() => hashSeed(tree.key), [tree.key]);
  const blobs = useMemo(() => {
    const out = [];
    canopy.forEach((c, i) => {
      out.push({ x: 0, y: c.atY, z: 0, r: c.radius, color: LEAF_GREENS[(seed + i) % LEAF_GREENS.length] });
      if (lite) return;
      for (let j = 0; j < 5; j++) {
        const a = j * ((Math.PI * 2) / 5) + i * 0.6 + (seed % 5) * 0.2;
        out.push({
          x: Math.cos(a) * c.radius * 0.62,
          y: c.atY + (j % 2 ? 0.28 : -0.12) * c.radius,
          z: Math.sin(a) * c.radius * 0.62,
          r: c.radius * (0.55 + (j % 3) * 0.06),
          color: LEAF_GREENS[(seed + i + j + 1) % LEAF_GREENS.length],
        });
      }
    });
    return out;
  }, [canopy, seed, lite]);
  return (
    <group position={position}>
      <mesh position={[0, trunk.height / 2, 0]} castShadow>
        <cylinderGeometry args={[trunk.radiusTop, trunk.radiusBase, trunk.height, 8]} />
        <meshStandardMaterial color="#9c8466" map={bark.map} normalMap={bark.normalMap} roughnessMap={bark.roughnessMap} roughness={1} wireframe={wireframe} />
      </mesh>
      {blobs.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]} castShadow receiveShadow>
          <sphereGeometry args={[b.r, 12, 9]} />
          <meshStandardMaterial color={b.color} roughness={0.95} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}

// A shrub: three overlapping blobs of different size/tint instead of one sphere.
export function Bush({ bush, wireframe, lite }) {
  const seed = useMemo(() => hashSeed(bush.key), [bush.key]);
  const r = bush.radius;
  const parts = lite
    ? [[0, 0, 0, 1]]
    : [[0, 0, 0, 1], [r * 0.7, -r * 0.1, r * 0.2, 0.68], [-r * 0.55, -r * 0.05, -r * 0.45, 0.6]];
  return (
    <group position={bush.position}>
      {parts.map(([x, y, z, k], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <sphereGeometry args={[r * k, 10, 8]} />
          <meshStandardMaterial color={LEAF_GREENS[(seed + i * 2) % LEAF_GREENS.length]} roughness={0.95} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}

// Site landscaping: the garden's trees (palm/ornamental, from houseModel.js's
// buildTree) and its pool, if the open-space rect was large enough for one.
// Split out of HouseScene.jsx purely to keep that file from growing unwieldy —
// same "component per cohesive geometry cluster" pattern as Walls.jsx/Roof.jsx.
export default function Landscaping({ trees, pool, wireframe, lite = false }) {
  const poolTileTexture = useMemo(() => (pool ? getPoolTileTexture() : null), [pool]);

  return (
    <>
      {trees.map((tree) => (
        tree.type === 'palm'
          ? <PalmTree key={tree.key} tree={tree} wireframe={wireframe} />
          : <OrnamentalTree key={tree.key} tree={tree} wireframe={wireframe} lite={lite} />
      ))}

      {pool && (
        <group>
          <mesh position={pool.coping.position} receiveShadow castShadow>
            <boxGeometry args={pool.coping.size} />
            <meshStandardMaterial map={poolTileTexture} roughness={0.65} wireframe={wireframe} />
          </mesh>
          <mesh position={pool.basin.position} receiveShadow castShadow>
            <boxGeometry args={pool.basin.size} />
            <meshStandardMaterial color="#1c4f63" roughness={0.55} wireframe={wireframe} />
          </mesh>
          {/* Water surface: the same transmissive-PBR technique already used for
              the window glass, so a pool reads as premium/real rather than a
              flat blue rectangle. */}
          <mesh position={pool.water.position} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={pool.water.size} />
            <meshPhysicalMaterial
              color="#2fa8c9" transmission={0.6} roughness={0.06} ior={1.33} thickness={0.6}
              transparent opacity={0.92} wireframe={wireframe}
            />
          </mesh>
        </group>
      )}
    </>
  );
}
