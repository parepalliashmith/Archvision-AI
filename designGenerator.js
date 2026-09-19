// Rule-based / constraint-based House Design Generator.
//
// Deliberately NOT an LLM call: an LLM can describe a house in words, but asking one to
// output precise, non-overlapping room coordinates that exactly tile a given plot is
// asking it to do CAD geometry — something language models are unreliable at. Real
// procedural floor-plan tools (and this generator) instead use a geometric algorithm:
// recursive area-proportional rectangle subdivision, a technique closely related to
// "guillotine cutting" and treemap layout algorithms. It GUARANTEES, by construction:
//   - every room is an axis-aligned rectangle,
//   - no two rooms on the same floor ever overlap,
//   - the assigned rooms exactly tile the available floor area (no gaps),
//   - the whole layout stays within the given plot's outer dimensions.
//
// Units: this module works natively in FEET, since Indian residential plot sizes are
// conventionally quoted that way (e.g. "30x40 site"). x runs across the plot's width,
// y runs across its depth, with y = 0 being the front (road-facing) edge of the plot.

const { estimateCostFromSqft } = require('./costEstimator');

const ROOM_TYPES = [
  'living', 'bedroom', 'kitchen', 'bathroom', 'dining',
  'garage', 'hallway', 'balcony', 'study', 'utility', 'other',
  'pooja', 'gym', 'store',
];
const WALL_SIDES = ['north', 'south', 'east', 'west'];

// ---------------------------------------------------------------------------
// Step 1 — Room program: turn requirement counts into a concrete list of rooms
// per floor, each with a *target area* (used as a weight for proportional
// subdivision, not a hard size — see buildFloorLayout below).
// ---------------------------------------------------------------------------

const TARGET_AREA_SQFT = {
  living: 200,
  kitchen: 100,
  dining: 100,
  masterBedroom: 150,
  bedroom: 120,
  bathroom: 36,
  pooja: 20,
  gym: 90,
  store: 30,
};

const LIVING_ROOM_SIZE_MULTIPLIER = {
  compact: 0.75,
  medium: 1,
  'large / open-plan': 1.5,
};

// ---------------------------------------------------------------------------
// Variation profiles — power "Generate Another Design". Each one nudges the
// SAME deterministic algorithm below toward a structurally different result
// by changing relative room-size weights, the order rooms are handed to
// `subdivide` (which changes how they get paired up as the rectangle is cut),
// and which side of the plot the staircase strip sits on. Because `subdivide`
// always allocates area strictly proportional to these weights and exactly
// tiles whatever rectangle it's given, every profile still guarantees the
// same plot, the same room list, the same total floor area (so essentially
// the same cost estimate) and zero overlaps — only the arrangement changes.
// Cycling through them (seed % length) means repeat clicks keep producing a
// different one of these four each time, wrapping around rather than
// repeating the design the user just rejected.
const VARIATION_PROFILES = [
  { livingScale: 1, bedroomScale: 1, staircaseSide: 'start', reverseUpperOrder: false, swapGroundOrder: false },
  { livingScale: 0.7, bedroomScale: 1.3, staircaseSide: 'end', reverseUpperOrder: true, swapGroundOrder: false },
  { livingScale: 1.25, bedroomScale: 0.85, staircaseSide: 'start', reverseUpperOrder: false, swapGroundOrder: true },
  { livingScale: 0.85, bedroomScale: 1.15, staircaseSide: 'end', reverseUpperOrder: true, swapGroundOrder: true },
];

function pickVariationProfile(seed) {
  const n = Number.isFinite(Number(seed)) ? Math.max(0, Math.floor(Number(seed))) : 0;
  return VARIATION_PROFILES[n % VARIATION_PROFILES.length];
}

