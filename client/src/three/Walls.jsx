import { useEffect, useMemo } from 'react';
import { WALL_COLOR_INTERIOR, WALL_COLOR_EXTERIOR } from './houseModel.js';
import { getFabricTexture, getRawSet, getDoorWoodTexture, makeTiledBoxGeometry, WALL_TILE_FACTOR } from './textures.js';

// Which way is "into the room" for a wall on a given side — the mirror image
// of houseModel.js's own (unexported) OUTWARD map, needed here so curtain
// panels hang on the interior face, not sticking out through the glass.
const INWARD = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] };

// The BoxGeometry face that points INTO the room for an exterior wall on each
// side — that face gets plaster while the outside keeps brick/stucco/concrete.
const INNER_FACE = { north: 'pz', south: 'nz', west: 'px', east: 'nx' };

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 997;
}

// One wall segment. Its UVs are scaled to the segment's real size so the photo
// texture keeps a believable scale on short and long walls alike; exterior walls
// use two materials (outside = style material, inside = plaster) on a geometry
// whose faces are grouped accordingly (see makeTiledBoxGeometry).
function WallSegment({ seg, extSet, extColor, extTile, plaster, wireframe }) {
  const exterior = seg.exterior;
  const geometry = useMemo(
    () => makeTiledBoxGeometry(
      seg.size,
      exterior ? extTile : seg.size[1] * WALL_TILE_FACTOR.plaster,
      hashSeed(seg.key),
      exterior ? INNER_FACE[seg.side] : null
    ),
    [seg.size, seg.key, seg.side, exterior, extTile]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const interiorMat = (attach) => (
    <meshStandardMaterial
      attach={attach}
      color={WALL_COLOR_INTERIOR}
      map={plaster.map}
      normalMap={plaster.normalMap}
      roughnessMap={plaster.roughnessMap}
      roughness={1}
      wireframe={wireframe}
    />
  );

  return (
    <mesh geometry={geometry} position={seg.position} castShadow receiveShadow>
      {exterior ? (
        <>
          <meshStandardMaterial
            attach="material-0"
            color={extColor}
            map={extSet.map}
            normalMap={extSet.normalMap}
            roughnessMap={extSet.roughnessMap}
            roughness={1}
            wireframe={wireframe}
          />
          {interiorMat('material-1')}
        </>
      ) : interiorMat('material')}
    </mesh>
  );
}

// A stone base band around the bottom of ground-floor exterior walls (a
// "plinth") — every real house has one; it grounds the walls and breaks up
// the single continuous wall texture.
function Plinth({ seg, stone, wireframe }) {
  const h = seg.size[1];
  const plinthH = h * 0.14;
  const grow = h * 0.014;
  const horizontal = seg.side === 'north' || seg.side === 'south';
  const size = horizontal ? [seg.size[0] + grow, plinthH, seg.size[2] + grow * 2] : [seg.size[0] + grow * 2, plinthH, seg.size[2] + grow];
  const geometry = useMemo(() => makeTiledBoxGeometry(size, h * WALL_TILE_FACTOR.stone, hashSeed(seg.key) + 7), [size[0], size[1], size[2], h, seg.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[seg.position[0], seg.position[1] - h / 2 + plinthH / 2, seg.position[2]]} castShadow receiveShadow>
      <meshStandardMaterial color="#d6d0c4" map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} roughness={1} wireframe={wireframe} />
    </mesh>
  );
}

// Door leaf + frame + handle. The entrance door takes the style's accent colour
// on real wood grain; interior doors are a plain warm wood.
function DoorLeaf({ door, accentColor, trimColor, wood, wireframe }) {
  return (
    <group>
      <mesh position={door.leaf.position} castShadow receiveShadow>
        <boxGeometry args={door.leaf.size} />
        <meshStandardMaterial
          color={door.isEntrance ? accentColor || '#6b4a36' : '#d9c3a0'}
          map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap}
          roughness={1} wireframe={wireframe}
        />
      </mesh>
      {door.frame.map((bar, i) => (
        <mesh key={i} position={bar.position} castShadow receiveShadow>
          <boxGeometry args={bar.size} />
          <meshStandardMaterial color={door.exterior ? trimColor : '#f4f0e8'} roughness={0.6} wireframe={wireframe} />
        </mesh>
      ))}
      <mesh position={door.handle.position} castShadow>
        <boxGeometry args={door.handle.size} />
        <meshStandardMaterial color="#c9a54a" metalness={0.85} roughness={0.3} wireframe={wireframe} />
      </mesh>
    </group>
  );
}

