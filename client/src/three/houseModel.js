// Pure, framework-agnostic layout math: turns a structured house layout (see the
// three accepted shapes below) into a plain-data description of every wall segment,
// window pane, floor tile, stair tread, and roof span. There is no THREE.* in this
// file — the R3F layer (HouseScene.jsx, Walls.jsx, Roof.jsx, Furniture.jsx) maps this
// data onto JSX meshes. Keeping the actual "2D -> 3D" mapping algorithm here, decoupled
// from any rendering library, is what makes it possible to reason about (and unit-test,
// if desired) the mapping in isolation — it's the real correctness guarantee of the
// whole project, so nothing here is invented: every number is read directly off the
// layout's own coordinates.
//
//   2D wall   (x1,y1) -> (x2,y2), on wall side W of room R
//   3D wall = a box (length, wallHeight, thickness) — or the transposed dimensions for
//             a wall running the other axis — centered on the segment's midpoint and
//             raised so its vertical center sits at yBase + wallHeight/2.
//
//   2D door   {room, wall, offset, width}
//   3D door = a GAP left in that wall's geometry (the wall becomes 1-2 separate box
//             segments on either side of the opening instead of one solid box).
//
//   2D window {room, wall, offset, width}
//   3D window = a thin glass box "patched" onto the wall at that offset/width, between
//               windowSill and windowSill+windowHeight — it does not cut a gap.
//
//   2D stairs {fromFloor, x, y, width, depth}
//   3D stairs = 10 box "treads" stacked with increasing y, marching across the stair
//               rectangle's footprint from fromFloor's height to the floor above.
//
//   Floor level (0, 1, 2...)
//   3D floor  = the whole set of the above, translated up by level * floorToFloor.

export const ROOM_COLORS = {
  living: '#f4d58d', bedroom: '#a7c7e7', kitchen: '#b7e4c7', bathroom: '#9fd8ef',
  dining: '#ffcf99', garage: '#c9d1d3', hallway: '#e3e3e3', balcony: '#cdeac0',
  study: '#d0bdf4', utility: '#d8cab8', other: '#e9e9e9',
  pooja: '#f3e0a8', gym: '#b7c9d8', store: '#d9cdb8',
};

export const WALL_COLOR_INTERIOR = '#f5f1ea';
export const WALL_COLOR_EXTERIOR = '#e4d6b8'; // slightly warmer/darker "stucco" tone so the outer shell reads distinctly

// The requirements form's "House Style" field (Modern/Traditional/Contemporary/
// Farmhouse/Compact urban) drives real differences in the generated model — roof
// shape, exterior wall/roof color, ceiling height — not just a label in the title.
// Geometry stays 100% procedural either way: a style only ever picks among these
// small hand-tuned presets, it never invents coordinates. No style (old saved
// designs, samples, the AI/upload path) falls back to exactly the previous look.
const STYLE_PRESETS = {
  modern: { roofType: 'flat', wallColor: '#e9e5da', roofColor: '#c7c0b0', accentColor: '#2b2f36', wallHeightScale: 1.08, windowScale: 1.35 },
  contemporary: { roofType: 'flat', wallColor: '#dcd5c6', roofColor: '#8f8a7c', accentColor: '#33383f', wallHeightScale: 1.05, windowScale: 1.25 },
  'compact urban': { roofType: 'flat', wallColor: '#c98b6b', roofColor: '#9c8f80', accentColor: '#2b2f36', windowScale: 1.1 },
  traditional: { roofType: 'hip', wallColor: '#f0e6d2', roofColor: '#a2543a', accentColor: '#6b4a36' },
  farmhouse: { roofType: 'hip', wallColor: '#ece3d3', roofColor: '#6b4a36', accentColor: '#5b4632', roofHeightScale: 1.25 },
  minimalist: { roofType: 'flat', wallColor: '#f2f0ea', roofColor: '#cfcdc5', accentColor: '#22252b', wallHeightScale: 1.1, windowScale: 1.4 },
  mediterranean: { roofType: 'hip', wallColor: '#f2ddb0', roofColor: '#b5502e', accentColor: '#2b2b2b', roofHeightScale: 1.1 },
  colonial: { roofType: 'hip', wallColor: '#f5f1e6', roofColor: '#3a3f47', accentColor: '#1f1f1f' },
  industrial: { roofType: 'flat', wallColor: '#9a958c', roofColor: '#2b2b2b', accentColor: '#8a4a2f', windowScale: 1.3 },
  scandinavian: { roofType: 'flat', wallColor: '#eae6da', roofColor: '#3d4147', accentColor: '#a67c52', windowScale: 1.2 },
};
const DEFAULT_STYLE_PRESET = { roofType: 'hip', wallColor: WALL_COLOR_EXTERIOR, roofColor: '#a2543a', accentColor: '#8a6a52' };

function resolveStylePreset(style) {
  return STYLE_PRESETS[String(style || '').toLowerCase().trim()] || DEFAULT_STYLE_PRESET;
}

// Wall/window/furniture sizing depends on what unit the layout's coordinates are
// already in — Three.js just treats numbers as "world units", so the fix is to pick
// dimension constants that make sense in whichever unit the room coordinates use.
export const DIMENSIONS = {
  m: {
    wallHeight: 2.8, wallThicknessInterior: 0.1, wallThicknessExterior: 0.2,
    windowSill: 0.9, windowHeight: 1.2, slabThickness: 0.15, roomGap: 0.04,
    eyeHeight: 1.65, walkSpeed: 1.8,
    // Walkthrough collision radius (SceneController.jsx) — deliberately smaller
    // than a realistic human shoulder radius. Doors are DOOR_WIDTH=3ft wide
    // (designGenerator.js) and a wall on each side of the gap inflates inward
    // by this radius, so 2x this value has to stay well under that or a door
    // becomes an impassable bottleneck. 0.15m is the standard "FPS camera
    // capsule" size for exactly this reason.
    collisionRadius: 0.15,
  },
  ft: {
    wallHeight: 9, wallThicknessInterior: 0.35, wallThicknessExterior: 0.6,
    windowSill: 3, windowHeight: 4, slabThickness: 0.5, roomGap: 0.1,
    eyeHeight: 5.5, walkSpeed: 5.9,
    collisionRadius: 0.5,
  },
};
// Furniture is authored in real-world meters regardless of the layout's own unit, then
// scaled into whichever unit the scene is actually built in.
export const M_TO_UNIT = { m: 1, ft: 3.28084 };

