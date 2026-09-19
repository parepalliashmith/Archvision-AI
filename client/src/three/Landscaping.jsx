import { useMemo } from 'react';
import { getPoolTileTexture } from './textures.js';

// Palm tree: a tapered trunk (native CylinderGeometry, no custom mesh) plus a
// radial cluster of drooping frond "blades" — each frond is a thin box tilted
// downward and rotated evenly around the trunk, cheap enough to place several
// per design without hurting frame rate.
function PalmTree({ tree, wireframe }) {
  const { position, trunk, fronds } = tree;
  const frondItems = useMemo(
    () => Array.from({ length: fronds.count }, (_, i) => ({
      angle: (i / fronds.count) * Math.PI * 2,
      tilt: 0.55 + (i % 3) * 0.1,
    })),
    [fronds.count]
  );
  return (
    <group position={position}>
      <mesh position={[0, trunk.height / 2, 0]} castShadow>
        <cylinderGeometry args={[trunk.radiusTop, trunk.radiusBase, trunk.height, 8]} />
        <meshStandardMaterial color="#8a6a4a" roughness={0.85} wireframe={wireframe} />
      </mesh>
      {frondItems.map((f, i) => (
        <group key={i} position={[0, fronds.atY, 0]} rotation={[0, f.angle, 0]}>
          <mesh position={[0, -fronds.length * 0.18, fronds.length * 0.48]} rotation={[f.tilt, 0, 0]} castShadow>
            <boxGeometry args={[fronds.length * 0.15, fronds.length * 0.04, fronds.length]} />
            <meshStandardMaterial color="#3f7d3f" roughness={0.8} wireframe={wireframe} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Ornamental tree: a short trunk plus two stacked, slightly-offset canopy
// spheres — reads as a fuller, more deliberate tree than a single bush sphere
// sitting straight on the ground.
function OrnamentalTree({ tree, wireframe }) {
  const { position, trunk, canopy } = tree;
  return (
    <group position={position}>
      <mesh position={[0, trunk.height / 2, 0]} castShadow>
        <cylinderGeometry args={[trunk.radiusTop, trunk.radiusBase, trunk.height, 7]} />
        <meshStandardMaterial color="#7a5c3e" roughness={0.85} wireframe={wireframe} />
      </mesh>
      {canopy.map((c, i) => (
        <mesh key={i} position={[0, c.atY, 0]} castShadow receiveShadow>
          <sphereGeometry args={[c.radius, 10, 8]} />
          <meshStandardMaterial color="#4f7f3f" roughness={0.9} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}

// Site landscaping: the garden's trees (palm/ornamental, from houseModel.js's
// buildTree) and its pool, if the open-space rect was large enough for one.
// Split out of HouseScene.jsx purely to keep that file from growing unwieldy —
// same "component per cohesive geometry cluster" pattern as Walls.jsx/Roof.jsx.
export default function Landscaping({ trees, pool, wireframe }) {
  const poolTileTexture = useMemo(() => (pool ? getPoolTileTexture() : null), [pool]);

  return (
    <>
      {trees.map((tree) => (
        tree.type === 'palm'
          ? <PalmTree key={tree.key} tree={tree} wireframe={wireframe} />
          : <OrnamentalTree key={tree.key} tree={tree} wireframe={wireframe} />
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
