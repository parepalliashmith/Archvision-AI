// Furniture placeholders, upgraded from the old single/double-crude-box versions into
// small multi-primitive assemblies (frame+mattress+headboard+pillows for a bed, a sofa
// with a backrest and armrests, dining chairs with actual legs, etc). Still 100%
// generated primitives — boxes and cylinders combined — no external .glb/.gltf assets,
// per the project's "no external 3D assets" principle. Sized in real-world meters via
// the `scale` (unitScale) prop, exactly like the old addFurniture().
//
// Interior-design pass: every room type now gets a full small furniture SET (not one
// item alone in a corner) plus a ceiling pendant light. The light is emissive-only, no
// real <pointLight>/<spotLight> — same performance reasoning as the window-glass and
// lantern emissive tricks elsewhere (HouseScene.jsx/Walls.jsx): a per-frame light cost
// multiplied by every room in the house would add up fast, an emissive bulb reads as
// "lit" at effectively zero extra cost. `nightMode`/`accentColor` are threaded in from
// HouseScene.jsx (same props that already drive the lanterns/window glow) so the light
// dims by day and glows warm at night exactly like the rest of the house, and a few
// pieces (rugs) pick up the design's own style accent color instead of a hardcoded one —
// real, already-available input, not Math.random() (this file follows the same
// deterministic-geometry rule as everywhere else in the app: position/size never comes
// from chance, only from room/style data that's already there).
//
// Real-materials pass: the largest wood-toned pieces (bed frame/headboard, wardrobe,
// coffee/dining table, dining chairs, desk) and the sofa's fabric surfaces now carry the
// same real photographed textures as the floors/walls (see textures.js) instead of a
// flat hex color — computed once at module scope (not per-room) since textures.js's own
// cache already returns the same shared instance every call, so there's nothing to
// re-memoize per Furniture instance. Thinner trim/legs/frames are left as flat color —
// too small on screen for photo detail to read, not worth the extra prop plumbing.
import { createContext, useContext } from 'react';
import { RoundedBox } from '@react-three/drei';
import { getWoodFloorTexture, getFabricTexture, getMarbleTexture } from './textures.js';

// Full-quality mode softens every furniture box's edges (RoundedBox); phones/low-spec
// devices (`lite`) keep plain boxes to stay light. Provided by the default export.
const LiteContext = createContext(false);

const wood = getWoodFloorTexture();
const fabric = getFabricTexture();
const marble = getMarbleTexture();

function Box({ size, position, color, roughness = 0.75, metalness = 0, transparent = false, opacity = 1, map = null, normalMap = null, roughnessMap = null }) {
  const lite = useContext(LiteContext);
  const material = (
    <meshStandardMaterial
      color={color}
      roughness={roughnessMap ? 1 : roughness}
      metalness={metalness}
      transparent={transparent}
      opacity={opacity}
      map={map}
      normalMap={normalMap}
      roughnessMap={roughnessMap}
    />
  );
  if (lite) {
    return (
      <mesh position={position} castShadow receiveShadow>
        <boxGeometry args={size} />
        {material}
      </mesh>
    );
  }
  // Rounded edge radius: a fraction of the smallest side, so a thin rug stays a
  // slab while a sofa arm or mattress gets a visibly soft edge.
  const radius = Math.min(size[0], size[1], size[2]) * 0.22;
  return (
    <RoundedBox args={size} radius={radius} smoothness={3} position={position} castShadow receiveShadow>
      {material}
    </RoundedBox>
  );
}

function Cyl({ radiusTop, radiusBottom = radiusTop, height, position, color, roughness = 0.7, rotation = [0, 0, 0] }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, 16]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

// A small, stable string hash — NOT Math.random(), same room name always
// gives the same result, so a design regenerates pixel-identical every time
// — used to pick between the two furniture-layout variants (bedroom/living,
// below). Only needs to differ often enough between different room names to
// read as real variety, not be cryptographically strong.
function hashSign(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h % 2 === 0 ? 1 : -1;
}

// A single freestanding chair (seat + backrest + 4 legs) — distinct from the dining
// room's own inline radial chair-around-a-table construction (kept as-is, untouched, to
// avoid regressing already-working geometry). Used for study/balcony. `facing` is the
// horizontal sign the backrest sits on (-1 = backrest on the -Z side, so the chair faces
// +Z, and so on) — same "sign pair" convention as CORNERS elsewhere in this file.
// `floorY` (the room's own floor height, yBase + half the slab) must be added to every
// Y position here — without it every chair renders relative to world Y=0 instead of its
// actual floor, which is invisible on the ground floor (floorY≈0) but sinks/floats the
// chair on any upper floor.
function Chair({ x, z, size, floorY, color = '#6b4c37', legColor = '#4a3526', facingZ = -1, map = null, normalMap = null, roughnessMap = null }) {
  const legH = size * 0.85;
  return (
    <group>
      <Box size={[size, 0.05 * size, size]} position={[x, floorY + legH * 0.9 + legH * 0.05, z]} color={color} map={map} normalMap={normalMap} roughnessMap={roughnessMap} />
      <Box size={[size, size * 0.9, 0.06 * size]} position={[x, floorY + legH * 0.9 + size * 0.5, z + facingZ * size * 0.47]} color={color} map={map} normalMap={normalMap} roughnessMap={roughnessMap} />
      {CORNERS.map(([lx, lz], i) => (
        <Cyl key={i} radiusTop={size * 0.045} height={legH} position={[x + lx * size * 0.4, floorY + legH / 2, z + lz * size * 0.4]} color={legColor} />
      ))}
    </group>
  );
}