// Accepts three layout shapes and normalizes them to one internal form:
//  1. Rule-based generator: { plot:{widthFt,depthFt,unit}, floors:[{level,name}], rooms:[{floor,...}] }
//  2. Gemini-generated / hand-authored: { widthMeters, depthMeters, floors:[{level,rooms}] }
//  3. Very old flat single-floor samples: { widthMeters, depthMeters, rooms:[...] }, no floors array
export function normalizeLayout(layout) {
  let floors, width, depth, unit;

  if (layout.plot) {
    unit = layout.plot.unit || 'ft';
    width = layout.plot.widthFt;
    depth = layout.plot.depthFt;
    const byFloor = new Map();
    (layout.rooms || []).forEach((r) => {
      if (!byFloor.has(r.floor)) byFloor.set(r.floor, []);
      byFloor.get(r.floor).push(r);
    });
    floors = (layout.floors || [{ level: 0 }]).map((f) => ({ level: f.level, rooms: byFloor.get(f.level) || [] }));
  } else {
    unit = 'm';
    width = layout.widthMeters;
    depth = layout.depthMeters;
    floors = Array.isArray(layout.floors) && layout.floors.length && layout.floors[0].rooms
      ? layout.floors
      : [{ level: 0, rooms: layout.rooms || [] }];
  }

  return {
    width, depth, unit,
    style: layout.style || '',
    dims: DIMENSIONS[unit] || DIMENSIONS.m,
    unitScale: M_TO_UNIT[unit] || 1,
    floors,
    doors: layout.doors || [],
    windows: layout.windows || [],
    stairs: layout.stairs || [],
    // Only the rule-based generator produces these (site-plan features outside
    // the building footprint, not floor-scoped rooms) — null for anything else,
    // same "quietly render nothing rather than guess" rule as the entrance porch.
    parking: layout.parking || null,
    openSpace: (layout.plot && layout.plot.openSpace) || null,
  };
}

// A wall side is "exterior" if it lies on the outer boundary of everything built on
// that floor (the floor's footprint) — otherwise it's an interior partition. Simple
// bounding-box check, computed once per floor from the room list.
export function computeFootprint(rooms) {
  if (!rooms.length) return { x: 0, y: 0, width: 0, depth: 0 };
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const maxY = Math.max(...rooms.map((r) => r.y + r.depth));
  return { x: minX, y: minY, width: maxX - minX, depth: maxY - minY };
}

// Cuts `gaps` (door openings) out of a [0, span] run of wall, returning the solid
// sub-runs left over — this is what turns "a door at offset X" into "two shorter wall
// boxes with a gap between them" instead of one solid wall.
export function solidSegments(span, gaps) {
  const sorted = gaps.slice().sort((a, b) => a.offset - b.offset);
  const segments = [];
  let cursor = 0;
  sorted.forEach((g) => {
    const gapStart = Math.max(0, Math.min(span, g.offset));
    const gapEnd = Math.max(0, Math.min(span, g.offset + g.width));
    if (gapStart > cursor) segments.push({ start: cursor, end: gapStart });
    cursor = Math.max(cursor, gapEnd);
  });
  if (cursor < span) segments.push({ start: cursor, end: span });
  return segments;
}

function buildRoomGeometry(room, yBase, doors, windows, footprint, dims) {
  const EPS = 1e-6;
  const sides = [
    { side: 'north', span: room.width, fixed: room.y, exterior: Math.abs(room.y - footprint.y) < EPS },
    { side: 'south', span: room.width, fixed: room.y + room.depth, exterior: Math.abs(room.y + room.depth - (footprint.y + footprint.depth)) < EPS },
    { side: 'west', span: room.depth, fixed: room.x, exterior: Math.abs(room.x - footprint.x) < EPS },
    { side: 'east', span: room.depth, fixed: room.x + room.width, exterior: Math.abs(room.x + room.width - (footprint.x + footprint.width)) < EPS },
  ];

  const wallSegments = [];
  const windowPanes = [];

  sides.forEach(({ side, span, fixed, exterior }) => {
    const thickness = exterior ? dims.wallThicknessExterior : dims.wallThicknessInterior;
    const horizontal = side === 'north' || side === 'south';
    const doorGaps = doors.filter((d) => d.room === room.name && d.wall === side);
    const segs = solidSegments(span, doorGaps);

    segs.forEach(({ start, end }, i) => {
      const length = end - start;
      if (length <= 0.05) return;
      const center = start + length / 2;
      // --- 2D -> 3D wall mapping ---
      // A north/south wall segment runs along X: box(length, height, thickness).
      // An east/west wall segment runs along Z: box(thickness, height, length).
      wallSegments.push({
        key: `${room.name}-${side}-${i}`,
        exterior,
        side,
        size: horizontal ? [length, dims.wallHeight, thickness] : [thickness, dims.wallHeight, length],
        position: horizontal
          ? [room.x + center, yBase + dims.wallHeight / 2, fixed]
          : [fixed, yBase + dims.wallHeight / 2, room.y + center],
      });
    });

    windows
      .filter((w) => w.room === room.name && w.wall === side)
      .forEach((w, i) => {
        const center = w.offset + w.width / 2;
        const cy = yBase + dims.windowSill + dims.windowHeight / 2;
        const glassSize = horizontal
          ? [w.width, dims.windowHeight, thickness + 0.02]
          : [thickness + 0.02, dims.windowHeight, w.width];
        const glassPos = horizontal
          ? [room.x + center, cy, fixed]
          : [fixed, cy, room.y + center];

        // Frame: 4 thin bars forming a border around the glass — plain glass
        // with no casing is nearly invisible against daylight/reflections and
        // easy to miss entirely. Bars sit OUTSIDE the glass's own footprint
        // (never overlapping it), so there's no z-fighting between the two.
        const trim = dims.wallThicknessInterior * 0.45;
        const frameDepth = thickness + 0.05;
        const frame = horizontal
          ? [
              { size: [w.width + trim * 2, trim, frameDepth], position: [room.x + center, cy + dims.windowHeight / 2 + trim / 2, fixed] },
              { size: [w.width + trim * 2, trim, frameDepth], position: [room.x + center, cy - dims.windowHeight / 2 - trim / 2, fixed] },
              { size: [trim, dims.windowHeight, frameDepth], position: [room.x + center - w.width / 2 - trim / 2, cy, fixed] },
              { size: [trim, dims.windowHeight, frameDepth], position: [room.x + center + w.width / 2 + trim / 2, cy, fixed] },
            ]
          : [
              { size: [frameDepth, trim, w.width + trim * 2], position: [fixed, cy + dims.windowHeight / 2 + trim / 2, room.y + center] },
              { size: [frameDepth, trim, w.width + trim * 2], position: [fixed, cy - dims.windowHeight / 2 - trim / 2, room.y + center] },
              { size: [frameDepth, dims.windowHeight, trim], position: [fixed, cy, room.y + center - w.width / 2 - trim / 2] },
              { size: [frameDepth, dims.windowHeight, trim], position: [fixed, cy, room.y + center + w.width / 2 + trim / 2] },
            ];

        // Sill: a small ledge protruding outward from the exterior wall face,
        // just below the glass — the detail that makes a window read as a
        // window even from a distance, not just a gap in the wall. Every
        // window in this app is already on an exterior wall (findWindows only
        // ever places them there), so this always applies.
        const sillDepth = dims.wallThicknessExterior * 0.7;
        const sillThickness = dims.slabThickness * 0.35;
        const sillY = yBase + dims.windowSill - sillThickness / 2;
        const outSign = OUTWARD[side].sign;
        const sillOutward = fixed + outSign * (thickness / 2 + sillDepth / 2);
        const sill = {
          size: horizontal ? [w.width + trim * 3, sillThickness, sillDepth] : [sillDepth, sillThickness, w.width + trim * 3],
          position: horizontal ? [room.x + center, sillY, sillOutward] : [sillOutward, sillY, room.y + center],
        };

        windowPanes.push({ key: `${room.name}-${side}-win-${i}`, side, size: glassSize, position: glassPos, frame, sill });
      });
  });

  return { wallSegments, windowPanes };
}

