// Converts a structured house design (plot + rooms + doors + windows + stairs +
// parking) into a per-floor "2D drawing model" — a plain JSON list of drawable
// primitives (wall lines, room rectangles, door swing arcs, window symbols, stair
// steps, dimension lines). The frontend renders this model as real SVG elements.
//
// This is deliberately NOT raw SVG markup or an AI-generated image: every primitive
// carries the same coordinates as the structured design, so the drawing is always an
// exact, to-scale representation of the actual data — not a picture that merely looks
// like a floor plan.
//
// Unlike the 3D engine (which tolerates two overlapping walls where two rooms meet,
// since that's invisible in 3D), a 2D plan reads as wrong if a shared wall is drawn
// twice. So this module computes a proper wall NETWORK: every wall segment — exterior
// or interior — is derived once, geometrically, from room adjacency.

const EPS = 1e-6;

// ---------------------------------------------------------------------------
// Validation — run before ever attempting to draw. Never trust structured input
// blindly, even input this app generated itself (a design may have come from
// storage, or in future from a different generation path).
// ---------------------------------------------------------------------------

function rectsOverlap(a, b) {
  return a.x < b.x + b.width - EPS && a.x + a.width > b.x + EPS &&
         a.y < b.y + b.depth - EPS && a.y + a.depth > b.y + EPS;
}

function isValidDimension(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function validateDesignGeometry(design) {
  const errors = [];
  if (!design || !design.plot || !isValidDimension(design.plot.widthFt) || !isValidDimension(design.plot.depthFt)) {
    return { valid: false, errors: ['Missing or invalid plot dimensions.'] };
  }
  const plot = design.plot;
  const floors = Array.isArray(design.floors) ? design.floors : [{ level: 0 }];
  // A room can pass "no overlap, stays in bounds" and still be physically
  // unbuildable — a sliver a few inches wide. Same numbers work in either unit
  // (see WALL_THICKNESS above), so pick the minimum by declared unit: ~3ft, or
  // ~0.9m for a meters-based (AI/upload-derived) design.
  const minRoomDim = plot.unit === 'm' ? 0.9 : 3;

  floors.forEach((floor) => {
    const rects = getFloorRects(design, floor.level);

    rects.forEach((r) => {
      if (!isValidDimension(r.width) || !isValidDimension(r.depth)) {
        errors.push(`Floor ${floor.level}: "${r.name}" has an invalid width/depth (${r.width} x ${r.depth}).`);
      } else if (r.width < minRoomDim || r.depth < minRoomDim) {
        errors.push(`Floor ${floor.level}: "${r.name}" is too small to be a real room (${r.width.toFixed(2)} x ${r.depth.toFixed(2)} ${plot.unit || 'ft'}).`);
      }
      if (r.x < -EPS || r.y < -EPS || r.x + r.width > plot.widthFt + EPS || r.y + r.depth > plot.depthFt + EPS) {
        errors.push(`Floor ${floor.level}: "${r.name}" falls outside the plot bounds.`);
      }
    });

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rectsOverlap(rects[i], rects[j])) {
          errors.push(`Floor ${floor.level}: "${rects[i].name}" overlaps "${rects[j].name}".`);
        }
      }
    }

    const roomsByName = new Map(rects.map((r) => [r.name, r]));
    ['doors', 'windows'].forEach((key) => {
      (design[key] || []).filter((o) => o.floor === floor.level).forEach((o) => {
        const room = roomsByName.get(o.room);
        if (!room) {
          errors.push(`Floor ${floor.level}: ${key.slice(0, -1)} references unknown room "${o.room}".`);
          return;
        }
        const span = o.wall === 'north' || o.wall === 'south' ? room.width : room.depth;
        if (o.offset < -EPS || o.offset + o.width > span + EPS) {
          errors.push(`Floor ${floor.level}: ${key.slice(0, -1)} on "${o.room}" (${o.wall}) doesn't fit that wall.`);
        }
      });
    });
  });

  return { valid: errors.length === 0, errors };
}

