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
  // A shingle/tile texture (textures.js) needs UV coordinates to show its
  // pattern at all — without them every face just samples one arbitrary texel
  // and reads as a flat color. A true per-face planar UV (projected into each
  // sloped face's own plane) would be more accurate, but for a subtle, mostly-
  // isotropic shingle pattern a simple top-down (x,z) projection — the same
  // technique terrain/roof shaders commonly use — tiles consistently across
  // every face at effectively zero extra complexity; TILE is world units per
  // texture repeat.
  const TILE = 8;
  const pushVert = (p) => { positions.push(...p); uvs.push(p[0] / TILE, p[2] / TILE); };
  const pushTri = (a, b, c) => { pushVert(a); pushVert(b); pushVert(c); };
  const pushQuad = (a, b, c, d) => { pushTri(a, b, c); pushTri(a, c, d); };

  if (longAxisIsX) {
    pushQuad(A, B, R2, R1); // north slope
    pushQuad(C, D, R1, R2); // south slope
    pushTri(A, D, R1);      // west hip
    pushTri(C, B, R2);      // east hip
  } else {
    pushQuad(D, A, R1, R2); // west slope
    pushQuad(B, C, R2, R1); // east slope
    pushTri(D, C, R2);      // south hip
    pushTri(B, A, R1);      // north hip
  }
  pushQuad(A, D, C, B); // underside cap

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