// Which way a room's wall side faces "outward" (away from the building), in the
// same x/z axes buildRoomGeometry uses — north/south move along z, west/east
// along x. Matches designGenerator.js's convention (y=0 is the road-facing front).
const OUTWARD = {
  north: { axis: 'z', sign: -1, wallCoord: (room) => room.y },
  south: { axis: 'z', sign: 1, wallCoord: (room) => room.y + room.depth },
  west: { axis: 'x', sign: -1, wallCoord: (room) => room.x },
  east: { axis: 'x', sign: 1, wallCoord: (room) => room.x + room.width },
};

// A flat parapet roof — the other shape a style can pick, alongside the hip roof
// (roofGeometry.js). It's a slab plus a 4-sided parapet ring, all plain boxes, so
// unlike the hip roof it needs no hand-built BufferGeometry — Roof.jsx renders it
// straight from JSX <boxGeometry> tags. Takes the actual building footprint rect
// (not assumed to start at the origin — see buildHouseModel's buildingFootprint)
// so it's correctly centered even when the house doesn't start at plot (0,0).
function buildFlatRoofModel(footprint, yTop, overhang, dims) {
  const { width: W, depth: D } = footprint;
  const slabThickness = dims.slabThickness * 2;
  const parapetHeight = dims.wallHeight * 0.22;
  const parapetThickness = dims.wallThicknessExterior * 0.75;
  const outerW = W + overhang * 2;
  const outerD = D + overhang * 2;
  const cx = footprint.x + W / 2, cz = footprint.y + D / 2;
  const halfW = outerW / 2, halfD = outerD / 2;
  const slabY = yTop + slabThickness / 2;
  const parapetY = yTop + slabThickness + parapetHeight / 2;
  return {
    overhang,
    slab: { size: [outerW, slabThickness, outerD], position: [cx, slabY, cz] },
    parapets: [
      { size: [outerW, parapetHeight, parapetThickness], position: [cx, parapetY, cz - halfD + parapetThickness / 2] },
      { size: [outerW, parapetHeight, parapetThickness], position: [cx, parapetY, cz + halfD - parapetThickness / 2] },
      { size: [parapetThickness, parapetHeight, outerD], position: [cx - halfW + parapetThickness / 2, parapetY, cz] },
      { size: [parapetThickness, parapetHeight, outerD], position: [cx + halfW - parapetThickness / 2, parapetY, cz] },
    ],
  };
}

// The main entrance gets a physical marker in 3D, not just a gap in a wall: a
// low step/porch slab outside the door and a canopy overhang on posts, all
// plain procedural boxes (no external asset, same approach as every other
// piece of this model) so it reads unmistakably as "the front door". In
// `wide` mode (traditional/farmhouse styles) the canopy stretches across most
// of the entrance facade on several evenly-spaced posts instead of a small
// 2-post awning right over the door — a proper covered veranda, the massing
// signature those styles are missing today. `facadeSpan` is the building
// footprint's own extent along that facade, so the veranda never reads as
// wider than the house it's attached to.
function buildEntrancePorch(door, room, yBase, dims, colors, wide, facadeSpan) {
  const dir = OUTWARD[door.wall];
  if (!dir || !room) return null;
  const horizontal = door.wall === 'north' || door.wall === 'south';
  const center = door.offset + door.width / 2;
  const alongPos = horizontal ? room.x + center : room.y + center;
  const wallCoord = dir.wallCoord(room);

  const porchDepth = wide
    ? Math.max(dims.windowHeight * 1.1, dims.wallThicknessExterior * 8)
    : Math.max(dims.windowHeight * 0.85, dims.wallThicknessExterior * 6);
  const porchWidth = wide
    ? Math.min((facadeSpan || door.width * 6) * 0.82, door.width + dims.wallThicknessExterior * 34)
    : door.width + dims.wallThicknessExterior * 5;
  const stepThickness = dims.slabThickness * 1.4;
  const stepOut = wallCoord + dir.sign * porchDepth / 2;
  const step = {
    size: horizontal ? [porchWidth, stepThickness, porchDepth] : [porchDepth, stepThickness, porchWidth],
    position: horizontal
      ? [alongPos, yBase + stepThickness / 2, stepOut]
      : [stepOut, yBase + stepThickness / 2, alongPos],
    color: '#b9b3a6', // concrete tone — stays neutral across every style, like the slab it sits on
  };

  const canopyOverhang = porchDepth * 0.95;
  const canopyThickness = dims.wallThicknessInterior;
  const canopyY = yBase + dims.wallHeight * 0.62;
  const canopyOut = wallCoord + dir.sign * canopyOverhang / 2;
  const canopy = {
    size: horizontal ? [porchWidth * 1.05, canopyThickness, canopyOverhang] : [canopyOverhang, canopyThickness, porchWidth * 1.05],
    position: horizontal
      ? [alongPos, canopyY, canopyOut]
      : [canopyOut, canopyY, alongPos],
    color: colors.roofColor, // matches the roof material so the canopy reads as "the same roof, extended"
  };

  const postHeight = canopyY - yBase;
  const postSize = [dims.wallThicknessExterior * 0.55, postHeight, dims.wallThicknessExterior * 0.55];
  const postOut = wallCoord + dir.sign * (canopyOverhang - dims.wallThicknessExterior * 0.4);
  const postCount = wide ? Math.max(4, Math.round(porchWidth / (dims.wallHeight * 1.15))) : 2;
  const postSpan = porchWidth * 0.5 - dims.wallThicknessExterior * 0.6;
  const posts = Array.from({ length: postCount }, (_, i) => {
    const t = postCount === 1 ? 0 : (i / (postCount - 1)) * 2 - 1; // -1..1 across the span
    const offsetPos = alongPos + t * postSpan;
    return {
      key: `entrance-post-${i}`,
      size: postSize,
      position: horizontal
        ? [offsetPos, yBase + postHeight / 2, postOut]
        : [postOut, yBase + postHeight / 2, offsetPos],
      color: colors.accentColor,
    };
  });

  return { step, canopy, posts };
}