// A tall case with 2 horizontal shelf dividers — bookshelf (study) and shelving
// (utility) are the same assembly, just re-tinted. Same `floorY` requirement as Chair.
function ShelfUnit({ x, z, w, d, h, floorY, color = '#8a6a52', trim = '#5b4632', map = null, normalMap = null, roughnessMap = null }) {
  return (
    <group>
      <Box size={[w, h, d]} position={[x, floorY + h / 2, z]} color={color} map={map} normalMap={normalMap} roughnessMap={roughnessMap} />
      <Box size={[w * 0.94, 0.02 * h, d * 0.9]} position={[x, floorY + h * 0.36, z]} color={trim} />
      <Box size={[w * 0.94, 0.02 * h, d * 0.9]} position={[x, floorY + h * 0.68, z]} color={trim} />
    </group>
  );
}

// A thin flat box standing in for a rug — same primitive vocabulary as everything else
// in this file (no decal/plane-with-alpha-texture system exists here), just a very
// short box sitting a hair above the floor tile so it doesn't z-fight. Thickness/offset
// are meter constants like everywhere else in this file, so they need `* scale` too —
// without it a feet-unit design (the rule-based generator's default) renders a rug a
// fraction of its intended thickness instead of ~2cm.
function Rug({ x, z, w, d, floorY, scale, color }) {
  return <Box size={[w, 0.02 * scale, d]} position={[x, floorY + 0.012 * scale, z]} color={color} roughness={0.95} metalness={0} />;
}

// A framed picture — a thin dark frame box with a lighter "canvas" box set
// just in front of it, both flat against a wall. Only used against a wall
// facing -Z (i.e. mounted at the larger-Z/"south" edge of a room, front
// facing back into the room) — every call site this pass places it there;
// no rotation support needed since nothing yet calls it against an X-facing
// wall. `scale` needed for the frame-thickness/canvas-offset meter
// constants, same reasoning as Rug's own scale param.
function WallArt({ x, y, z, w, h, scale, frameColor }) {
  return (
    <group>
      <Box size={[w, h, 0.02 * scale]} position={[x, y, z]} color={frameColor} roughness={0.5} metalness={0.15} />
      <Box size={[w * 0.86, h * 0.86, 0.01 * scale]} position={[x, y, z - 0.015 * scale]} color="#eee7d8" roughness={0.9} />
    </group>
  );
}

export default function Furniture({ lite = false, ...props }) {
  return (
    <LiteContext.Provider value={!!lite}>
      <FurnitureInner {...props} />
    </LiteContext.Provider>
  );
}