function buildRoomProgram({ bedrooms, bathrooms, floors, buildableAreaPerFloor, livingRoomSize, profile, overrides, wantsPoojaRoom, wantsGym, wantsStoreRoom }) {
  const floorPrograms = Array.from({ length: floors }, () => []);
  // Per-room-type multipliers from conversational edits ("make the kitchen
  // bigger" -> designModifier.js sets overrides.kitchen) — see server.js's
  // /api/design/chat-modify route. Defaults to a no-op (1), so a design with no
  // chat history behaves exactly as before. NOTE: this only ever redistributes
  // the SAME total tiled area between rooms (subdivide() always exactly fills
  // whatever rectangle it's given, regardless of relative weights) — it can't
  // change the total built-up area or cost. "Reduce the cost" therefore doesn't
  // go through here at all; it shrinks the buildable rectangle itself instead,
  // in planSite() below.
  const mult = (key) => overrides?.[key] || 1;
  const livingTarget =
    TARGET_AREA_SQFT.living *
    (LIVING_ROOM_SIZE_MULTIPLIER[String(livingRoomSize || '').toLowerCase()] || 1) *
    profile.livingScale * mult('living');
  const kitchenTarget = TARGET_AREA_SQFT.kitchen * mult('kitchen');
  const diningTarget = TARGET_AREA_SQFT.dining * mult('dining');
  const bathroomTarget = TARGET_AREA_SQFT.bathroom * mult('bathroom');
  const masterTarget = TARGET_AREA_SQFT.masterBedroom * profile.bedroomScale * mult('masterBedroom');
  const bedroomTarget = TARGET_AREA_SQFT.bedroom * profile.bedroomScale * mult('bedroom');
  const poojaTarget = TARGET_AREA_SQFT.pooja * mult('pooja');
  const gymTarget = TARGET_AREA_SQFT.gym * mult('gym');
  const storeTarget = TARGET_AREA_SQFT.store * mult('store');

  // Shared by both branches below: the ground floor's "public zone" entries
  // (Living/Kitchen/Dining), optionally rotated so Living Room isn't always
  // first in program order — since `subdivide` keeps rooms in program order
  // when grouping for a cut, rotating this changes which rooms end up
  // adjacent to which, without touching sizes. Pooja/Gym/Store are optional,
  // requirement-gated (like parking/garden) AND space-gated (like Dining
  // above) — appended after the swap so they never take part in the
  // living/kitchen reordering, and ground-floor-only for this pass (same
  // scope Dining already has).
  function groundPublicZone() {
    const entries = [{ name: 'Living Room', type: 'living', target: livingTarget }];
    entries.push({ name: 'Kitchen', type: 'kitchen', target: kitchenTarget });
    if (buildableAreaPerFloor >= 700) {
      entries.push({ name: 'Dining', type: 'dining', target: diningTarget });
    }
    if (profile.swapGroundOrder) entries.push(entries.shift());
    if (wantsPoojaRoom && buildableAreaPerFloor >= 500) {
      entries.push({ name: 'Pooja Room', type: 'pooja', target: poojaTarget });
    }
    if (wantsGym && buildableAreaPerFloor >= 900) {
      entries.push({ name: 'Home Gym', type: 'gym', target: gymTarget });
    }
    if (wantsStoreRoom && buildableAreaPerFloor >= 500) {
      entries.push({ name: 'Store Room', type: 'store', target: storeTarget });
    }
    return entries;
  }

  if (floors === 1) {
    // Single storey: everything lives on the one floor.
    floorPrograms[0].push(...groundPublicZone());
    for (let i = 0; i < bedrooms; i++) {
      const isMaster = i === 0;
      floorPrograms[0].push({
        name: isMaster ? 'Master Bedroom' : `Bedroom ${i + 1}`,
        type: 'bedroom',
        target: isMaster ? masterTarget : bedroomTarget,
      });
      if (i < bathrooms) {
        floorPrograms[0].push({
          name: isMaster ? 'Master Bathroom' : `Bathroom ${i + 1}`,
          type: 'bathroom',
          target: bathroomTarget,
        });
      }
    }
    for (let i = bedrooms; i < bathrooms; i++) {
      floorPrograms[0].push({ name: `Bathroom ${i + 1}`, type: 'bathroom', target: bathroomTarget });
    }
    return floorPrograms;
  }

  // Multi-storey: ground floor is the "public" zone; bedrooms live upstairs so the
  // ground floor stays open and every upper floor is a clean, private zone.
  floorPrograms[0].push(...groundPublicZone());
  // One of the requested bathrooms is placed downstairs as a guest bathroom; the
  // rest are distributed upstairs. The total across the whole house always equals
  // the requested count — this doesn't add an "extra" bathroom on top of it.
  const groundBathrooms = bathrooms > 0 ? 1 : 0;
  floorPrograms[0].push({ name: 'Guest Bathroom', type: 'bathroom', target: bathroomTarget });
  const upperBathroomBudget = bathrooms - groundBathrooms;

  // Spread bedrooms (and the remaining bathrooms) evenly across the upper floors.
  const upperFloorCount = floors - 1;
  const bedroomsPerFloor = Array.from({ length: upperFloorCount }, (_, i) =>
    Math.floor(bedrooms / upperFloorCount) + (i < bedrooms % upperFloorCount ? 1 : 0)
  );
  const bathroomsPerFloor = Array.from({ length: upperFloorCount }, (_, i) =>
    Math.floor(upperBathroomBudget / upperFloorCount) + (i < upperBathroomBudget % upperFloorCount ? 1 : 0)
  );

  let bedroomCounter = 0;
  for (let f = 0; f < upperFloorCount; f++) {
    const nBed = bedroomsPerFloor[f];
    const nBath = bathroomsPerFloor[f];
    const floorEntries = [];
    for (let i = 0; i < nBed; i++) {
      const isMaster = bedroomCounter === 0;
      floorEntries.push({
        name: isMaster ? 'Master Bedroom' : `Bedroom ${bedroomCounter + 1}`,
        type: 'bedroom',
        target: isMaster ? masterTarget : bedroomTarget,
      });
      if (i < nBath) {
        floorEntries.push({
          name: isMaster ? 'Master Bathroom' : `Bathroom ${bedroomCounter + 1}`,
          type: 'bathroom',
          target: bathroomTarget,
        });
      }
      bedroomCounter++;
    }
    for (let i = nBed; i < nBath; i++) {
      floorEntries.push({ name: `Bathroom (F${f + 1})`, type: 'bathroom', target: bathroomTarget });
    }
    if (floorEntries.length === 0) {
      // Degenerate case (more floors than rooms to put on them) — still give the
      // floor a usable room rather than leaving it empty.
      floorEntries.push({ name: `Bedroom ${bedroomCounter + 1}`, type: 'bedroom', target: bedroomTarget });
      bedroomCounter++;
    }
    // Reversing here only changes the order `subdivide` sees (and therefore how
    // the rectangle gets cut) — names/master-assignment above are already fixed,
    // so this can't rename or misassign anything.
    if (profile.reverseUpperOrder) floorEntries.reverse();
    floorPrograms[f + 1].push(...floorEntries);
  }

  return floorPrograms;
}