// A cylindrical corner tower with a conical cap, projecting from the entrance
// corner and rising above the main roof ridge — the single most recognizable
// "villa" massing signature (see the SketchUp reference this feature was
// requested from), reserved for traditional/farmhouse styles where it actually
// suits the aesthetic. Built entirely from native THREE primitives (cylinder +
// cone), no custom geometry needed. Offset sideways from the door along the
// facade (clear of the veranda/porch) and slightly outward, so it reads as a
// projecting corner element rather than something floating over the doorway.
function buildEntranceTower(door, room, totalHeight, dims, colors) {
  const dir = OUTWARD[door.wall];
  if (!dir || !room) return null;
  const horizontal = door.wall === 'north' || door.wall === 'south';
  const center = door.offset + door.width / 2;
  const alongPos = horizontal ? room.x + center : room.y + center;
  const wallCoord = dir.wallCoord(room);

  const radius = dims.wallThicknessExterior * 3.2;
  const height = totalHeight + dims.wallHeight * 0.9;
  const sideOffset = radius + dims.wallThicknessExterior * 3;
  const outOffset = radius * 0.6;
  const along = alongPos + sideOffset;
  const out = wallCoord + dir.sign * outOffset;
  const position = horizontal ? [along, height / 2, out] : [out, height / 2, along];
  const capHeight = radius * 1.5;
  const capPosition = horizontal ? [along, height + capHeight / 2, out] : [out, height + capHeight / 2, along];

  return {
    radius, height, position, color: colors.wallColor,
    cap: { radius: radius * 1.18, height: capHeight, position: capPosition, color: colors.roofColor },
  };
}

// A cantilevered slab + simple railing projecting from the entrance-facing
// facade of every floor ABOVE the ground floor (the ground floor already has
// the entrance porch/veranda instead) — the real "premium villa" signature
// this model was missing. Uses that floor's OWN footprint (computeFootprint),
// not the whole building's, so an upper floor that's a different shape than
// the ground floor still gets a balcony sized to itself, not something
// floating past its own walls.
function buildBalconies(floors, entranceWall, dims) {
  const dir = OUTWARD[entranceWall];
  if (!dir) return [];
  const horizontal = entranceWall === 'north' || entranceWall === 'south';
  const slabThickness = dims.slabThickness * 1.2;
  const projection = dims.wallHeight * 0.5;
  const railHeight = dims.wallHeight * 0.42;
  const balusterSpacing = dims.wallThicknessExterior * 2.5;
  const balusterSize = dims.wallThicknessExterior * 0.35;

  const balconies = [];
  floors.forEach((floor, i) => {
    if (i === 0) return;
    // `floor.rooms` here is buildHouseModel's own processed per-room wrapper
    // ({ room, wallSegments, ... }), not the raw layout rects computeFootprint
    // expects — unwrap `.room` (falls back to the entry itself for a raw shape).
    const footprint = computeFootprint(floor.rooms.map((r) => r.room || r));
    if (!footprint.width || !footprint.depth) return;
    const span = horizontal ? footprint.width : footprint.depth;
    const along = horizontal ? footprint.x + footprint.width / 2 : footprint.y + footprint.depth / 2;
    const balconyWidth = span * 0.6;
    const wallCoord = dir.wallCoord(footprint);
    const slabOut = wallCoord + dir.sign * (projection / 2);
    const outerEdge = wallCoord + dir.sign * projection;
    const railY = floor.yBase + slabThickness + railHeight / 2;

    const slab = {
      size: horizontal ? [balconyWidth, slabThickness, projection] : [projection, slabThickness, balconyWidth],
      position: horizontal ? [along, floor.yBase + slabThickness / 2, slabOut] : [slabOut, floor.yBase + slabThickness / 2, along],
    };

    const balusterCount = Math.max(3, Math.round(balconyWidth / balusterSpacing));
    const balusters = Array.from({ length: balusterCount }, (_, bi) => {
      const t = balusterCount === 1 ? 0.5 : bi / (balusterCount - 1);
      const alongPos = along - balconyWidth / 2 + t * balconyWidth;
      return {
        size: [balusterSize, railHeight, balusterSize],
        position: horizontal ? [alongPos, railY, outerEdge] : [outerEdge, railY, alongPos],
      };
    });

    const railTop = {
      size: horizontal ? [balconyWidth + 0.1, dims.wallThicknessInterior * 0.6, balusterSize * 1.3] : [balusterSize * 1.3, dims.wallThicknessInterior * 0.6, balconyWidth + 0.1],
      position: horizontal ? [along, floor.yBase + slabThickness + railHeight, outerEdge] : [outerEdge, floor.yBase + slabThickness + railHeight, along],
    };

    balconies.push({ key: `balcony-${i}`, floor: i, slab, balusters, railTop });
  });
  return balconies;
}