// Rooms + the stairs shaft (if any) on a floor, as one list of rectangles — the
// stairs shaft behaves like a room for wall-drawing purposes (it has walls around
// it too), even though it isn't part of design.rooms.
function getFloorRects(design, level) {
  const rooms = (design.rooms || []).filter((r) => r.floor === level);
  const stairsHere = (design.stairs || []).find((s) => s.fromFloor === level || s.fromFloor === level - 1);
  const rects = rooms.map((r) => ({ ...r }));
  if (stairsHere) {
    rects.push({
      name: '__stairs__', type: 'stairs',
      x: stairsHere.x, y: stairsHere.y, width: stairsHere.width, depth: stairsHere.depth,
    });
  }
  return rects;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Cuts `gaps` (openings) out of a [0, span] run, returning the remaining solid sub-runs.
function solidSegments(span, gaps) {
  const sorted = gaps.slice().sort((a, b) => a.start - b.start);
  const segs = [];
  let cursor = 0;
  sorted.forEach((g) => {
    const s = Math.max(0, Math.min(span, g.start));
    const e = Math.max(0, Math.min(span, g.end));
    if (s > cursor + EPS) segs.push([cursor, s]);
    cursor = Math.max(cursor, e);
  });
  if (cursor < span - EPS) segs.push([cursor, span]);
  return segs;
}

// Turns a {room, wall, offset, width} door/window entry into an absolute segment.
function resolveOpening(entry, roomsByName) {
  const room = roomsByName.get(entry.room);
  if (!room) return null;
  switch (entry.wall) {
    case 'north': return { x1: room.x + entry.offset, y1: room.y, x2: room.x + entry.offset + entry.width, y2: room.y, orientation: 'h' };
    case 'south': return { x1: room.x + entry.offset, y1: room.y + room.depth, x2: room.x + entry.offset + entry.width, y2: room.y + room.depth, orientation: 'h' };
    case 'west': return { x1: room.x, y1: room.y + entry.offset, x2: room.x, y2: room.y + entry.offset + entry.width, orientation: 'v' };
    case 'east': return { x1: room.x + room.width, y1: room.y + entry.offset, x2: room.x + room.width, y2: room.y + entry.offset + entry.width, orientation: 'v' };
    default: return null;
  }
}

// Every pair of rectangles that share part of an edge — the interior wall network.
function findSharedEdges(rects) {
  const edges = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (Math.abs(a.x + a.width - b.x) < EPS || Math.abs(b.x + b.width - a.x) < EPS) {
        const x = Math.abs(a.x + a.width - b.x) < EPS ? a.x + a.width : b.x + b.width;
        const s = Math.max(a.y, b.y), e = Math.min(a.y + a.depth, b.y + b.depth);
        if (e - s > EPS) edges.push({ orientation: 'v', fixed: x, start: s, end: e });
      }
      if (Math.abs(a.y + a.depth - b.y) < EPS || Math.abs(b.y + b.depth - a.y) < EPS) {
        const y = Math.abs(a.y + a.depth - b.y) < EPS ? a.y + a.depth : b.y + b.depth;
        const s = Math.max(a.x, b.x), e = Math.min(a.x + a.width, b.x + b.width);
        if (e - s > EPS) edges.push({ orientation: 'h', fixed: y, start: s, end: e });
      }
    }
  }
  return edges;
}