// ---------------------------------------------------------------------------
// Step 2 — Recursive area-proportional rectangle subdivision.
//
// Given a rectangle and an ordered list of rooms (each with a target area used as a
// weight, not an absolute size), recursively cuts the rectangle into two along its
// longer axis, splitting the room list into a front/back run whose combined target
// areas are as close to half-and-half as possible, and recurses. This always
// terminates with exactly one room per leaf rectangle, and — because each cut simply
// divides one rectangle into two adjoining ones — the result always exactly tiles the
// starting rectangle with zero gaps and zero overlaps.
//
// Keeping rooms in program order (rather than sorting by size) means an adjacent pair
// like "Master Bedroom" + "Master Bathroom" tends to land in the same half of a cut for
// as long as possible, which is what keeps them next to each other in the final plan.
// ---------------------------------------------------------------------------

function splitByArea(rooms) {
  const total = rooms.reduce((s, r) => s + r.target, 0);
  let running = 0;
  let splitIndex = 1;
  for (let i = 0; i < rooms.length; i++) {
    running += rooms[i].target;
    if (running >= total / 2) {
      splitIndex = i + 1;
      break;
    }
  }
  // Never produce an empty group.
  splitIndex = Math.max(1, Math.min(rooms.length - 1, splitIndex));
  return [rooms.slice(0, splitIndex), rooms.slice(splitIndex)];
}

