// Architectural elevations — an orthographic (straight-on, not perspective)
// view of each exterior face of the house, the standard architectural
// drawing type alongside a floor plan. Deliberately built as a PROJECTION of
// the exact same geometry buildHouseModel already computed (wall footprint,
// window positions/sizes, the entrance opening, the roof's own math) rather
// than a second, independent drawing algorithm — that would risk disagreeing
// with the 3D model or the 2D floor plan over something as basic as "how many
// windows does the front of this house have."
//
// Every floor in this app shares the exact same footprint rectangle (the
// rule-based generator always subdivides the same site.roomRect for every
// floor — see designGenerator.js's planSite), so each elevation's wall
// outline is simply that footprint's relevant edge repeated per floor — no
// need to stitch together individual 3D wall segments.
//
// All coordinates below are in one consistent "elevation space": x=0 at the
// left edge of the drawing, y=0 at the ground line, both in the model's own
// unit (ft or m) — ready to hand straight to an SVG renderer.

const DIRECTIONS = [
  { key: 'north', label: 'Front Elevation' },
  { key: 'south', label: 'Rear Elevation' },
  { key: 'west', label: 'Left Elevation' },
  { key: 'east', label: 'Right Elevation' },
];

// Hip roof silhouette from a given direction — replicates roofGeometry.js's
// own eave/ridge math (hw/hd/ridgeHalf) rather than approximating, so the
// elevation's roofline always matches the actual 3D roof. Returns points
// relative to the building's own center along this elevation's axis; the
// caller re-centers them into the shared "left edge = 0" drawing space.
function hipRoofProfile(model, viewAxisIsX) {
  const fp = model.buildingFootprint;
  const overhang = model.roof.overhang;
  const hw = fp.width / 2 + overhang;
  const hd = fp.depth / 2 + overhang;
  const longAxisIsX = fp.width >= fp.depth;
  const ridgeHalf = Math.max(0, longAxisIsX ? hw - hd : hd - hw);
  const eaveY = model.totalHeight;
  const ridgeY = model.totalHeight + model.roof.height;
  const half = viewAxisIsX ? hw : hd;
  // Looking along the same axis the ridge itself runs -> the long pitched
  // side (a trapezoid, or a triangle if the footprint is square enough that
  // the ridge has no length). Looking the other way -> the triangular hip
  // end, always a single peak regardless of ridge length.
  const sameAxisAsRidge = viewAxisIsX === longAxisIsX;
  if (sameAxisAsRidge && ridgeHalf > 0.01) {
    return [
      { x: -half, y: eaveY }, { x: -ridgeHalf, y: ridgeY },
      { x: ridgeHalf, y: ridgeY }, { x: half, y: eaveY },
    ];
  }
  return [{ x: -half, y: eaveY }, { x: 0, y: ridgeY }, { x: half, y: eaveY }];
}

function flatRoofProfile(model, halfFootprint) {
  const overhang = model.roof.overhang;
  const half = halfFootprint + overhang;
  const parapetTop = model.totalHeight + model.roof.slab.size[1] + model.roof.parapets[0].size[1];
  const slabTop = model.totalHeight + model.roof.slab.size[1];
  // A simple parapet silhouette: eave-height up to the slab top, a step up to
  // the parapet's own top, flat across, step back down — reads clearly as
  // "flat roof with a raised rim" without needing the exact parapet width.
  return [
    { x: -half, y: model.totalHeight }, { x: -half, y: slabTop },
    { x: half, y: slabTop }, { x: half, y: model.totalHeight },
  ].concat(
    // The raised parapet rim itself, inset slightly from the slab edge.
    [
      { x: -half + overhang, y: slabTop }, { x: -half + overhang, y: parapetTop },
      { x: half - overhang, y: parapetTop }, { x: half - overhang, y: slabTop },
    ]
  );
}

export function buildElevations(model) {
  const fp = model.buildingFootprint;

  return DIRECTIONS.map(({ key, label }) => {
    const viewAxisIsX = key === 'north' || key === 'south';
    const spanMin = viewAxisIsX ? fp.x : fp.y;
    const width = viewAxisIsX ? fp.width : fp.depth;
    const halfFootprint = width / 2;
    const centerRelative = halfFootprint; // building's own center, in this drawing's x

    const windows = [];
    model.floors.forEach((floor) => {
      floor.rooms.forEach((r) => {
        r.windowPanes.forEach((w) => {
          if (w.side !== key) return;
          const along = viewAxisIsX ? w.position[0] : w.position[2];
          const spanW = viewAxisIsX ? w.size[0] : w.size[2];
          windows.push({
            x: along - spanW / 2 - spanMin,
            y: w.position[1] - w.size[1] / 2,
            width: spanW,
            height: w.size[1],
          });
        });
      });
    });

    let door = null;
    if (model.entranceOpening && model.entranceOpening.wall === key) {
      const doorHeight = Math.min(model.dims.wallHeight * 0.8, model.dims.windowSill + model.dims.windowHeight + 1);
      door = {
        x: model.entranceOpening.along - model.entranceOpening.width / 2 - spanMin,
        y: 0,
        width: model.entranceOpening.width,
        height: doorHeight,
      };
    }

    const roofPoints = (model.roof.type === 'flat' ? flatRoofProfile(model, halfFootprint) : hipRoofProfile(model, viewAxisIsX))
      .map((p) => ({ x: p.x + centerRelative, y: p.y }));

    return {
      key, label, width,
      floorCount: model.floorCount,
      floorToFloor: model.floorToFloor,
      wallTop: model.totalHeight,
      unit: model.unit,
      windows,
      door,
      roofPoints,
    };
  });
}