function gapsOnLine(openings, orientation, fixed, start, end) {
  return openings
    .filter((o) => o && o.orientation === orientation && Math.abs((orientation === 'v' ? o.x1 : o.y1) - fixed) < EPS)
    .map((o) => (orientation === 'v' ? { start: o.y1, end: o.y2 } : { start: o.x1, end: o.x2 }))
    .filter((g) => g.end > start - EPS && g.start < end + EPS)
    .map((g) => ({ start: Math.max(g.start, start) - start, end: Math.min(g.end, end) - start }));
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

const WALL_THICKNESS = { exterior: 0.5, interior: 0.3 }; // feet (or meters, same numbers work either unit)

function buildFloorPlan(design, level) {
  const plot = design.plot;
  const buildable = plot.buildable || { x: 0, y: 0, width: plot.widthFt, depth: plot.depthFt };
  const rects = getFloorRects(design, level);
  const roomsByName = new Map(rects.map((r) => [r.name, r]));

  const doorEntries = (design.doors || []).filter((d) => d.floor === level).map((d) => resolveOpening(d, roomsByName)).filter(Boolean);
  const windowEntries = (design.windows || []).filter((w) => w.floor === level).map((w) => resolveOpening(w, roomsByName)).filter(Boolean);

  const walls = [];

  // Exterior walls: the 4 sides of the building footprint, minus door openings only
  // (windows don't create a gap — they're drawn as a symbol on top of a solid wall).
  const sides = [
    { orientation: 'h', fixed: buildable.y, start: buildable.x, end: buildable.x + buildable.width, from: (t) => ({ x1: t, y1: buildable.y }) },
    { orientation: 'h', fixed: buildable.y + buildable.depth, start: buildable.x, end: buildable.x + buildable.width },
    { orientation: 'v', fixed: buildable.x, start: buildable.y, end: buildable.y + buildable.depth },
    { orientation: 'v', fixed: buildable.x + buildable.width, start: buildable.y, end: buildable.y + buildable.depth },
  ];
  sides.forEach(({ orientation, fixed, start, end }) => {
    const gaps = gapsOnLine(doorEntries, orientation, fixed, start, end);
    solidSegments(end - start, gaps).forEach(([s, e]) => {
      walls.push(orientation === 'h'
        ? { x1: start + s, y1: fixed, x2: start + e, y2: fixed, kind: 'exterior' }
        : { x1: fixed, y1: start + s, x2: fixed, y2: start + e, kind: 'exterior' });
    });
  });

  // Interior walls: every shared edge between two rooms (or a room and the stairs
  // shaft), minus door openings on that same line.
  findSharedEdges(rects).forEach(({ orientation, fixed, start, end }) => {
    const gaps = gapsOnLine(doorEntries, orientation, fixed, start, end);
    solidSegments(end - start, gaps).forEach(([s, e]) => {
      walls.push(orientation === 'h'
        ? { x1: start + s, y1: fixed, x2: start + e, y2: fixed, kind: 'interior' }
        : { x1: fixed, y1: start + s, x2: fixed, y2: start + e, kind: 'interior' });
    });
  });

  // Doors: gap + a quarter-circle swing arc opening into the referenced room.
  // An interior doorway is described by TWO entries in design.doors (one per
  // adjoining room, per designGenerator.js's convention) that resolve to the exact
  // same physical segment — draw that opening's swing symbol only once, or it would
  // render as two conflicting arcs stacked on each other.
  const seenDoorSegments = new Set();
  const doors = (design.doors || []).filter((d) => d.floor === level).map((d) => {
    const seg = resolveOpening(d, roomsByName);
    if (!seg) return null;
    const key = [seg.x1, seg.y1, seg.x2, seg.y2].map((n) => n.toFixed(3)).join(',');
    if (seenDoorSegments.has(key)) return null;
    seenDoorSegments.add(key);

    const room = roomsByName.get(d.room);
    const inward = { x: room.x + room.width / 2, y: room.y + room.depth / 2 };
    // Hinge at the endpoint closer to... always (x1,y1); swing sweeps toward the room's center.
    const hinge = { x: seg.x1, y: seg.y1 };
    const leafEnd = seg.orientation === 'h'
      ? { x: hinge.x, y: hinge.y + (inward.y > hinge.y ? d.width : -d.width) }
      : { x: hinge.x + (inward.x > hinge.x ? d.width : -d.width), y: hinge.y };
    const sweep = seg.orientation === 'h' ? (inward.y > hinge.y ? 1 : 0) : (inward.x > hinge.x ? 0 : 1);
    return {
      x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2,
      hinge, leafEnd, isEntrance: !!d.isEntrance,
      arcPath: `M ${seg.x2} ${seg.y2} A ${d.width} ${d.width} 0 0 ${sweep} ${leafEnd.x} ${leafEnd.y}`,
    };
  }).filter(Boolean);

  // The main entrance gets its own marker outside the wall (a small "porch" arc +
  // label) so it reads clearly as THE front door, not just another opening — see
  // houseModel.js's matching physical porch/canopy in the 3D view.
  const entranceDoorEntry = (design.doors || []).find((d) => d.floor === level && d.isEntrance);
  let entranceMarker = null;
  if (entranceDoorEntry) {
    const seg = resolveOpening(entranceDoorEntry, roomsByName);
    if (seg) {
      const midX = (seg.x1 + seg.x2) / 2;
      const midY = (seg.y1 + seg.y2) / 2;
      const out = Math.max(plot.widthFt, plot.depthFt) * 0.03;
      // Which side of the wall is actually outside the building — the mat is the
      // door's own segment offset outward (parallel to it, not across it), and the
      // label sits further out along that same direction.
      const towardExterior = (() => {
        if (entranceDoorEntry.wall === 'north') return { x: 0, y: -1 };
        if (entranceDoorEntry.wall === 'south') return { x: 0, y: 1 };
        if (entranceDoorEntry.wall === 'west') return { x: -1, y: 0 };
        return { x: 1, y: 0 };
      })();
      entranceMarker = {
        matStart: { x: seg.x1 + towardExterior.x * out, y: seg.y1 + towardExterior.y * out },
        matEnd: { x: seg.x2 + towardExterior.x * out, y: seg.y2 + towardExterior.y * out },
        outX: midX + towardExterior.x * out * 1.8,
        outY: midY + towardExterior.y * out * 1.8,
      };
    }
  }

  // Windows: drawn as a short parallel double-line symbol across the wall.
  const windows = windowEntries.map((seg) => seg);

  // Stairs: step lines across the shaft, in the direction of its longer axis.
  const stairs = (design.stairs || [])
    .filter((s) => s.fromFloor === level || s.fromFloor === level - 1)
    .map((s) => {
      const goingUp = s.fromFloor === level;
      const steps = [];
      const n = 10;
      const vertical = s.depth >= s.width;
      for (let i = 1; i < n; i++) {
        const t = s.x + (vertical ? 0 : (s.width * i) / n);
        const u = s.y + (vertical ? (s.depth * i) / n : 0);
        steps.push(vertical
          ? { x1: s.x, y1: u, x2: s.x + s.width, y2: u }
          : { x1: t, y1: s.y, x2: t, y2: s.y + s.depth });
      }
      return { x: s.x, y: s.y, width: s.width, depth: s.depth, steps, label: goingUp ? 'UP' : 'DN' };
    });

  // Room labels + dimension text.
  const rooms = rects.filter((r) => r.type !== 'stairs').map((r) => ({
    name: r.name, type: r.type, x: r.x, y: r.y, width: r.width, depth: r.depth,
    dimensionLabel: `${r.width.toFixed(1)} x ${r.depth.toFixed(1)} ${plot.unit}`,
  }));

  // Overall plot dimension lines (outside the building, along the top and left).
  const margin = Math.max(plot.widthFt, plot.depthFt) * 0.12;
  const dimensionLines = [
    { x1: 0, y1: -margin * 0.5, x2: plot.widthFt, y2: -margin * 0.5, text: `${plot.widthFt} ${plot.unit}` },
    { x1: -margin * 0.5, y1: 0, x2: -margin * 0.5, y2: plot.depthFt, text: `${plot.depthFt} ${plot.unit}`, vertical: true },
  ];

  return {
    level,
    unit: plot.unit,
    bounds: { x: -margin, y: -margin, width: plot.widthFt + margin * 2, height: plot.depthFt + margin * 2 },
    plot: { x: 0, y: 0, width: plot.widthFt, depth: plot.depthFt },
    buildable,
    walls,
    wallThickness: WALL_THICKNESS,
    rooms,
    doors,
    windows,
    stairs,
    entranceMarker,
    parking: level === 0 ? design.parking || null : null,
    openSpace: level === 0 ? plot.openSpace || null : null,
    dimensionLines,
  };
}

function buildFloorPlans(design) {
  const check = validateDesignGeometry(design);
  if (!check.valid) {
    throw Object.assign(new Error('Design geometry is invalid — cannot draw a floor plan.'), { status: 422, details: check.errors });
  }
  const floors = Array.isArray(design.floors) && design.floors.length ? design.floors : [{ level: 0 }];
  return floors.map((f) => buildFloorPlan(design, f.level));
}

module.exports = { buildFloorPlans, validateDesignGeometry };