function subdivide(rect, rooms, out) {
  if (rooms.length === 1) {
    out.push({ ...rooms[0], x: rect.x, y: rect.y, width: rect.width, depth: rect.depth });
    return;
  }

  const [groupA, groupB] = splitByArea(rooms);
  const areaA = groupA.reduce((s, r) => s + r.target, 0);
  const areaB = groupB.reduce((s, r) => s + r.target, 0);
  const fraction = areaA / (areaA + areaB);

  const splitVertical = rect.width >= rect.depth; // cut along the longer axis
  if (splitVertical) {
    const widthA = rect.width * fraction;
    subdivide({ x: rect.x, y: rect.y, width: widthA, depth: rect.depth }, groupA, out);
    subdivide({ x: rect.x + widthA, y: rect.y, width: rect.width - widthA, depth: rect.depth }, groupB, out);
  } else {
    const depthA = rect.depth * fraction;
    subdivide({ x: rect.x, y: rect.y, width: rect.width, depth: depthA }, groupA, out);
    subdivide({ x: rect.x, y: rect.y + depthA, width: rect.width, depth: rect.depth - depthA }, groupB, out);
  }
}

function buildFloorLayout(rect, roomProgram) {
  const out = [];
  subdivide(rect, roomProgram, out);
  return out;
}

// ---------------------------------------------------------------------------
// Step 3 — Site planning: carve the plot into a front setback (parking + open
// space) and a buildable rectangle, then — if there's more than one floor — a
// fixed-position vertical staircase strip shared by every floor, so the stairs
// line up between storeys.
// ---------------------------------------------------------------------------

const STAIRS_STRIP_WIDTH_FT = 4;
const PARKING_WIDTH_FT = 12;

function planSite({ plotWidthFt, plotDepthFt, floors, wantsParking, wantsOpenSpace, staircaseSide = 'start', openSpaceScale = 1, sizeScale = 1 }) {
  // "Give me more open space" (designModifier.js) bumps openSpaceScale above 1,
  // widening the front setback band — capped so it can't be asked to eat more
  // than 40% of the plot's own depth, however many times it's applied.
  const frontSetback = wantsOpenSpace
    ? Math.min(Math.round(plotDepthFt * 0.4), Math.max(8, Math.round(plotDepthFt * 0.15 * openSpaceScale)))
    : Math.min(10, Math.max(6, Math.round(plotDepthFt * 0.08)));

  const parking = wantsParking
    ? { x: 0, y: 0, width: Math.min(PARKING_WIDTH_FT, plotWidthFt), depth: frontSetback, capacity: 1 }
    : null;

  const openSpace = wantsOpenSpace
    ? {
        x: parking ? parking.width : 0,
        y: 0,
        width: Math.max(0, plotWidthFt - (parking ? parking.width : 0)),
        depth: frontSetback,
      }
    : null;

  // "Reduce the cost" (designModifier.js) shrinks the house's own footprint —
  // width and depth both scaled by sqrt(sizeScale) so the tiled AREA (and
  // therefore the cost, which is computed straight from total room area) shrinks
  // by exactly sizeScale. This has to happen here, before any room-level target
  // weights come into play: subdivide() always exactly tiles whatever rectangle
  // it's handed regardless of relative weights, so scaling weights alone (as
  // buildRoomProgram's per-room overrides do) can redistribute area between
  // rooms but can never change the total — only shrinking the rectangle itself
  // actually reduces built-up area. The house stays anchored at the plot's own
  // front-left corner; the unused remainder is simply left as open plot.
  const footprintShrink = sizeScale < 1 ? Math.sqrt(sizeScale) : 1;
  const fullBuildable = {
    x: 0, y: frontSetback,
    width: plotWidthFt * footprintShrink,
    depth: (plotDepthFt - frontSetback) * footprintShrink,
  };

  let stairsStrip = null;
  let roomRect = fullBuildable;
  if (floors > 1) {
    // "Generate Another Design" can flip which side of the plot the stairs sit
    // on — a real, visually obvious structural difference between versions,
    // not just a cosmetic tweak.
    const stripX =
      staircaseSide === 'end'
        ? fullBuildable.x + fullBuildable.width - STAIRS_STRIP_WIDTH_FT
        : fullBuildable.x;
    stairsStrip = { x: stripX, y: fullBuildable.y, width: STAIRS_STRIP_WIDTH_FT, depth: fullBuildable.depth };
    roomRect =
      staircaseSide === 'end'
        ? {
            x: fullBuildable.x,
            y: fullBuildable.y,
            width: fullBuildable.width - STAIRS_STRIP_WIDTH_FT,
            depth: fullBuildable.depth,
          }
        : {
            x: fullBuildable.x + STAIRS_STRIP_WIDTH_FT,
            y: fullBuildable.y,
            width: fullBuildable.width - STAIRS_STRIP_WIDTH_FT,
            depth: fullBuildable.depth,
          };
  }

  return { frontSetback, parking, openSpace, buildable: fullBuildable, stairsStrip, roomRect };
}

