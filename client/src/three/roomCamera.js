// Camera framing for a single room's video clip ("Generate Video for Each
// Room", HouseViewer3D.jsx) — pure math, no THREE import, same convention as
// collision.js/houseModel.js. Deterministic from the room's own real
// x/y/width/depth (this file follows the same no-Math.random()-in-geometry
// rule as the rest of the app), not the house-level named presets in
// SceneController.jsx's computePose (those frame the whole building; this
// frames one room from the inside).

// A short diagonal pan across the room at eye height — from near one corner
// looking toward the far side, ending near the opposite corner looking back —
// so the clip reads as "step into the room and look around" rather than a
// static screenshot held for a few seconds.
export function computeRoomPoses(room, floorYBase, dims) {
  const cx = room.x + room.width / 2;
  const cz = room.y + room.depth / 2;
  const eyeY = floorYBase + dims.eyeHeight;
  const lookY = floorYBase + dims.eyeHeight * 0.85;
  const offX = room.width * 0.32;
  const offZ = room.depth * 0.32;
  return {
    start: {
      position: [cx - offX, eyeY, cz - offZ],
      target: [cx + offX * 0.4, lookY, cz + offZ * 0.4],
    },
    end: {
      position: [cx - offX * 0.4, eyeY, cz + offZ],
      target: [cx + offX, lookY, cz - offZ * 0.3],
    },
  };
}
