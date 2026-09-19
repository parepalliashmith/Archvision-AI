import { useMemo } from 'react';
import { WALL_COLOR_INTERIOR, WALL_COLOR_EXTERIOR } from './houseModel.js';
import { getStuccoTexture, getFabricTexture } from './textures.js';

// Which way is "into the room" for a wall on a given side — the mirror image
// of houseModel.js's own (unexported) OUTWARD map, needed here so curtain
// panels hang on the interior face, not sticking out through the glass.
const INWARD = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] };

// Renders one room's wall segments (already split around door gaps by houseModel.js)
// plus its window panes. Declarative JSX all the way down — the segment list is just
// data by the time it gets here, so this is a plain .map().
export default function RoomWalls({ wallSegments, windowPanes, wireframe, wallColorExterior, accentColor, nightMode }) {
  // Real photographed plaster (see textures.js) — one shared instance for
  // every exterior wall segment regardless of length, same reasoning as
  // before: it reads fine without being individually rescaled per segment.
  // Still multiplied by the style's own wallColorExterior (same as the old
  // canvas texture) so per-style differentiation (modern/traditional/
  // farmhouse/...) keeps working — the photo is already a neutral cream/off-
  // white plaster tone, so a style tint reads as "painted plaster in that
  // color" rather than washing out the real surface detail.
  const stucco = useMemo(() => getStuccoTexture(), []);
  const fabric = useMemo(() => getFabricTexture(), []);

  return (
    <group>
      {wallSegments.map((seg) => (
        <mesh key={seg.key} position={seg.position} castShadow receiveShadow>
          <boxGeometry args={seg.size} />
          <meshStandardMaterial
            color={seg.exterior ? wallColorExterior || WALL_COLOR_EXTERIOR : WALL_COLOR_INTERIOR}
            map={seg.exterior ? stucco.map : null}
            normalMap={seg.exterior ? stucco.normalMap : null}
            roughnessMap={seg.exterior ? stucco.roughnessMap : null}
            roughness={seg.exterior ? 1 : 0.88}
            wireframe={wireframe}
          />
        </mesh>
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
          <mesh position={pane.sill.position} castShadow receiveShadow>
            <boxGeometry args={pane.sill.size} />
            <meshStandardMaterial color="#e8e2d5" roughness={0.85} wireframe={wireframe} />
          </mesh>
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
