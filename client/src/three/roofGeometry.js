import * as THREE from 'three';

// A procedural hip roof: four faces rising from a rectangular eave to a ridge line
// centered on the shorter axis, plus a closed underside so it never reads as a hollow
// shell from a top-down or walkthrough view. When the footprint is square the ridge
// collapses to a single point and the roof becomes a pyramid — that's the same formula
// with ridgeHalf = 0, not a special case, so this stays a real upgrade over the old
// 4-sided ConeGeometry cone while remaining 100% procedural from width/depth/height
// (never a fixed/pre-made mesh).
export function buildHipRoofGeometry(width, depth, height, overhang) {
  const hw = width / 2 + overhang;
  const hd = depth / 2 + overhang;
  const longAxisIsX = width >= depth;
  const ridgeHalf = Math.max(0, longAxisIsX ? hw - hd : hd - hw);

  // Eave corners at y = 0, going around the perimeter: north-west, north-east,
  // south-east, south-west (north = -Z, matching the room-wall convention elsewhere).
  const A = [-hw, 0, -hd];
  const B = [hw, 0, -hd];
  const C = [hw, 0, hd];
  const D = [-hw, 0, hd];

  // The two ends of the ridge line (equal, i.e. a single point, when it collapses).
  const R1 = longAxisIsX ? [-ridgeHalf, height, 0] : [0, height, -ridgeHalf];
  const R2 = longAxisIsX ? [ridgeHalf, height, 0] : [0, height, ridgeHalf];

  const positions = [];
  const uvs = [];
  // Shingle/tile UVs measured ALONG each slope: u runs along the eave, v is the
  // real distance up the slope from the eave (hypot of horizontal run and rise).
  // The old top-down (x,z) projection stretched the texture on steep faces; this
  // keeps tile size constant regardless of pitch. TILE is world units per repeat.
  const TILE = 8;
  const slope = { // per face: which axis is "along the eave" and where the eave line is
    north: (p) => [p[0] / TILE, Math.hypot(p[2] + hd, p[1]) / TILE],
    south: (p) => [p[0] / TILE, Math.hypot(hd - p[2], p[1]) / TILE],
    west: (p) => [p[2] / TILE, Math.hypot(p[0] + hw, p[1]) / TILE],
    east: (p) => [p[2] / TILE, Math.hypot(hw - p[0], p[1]) / TILE],
    under: (p) => [p[0] / TILE, p[2] / TILE],
  };
  const pushVert = (p, f) => { positions.push(...p); uvs.push(...slope[f](p)); };
  const pushTri = (a, b, c, f) => { pushVert(a, f); pushVert(b, f); pushVert(c, f); };
  const pushQuad = (a, b, c, d, f) => { pushTri(a, b, c, f); pushTri(a, c, d, f); };

  if (longAxisIsX) {
    pushQuad(A, B, R2, R1, 'north'); // north slope
    pushQuad(C, D, R1, R2, 'south'); // south slope
    pushTri(A, D, R1, 'west');       // west hip
    pushTri(C, B, R2, 'east');       // east hip
  } else {
    pushQuad(D, A, R1, R2, 'west');  // west slope
    pushQuad(B, C, R2, R1, 'east');  // east slope
    pushTri(D, C, R2, 'south');      // south hip
    pushTri(B, A, R1, 'north');      // north hip
  }
  pushQuad(A, D, C, B, 'under'); // underside cap

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