// ---------------------------------------------------------------------------
// Step 4 — Doors: one exterior main entrance (on the ground floor's Living Room,
// on whichever of its walls actually touches the buildable rectangle's front
// edge), plus a connecting door for every pair of rooms on the same floor that
// share a wall segment. Two entries are emitted per interior doorway — one per
// room — at the same shared-wall location, matching the 3D engine's convention.
// ---------------------------------------------------------------------------

function roomExteriorWalls(room, bounds) {
  const walls = [];
  if (Math.abs(room.y - bounds.y) < 1e-6) walls.push('north');
  if (Math.abs(room.y + room.depth - (bounds.y + bounds.depth)) < 1e-6) walls.push('south');
  if (Math.abs(room.x - bounds.x) < 1e-6) walls.push('west');
  if (Math.abs(room.x + room.width - (bounds.x + bounds.width)) < 1e-6) walls.push('east');
  return walls;
}

function findEntranceDoor(livingRoom, bounds) {
  const walls = roomExteriorWalls(livingRoom, bounds);
  // 'north' is the road-facing front of the plot (y=0 is the front edge — see the
  // header comment). Prefer putting the main entrance there whenever the living
  // room actually touches it, so the door reads as a sensible front door rather
  // than landing on a side/back wall — which can otherwise happen for some
  // "Generate Another Design" layouts where a variation profile pushes the living
  // room away from the front of the plot. Fall back to whatever exterior wall it
  // does touch (still a real exterior door) if the front wall isn't available.
  const wall = walls.includes('north') ? 'north' : walls[0] || 'south'; // always has at least one exterior wall in practice
  const span = wall === 'north' || wall === 'south' ? livingRoom.width : livingRoom.depth;
  const width = Math.min(3.5, span);
  return { room: livingRoom.name, wall, offset: Math.max(0, (span - width) / 2), width, isEntrance: true };
}

function findConnectingDoors(rooms) {
  const doors = [];
  const DOOR_WIDTH = 3;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      // Share a vertical wall (a's east == b's west), overlapping in y.
      if (Math.abs(a.x + a.width - b.x) < 1e-6) {
        const overlapStart = Math.max(a.y, b.y);
        const overlapEnd = Math.min(a.y + a.depth, b.y + b.depth);
        if (overlapEnd - overlapStart >= DOOR_WIDTH) {
          const center = (overlapStart + overlapEnd) / 2;
          doors.push({ room: a.name, wall: 'east', offset: center - DOOR_WIDTH / 2 - a.y, width: DOOR_WIDTH });
          doors.push({ room: b.name, wall: 'west', offset: center - DOOR_WIDTH / 2 - b.y, width: DOOR_WIDTH });
          continue;
        }
      }
      if (Math.abs(b.x + b.width - a.x) < 1e-6) {
        const overlapStart = Math.max(a.y, b.y);
        const overlapEnd = Math.min(a.y + a.depth, b.y + b.depth);
        if (overlapEnd - overlapStart >= DOOR_WIDTH) {
          const center = (overlapStart + overlapEnd) / 2;
          doors.push({ room: a.name, wall: 'west', offset: center - DOOR_WIDTH / 2 - a.y, width: DOOR_WIDTH });
          doors.push({ room: b.name, wall: 'east', offset: center - DOOR_WIDTH / 2 - b.y, width: DOOR_WIDTH });
          continue;
        }
      }
      // Share a horizontal wall (a's south == b's north), overlapping in x.
      if (Math.abs(a.y + a.depth - b.y) < 1e-6) {
        const overlapStart = Math.max(a.x, b.x);
        const overlapEnd = Math.min(a.x + a.width, b.x + b.width);
        if (overlapEnd - overlapStart >= DOOR_WIDTH) {
          const center = (overlapStart + overlapEnd) / 2;
          doors.push({ room: a.name, wall: 'south', offset: center - DOOR_WIDTH / 2 - a.x, width: DOOR_WIDTH });
          doors.push({ room: b.name, wall: 'north', offset: center - DOOR_WIDTH / 2 - b.x, width: DOOR_WIDTH });
          continue;
        }
      }
      if (Math.abs(b.y + b.depth - a.y) < 1e-6) {
        const overlapStart = Math.max(a.x, b.x);
        const overlapEnd = Math.min(a.x + a.width, b.x + b.width);
        if (overlapEnd - overlapStart >= DOOR_WIDTH) {
          const center = (overlapStart + overlapEnd) / 2;
          doors.push({ room: a.name, wall: 'north', offset: center - DOOR_WIDTH / 2 - a.x, width: DOOR_WIDTH });
          doors.push({ room: b.name, wall: 'south', offset: center - DOOR_WIDTH / 2 - b.x, width: DOOR_WIDTH });
          continue;
        }
      }
    }
  }
  return doors;
}