function FurnitureInner({ room, yBase, dims, scale, nightMode, accentColor }) {
  const floorY = yBase + dims.slabThickness * 0.5;
  const cx = room.x + room.width / 2;
  const cz = room.y + room.depth / 2;
  const fit = (size) => Math.min(size, (room.width * 0.8) / scale, (room.depth * 0.8) / scale);
  const rugColor = accentColor || '#8a6a52';

  // Ceiling pendant fixture — one per room, every case below appends it. Dim by day,
  // warm and bright at night, exactly the `nightMode ? 2.4 : 0.5`-style split the
  // lanterns already use (HouseScene.jsx) — same visual language, different fixture.
  const ceilingLight = (
    <group>
      <Cyl radiusTop={0.015 * scale} height={0.22 * scale} position={[cx, yBase + dims.wallHeight - 0.12 * scale, cz]} color="#333333" />
      <mesh position={[cx, yBase + dims.wallHeight - 0.3 * scale, cz]} castShadow>
        <sphereGeometry args={[0.09 * scale, 12, 10]} />
        <meshStandardMaterial color="#fff2cf" emissive="#ffcf80" emissiveIntensity={nightMode ? 2.2 : 0.35} roughness={0.4} />
      </mesh>
    </group>
  );

  switch (room.type) {
    case 'bedroom': {
      // Furniture variety: a deterministic mirror (hashSign(room.name), not
      // Math.random() — a design still regenerates pixel-identical every
      // time) flips the nightstand/wardrobe/art to the OTHER side of the
      // room, so e.g. "Master Bedroom" and "Bedroom 2" in the same house
      // don't render as identical furniture, just resized. The bed itself
      // and every Z-direction (headboard/foot) placement stay untouched —
      // only left/right secondary-piece placement mirrors.
      const mirror = hashSign(room.name);
      const w = fit(1.5) * scale;
      const d = fit(2.0) * scale;
      const frameH = 0.28 * scale, mattressH = 0.22 * scale, headboardH = 0.55 * scale;
      const bx = room.x + w / 2 + 0.3 * scale, bz = room.y + d / 2 + 0.3 * scale;
      // Nightstand: flush against the headboard wall, immediately beside the bed's
      // open (non-wall) edge — clamped so it can never land outside the room even
      // when the bed itself already fills most of the width. Mirrored: beside the
      // bed's OTHER open edge instead.
      const nsW = 0.4 * scale, nsD = 0.35 * scale, nsH = 0.45 * scale;
      const nsX = mirror === 1
        ? Math.min(bx + w / 2 + nsW / 2 + 0.06 * scale, room.x + room.width - nsW / 2 - 0.05 * scale)
        : Math.max(bx - w / 2 - nsW / 2 - 0.06 * scale, room.x + nsW / 2 + 0.05 * scale);
      const nsZ = bz - d / 2 + nsD / 2 + 0.03 * scale;
      // Wardrobe: against the far wall, opposite corner from the bed. Mirrored:
      // the OTHER far corner.
      const wardW = 0.6 * scale, wardD = Math.min(room.depth * 0.35, 1.0) * scale, wardH = 1.9 * scale;
      const wardX = mirror === 1
        ? room.x + room.width - wardW / 2 - 0.12 * scale
        : room.x + wardW / 2 + 0.12 * scale;
      const wardZ = room.y + room.depth - wardD / 2 - 0.12 * scale;
      // Throw blanket folded across the foot of the bed, plus a small accent
      // cushion pair in front of the sleeping pillows — a "styled," not
      // bare, bed.
      const throwD = d * 0.22;
      const throwY = floorY + frameH + mattressH + 0.03 * scale;
      const throwZ = bz + d / 2 - throwD / 2 - 0.03 * scale;
      const accentCushionY = floorY + frameH + mattressH + 0.1 * scale;
      const accentCushionZ = bz - d * 0.16;
      // Wall art on the south wall, offset toward whichever quarter the
      // wardrobe (same wall) ISN'T on — mirrored along with it, so it always
      // stays clear.
      const artW = Math.min(room.width * 0.22, 0.7 * scale);
      const artH = artW * 0.75;
      const artX = mirror === 1 ? room.x + room.width * 0.25 : room.x + room.width * 0.75;
      const artZ = room.y + room.depth - 0.03 * scale;
      const artY = floorY + dims.wallHeight * 0.55;
      return (
        <group>
          <Box size={[w, frameH, d]} position={[bx, floorY + frameH / 2, bz]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          <Box size={[w * 0.94, mattressH, d * 0.94]} position={[bx, floorY + frameH + mattressH / 2, bz]} color="#eef1f5" roughness={0.9} />
          <Box size={[w * 0.96, headboardH, 0.06 * scale]} position={[bx, floorY + headboardH / 2, bz - d / 2 + 0.03 * scale]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          <Box size={[w * 0.36, 0.12 * scale, d * 0.22]} position={[bx - w * 0.22, floorY + frameH + mattressH + 0.06 * scale, bz - d * 0.32]} color="#ffffff" roughness={0.95} />
          <Box size={[w * 0.36, 0.12 * scale, d * 0.22]} position={[bx + w * 0.22, floorY + frameH + mattressH + 0.06 * scale, bz - d * 0.32]} color="#ffffff" roughness={0.95} />
          {/* Nightstand + lamp */}
          <Box size={[nsW, nsH, nsD]} position={[nsX, floorY + nsH / 2, nsZ]} color="#6b4a36" />
          <Cyl radiusTop={0.03 * scale} height={0.14 * scale} position={[nsX, floorY + nsH + 0.07 * scale, nsZ]} color="#4a3526" />
          <mesh position={[nsX, floorY + nsH + 0.2 * scale, nsZ]}>
            <coneGeometry args={[0.09 * scale, 0.14 * scale, 10]} />
            <meshStandardMaterial color="#f4e4c1" emissive="#ffd98a" emissiveIntensity={nightMode ? 1.6 : 0.15} roughness={0.6} />
          </mesh>
          {/* Wardrobe, double-door seam */}
          <Box size={[wardW, wardH, wardD]} position={[wardX, floorY + wardH / 2, wardZ]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          <Box size={[0.02 * scale, wardH * 0.85, wardD + 0.01 * scale]} position={[wardX, floorY + wardH * 0.5, wardZ]} color="#4a3526" />
          {/* Throw blanket + accent cushions — styling on top of the plain
              frame/mattress/headboard/pillows above. */}
          <Box size={[w * 0.98, 0.05 * scale, throwD]} position={[bx, throwY, throwZ]} color={rugColor} roughness={0.9} />
          <Box size={[w * 0.2, 0.09 * scale, w * 0.13]} position={[bx - w * 0.16, accentCushionY, accentCushionZ]} color={rugColor} roughness={0.85} />
          <Box size={[w * 0.2, 0.09 * scale, w * 0.13]} position={[bx + w * 0.16, accentCushionY, accentCushionZ]} color={rugColor} roughness={0.85} />
          <WallArt x={artX} y={artY} z={artZ} w={artW} h={artH} scale={scale} frameColor={rugColor} />
          {ceilingLight}
        </group>
      );
    }
    case 'living': {
      // Same deterministic-mirror variety as bedroom, above — living's own
      // sofa/TV pair is already centered/symmetric across X, so the visible
      // difference here is subtler: the potted plant's corner and the wall
      // art's off-center offset both flip.
      const mirror = hashSign(room.name);
      const sw = fit(1.9) * scale, sd = fit(0.8) * scale;
      const sh = 0.42 * scale, backH = 0.45 * scale, armW = 0.14 * scale, armH = sh + backH * 0.6;
      const sx = cx, sz = room.y + room.depth - sd / 2 - 0.25 * scale;
      const tSize = fit(0.9) * scale;
      const tableZ = room.y + room.depth - sd - tSize * 0.5 - 0.5 * scale;
      // Rug: under the coffee table and the front half of the sofa.
      const rugW = Math.min(room.width * 0.6, 2.4 * scale), rugD = Math.min(room.depth * 0.42, 1.7 * scale);
      const rugZ = tableZ + rugD * 0.15;
      // TV unit: on the wall the sofa faces (the room's near/top wall).
      const tvW = Math.min(room.width * 0.35, 1.3 * scale), tvUnitH = 0.42 * scale, tvUnitD = 0.35 * scale;
      const tvX = cx, tvZ = room.y + tvUnitD / 2 + 0.1 * scale;
      // Wall art above the sofa (the south wall, same wall the sofa's own
      // backrest sits against) — "opposite the TV," the classic living-room
      // pairing.
      const artW = Math.min(sw * 0.5, 1.1 * scale);
      const artH = artW * 0.65;
      const artY = floorY + sh + backH + artH / 2 + 0.15 * scale;
      const artZ = sz + sd / 2 - 0.04 * scale;
      const artX = cx + mirror * sw * 0.14;
      // Potted plant in the spare corner, away from the sofa/table/TV —
      // mirrored to the OTHER corner.
      const potR = fit(0.22) * scale;
      const plantX = mirror === 1 ? room.x + potR + 0.2 * scale : room.x + room.width - potR - 0.2 * scale;
      const plantZ = room.y + room.depth - potR - 0.2 * scale;
      return (
        <group>
          <Box size={[sw, sh, sd]} position={[sx, floorY + sh / 2, sz]} color="#ffffff" map={fabric.map} normalMap={fabric.normalMap} roughnessMap={fabric.roughnessMap} />
          {/* Backrest on the WALL-facing edge (fixed: this was on the room-facing
              edge, which made the sofa face away from the coffee table/TV). */}
          <Box size={[sw, backH, 0.12 * scale]} position={[sx, floorY + sh + backH / 2, sz + sd / 2 - 0.06 * scale]} color="#ffffff" map={fabric.map} normalMap={fabric.normalMap} roughnessMap={fabric.roughnessMap} />
          <Box size={[armW, armH, sd]} position={[sx - sw / 2 + armW / 2, floorY + armH / 2, sz]} color="#ffffff" map={fabric.map} normalMap={fabric.normalMap} roughnessMap={fabric.roughnessMap} />
          <Box size={[armW, armH, sd]} position={[sx + sw / 2 - armW / 2, floorY + armH / 2, sz]} color="#ffffff" map={fabric.map} normalMap={fabric.normalMap} roughnessMap={fabric.roughnessMap} />
          <Box size={[tSize, 0.32 * scale, tSize * 0.7]} position={[cx, floorY + 0.16 * scale, tableZ]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          <Rug x={cx} z={rugZ} w={rugW} d={rugD} floorY={floorY} scale={scale} color={rugColor} />
          {/* TV unit + panel */}
          <Box size={[tvW, tvUnitH, tvUnitD]} position={[tvX, floorY + tvUnitH / 2, tvZ]} color="#3a3a3a" />
          <Box size={[tvW * 0.85, tvUnitH * 1.6, 0.03 * scale]} position={[tvX, floorY + tvUnitH + tvUnitH * 0.8, tvZ - tvUnitD / 2 + 0.02 * scale]} color="#111111" roughness={0.3} />
          <WallArt x={artX} y={artY} z={artZ} w={artW} h={artH} scale={scale} frameColor={rugColor} />
          {/* Potted plant */}
          <Cyl radiusTop={potR * 0.85} radiusBottom={potR} height={potR * 1.4} position={[plantX, floorY + potR * 0.7, plantZ]} color="#a3573a" roughness={0.85} />
          <mesh position={[plantX, floorY + potR * 1.6, plantZ]} castShadow>
            <sphereGeometry args={[potR * 1.3, 10, 8]} />
            <meshStandardMaterial color="#4f7f3f" roughness={0.9} />
          </mesh>
          {ceilingLight}
        </group>
      );
    }
    case 'kitchen': {
      const cw = Math.min(room.width * 0.9, 2.4 * scale), cd = 0.55 * scale, ch = 0.85 * scale;
      const counterX = room.x + cw / 2 + 0.15 * scale, counterZ = room.y + cd / 2 + 0.1 * scale;
      // Upper cabinets: mounted on the same wall, above the counter.
      const cabH = 0.55 * scale, cabD = 0.32 * scale;
      const cabY = floorY + 1.55 * scale;
      // Fridge: the room's other corner.
      const fw = Math.min(room.width * 0.3, 0.75 * scale), fd = 0.65 * scale, fh = 1.75 * scale;
      const fx = room.x + room.width - fw / 2 - 0.15 * scale, fz = room.y + fd / 2 + 0.15 * scale;
      return (
        <group>
          <Box size={[cw, ch, cd]} position={[counterX, floorY + ch / 2, counterZ]} color="#d8d8d8" />
          <Box size={[cw * 0.96, ch * 0.35, cd * 0.9]} position={[counterX, floorY + ch * 0.2, counterZ]} color="#b8b8b8" />
          {/* Real marble countertop instead of a flat gray slab. */}
          <Box size={[cw * 0.9, 0.05 * scale, cd * 0.9]} position={[counterX, floorY + ch + 0.03 * scale, counterZ]} color="#ffffff" map={marble.map} normalMap={marble.normalMap} roughnessMap={marble.roughnessMap} roughness={1} />
          <Cyl radiusTop={0.07 * scale} height={0.04 * scale} position={[counterX - cw * 0.18, floorY + ch + 0.06 * scale, counterZ]} color="#222222" />
          <Cyl radiusTop={0.07 * scale} height={0.04 * scale} position={[counterX + cw * 0.18, floorY + ch + 0.06 * scale, counterZ]} color="#222222" />
          {/* Upper cabinets */}
          <Box size={[cw * 0.94, cabH, cabD]} position={[counterX, cabY, counterZ - (cd - cabD) / 2]} color="#c9c9c9" />
          <Box size={[cw * 0.9, 0.02 * scale, cabD]} position={[counterX, cabY - cabH * 0.02, counterZ - (cd - cabD) / 2]} color="#9a9a9a" />
          {/* Fridge */}
          <Box size={[fw, fh, fd]} position={[fx, floorY + fh / 2, fz]} color="#e6e6e6" roughness={0.4} metalness={0.4} />
          <Box size={[fw * 0.06, fh * 0.7, 0.02 * scale]} position={[fx - fw / 2 + fw * 0.1, floorY + fh * 0.55, fz + fd / 2]} color="#9a9a9a" metalness={0.5} />
          {ceilingLight}
        </group>
      );
    }
    case 'bathroom': {
      const toiletX = room.x + room.width - 0.4 * scale, toiletZ = room.y + room.depth - 0.45 * scale;
      const sinkW = Math.min(room.width * 0.4, 0.6 * scale);
      const sinkX = room.x + sinkW / 2 + 0.15 * scale, sinkZ = room.y + 0.35 * scale;
      // Shower: only when the room has real spare floor beyond the sink+toilet corners.
      const showerSize = Math.min(room.width, room.depth) * 0.55;
      const hasShower = (showerSize / scale) > 0.9 && room.width / scale > 1.8 && room.depth / scale > 1.8;
      const showerX = room.x + showerSize / 2 + 0.15 * scale, showerZ = room.y + room.depth - showerSize / 2 - 0.15 * scale;
      return (
        <group>
          <Cyl radiusTop={0.2 * scale} height={0.35 * scale} position={[toiletX, floorY + 0.175 * scale, toiletZ]} color="#ffffff" roughness={0.3} />
          <Box size={[0.3 * scale, 0.28 * scale, 0.16 * scale]} position={[toiletX, floorY + 0.35 * scale + 0.14 * scale, toiletZ - 0.18 * scale]} color="#ffffff" roughness={0.3} />
          <Box size={[sinkW, 0.08 * scale, 0.4 * scale]} position={[sinkX, floorY + 0.75 * scale, sinkZ]} color="#e8f4fb" roughness={0.2} />
          <Cyl radiusTop={0.06 * scale} height={0.7 * scale} position={[sinkX, floorY + 0.35 * scale, sinkZ]} color="#dddddd" roughness={0.3} />
          {/* Mirror above the sink */}
          <Box size={[sinkW * 0.85, 0.4 * scale, 0.02 * scale]} position={[sinkX, floorY + 1.35 * scale, sinkZ - 0.18 * scale]} color="#cfefff" roughness={0.05} metalness={0.7} />
          {hasShower && (
            <>
              <Box size={[showerSize, 0.05 * scale, showerSize]} position={[showerX, floorY + 0.025 * scale, showerZ]} color="#dfe6ea" roughness={0.5} />
              <Box size={[showerSize, 1.8 * scale, 0.02 * scale]} position={[showerX, floorY + 0.9 * scale, showerZ - showerSize / 2]} color="#bcdcea" roughness={0.15} transparent opacity={0.35} />
              <Box size={[0.02 * scale, 1.8 * scale, showerSize]} position={[showerX - showerSize / 2, floorY + 0.9 * scale, showerZ]} color="#bcdcea" roughness={0.15} transparent opacity={0.35} />
            </>
          )}
          {ceilingLight}
        </group>
      );
    }
    case 'dining': {
      const tSize = fit(1.3) * scale;
      const legR = 0.03 * scale, legH = 0.4 * scale, topH = 0.06 * scale;
      const chairSize = 0.4 * scale;
      return (
        <group>
          <Box size={[tSize, topH, tSize * 0.65]} position={[cx, floorY + legH + topH / 2, cz]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          {CORNERS.map(([sx, sz], i) => (
            <Cyl
              key={`tleg-${i}`}
              radiusTop={legR}
              height={legH}
              position={[cx + sx * (tSize / 2 - 0.05 * scale), floorY + legH / 2, cz + sz * (tSize * 0.325 - 0.05 * scale)]}
              color="#5b4632"
            />
          ))}
          {CORNERS.map(([sx, sz], i) => {
            const chx = cx + sx * (tSize / 2 + 0.35 * scale);
            const chz = cz + sz * (tSize * 0.325 + 0.3 * scale);
            return (
              <group key={`chair-${i}`}>
                <Box size={[chairSize, 0.05 * scale, chairSize]} position={[chx, floorY + legH * 0.9, chz]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
                {/* Backrest on the OUTWARD (away from table) edge — fixed: this was
                    on the table-facing edge, seating people with their backs to the
                    table. */}
                <Box size={[chairSize, 0.35 * scale, 0.05 * scale]} position={[chx, floorY + legH * 0.9 + 0.18 * scale, chz + sz * chairSize * 0.45]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
                {CORNERS.map(([lx, lz], j) => (
                  <Cyl
                    key={j}
                    radiusTop={0.02 * scale}
                    height={legH * 0.9}
                    position={[chx + lx * chairSize * 0.4, floorY + legH * 0.45, chz + lz * chairSize * 0.4]}
                    color="#4a3526"
                  />
                ))}
              </group>
            );
          })}
          <Rug x={cx} z={cz} w={Math.min(room.width * 0.75, tSize * 1.9)} d={Math.min(room.depth * 0.75, tSize * 1.6)} floorY={floorY} scale={scale} color={rugColor} />
          {ceilingLight}
        </group>
      );
    }
    case 'garage': {
      const carLen = Math.min(room.depth * 0.8, 4.3 * scale), carW = Math.min(room.width * 0.7, 1.7 * scale);
      const wheelR = 0.28 * scale;
      return (
        <group>
          <Box size={[carW, 0.7 * scale, carLen]} position={[cx, floorY + wheelR + 0.35 * scale, cz]} color="#b33c3c" metalness={0.3} roughness={0.4} />
          <Box size={[carW * 0.8, 0.5 * scale, carLen * 0.45]} position={[cx, floorY + wheelR + 0.95 * scale, cz]} color="#8fa8bf" roughness={0.2} />
          {CORNERS.map(([sx, sz], i) => (
            <Cyl
              key={i}
              radiusTop={wheelR}
              height={0.18 * scale}
              rotation={[0, 0, Math.PI / 2]}
              position={[cx + sx * carW * 0.42, floorY + wheelR, cz + sz * carLen * 0.32]}
              color="#1c1c1c"
              roughness={0.9}
            />
          ))}
          {ceilingLight}
        </group>
      );
    }
    case 'study': {
      const dw = fit(1.1) * scale, dd = fit(0.55) * scale;
      const dx = room.x + 0.7 * scale, dz = room.y + 0.4 * scale;
      const chairSize = 0.4 * scale;
      const chairZ = Math.min(dz + dd * 0.5 + chairSize * 0.6, room.y + room.depth - chairSize * 0.6);
      const shelfW = 0.35 * scale, shelfD = Math.min(room.width * 0.3, 1.1) * scale, shelfH = 2.0 * scale;
      const shelfX = room.x + room.width - shelfW / 2 - 0.1 * scale;
      const shelfZ = room.y + room.depth - shelfD / 2 - 0.1 * scale;
      return (
        <group>
          <Box size={[dw, 0.05 * scale, dd]} position={[dx, floorY + 0.4 * scale, dz]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          {CORNERS.map(([sx, sz], i) => (
            <Cyl
              key={i}
              radiusTop={0.025 * scale}
              height={0.4 * scale}
              position={[dx + sx * dw * 0.45, floorY + 0.2 * scale, dz + sz * dd * 0.42]}
              color="#5b4632"
            />
          ))}
          <Box size={[dw * 0.5, 0.28 * scale, 0.02 * scale]} position={[dx, floorY + 0.4 * scale + 0.14 * scale, dz - dd / 2 + 0.15 * scale]} color="#2b2b2b" />
          {/* facingZ=1: the chair sits further into the room than the desk (larger
              z), so it must face -Z (toward the desk) — fixed: this was facingZ=-1,
              which seated the chair facing away from the desk. */}
          <Chair x={dx} z={chairZ} size={chairSize} floorY={floorY} facingZ={1} map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          <ShelfUnit x={shelfX} z={shelfZ} w={shelfW} d={shelfD} h={shelfH} floorY={floorY} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          {ceilingLight}
        </group>
      );
    }
    case 'hallway': {
      // Runner rug down whichever axis the hallway is actually long along.
      const horizontal = room.width >= room.depth;
      const rugW = horizontal ? room.width * 0.75 : Math.min(room.width * 0.55, 0.8 * scale);
      const rugD = horizontal ? Math.min(room.depth * 0.55, 0.8 * scale) : room.depth * 0.75;
      return (
        <group>
          <Rug x={cx} z={cz} w={rugW} d={rugD} floorY={floorY} scale={scale} color={rugColor} />
          {ceilingLight}
        </group>
      );
    }
    case 'balcony': {
      const chairSize = fit(0.4) * scale;
      const chairX = room.x + room.width - chairSize * 0.9 - 0.15 * scale, chairZ = room.y + room.depth - chairSize * 0.9 - 0.15 * scale;
      const potR = fit(0.22) * scale;
      const potX = room.x + potR + 0.15 * scale, potZ = room.y + potR + 0.15 * scale;
      return (
        <group>
          <Chair x={chairX} z={chairZ} size={chairSize} floorY={floorY} facingZ={1} />
          <Cyl radiusTop={potR * 0.85} radiusBottom={potR} height={potR * 1.4} position={[potX, floorY + potR * 0.7, potZ]} color="#a3573a" roughness={0.85} />
          <mesh position={[potX, floorY + potR * 1.6, potZ]} castShadow>
            <sphereGeometry args={[potR * 1.3, 10, 8]} />
            <meshStandardMaterial color="#4f7f3f" roughness={0.9} />
          </mesh>
        </group>
      );
    }
    case 'utility': {
      const wW = 0.6 * scale, wD = 0.6 * scale, wH = 0.85 * scale;
      const wX = room.x + wW / 2 + 0.15 * scale, wZ = room.y + wD / 2 + 0.15 * scale;
      const shelfW = Math.min(room.width * 0.35, 1.0) * scale, shelfD = 0.35 * scale, shelfH = 1.9 * scale;
      const shelfX = room.x + room.width - shelfW / 2 - 0.12 * scale;
      const shelfZ = room.y + room.depth - shelfD / 2 - 0.12 * scale;
      return (
        <group>
          <Box size={[wW, wH, wD]} position={[wX, floorY + wH / 2, wZ]} color="#e8e8e8" />
          <Cyl radiusTop={wW * 0.32} height={0.04 * scale} rotation={[Math.PI / 2, 0, 0]} position={[wX, floorY + wH * 0.5, wZ + wD / 2 + 0.005 * scale]} color="#2b2b2b" />
          <ShelfUnit x={shelfX} z={shelfZ} w={shelfW} d={shelfD} h={shelfH} floorY={floorY} color="#9a9a9a" trim="#7a7a7a" />
          {ceilingLight}
        </group>
      );
    }
    case 'pooja': {
      // Small wall-mounted shrine shelf with a peaked canopy (coneGeometry
      // with 4 radial segments — a simple pyramidal roof shape) + a diya
      // (small oil lamp). The flame glows fairly bright even by day (real
      // diyas are commonly kept lit day and night) and brighter still at
      // night, same `nightMode`-driven pattern as every other light in
      // this file.
      const shelfW = Math.min(room.width * 0.5, 0.9 * scale), shelfD = 0.28 * scale, shelfH = 0.35 * scale;
      const shelfX = cx, shelfZ = room.y + shelfD / 2 + 0.08 * scale;
      const shelfY = floorY + dims.wallHeight * 0.32;
      const matX = cx, matZ = room.y + room.depth * 0.62;
      return (
        <group>
          <Box size={[shelfW, shelfH, shelfD]} position={[shelfX, shelfY, shelfZ]} color="#ffffff" map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} />
          <mesh position={[shelfX, shelfY + shelfH / 2 + 0.14 * scale, shelfZ]} castShadow>
            <coneGeometry args={[shelfW * 0.42, 0.28 * scale, 4]} />
            <meshStandardMaterial color={rugColor} roughness={0.5} metalness={0.3} />
          </mesh>
          {/* Diya */}
          <Cyl radiusTop={0.05 * scale} height={0.05 * scale} position={[shelfX, shelfY + shelfH / 2 + 0.03 * scale, shelfZ + shelfD * 0.1]} color="#8a6a36" metalness={0.6} roughness={0.3} />
          <mesh position={[shelfX, shelfY + shelfH / 2 + 0.08 * scale, shelfZ + shelfD * 0.1]}>
            <sphereGeometry args={[0.025 * scale, 8, 8]} />
            <meshStandardMaterial color="#ffcf80" emissive="#ff9d3d" emissiveIntensity={nightMode ? 2.5 : 1.2} roughness={0.4} />
          </mesh>
          {/* Floor seating mat */}
          <Rug x={matX} z={matZ} w={Math.min(room.width * 0.4, 0.6 * scale)} d={Math.min(room.depth * 0.3, 0.5 * scale)} floorY={floorY} scale={scale} color={rugColor} />
          {ceilingLight}
        </group>
      );
    }
    case 'gym': {
      const benchW = Math.min(room.width * 0.35, 1.1 * scale), benchD = 0.4 * scale, benchH = 0.32 * scale;
      const benchX = cx, benchZ = room.y + room.depth * 0.35;
      const mirrorW = Math.min(room.width * 0.6, 1.6 * scale), mirrorH = dims.wallHeight * 0.55;
      const mirrorX = cx, mirrorZ = room.y + 0.03 * scale;
      const mirrorY = floorY + mirrorH / 2 + 0.15 * scale;
      const rackW = 0.4 * scale, rackD = Math.min(room.depth * 0.3, 0.9 * scale), rackH = 1.1 * scale;
      const rackX = room.x + room.width - rackW / 2 - 0.15 * scale, rackZ = room.y + room.depth - rackD / 2 - 0.15 * scale;
      return (
        <group>
          {/* Bench */}
          <Box size={[benchW, 0.08 * scale, benchD]} position={[benchX, floorY + benchH, benchZ]} color="#2b2b2b" roughness={0.6} />
          {CORNERS.map(([sx, sz], i) => (
            <Cyl key={i} radiusTop={0.025 * scale} height={benchH} position={[benchX + sx * benchW * 0.42, floorY + benchH / 2, benchZ + sz * benchD * 0.35]} color="#1a1a1a" metalness={0.5} />
          ))}
          {/* Wall mirror */}
          <Box size={[mirrorW, mirrorH, 0.02 * scale]} position={[mirrorX, mirrorY, mirrorZ]} color="#cfefff" roughness={0.05} metalness={0.7} />
          {/* Weight rack + a dumbbell */}
          <ShelfUnit x={rackX} z={rackZ} w={rackW} d={rackD} h={rackH} floorY={floorY} color="#3a3a3a" trim="#2b2b2b" />
          <Cyl radiusTop={0.08 * scale} height={0.22 * scale} rotation={[0, 0, Math.PI / 2]} position={[rackX, floorY + rackH * 0.7, rackZ]} color="#1a1a1a" metalness={0.4} />
          {ceilingLight}
        </group>
      );
    }
    case 'store': {
      const shelfW = 0.4 * scale, shelfD = Math.min(room.depth * 0.7, 1.8 * scale), shelfH = 1.9 * scale;
      const shelfX = room.x + shelfW / 2 + 0.1 * scale, shelfZ = room.y + shelfD / 2 + 0.1 * scale;
      const crateSize = 0.4 * scale;
      const crateX = room.x + room.width - crateSize / 2 - 0.15 * scale;
      const crateZ = room.y + room.depth - crateSize / 2 - 0.15 * scale;
      return (
        <group>
          <ShelfUnit x={shelfX} z={shelfZ} w={shelfW} d={shelfD} h={shelfH} floorY={floorY} color="#9a9a9a" trim="#7a7a7a" />
          <Box size={[crateSize, crateSize * 0.75, crateSize]} position={[crateX, floorY + crateSize * 0.375, crateZ]} color="#8a6a52" roughness={0.85} />
          <Box size={[crateSize * 0.9, crateSize * 0.7, crateSize * 0.9]} position={[crateX, floorY + crateSize * 0.75 + crateSize * 0.35, crateZ]} color="#6b4a36" roughness={0.85} />
          {ceilingLight}
        </group>
      );
    }
    default:
      // balcony (above) intentionally has no ceiling light — it's an open-air
      // feature, unlike every enclosed room type. Everything else unmatched
      // (`other`, and any future/unknown room type) still gets at least the
      // light so no room in the house is ever completely dark/empty.
      return <group>{ceilingLight}</group>;
  }
}