// Renders one room's wall segments (already split around door gaps by houseModel.js),
// its window panes and its doors. Declarative JSX all the way down — the segment list
// is just data by the time it gets here, so this is a plain .map().
export default function RoomWalls({
  wallSegments, windowPanes, doorLeaves = [], wireframe, wallColorExterior, accentColor, trimColor = '#f1ede4',
  wallTexture = 'stucco', hasShutters = false, groundFloor = false, lite = false, nightMode,
}) {
  // Real photographed materials (see textures.js). Stucco is tinted by the
  // style's wall colour (a "painted plaster" look); brick and concrete are real
  // colours and stay untinted.
  const extSet = useMemo(() => getRawSet(wallTexture), [wallTexture]);
  const extColor = wallTexture === 'stucco' ? wallColorExterior || WALL_COLOR_EXTERIOR : '#ffffff';
  const plaster = useMemo(() => getRawSet('plaster'), []);
  const stone = useMemo(() => (groundFloor ? getRawSet('stone') : null), [groundFloor]);
  const fabric = useMemo(() => getFabricTexture(), []);
  const wood = useMemo(() => getDoorWoodTexture(), []);

  return (
    <group>
      {wallSegments.map((seg) => {
        const isLintel = seg.key.includes('lintel');
        return (
          <group key={seg.key}>
            <WallSegment
              seg={seg}
              extSet={extSet}
              extColor={extColor}
              extTile={seg.size[1] * (WALL_TILE_FACTOR[wallTexture] || 1.25)}
              plaster={plaster}
              wireframe={wireframe}
            />
            {seg.exterior && groundFloor && !isLintel && <Plinth seg={seg} stone={stone} wireframe={wireframe} />}
            {!seg.exterior && !isLintel && !lite && (
              // Skirting board along the foot of interior walls.
              <mesh
                position={[seg.position[0], seg.position[1] - seg.size[1] / 2 + seg.size[1] * 0.035, seg.position[2]]}
                castShadow={false}
                receiveShadow
              >
                <boxGeometry args={[
                  seg.size[0] > seg.size[2] ? seg.size[0] : seg.size[0] + seg.size[1] * 0.012,
                  seg.size[1] * 0.07,
                  seg.size[0] > seg.size[2] ? seg.size[2] + seg.size[1] * 0.012 : seg.size[2],
                ]} />
                <meshStandardMaterial color="#faf8f3" roughness={0.55} wireframe={wireframe} />
              </mesh>
            )}
          </group>
        );
      })}

      {doorLeaves.map((door) => (
        <DoorLeaf key={door.key} door={door} accentColor={accentColor} trimColor={trimColor} wood={wood} wireframe={wireframe} />
      ))}

      {windowPanes.map((pane) => {
        // Curtains: two fabric panels flanking the window on the interior
        // face, hanging from just above the frame to well below the sill —
        // real photo weave (textures.js's fabric set, already loaded for the
        // sofa) tinted by the design's own accentColor. All dimensions are
        // derived as fractions of the pane's own already-unit-scaled size,
        // never a raw meter constant — this file has no `dims`/`scale` prop
        // to convert one against (same lesson as Furniture.jsx's Rug fix
        // earlier this session).
        const horizontal = pane.side === 'north' || pane.side === 'south';
        const winWidth = horizontal ? pane.size[0] : pane.size[2];
        const winHeight = pane.size[1];
        const inward = INWARD[pane.side] || [0, 1];
        const panelWidth = winWidth * 0.32;
        const panelThickness = winWidth * 0.025;
        const curtainHeight = winHeight * 1.5;
        const curtainY = pane.position[1] - winHeight * 0.18;
        const sideOffset = winWidth / 2 + panelWidth * 0.35;
        const pullIn = panelThickness * 3;
        const leftPos = horizontal
          ? [pane.position[0] - sideOffset, curtainY, pane.position[2] + inward[1] * pullIn]
          : [pane.position[0] + inward[0] * pullIn, curtainY, pane.position[2] - sideOffset];
        const rightPos = horizontal
          ? [pane.position[0] + sideOffset, curtainY, pane.position[2] + inward[1] * pullIn]
          : [pane.position[0] + inward[0] * pullIn, curtainY, pane.position[2] + sideOffset];
        const panelSize = horizontal ? [panelWidth, curtainHeight, panelThickness] : [panelThickness, curtainHeight, panelWidth];

        // Window detail derived from data already on the pane (frame bar size
        // gives trim thickness + depth; the sill's offset from the glass gives
        // the outward direction): dividers, a lintel above and, for styles that
        // ask for them, shutters either side.
        const jamb = pane.frame[2];
        const trim = horizontal ? jamb.size[0] : jamb.size[2];
        const depth = horizontal ? jamb.size[2] : jamb.size[0];
        const outIdx = horizontal ? 2 : 0;
        const outDelta = pane.sill.position[outIdx] - pane.position[outIdx];
        const lintelT = pane.sill.size[1] * 1.6;
        const lintelY = pane.position[1] + winHeight / 2 + trim + lintelT / 2;
        const lintelPos = [pane.sill.position[0], lintelY, pane.sill.position[2]];
        const shutterW = winWidth * 0.42;
        const shutterH = winHeight + trim * 2;
        const shutterThick = Math.abs(outDelta) * 0.35;
        const shutterOffset = winWidth / 2 + trim + shutterW / 2;
        const shutterOut = pane.position[outIdx] + outDelta * 0.78;
        const shutterPos = (sign) => (horizontal
          ? [pane.position[0] + sign * shutterOffset, pane.position[1], shutterOut]
          : [shutterOut, pane.position[1], pane.position[2] + sign * shutterOffset]);
        const shutterSize = horizontal ? [shutterW, shutterH, shutterThick] : [shutterThick, shutterH, shutterW];

        return (
        <group key={pane.key}>
          <mesh position={pane.position}>
            <boxGeometry args={pane.size} />
            {/* Real transmissive glass (PBR), tuned for a crisper "high-end
                low-iron glazing" look — less roughness/tint than a standard
                pane, a touch of clearcoat for the glossy edge highlight a
                premium storefront-style window actually has. At night it
                additionally gets a warm emissive tint — reads as "lit from
                inside" without any actual light source per window (which
                would be real per-frame cost multiplied by every window in
                the house); this is the one visual trick doing that job. */}
            <meshPhysicalMaterial
              color="#dceefc"
              transmission={nightMode ? 0.55 : 0.92}
              thickness={0.04}
              roughness={0.04}
              ior={1.5}
              clearcoat={0.6}
              clearcoatRoughness={0.15}
              emissive={nightMode ? '#ffb84d' : '#000000'}
              emissiveIntensity={nightMode ? 0.9 : 0}
              transparent
            />
          </mesh>
          {/* Frame + sill: plain glass with no casing reads as almost nothing
              against daylight/reflections — these are what actually make a
              window visible as a window. Frame uses the style's own accent/trim
              color, matching the entrance porch and carport for a cohesive look. */}
          {pane.frame.map((bar, i) => (
            <mesh key={i} position={bar.position} castShadow receiveShadow>
              <boxGeometry args={bar.size} />
              <meshStandardMaterial color={accentColor || '#8a6a52'} roughness={0.6} wireframe={wireframe} />
            </mesh>
          ))}
          {!lite && (
            <>
              {/* Dividers (mullion + transom) split the glass into panes. */}
              <mesh position={pane.position} castShadow>
                <boxGeometry args={horizontal ? [trim * 0.6, winHeight, depth * 0.85] : [depth * 0.85, winHeight, trim * 0.6]} />
                <meshStandardMaterial color={accentColor || '#8a6a52'} roughness={0.6} wireframe={wireframe} />
              </mesh>
              <mesh position={pane.position} castShadow>
                <boxGeometry args={horizontal ? [winWidth, trim * 0.6, depth * 0.85] : [depth * 0.85, trim * 0.6, winWidth]} />
                <meshStandardMaterial color={accentColor || '#8a6a52'} roughness={0.6} wireframe={wireframe} />
              </mesh>
            </>
          )}
          <mesh position={pane.sill.position} castShadow receiveShadow>
            <boxGeometry args={pane.sill.size} />
            <meshStandardMaterial color="#e8e2d5" roughness={0.85} wireframe={wireframe} />
          </mesh>
          <mesh position={lintelPos} castShadow receiveShadow>
            <boxGeometry args={horizontal ? [pane.sill.size[0], lintelT, pane.sill.size[2]] : [pane.sill.size[0], lintelT, pane.sill.size[2]]} />
            <meshStandardMaterial color={trimColor} roughness={0.7} wireframe={wireframe} />
          </mesh>
          {hasShutters && !lite && [-1, 1].map((sign) => (
            <mesh key={sign} position={shutterPos(sign)} castShadow>
              <boxGeometry args={shutterSize} />
              <meshStandardMaterial color={accentColor || '#6b4a36'} roughness={0.7} wireframe={wireframe} />
            </mesh>
          ))}
          <mesh position={leftPos} castShadow>
            <boxGeometry args={panelSize} />
            <meshStandardMaterial color={accentColor || '#8a6a52'} map={fabric.map} normalMap={fabric.normalMap} roughnessMap={fabric.roughnessMap} roughness={1} wireframe={wireframe} />
          </mesh>
          <mesh position={rightPos} castShadow>
            <boxGeometry args={panelSize} />
            <meshStandardMaterial color={accentColor || '#8a6a52'} map={fabric.map} normalMap={fabric.normalMap} roughnessMap={fabric.roughnessMap} roughness={1} wireframe={wireframe} />
          </mesh>
        </group>
        );
      })}
    </group>
  );
}

