// Wall-collision for the first-person walkthrough — the actual "walkable engine"
// piece: without this, SceneController.jsx's PointerLockControls-driven movement
// walks straight through geometry. Pure JS (no THREE import), same convention as
// houseModel.js: plain data in, plain data/mutation out.
//
// Reuses houseModel.js's own wallSegments — already axis-aligned boxes, already
// split around door openings by solidSegments() (a doorway simply has no wall box
// spanning it), so walking through a door needs no special-casing here at all.

function boxToCollider(size, position) {
  const [sx, sy, sz] = size;
  const [px, py, pz] = position;
  return {
    minX: px - sx / 2, maxX: px + sx / 2,
    minY: py - sy / 2, maxY: py + sy / 2,
    minZ: pz - sz / 2, maxZ: pz + sz / 2,
  };
}

// Flattens every floor's rooms' wallSegments, plus the stairwell's own
// full-height walls (houseModel.js's buildStairwellWalls — real walls, not
// yet part of any room's wallSegments), into flat min/max AABBs. Rebuilt
// once per generated design (see SceneController.jsx's useEffect keyed on
// `model`), not per frame — cheap even for a large multi-floor house.
export function buildWallColliders(model) {
  if (!model?.floors) return [];
  const colliders = [];
  model.floors.forEach((floor) => {
    floor.rooms.forEach((r) => {
      r.wallSegments.forEach((seg) => colliders.push(boxToCollider(seg.size, seg.position)));
    });
  });
  (model.stairwellWalls || []).forEach((seg) => colliders.push(boxToCollider(seg.size, seg.position)));
  return colliders;
}

// Mutates `position` (a THREE.Vector3) in place, pushing it out of any wall box
// it's now penetrating. Two passes so a two-wall corner resolves cleanly instead
// of escaping one wall straight into its neighbor.
//
// A collider is skipped entirely when `position.y` falls outside its Y-range —
// this is what makes collision floor-aware for free: a camera on the ground
// floor is never in range of floor-2's wall boxes (they sit at a different
// absolute Y), so there's no need to track "which floor is the player on"
// anywhere. The box is inflated by `radius` on X/Z only (not Y) since vertical
// clearance isn't this pass's concern.
export function resolveWallCollision(position, colliders, radius) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (position.y < c.minY || position.y > c.maxY) continue;
      const minX = c.minX - radius, maxX = c.maxX + radius;
      const minZ = c.minZ - radius, maxZ = c.maxZ + radius;
      if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) continue;

      const overlapLeft = position.x - minX;
      const overlapRight = maxX - position.x;
      const overlapTop = position.z - minZ;
      const overlapBottom = maxZ - position.z;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if (minOverlap === overlapLeft) position.x = minX;
      else if (minOverlap === overlapRight) position.x = maxX;
      else if (minOverlap === overlapTop) position.z = minZ;
      else position.z = maxZ;
    }
  }
}
