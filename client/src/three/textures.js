// Real, CC0-licensed PBR photo materials (Poly Haven — dl.polyhaven.org — no
// attribution required, safe for any use), downloaded once into
// client/public/textures/<surface>/{diffuse,normal,roughness}.jpg and loaded
// here via THREE.TextureLoader. This is a deliberate, explicit departure from
// this project's earlier "100% procedural, no external assets" rule — the
// user asked for the live viewer to look meaningfully more realistic than
// flat colors + canvas-drawn noise can achieve, and real photographed
// materials (with real normal-map surface detail) are the honest way to get
// there within a real-time WebGL scene. See client/public/textures/ for the
// raw files and the plan this was built from for the exact Poly Haven slugs
// each surface came from.
//
// getPoolTileTexture() is the one holdout still drawn on a canvas — it's a
// small decorative detail (pool coping), not part of this swap's scope.
//
// Wall/roof/floor diffuse maps are left at their real photographed color
// (not the old "near-neutral gray so it multiplies with the style color"
// trick) — real photos already have absolute color, so callers that used to
// multiply a style color on top now pass white instead (see Walls.jsx/
// HouseScene.jsx) so the real photo's own color shows through unmodified.

import * as THREE from 'three';

const cache = new Map();
const loader = new THREE.TextureLoader();

// Loads (and caches) one surface's {map, normalMap, roughnessMap} set from
// client/public/textures/<dir>/. `map` (diffuse/color) is tagged sRGB since
// it encodes perceived color; normalMap/roughnessMap are DATA (a direction
// vector, a scalar), not color, so they're left at three.js's default linear
// colorSpace — tagging them sRGB would wash out normal-map detail and skew
// roughness values.
function loadSet(key, dir) {
  if (cache.has(key)) return cache.get(key);
  const map = loader.load(`/textures/${dir}/diffuse.jpg`);
  const normalMap = loader.load(`/textures/${dir}/normal.jpg`);
  const roughnessMap = loader.load(`/textures/${dir}/roughness.jpg`);
  map.colorSpace = THREE.SRGBColorSpace;
  [map, normalMap, roughnessMap].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  });
  const set = { map, normalMap, roughnessMap };
  cache.set(key, set);
  return set;
}

// Clones a whole {map, normalMap, roughnessMap} set together — all three
// must share one repeat, since repeating just the diffuse map while leaving
// normal/roughness at a different scale would misalign the surface detail
// against the color.
function scaledSet(set, repeatX, repeatZ) {
  const out = {};
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    const t = set[k].clone();
    t.needsUpdate = true;
    t.repeat.set(repeatX, repeatZ);
    out[k] = t;
  }
  return out;
}

function canvas2d(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return { c, ctx: c.getContext('2d') };
}

// Grass: ground plane + garden pad.
export function getGrassTexture() {
  return scaledSet(loadSet('grass', 'grass'), 6, 6);
}

// The generic ground plane is sized at 3x the plot's own largest dimension
// (see houseModel.js), which varies enormously between a small and a large
// design — a fixed repeat would look either sparse or overly dense depending
// on the plot, so this scales tiling proportionally to the actual plane size.
export function getGrassTextureForSize(sizeInUnits) {
  const tilesAcross = Math.max(4, Math.round(sizeInUnits / 6));
  return scaledSet(loadSet('grass', 'grass'), tilesAcross, tilesAcross);
}

// Exterior wall plaster — one shared instance across every exterior wall
// segment regardless of length (same reasoning as the old canvas version:
// a real plaster photo reads fine without being individually rescaled per
// segment; only a strong repeating unit like brick coursing would need that).
export function getStuccoTexture() {
  return scaledSet(loadSet('stucco', 'exterior-wall'), 4, 3);
}

// Roof shingles — repeat=1: the hip roof's own geometry already bakes
// world-space UVs (roofGeometry.js, TILE=8 world units per tile), so the
// texture itself must NOT add another repeat on top or the tiling scale
// doubles up.
export function getShingleTexture() {
  return loadSet('roof', 'roof');
}

// The flat roof's slab is a plain BoxGeometry (standard 0-1 per-face UVs), so
// unlike the hip roof it needs an explicit repeat — sized proportionally to
// the actual roof span, same reasoning as getGrassTextureForSize above.
export function getShingleTextureForSize(width, depth) {
  const TILE = 8;
  return scaledSet(loadSet('roof', 'roof'), Math.max(1, width / TILE), Math.max(1, depth / TILE));
}

// Pool coping/deck — kept procedural (small decorative detail, out of this
// pass's scope): a light mosaic tile pattern, distinct from the real tile
// floor texture's coarser grout-line look.
export function getPoolTileTexture() {
  if (cache.has('poolTile')) return cache.get('poolTile');
  const size = 256;
  const { c, ctx } = canvas2d(size);
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(0, 0, size, size);
  const cell = size / 12;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      const shade = 0.92 + Math.random() * 0.14;
      ctx.fillStyle = `rgb(${Math.round(232 * shade)},${Math.round(227 * shade)},${Math.round(213 * shade)})`;
      ctx.fillRect(col * cell + 1, row * cell + 1, cell - 2, cell - 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set('poolTile', tex);
  return tex;
}

// Paving: parking pad / driveway.
export function getPavingTexture() {
  return scaledSet(loadSet('paving', 'paving'), 4, 4);
}

// Wood flooring — living/bedroom/dining/study/hallway floors, and (Furniture.jsx)
// wood-toned furniture pieces (bed frame, wardrobe, dining table, desk, ...).
export function getWoodFloorTexture() {
  return loadSet('wood', 'wood');
}

// Size-scaled variant, same reasoning as getShingleTextureForSize — room
// floor tiles vary hugely in size between designs.
export function getWoodFloorTextureForSize(width, depth) {
  const TILE = 4;
  return scaledSet(loadSet('wood', 'wood'), Math.max(1, width / TILE), Math.max(1, depth / TILE));
}

// Ceramic tile flooring — kitchen/bathroom/utility floors.
export function getTileFloorTexture() {
  return loadSet('tile', 'tile');
}

export function getTileFloorTextureForSize(width, depth) {
  const TILE = 3;
  return scaledSet(loadSet('tile', 'tile'), Math.max(1, width / TILE), Math.max(1, depth / TILE));
}

// Fabric upholstery — sofa cushions/backrest/arms (Furniture.jsx). One shared
// instance, same reasoning as stucco — furniture pieces are small enough
// that per-piece rescaling isn't worth the complexity.
export function getFabricTexture() {
  return scaledSet(loadSet('fabric', 'fabric'), 2, 2);
}

// Marble — kitchen counter top (Furniture.jsx), real veining instead of a
// flat gray slab. One shared instance, same reasoning as fabric above.
export function getMarbleTexture() {
  return scaledSet(loadSet('marble', 'marble'), 1.5, 1.5);
}