// A generic box with a real-world-scaled photo texture (kind = 'stone' | 'concrete' |
// 'brick' | 'plaster' | 'paving' | 'stucco'), used for the foundation slab, chimney,
// garden wall, path and other site/massing pieces that used to be flat colour.
export function TexturedBox({ size, position, kind, color = '#ffffff', tile, seed = 0, castShadow = true, receiveShadow = true, wireframe = false, roughness = 1 }) {
  const set = useMemo(() => getRawSet(kind), [kind]);
  const geometry = useMemo(
    () => makeTiledBoxGeometry(size, tile || Math.max(size[0], size[1], size[2]), seed),
    [size[0], size[1], size[2], tile, seed] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} castShadow={castShadow} receiveShadow={receiveShadow}>
      <meshStandardMaterial color={color} map={set.map} normalMap={set.normalMap} roughnessMap={set.roughnessMap} roughness={roughness} wireframe={wireframe} />
    </mesh>
  );
}

// An exterior wall block that isn't a room wall (the stairwell enclosure): the
// style's exterior material on every face, texture scaled to real size.
export function ExteriorBlock({ seg, wallTexture = 'stucco', wallColorExterior, wireframe }) {
  return (
    <TexturedBox
      size={seg.size}
      position={seg.position}
      kind={wallTexture}
      color={wallTexture === 'stucco' ? wallColorExterior || WALL_COLOR_EXTERIOR : '#ffffff'}
      tile={seg.size[1] * (WALL_TILE_FACTOR[wallTexture] || 1.25)}
      seed={hashSeed(seg.key)}
      wireframe={wireframe}
    />
  );
}