// Encloses the dedicated stairs strip (designGenerator.js's planSite()
// reserves this as a room-free zone so stairs never clip through a room)
// with real walls. Without this, the stairwell is open to the outside on 3
// of its 4 sides — only ROOMS ever produce wall geometry elsewhere in this
// file, and nothing else ever closes off a zone no room occupies. Spans the
// FULL building height in one piece (not per-floor): there's no floor slab
// interrupting the shaft at any level, so a single tall wall avoids
// inter-floor seams. `roomFootprint` is every floor's rooms unioned
// together (stairs excluded) — whichever of the strip's two X-edges sits at
// that footprint's own edge is the room-facing side (already has a wall,
// from each adjoining room's own wall loop); the OTHER edge is the true
// exterior face this function adds, plus the two end caps nothing else ever
// covers (no room ever extends into the stairs' own x-range).
function buildStairwellWalls(stairsRect, roomFootprint, totalHeight, dims) {
  const t = dims.wallThicknessExterior;
  const midY = totalHeight / 2;
  const stairsRight = stairsRect.x + stairsRect.width;
  const exteriorIsLeft = Math.abs(stairsRight - roomFootprint.x) < 0.5;
  const exteriorX = exteriorIsLeft ? stairsRect.x : stairsRight;

  return [
    {
      key: 'stairwell-exterior',
      size: [t, totalHeight, stairsRect.depth],
      position: [exteriorX, midY, stairsRect.y + stairsRect.depth / 2],
    },
    {
      key: 'stairwell-front',
      size: [stairsRect.width, totalHeight, t],
      position: [stairsRect.x + stairsRect.width / 2, midY, stairsRect.y],
    },
    {
      key: 'stairwell-back',
      size: [stairsRect.width, totalHeight, t],
      position: [stairsRect.x + stairsRect.width / 2, midY, stairsRect.y + stairsRect.depth],
    },
  ];
}

// A palm (tapered trunk + a radial cluster of drooping fronds) or ornamental
// tree (short trunk + layered sphere canopy) — both built from plain THREE
// primitives (cylinder/sphere), same "no external assets" rule as everything
// else. `dims.wallHeight` anchors real-world scale (a palm reads as ~1.4x a
// storey tall, an ornamental tree about half that) regardless of unit.
function buildTree(type, position, dims) {
  if (type === 'palm') {
    const trunkHeight = dims.wallHeight * 1.4;
    const trunkRadiusBase = dims.wallThicknessExterior * 0.45;
    return {
      type, position,
      trunk: { height: trunkHeight, radiusBase: trunkRadiusBase, radiusTop: trunkRadiusBase * 0.55 },
      fronds: { count: 7, length: trunkHeight * 0.55, atY: trunkHeight },
    };
  }
  const trunkHeight = dims.wallHeight * 0.55;
  const canopyRadius = dims.wallHeight * 0.55;
  return {
    type, position,
    trunk: { height: trunkHeight, radiusBase: dims.wallThicknessExterior * 0.4, radiusTop: dims.wallThicknessExterior * 0.3 },
    canopy: [
      { radius: canopyRadius, atY: trunkHeight + canopyRadius * 0.7 },
      { radius: canopyRadius * 0.7, atY: trunkHeight + canopyRadius * 1.5 },
    ],
  };
}

// Garden / open space: a raised lawn pad (reads as deliberate landscaping, not
// just "the same ground plane") plus procedural landscaping — trees, a low
// bush, and (space permitting) a pool — same no-external-assets approach as
// everything else, positions derived deterministically from the rect's own
// size (fractions of it) rather than randomized, so the same design always
// renders identically.
function buildOpenSpaceModel(openSpace, dims) {
  const padThickness = dims.slabThickness * 0.4;
  const pad = {
    size: [openSpace.width, padThickness, openSpace.depth],
    position: [openSpace.x + openSpace.width / 2, padThickness / 2, openSpace.y + openSpace.depth / 2],
  };
  const padTop = padThickness;

  // A pool only fits a genuinely garden-sized plot — anything smaller keeps
  // today's lawn-only look (no regression on compact plots). Thresholds are
  // in dims.wallHeight multiples so they scale correctly whether the layout's
  // unit is meters or feet. The rule-based generator's garden rect is
  // typically wide-and-shallow (a front-yard strip along the road, bounded by
  // the site's front setback) rather than square, so the depth threshold is
  // deliberately much looser than the width one — confirmed against real
  // generator output (a 78x18ft garden strip should still fit a pool).
  const fitsPool = openSpace.width >= dims.wallHeight * 3.2 && openSpace.depth >= dims.wallHeight * 1.7;
  let pool = null;
  if (fitsPool) {
    const poolW = Math.min(openSpace.width * 0.5, dims.wallHeight * 3.2);
    const poolD = Math.min(openSpace.depth * 0.45, dims.wallHeight * 2.2);
    const cx = openSpace.x + openSpace.width * 0.74;
    const cz = openSpace.y + openSpace.depth * 0.68;
    const coping = dims.wallThicknessExterior * 1.6;
    const copingThickness = padThickness;
    const rim = dims.slabThickness * 0.6;
    const basinDepth = dims.wallHeight * 0.55;
    const waterInset = dims.wallThicknessExterior * 0.5;
    pool = {
      coping: {
        size: [poolW + coping * 2, copingThickness, poolD + coping * 2],
        position: [cx, padTop - copingThickness / 2, cz],
      },
      basin: {
        size: [poolW, basinDepth, poolD],
        position: [cx, padTop - rim - basinDepth / 2, cz],
      },
      water: {
        size: [poolW - waterInset, poolD - waterInset],
        position: [cx, padTop - rim - dims.slabThickness * 0.2, cz],
      },
    };
  }

  // Landscaping spots as fractions of the open-space rect — hand-placed so
  // they read as intentional planting, not a random scatter, and (when a pool
  // is present) sit clear of its reserved back-right corner: palms flank the
  // poolside, the ornamental tree and low bush sit toward the house-facing edge.
  const spots = fitsPool
    ? [
        { type: 'palm', fx: 0.47, fy: 0.68 },
        { type: 'palm', fx: 0.9, fy: 0.9 },
        { type: 'ornamental', fx: 0.16, fy: 0.22 },
        { type: 'bush', fx: 0.2, fy: 0.55 },
      ]
    : [
        { type: 'ornamental', fx: 0.2, fy: 0.3 },
        { type: 'bush', fx: 0.5, fy: 0.65 },
        { type: 'bush', fx: 0.8, fy: 0.35 },
      ];

  const bushRadius = Math.min(openSpace.width, openSpace.depth) * 0.14;
  const trees = [];
  const bushes = [];
  spots.forEach((spot, i) => {
    const position = [openSpace.x + openSpace.width * spot.fx, 0, openSpace.y + openSpace.depth * spot.fy];
    if (spot.type === 'bush') {
      bushes.push({ key: `bush-${i}`, radius: Math.max(0.3, bushRadius * (0.8 + (i % 2) * 0.3)), position });
    } else {
      trees.push({ key: `tree-${i}`, ...buildTree(spot.type, position, dims) });
    }
  });

  return { pad, bushes, trees, pool };
}

