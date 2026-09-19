// Small helpers that understand every layout shape this app can produce:
//  1. Gemini-generated layouts: { widthMeters, depthMeters, floors:[{level,rooms}], rooms (mirror of floor 0) }
//  2. Hand-authored samples: same as (1), or just a flat { rooms: [...] } for single-floor ones.
//  3. Rule-based generator output: { plot:{widthFt,depthFt}, floors:[{level,name}], rooms:[{floor,...}] }
// Rather than scatter shape-detection across components, everything funnels through here.

export function getAllRooms(layout) {
  if (Array.isArray(layout.rooms) && layout.rooms.length && layout.rooms[0].floor !== undefined) {
    return layout.rooms; // shape 3: already flat, each room tagged with its floor
  }
  if (Array.isArray(layout.floors) && layout.floors.length && layout.floors[0].rooms) {
    return layout.floors.flatMap((f) => f.rooms); // shape 1
  }
  return layout.rooms || []; // shape 2
}

export function getFloorCount(layout) {
  return (Array.isArray(layout.floors) && layout.floors.length) || 1;
}

export function getPlotSize(layout) {
  if (layout.plot) return { width: layout.plot.widthFt, depth: layout.plot.depthFt, unit: layout.plot.unit || 'ft' };
  return { width: layout.widthMeters, depth: layout.depthMeters, unit: 'm' };
}

export function areaOf(layout) {
  return Math.round(getAllRooms(layout).reduce((s, r) => s + r.width * r.depth, 0));
}

export function areaUnitOf(layout) {
  return getPlotSize(layout).unit === 'ft' ? 'sqft' : 'sqm';
}

export function roomCountOf(layout) {
  return getAllRooms(layout).length;
}

export function bedroomCountOf(layout) {
  return getAllRooms(layout).filter((r) => r.type === 'bedroom').length;
}

export function floorCountOf(layout) {
  return getFloorCount(layout);
}