// ---------------------------------------------------------------------------
// Step 5 — Windows: every room gets one window on its longest exterior-facing
// wall (a wall lying on the outer edge of that floor's buildable rectangle).
// ---------------------------------------------------------------------------

function findWindows(rooms, bounds) {
  const windows = [];
  rooms.forEach((room) => {
    const walls = roomExteriorWalls(room, bounds);
    if (!walls.length) return;
    const spanOf = (wall) => (wall === 'north' || wall === 'south' ? room.width : room.depth);
    const wall = walls.reduce((best, w) => (spanOf(w) > spanOf(best) ? w : best), walls[0]);
    const span = spanOf(wall);
    const width = Math.min(4, span * 0.5);
    windows.push({ room: room.name, wall, offset: (span - width) / 2, width });
  });
  return windows;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function generateHouseDesign(requirements) {
  const plotWidthFt = Math.max(15, Number(requirements.plotWidthFt) || 30);
  const plotDepthFt = Math.max(15, Number(requirements.plotDepthFt) || 40);
  const bedrooms = clampInt(requirements.bedrooms, 1, 8, 3);
  const bathrooms = clampInt(requirements.bathrooms, 1, 6, 2);
  const floors = clampInt(requirements.floors, 1, 3, 1);
  const wantsParking = !!requirements.parking;
  const wantsOpenSpace = !!requirements.garden;
  const wantsPoojaRoom = !!requirements.poojaRoom;
  const wantsGym = !!requirements.gym;
  const wantsStoreRoom = !!requirements.storeRoom;
  const style = requirements.style || '';
  // "Generate Another Design" resends the same requirements with an incremented
  // variationSeed instead of any randomness, so results stay reproducible and
  // the algorithm stays fully rule-based/deterministic (see VARIATION_PROFILES).
  const variationSeed = Number.isFinite(Number(requirements.variationSeed))
    ? Math.max(0, Math.floor(Number(requirements.variationSeed)))
    : 0;
  const profile = pickVariationProfile(variationSeed);
  // Conversational edits (designModifier.js / /api/design/chat-modify) set these
  // — an explicit staircase side ("move the staircase" overrides whatever the
  // variation profile picked), per-room-type size multipliers ("make the X
  // bigger/smaller"), and a global size scale ("reduce the cost"). All default to
  // a no-op, so a design with no chat history is unaffected.
  const staircaseSide = requirements.staircaseSideOverride || profile.staircaseSide;
  const roomSizeOverrides = requirements.roomSizeOverrides || null;
  const sizeScale = Number(requirements.sizeScale) || 1;
  const openSpaceScale = Number(requirements.openSpaceScale) || 1;

  const site = planSite({ plotWidthFt, plotDepthFt, floors, wantsParking, wantsOpenSpace, staircaseSide, openSpaceScale, sizeScale });
  const buildableAreaPerFloor = site.roomRect.width * site.roomRect.depth;

  const floorPrograms = buildRoomProgram({
    bedrooms, bathrooms, floors, buildableAreaPerFloor, livingRoomSize: requirements.livingRoomSize,
    profile, overrides: roomSizeOverrides, wantsPoojaRoom, wantsGym, wantsStoreRoom,
  });

  const rooms = [];
  const doors = [];
  const windows = [];
  const stairs = [];

  floorPrograms.forEach((program, level) => {
    const floorRooms = buildFloorLayout(site.roomRect, program);
    floorRooms.forEach((r) => rooms.push({ floor: level, name: r.name, type: r.type, x: r.x, y: r.y, width: r.width, depth: r.depth }));

    windows.push(...findWindows(floorRooms, site.buildable).map((w) => ({ floor: level, ...w })));
    doors.push(...findConnectingDoors(floorRooms).map((d) => ({ floor: level, ...d })));

    if (level === 0) {
      const livingRoom = floorRooms.find((r) => r.type === 'living') || floorRooms[0];
      doors.push({ floor: level, ...findEntranceDoor(livingRoom, site.buildable) });
    }
  });

  if (site.stairsStrip) {
    for (let f = 0; f < floors - 1; f++) {
      stairs.push({ fromFloor: f, x: site.stairsStrip.x, y: site.stairsStrip.y, width: site.stairsStrip.width, depth: site.stairsStrip.depth });
    }
  }

  // `subdivide` guarantees no overlaps/gaps by construction, but it has no notion
  // of a MINIMUM size — it will happily carve out a physically unbuildable sliver
  // (e.g. a 1ft-wide "bathroom") if too many rooms are asked to fit too small a
  // plot (found via testing: a 15x15ft plot with 8 bedrooms/6 bathrooms/3 floors
  // produced a 1.17ft-wide bathroom). Rather than silently return that, fail
  // clearly with an actionable message — the same "never hand back geometry we
  // know is broken" principle floorPlan2D.js's validator already follows.
  const MIN_ROOM_DIM_FT = 3;
  const tinyRoom = rooms.find((r) => r.width < MIN_ROOM_DIM_FT || r.depth < MIN_ROOM_DIM_FT);
  if (tinyRoom) {
    throw Object.assign(
      new Error(
        `This plot is too small for ${bedrooms} bedroom(s)/${bathrooms} bathroom(s) across ${floors} floor(s) — ` +
        `the "${tinyRoom.name}" would end up only ${tinyRoom.width.toFixed(1)}x${tinyRoom.depth.toFixed(1)}ft. ` +
        `Try a larger plot, fewer rooms, or fewer floors.`
      ),
      { status: 422 }
    );
  }

  const totalAreaSqft = rooms.reduce((s, r) => s + r.width * r.depth, 0);
  const bathroomCount = rooms.filter((r) => r.type === 'bathroom').length;
  const estimated_cost = estimateCostFromSqft(totalAreaSqft, {
    style,
    floorsCount: floors,
    bathroomCount,
    parking: wantsParking,
    garden: wantsOpenSpace,
    budget: requirements.budget,
  });

  return {
    title: `${bedrooms}BHK ${style ? style + ' ' : ''}House — ${floors > 1 ? floors + ' Floors' : 'Single Storey'}`,
    summary:
      `A rule-based ${plotWidthFt}x${plotDepthFt} ft plot layout with ${bedrooms} bedroom(s), ` +
      `${bathrooms} bathroom(s) across ${floors} floor(s).`,
    variationSeed,
    style, // drives roof shape/wall color/ceiling height in the 3D viewer — see client/src/three/houseModel.js
    plot: {
      unit: 'ft',
      widthFt: plotWidthFt,
      depthFt: plotDepthFt,
      areaSqft: plotWidthFt * plotDepthFt,
      frontSetbackFt: site.frontSetback,
      buildable: site.buildable,
      openSpace: site.openSpace,
    },
    floors: Array.from({ length: floors }, (_, i) => ({ level: i, name: i === 0 ? 'Ground Floor' : `Floor ${i + 1}` })),
    rooms,
    doors,
    windows,
    stairs,
    parking: site.parking,
    estimated_cost,
  };
}

module.exports = { generateHouseDesign, ROOM_TYPES, WALL_SIDES };