// Covered parking / garage: a paved pad plus a pergola-style canopy (a lattice
// of parallel beams + a few cross-beams, all resting on the same 4 corner
// posts) — reads as an open, premium pergola rather than a solid flat panel,
// while still being visually "covered", matching the requirement's own label
// ("Needs covered parking").
function buildParkingModel(parking, dims) {
  const padThickness = dims.slabThickness * 0.5;
  const pad = {
    size: [parking.width, padThickness, parking.depth],
    position: [parking.x + parking.width / 2, padThickness / 2, parking.y + parking.depth / 2],
  };
  const postHeight = dims.wallHeight * 0.85;
  const beamThickness = dims.wallThicknessInterior * 1.2;
  // Slight overhang past the pad edge on 3 sides — but the parking pad's own
  // front edge (parking.y) already sits flush against the plot's road-facing
  // line, so overhanging that side too would push the canopy past the property
  // boundary into the road (found via testing: it was reaching z<0, which also
  // threw off the camera's auto-framing since that geometry dominated the
  // scene's bounding box). Clamp so the front edge never goes past parking.y.
  const canopyMargin = dims.wallThicknessExterior;
  const canopyFrontY = Math.max(parking.y, parking.y - canopyMargin);
  const canopyBackY = parking.y + parking.depth + canopyMargin;
  const canopyLeftX = parking.x - canopyMargin;
  const canopyRightX = parking.x + parking.width + canopyMargin;
  const canopyY = postHeight + beamThickness / 2;
  // Main beams run along Z (depth), evenly spaced across X (width) — the
  // primary pergola members a post would actually carry.
  const beamCount = Math.max(3, Math.round((canopyRightX - canopyLeftX) / (dims.wallThicknessExterior * 2.2)));
  const beamWidth = dims.wallThicknessExterior * 0.5;
  const beams = Array.from({ length: beamCount }, (_, i) => {
    const t = beamCount === 1 ? 0.5 : i / (beamCount - 1);
    const x = canopyLeftX + t * (canopyRightX - canopyLeftX);
    return { key: `carport-beam-${i}`, size: [beamWidth, beamThickness, canopyBackY - canopyFrontY], position: [x, canopyY, (canopyFrontY + canopyBackY) / 2] };
  });
  // Cross-beams run along X, sitting a touch higher than the main beams so the
  // lattice reads correctly (cross members resting on top).
  const crossCount = 3;
  const crossBeams = Array.from({ length: crossCount }, (_, i) => {
    const t = (i + 0.5) / crossCount;
    const z = canopyFrontY + t * (canopyBackY - canopyFrontY);
    return { key: `carport-cross-${i}`, size: [canopyRightX - canopyLeftX, beamThickness * 0.8, beamWidth], position: [(canopyLeftX + canopyRightX) / 2, canopyY + beamThickness * 0.8, z] };
  });
  const postSize = [dims.wallThicknessExterior * 0.6, postHeight, dims.wallThicknessExterior * 0.6];
  const postInsetX = parking.width / 2 - dims.wallThicknessExterior;
  const postInsetY = parking.depth / 2 - dims.wallThicknessExterior;
  const cx = parking.x + parking.width / 2;
  const cy = parking.y + parking.depth / 2;
  const posts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => ({
    key: `carport-post-${i}`,
    size: postSize,
    position: [cx + sx * postInsetX, postHeight / 2, cy + sy * postInsetY],
  }));
  return { pad, canopy: { beams, crossBeams }, posts };
}

// Compound/boundary wall with a gated driveway opening — a low perimeter wall
// running around the whole PLOT (not just the building), the single most
// recognizable "premium gated property" signal in real residential design.
// Always present (not tied to a requirement checkbox) as a general visual
// upgrade, same reasoning as the entrance porch. The gate lines up with the
// parking pad's own width when there is one (so the driveway actually leads
// through it), or sits centered on the plot's frontage otherwise.
function buildBoundaryWallModel(plotWidth, plotDepth, gateCenter, gateWidth, dims) {
  const wallHeight = dims.wallHeight * 0.42;
  const wallThickness = dims.wallThicknessExterior * 0.65;
  const pillarSize = wallThickness * 2.4;
  const pillarHeight = wallHeight * 1.3;
  const inset = wallThickness / 2;

  const segments = [
    { key: 'boundary-rear', size: [plotWidth, wallHeight, wallThickness], position: [plotWidth / 2, wallHeight / 2, plotDepth - inset] },
    { key: 'boundary-west', size: [wallThickness, wallHeight, plotDepth], position: [inset, wallHeight / 2, plotDepth / 2] },
    { key: 'boundary-east', size: [wallThickness, wallHeight, plotDepth], position: [plotWidth - inset, wallHeight / 2, plotDepth / 2] },
  ];

  // Front (road-facing) wall, split around the gate gap.
  const gateStart = Math.max(0, gateCenter - gateWidth / 2);
  const gateEnd = Math.min(plotWidth, gateCenter + gateWidth / 2);
  if (gateStart > 0.5) {
    segments.push({ key: 'boundary-front-left', size: [gateStart, wallHeight, wallThickness], position: [gateStart / 2, wallHeight / 2, inset] });
  }
  if (plotWidth - gateEnd > 0.5) {
    segments.push({
      key: 'boundary-front-right',
      size: [plotWidth - gateEnd, wallHeight, wallThickness],
      position: [gateEnd + (plotWidth - gateEnd) / 2, wallHeight / 2, inset],
    });
  }

  // Pillars at the 2 rear corners and flanking the gate — taller than the
  // wall itself and capped with the style's accent color, so the entrance
  // reads clearly even before the gate itself registers.
  const pillarSpots = [
    [inset, plotDepth - inset], [plotWidth - inset, plotDepth - inset],
    [gateStart, inset], [gateEnd, inset],
  ];
  const pillars = pillarSpots.map(([x, z], i) => ({
    key: `boundary-pillar-${i}`,
    size: [pillarSize, pillarHeight, pillarSize],
    position: [x, pillarHeight / 2, z],
  }));

  return { segments, pillars };
}

// The single entry point: normalizes any of the three accepted layout shapes and
// produces a fully-computed, framework-agnostic description of the whole scene.
export function buildHouseModel(rawLayout) {
  const layout = normalizeLayout(rawLayout);
  const preset = resolveStylePreset(layout.style);
  // Only wallHeight is scaled here (a taller-ceiling "grander" feel for some
  // styles) — everything else (eyeHeight, walkSpeed, thicknesses) stays exactly
  // as authored, so this can't silently affect walkthrough speed or camera math.
  const dims = {
    ...layout.dims,
    wallHeight: layout.dims.wallHeight * (preset.wallHeightScale || 1),
    // Bigger glass reads as more premium/modern — Modern/Contemporary/Compact
    // urban each get a windowScale; Traditional/Farmhouse omit it (1) since
    // smaller punched windows suit those styles. Window WIDTH stays exactly
    // as the 2D design placed it (that's real, validated geometry from
    // designGenerator.js); only the 3D-only height/sill are style-scaled, the
    // same "never touch validated 2D numbers" rule wallHeightScale follows.
    windowHeight: layout.dims.windowHeight * (preset.windowScale || 1),
    windowSill: layout.dims.windowSill / (preset.windowScale || 1),
  };
  const unitScale = layout.unitScale;
  const floorToFloor = dims.wallHeight + dims.slabThickness * 2;
  const W = layout.width, D = layout.depth;
  const cx = W / 2, cz = D / 2;
  const floorCount = layout.floors.length;
  const totalHeight = floorCount * floorToFloor;
  const roomGap = dims.roomGap;
  const slabOverhang = dims.slabThickness * 2;

  const floors = layout.floors.map((floor) => {
    const yBase = floor.level * floorToFloor;
    const doors = layout.doors.filter((d) => d.floor === floor.level);
    const windows = layout.windows.filter((w) => w.floor === floor.level);
    const footprint = computeFootprint(floor.rooms);

    const rooms = floor.rooms.map((room) => {
      const rx = room.x + room.width / 2;
      const rz = room.y + room.depth / 2;
      const { wallSegments, windowPanes } = buildRoomGeometry(room, yBase, doors, windows, footprint, dims);
      return {
        key: `${floor.level}-${room.name}`,
        room,
        color: ROOM_COLORS[room.type] || ROOM_COLORS.other,
        // --- 2D -> 3D floor slab mapping: a room rectangle becomes a thin box of
        // that exact width/depth, centered on the rectangle, resting on the slab.
        floorTile: {
          size: [Math.max(0.1, room.width - roomGap), dims.slabThickness * 0.5, Math.max(0.1, room.depth - roomGap)],
          position: [rx, yBase + (dims.slabThickness * 0.5) / 2, rz],
        },
        wallSegments,
        windowPanes,
        label: { text: room.name, position: [rx, yBase + dims.wallHeight + dims.windowSill * 0.5, rz] },
      };
    });

    return { level: floor.level, yBase, rooms };
  });

  // Needed to tell which long edge of the stairs strip faces away from every
  // room (the true exterior face) — designGenerator.js's planSite() carves
  // the strip out of the buildable area specifically so no room ever
  // occupies it, so this footprint (rooms only, stairs excluded) never
  // overlaps the strip; whichever of the strip's two X-edges sits AT this
  // footprint's own edge is the room-facing side, the other is exterior.
  // Used below for both the stairs' wall-mounted handrail and
  // buildStairwellWalls further down.
  const roomFootprintAllFloors = computeFootprint(layout.floors.flatMap((f) => f.rooms));

  const stairs = layout.stairs.map((stair, i) => {
    const fromY = stair.fromFloor * floorToFloor;
    const steps = 10;
    const stepHeight = floorToFloor / steps;
    const stepDepth = stair.depth / steps;
    const treads = Array.from({ length: steps }, (_, s) => ({
      size: [stair.width, stepHeight, stepDepth],
      position: [stair.x + stair.width / 2, fromY + stepHeight * (s + 0.5), stair.y + stepDepth * (s + 0.5)],
    }));

    // Wall-mounted handrail, one short segment per step, on the room-facing
    // side. Unlike a balcony's open edge, the stairwell is enclosed by real
    // walls on BOTH long sides once buildStairwellWalls runs below (the
    // treads already span the strip's full width) — so a rail bracketed to
    // the wall is the realistic fit here, not free-standing balusters.
    const stairsRight = stair.x + stair.width;
    const roomSideIsRight = Math.abs(stairsRight - roomFootprintAllFloors.x) < 0.5;
    const railInset = dims.wallThicknessExterior * 1.2;
    const railX = roomSideIsRight ? stairsRight - railInset : stair.x + railInset;
    const railHeight = dims.wallHeight * 0.42;
    const railBarSize = dims.wallThicknessExterior * 0.3;
    const rail = Array.from({ length: steps }, (_, s) => ({
      size: [railBarSize, railBarSize, stepDepth * 0.95],
      position: [railX, fromY + stepHeight * (s + 1) + railHeight, stair.y + stepDepth * (s + 0.5)],
    }));

    return {
      key: `stair-${i}`,
      fromFloor: stair.fromFloor,
      treads,
      rail,
      label: { text: 'Stairs', position: [stair.x + stair.width / 2, fromY + floorToFloor + 0.3, stair.y + stair.depth / 2] },
    };
  });

  // The roof/slab must cover the actual BUILDING footprint, not the full plot:
  // `W`/`D` are the plot's own dimensions, but the rule-based generator always
  // reserves a front setback for the road/parking/garden (site.frontSetback in
  // designGenerator.js — present even with no garden/parking requested, min
  // 6ft), so the building itself starts short of the plot's front edge. Using
  // the plot's full depth here made the roof silently overhang the entrance by
  // that whole setback on every design — invisible against a plain lawn, but
  // obviously wrong once there's a garden/parking pad sitting under it (found
  // via this exact rendering bug). The building's real footprint is just the
  // union of every room (any floor) and the stairs shaft.
  const allRoomsAllFloors = layout.floors.flatMap((f) => f.rooms);
  const stairsRects = layout.stairs.map((s) => ({ x: s.x, y: s.y, width: s.width, depth: s.depth }));
  const buildingFootprint = allRoomsAllFloors.length || stairsRects.length
    ? computeFootprint([...allRoomsAllFloors, ...stairsRects])
    : { x: 0, y: 0, width: W, depth: D };
  const bcx = buildingFootprint.x + buildingFootprint.width / 2;
  const bcz = buildingFootprint.y + buildingFootprint.depth / 2;

  // The actual stairs fix: enclose the strip designGenerator.js reserved for
  // it — see buildStairwellWalls' own header comment for why this was open
  // to the outside on 3 sides without it. One stairs entry is enough (every
  // entry shares the same x/y/width/depth — "a fixed-position vertical
  // staircase strip shared by every floor," designGenerator.js) since this
  // spans the whole building height in one piece.
  const stairwellWalls = stairsRects.length
    ? buildStairwellWalls(stairsRects[0], roomFootprintAllFloors, totalHeight, dims)
    : [];

  // Roof: the style preset picks the SHAPE (flat parapet vs. hip), not just the
  // color. Flat roofs are plain boxes (buildFlatRoofModel, above); the hip roof's
  // actual geometry construction lives in roofGeometry.js since it needs THREE.
  const roofOverhang = dims.wallThicknessExterior * 2;
  const roof = preset.roofType === 'flat'
    ? { type: 'flat', color: preset.roofColor, ...buildFlatRoofModel(buildingFootprint, totalHeight, roofOverhang, dims) }
    : {
        type: 'hip', color: preset.roofColor,
        center: [bcx, totalHeight, bcz], width: buildingFootprint.width, depth: buildingFootprint.depth,
        height: Math.min(buildingFootprint.width, buildingFootprint.depth) * 0.28 * (preset.roofHeightScale || 1),
        overhang: roofOverhang,
      };

  // Entrance porch: only the rule-based generator tags a door `isEntrance` (see
  // designGenerator.js's findEntranceDoor) — an AI/upload-derived layout simply
  // won't have one, so this quietly renders nothing rather than guessing.
  // Traditional/farmhouse styles get the "wide veranda" treatment (a proper
  // covered porch spanning the facade on several posts, plus a corner tower)
  // — the massing signature that makes those styles read as a real villa
  // instead of just a different roof color on the same box.
  const styleKey = String(layout.style || '').toLowerCase().trim();
  const isVillaStyle = styleKey === 'traditional' || styleKey === 'farmhouse';
  const entranceDoor = layout.doors.find((d) => d.floor === 0 && d.isEntrance);
  const groundFloorRooms = (layout.floors.find((f) => f.level === 0) || {}).rooms || [];
  const entranceRoom = entranceDoor ? groundFloorRooms.find((r) => r.name === entranceDoor.room) : null;
  const entranceFacadeSpan = entranceDoor && (entranceDoor.wall === 'north' || entranceDoor.wall === 'south')
    ? buildingFootprint.width
    : buildingFootprint.depth;
  const entrancePorch = entranceDoor && entranceRoom
    ? buildEntrancePorch(entranceDoor, entranceRoom, 0, dims, preset, isVillaStyle, entranceFacadeSpan)
    : null;
  const entranceTower = isVillaStyle && entranceDoor && entranceRoom
    ? buildEntranceTower(entranceDoor, entranceRoom, totalHeight, dims, preset)
    : null;
  // Balconies need SOME facade to project from — reuse the entrance wall when
  // known, otherwise there's no principled "front" to pick, so quietly skip
  // (same "render nothing rather than guess" rule as the porch above).
  const balconies = entranceDoor ? buildBalconies(floors, entranceDoor.wall, dims) : [];
  // Same door, expressed as a wall-plane opening (position along the wall +
  // width) instead of a 3D porch — what elevations.js needs to draw the front
  // door as a rectangle on the correct facade.
  const entranceOpening = entranceDoor && entranceRoom
    ? {
        wall: entranceDoor.wall,
        along: (entranceDoor.wall === 'north' || entranceDoor.wall === 'south')
          ? entranceRoom.x + entranceDoor.offset + entranceDoor.width / 2
          : entranceRoom.y + entranceDoor.offset + entranceDoor.width / 2,
        width: entranceDoor.width,
      }
    : null;

  // Site features outside the building footprint — see buildOpenSpaceModel/
  // buildParkingModel above. Both null unless the rule-based generator actually
  // planned one (requirements.garden / requirements.parking).
  const openSpaceModel = layout.openSpace ? buildOpenSpaceModel(layout.openSpace, dims) : null;
  const parkingModel = layout.parking ? buildParkingModel(layout.parking, dims) : null;
  // Boundary wall + gate: only meaningful for the rule-based generator's own
  // plot shape (W/D here are the actual plot, not just widthMeters/depthMeters
  // guessed from an AI-vision room layout that has no real "plot line") — an
  // uploaded/AI-derived design has no `plot` at all (normalizeLayout's `else`
  // branch), so this quietly skips rather than fencing in a guessed boundary.
  const boundaryWall = rawLayout.plot
    ? buildBoundaryWallModel(
        W, D,
        layout.parking ? layout.parking.x + layout.parking.width / 2 : W / 2,
        layout.parking ? layout.parking.width + 4 : Math.min(14, W * 0.4),
        dims
      )
    : null;

  // Lantern fixtures: a small warm-glow accent (emissive material, no real
  // light source — kept cheap) on the entrance porch posts and the gate
  // pillars, the classic "arriving at dusk" luxury-listing touch.
  const lanternSpots = [];
  if (entrancePorch) {
    entrancePorch.posts.forEach((p) => lanternSpots.push([p.position[0], p.position[1] + p.size[1] / 2 + 0.15, p.position[2]]));
  }
  if (boundaryWall) {
    boundaryWall.pillars.slice(2, 4).forEach((p) => lanternSpots.push([p.position[0], p.position[1] + p.size[1] / 2 + 0.15, p.position[2]]));
  }
  const lanternRadius = dims.wallThicknessExterior * 0.35;
  const lanterns = lanternSpots.map((position, i) => ({ key: `lantern-${i}`, position, radius: lanternRadius }));

  return {
    unit: layout.unit, dims, unitScale,
    style: layout.style, wallColorExterior: preset.wallColor, accentColor: preset.accentColor,
    width: W, depth: D, floorToFloor, totalHeight, floorCount,
    ground: { size: Math.max(W, D) * 3, position: [cx, -0.02, cz] },
    // Same building-footprint fix as the roof above — the foundation slab should
    // sit under the house, not sprawl across the front setback/garden/parking too.
    slab: {
      size: [buildingFootprint.width + slabOverhang, dims.slabThickness, buildingFootprint.depth + slabOverhang],
      position: [bcx, -dims.slabThickness / 2, bcz],
    },
    floors,
    stairs,
    stairwellWalls,
    openSpace: openSpaceModel,
    parking: parkingModel,
    boundaryWall,
    lanterns,
    entrancePorch,
    entranceTower,
    balconies,
    entranceWall: entranceDoor?.wall || null,
    entranceOpening,
    buildingFootprint,
    roof,
  };
}
