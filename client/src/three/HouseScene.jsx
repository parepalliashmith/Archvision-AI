import { useMemo } from 'react';
import Label from './Label.jsx';
import RoomWalls from './Walls.jsx';
import Furniture from './Furniture.jsx';
import Roof from './Roof.jsx';
import Landscaping from './Landscaping.jsx';
import { getGrassTexture, getGrassTextureForSize, getPavingTexture, getWoodFloorTexture, getWoodFloorTextureForSize, getTileFloorTextureForSize, getStuccoTexture } from './textures.js';

// Which room types get a real floor material instead of the old flat
// room-color fill — matches houseModel.js's own ROOM_COLORS keys exactly.
// Garage reuses the already-loaded paving texture (see floorMaterials below);
// balcony/other keep today's flat color, unchanged.
const WOOD_FLOOR_TYPES = new Set(['living', 'bedroom', 'dining', 'study', 'hallway']);
const TILE_FLOOR_TYPES = new Set(['kitchen', 'bathroom', 'utility']);

// All STATIC geometry — ground, slab, walls, floor tiles, windows, furniture, stairs,
// roof — as plain declarative JSX, built off `model` (the pre-computed output of
// houseModel.js's buildHouseModel). This only changes when the layout itself changes,
// so the parent memoizes `model` with useMemo and this component just maps it to
// meshes; there is no imperative Three.js code anywhere in this file. Floor isolation,
// the roof toggle, and wireframe are all plain `visible`/material props driven by
// React state one level up — see HouseViewer3D.jsx — no imperative escape hatch is
// needed for any of this. The one exception is camera/walkthrough, which lives in
// SceneController.jsx instead.
//
// `furnitureGroupRef`/`landscapeGroupRef` are only consumed by BuildAnimation.jsx (the
// cinematic reveal) — it needs each as ONE group it can scale 0→1 for the "pop in after
// the structure rises" beat, so furniture and site features are rendered in their own
// loops here (a second pass over the same model data) rather than inline per-room,
// purely so they can live under those two ref'd wrapper groups.
export default function HouseScene({ groupRef, model, roofVisible, wireframe, floorFilter, nightMode, furnitureGroupRef, landscapeGroupRef }) {
  const topLevel = model.floorCount - 1;
  // Procedural, canvas-generated textures — see textures.js. The ground plane's
  // size varies enormously between designs (3x the plot's own largest
  // dimension), so it gets its own texture clone with a proportional repeat;
  // everything else reuses the shared, cached base textures directly.
  const ground = useMemo(() => getGrassTextureForSize(model.ground.size), [model.ground.size]);
  const grass = useMemo(() => getGrassTexture(), []);
  const paving = useMemo(() => getPavingTexture(), []);
  const stairWood = useMemo(() => getWoodFloorTexture(), []);
  const exteriorWall = useMemo(() => getStuccoTexture(), []);
  const lanternIntensity = nightMode ? 2.4 : 0.5;

  // Real per-room floor materials (wood/tile/paving) instead of a flat color
  // fill — rebuilt once per generated design (keyed on `model`), not per
  // frame. Rooms with no match (balcony, other, ...) are left out of the map
  // entirely and keep today's exact look.
  const floorMaterials = useMemo(() => {
    const map = new Map();
    model.floors.forEach((floor) => {
      floor.rooms.forEach((r) => {
        const type = r.room.type;
        const [w, , d] = r.floorTile.size;
        if (WOOD_FLOOR_TYPES.has(type)) map.set(r.key, getWoodFloorTextureForSize(w, d));
        else if (TILE_FLOOR_TYPES.has(type)) map.set(r.key, getTileFloorTextureForSize(w, d));
        else if (type === 'garage') map.set(r.key, paving);
      });
    });
    return map;
  }, [model, paving]);

  return (
    <>
      {/* Site: ground plane + foundation slab, always visible regardless of floor
          filter. Deliberately rendered OUTSIDE groupRef (as siblings, not children):
          groupRef is exactly what SceneController's THREE.Box3.setFromObject() uses
          to frame the camera for setCameraView()/enterWalkthrough(), and Box3 does
          NOT consult an object's `visible` flag (confirmed against three.js's own
          Box3.expandByObject source) — a ground plane sized 3x the plot's largest
          dimension living in that same group would permanently dominate the
          bounding box, making every camera preset frame against ~3x the house's
          real size and making floor isolation not actually change the framing at
          all, contradicting the spec's explicit "must be recomputed on demand...
          since floor-filtering changes the visible bounding box" requirement. This
          split keeps the ground/slab visually present (they still render, still
          receive shadows) while excluding them from camera-bounds math. Also stays
          outside the cinematic build-in's clipping group deliberately — the ground
          reads as "the site" and is there from the very first frame, blueprint-style. */}
      <mesh position={model.ground.position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[model.ground.size, model.ground.size]} />
        <meshStandardMaterial map={ground.map} normalMap={ground.normalMap} roughnessMap={ground.roughnessMap} roughness={1} />
      </mesh>
      <mesh position={model.slab.position} receiveShadow>
        <boxGeometry args={model.slab.size} />
        <meshStandardMaterial color="#b9b3a6" />
      </mesh>

      <group ref={groupRef}>
        {model.floors.map((floor, i) => (
          <group key={floor.level} visible={floorFilter === null || floorFilter === i}>
            {floor.rooms.map((r) => {
              const floorMap = floorMaterials.get(r.key);
              return (
                <group key={r.key}>
                  <mesh position={r.floorTile.position} receiveShadow>
                    <boxGeometry args={r.floorTile.size} />
                    <meshStandardMaterial
                      color={floorMap ? '#ffffff' : r.color}
                      map={floorMap?.map || null}
                      normalMap={floorMap?.normalMap || null}
                      roughnessMap={floorMap?.roughnessMap || null}
                      roughness={floorMap ? 1 : 0.9}
                      wireframe={wireframe}
                    />
                  </mesh>
                  <RoomWalls wallSegments={r.wallSegments} windowPanes={r.windowPanes} wireframe={wireframe} wallColorExterior={model.wallColorExterior} accentColor={model.accentColor} nightMode={nightMode} />
                  <Label text={r.label.text} position={r.label.position} />
                </group>
              );
            })}
          </group>
        ))}

        {/* A stair "belongs" to two floors: it stays visible if the filter shows every
            floor, or the floor it starts from, or the floor above it. */}
        {model.stairs.map((stair) => (
          <group
            key={stair.key}
            visible={floorFilter === null || floorFilter === stair.fromFloor || floorFilter === stair.fromFloor + 1}
          >
            {stair.treads.map((tread, i) => (
              <mesh key={i} position={tread.position} castShadow receiveShadow>
                <boxGeometry args={tread.size} />
                <meshStandardMaterial color="#ffffff" map={stairWood.map} normalMap={stairWood.normalMap} roughnessMap={stairWood.roughnessMap} roughness={1} />
              </mesh>
            ))}
            {/* Wall-mounted handrail — see houseModel.js's buildHouseModel
                (the stairs map) for why this is a wall rail, not free-
                standing balusters: the stairwell is enclosed on both long
                sides once stairwellWalls (below) renders. */}
            {stair.rail.map((bar, i) => (
              <mesh key={`rail-${i}`} position={bar.position} castShadow>
                <boxGeometry args={bar.size} />
                <meshStandardMaterial color={model.accentColor} roughness={0.5} metalness={0.3} wireframe={wireframe} />
              </mesh>
            ))}
            <Label text={stair.label.text} position={stair.label.position} />
          </group>
        ))}

        {/* Stairwell enclosure — the actual stairs fix (see
            buildStairwellWalls' header comment in houseModel.js): without
            this, the stairs strip designGenerator.js reserves is open to the
            outside on 3 of its 4 sides, since only rooms ever produce wall
            geometry elsewhere. Not floor-gated (spans the whole building
            height in one piece, same as the boundary wall). Textured with
            the same real stucco as every other exterior wall. */}
        {model.stairwellWalls.map((seg) => (
          <mesh key={seg.key} position={seg.position} castShadow receiveShadow>
            <boxGeometry args={seg.size} />
            <meshStandardMaterial
              color={model.wallColorExterior}
              map={exteriorWall.map}
              normalMap={exteriorWall.normalMap}
              roughnessMap={exteriorWall.roughnessMap}
              roughness={1}
              wireframe={wireframe}
            />
          </mesh>
        ))}

        <Roof roof={model.roof} visible={roofVisible && (floorFilter === null || floorFilter === topLevel)} />

        {/* Balconies: upper floors only, projecting from the entrance-facing
            facade — see buildBalconies' header comment in houseModel.js. */}
        {model.balconies.map((b) => (
          <group key={b.key} visible={floorFilter === null || floorFilter === b.floor}>
            <mesh position={b.slab.position} receiveShadow castShadow>
              <boxGeometry args={b.slab.size} />
              <meshStandardMaterial color="#b9b3a6" wireframe={wireframe} />
            </mesh>
            {b.balusters.map((baluster, i) => (
              <mesh key={i} position={baluster.position} castShadow>
                <boxGeometry args={baluster.size} />
                <meshStandardMaterial color={model.accentColor} roughness={0.6} metalness={0.3} wireframe={wireframe} />
              </mesh>
            ))}
            <mesh position={b.railTop.position} castShadow>
              <boxGeometry args={b.railTop.size} />
              <meshStandardMaterial color={model.accentColor} roughness={0.6} metalness={0.3} wireframe={wireframe} />
            </mesh>
          </group>
        ))}

        {/* Entrance porch: a step + canopy on posts marking the front door, tied to
            the ground floor's visibility like everything else on that floor. */}
        {model.entrancePorch && (
          <group visible={floorFilter === null || floorFilter === 0}>
            <mesh position={model.entrancePorch.step.position} receiveShadow castShadow>
              <boxGeometry args={model.entrancePorch.step.size} />
              <meshStandardMaterial color={model.entrancePorch.step.color} wireframe={wireframe} />
            </mesh>
            <mesh position={model.entrancePorch.canopy.position} castShadow>
              <boxGeometry args={model.entrancePorch.canopy.size} />
              <meshStandardMaterial color={model.entrancePorch.canopy.color} roughness={0.7} wireframe={wireframe} />
            </mesh>
            {model.entrancePorch.posts.map((post) => (
              <mesh key={post.key} position={post.position} castShadow>
                <boxGeometry args={post.size} />
                <meshStandardMaterial color={post.color} roughness={0.8} wireframe={wireframe} />
              </mesh>
            ))}
          </group>
        )}

        {/* Entrance tower: traditional/farmhouse styles only (see
            buildEntranceTower's header comment) — a corner cylinder + conical
            cap rising above the roof line, the "villa" massing signature.
            Not floor-gated, same reasoning as the boundary wall: it's an
            exterior facade feature, not tied to any one floor's rooms. */}
        {model.entranceTower && (
          <group>
            <mesh position={model.entranceTower.position} castShadow receiveShadow>
              <cylinderGeometry args={[model.entranceTower.radius, model.entranceTower.radius, model.entranceTower.height, 16]} />
              <meshStandardMaterial color={model.entranceTower.color} roughness={0.8} wireframe={wireframe} />
            </mesh>
            <mesh position={model.entranceTower.cap.position} castShadow>
              <coneGeometry args={[model.entranceTower.cap.radius, model.entranceTower.cap.height, 16]} />
              <meshStandardMaterial color={model.entranceTower.cap.color} roughness={0.7} wireframe={wireframe} />
            </mesh>
          </group>
        )}

        {/* Furniture: collected into its own ref'd group (rather than left inline
            per-room) purely so the cinematic build-in can pop it all in as one
            unit after the structure finishes rising — see HouseScene's own
            header comment. Visibility still follows the floor filter per-floor. */}
        <group ref={furnitureGroupRef}>
          {model.floors.map((floor, i) => (
            <group key={floor.level} visible={floorFilter === null || floorFilter === i}>
              {floor.rooms.map((r) => (
                <Furniture key={r.key} room={r.room} yBase={floor.yBase} dims={model.dims} scale={model.unitScale} nightMode={nightMode} accentColor={model.accentColor} />
              ))}
            </group>
          ))}
        </group>

        {/* Site / landscape features — garden, parking, boundary wall, lanterns —
            grouped under one ref for the same "pop in after the structure" reason
            as furniture above. Always visible regardless of floor filter, same as
            before this grouping. */}
        <group ref={landscapeGroupRef}>
          {/* Garden / open space: only present when the requirements asked for one
              ("Wants a garden / open space"). */}
          {model.openSpace && (
            <group>
              <mesh position={model.openSpace.pad.position} receiveShadow>
                <boxGeometry args={model.openSpace.pad.size} />
                <meshStandardMaterial map={grass.map} normalMap={grass.normalMap} roughnessMap={grass.roughnessMap} roughness={1} wireframe={wireframe} />
              </mesh>
              {model.openSpace.bushes.map((bush) => (
                <mesh key={bush.key} position={bush.position} castShadow receiveShadow>
                  <sphereGeometry args={[bush.radius, 10, 8]} />
                  <meshStandardMaterial color="#4f7f3f" roughness={0.9} wireframe={wireframe} />
                </mesh>
              ))}
              <Landscaping trees={model.openSpace.trees} pool={model.openSpace.pool} wireframe={wireframe} />
            </group>
          )}

          {/* Covered parking / garage: only present when the requirements asked for
              one ("Needs covered parking"). A paved pad plus a pergola canopy on 4
              posts — "covered", matching the requirement's own wording. */}
          {model.parking && (
            <group>
              <mesh position={model.parking.pad.position} receiveShadow>
                <boxGeometry args={model.parking.pad.size} />
                <meshStandardMaterial map={paving.map} normalMap={paving.normalMap} roughnessMap={paving.roughnessMap} roughness={1} wireframe={wireframe} />
              </mesh>
              {model.parking.canopy.beams.map((beam) => (
                <mesh key={beam.key} position={beam.position} castShadow>
                  <boxGeometry args={beam.size} />
                  <meshStandardMaterial color={model.accentColor} roughness={0.7} wireframe={wireframe} />
                </mesh>
              ))}
              {model.parking.canopy.crossBeams.map((beam) => (
                <mesh key={beam.key} position={beam.position} castShadow>
                  <boxGeometry args={beam.size} />
                  <meshStandardMaterial color={model.accentColor} roughness={0.7} wireframe={wireframe} />
                </mesh>
              ))}
              {model.parking.posts.map((post) => (
                <mesh key={post.key} position={post.position} castShadow>
                  <boxGeometry args={post.size} />
                  <meshStandardMaterial color={model.accentColor} roughness={0.8} wireframe={wireframe} />
                </mesh>
              ))}
            </group>
          )}

          {/* Compound/boundary wall + gate pillars — always present (see
              buildBoundaryWallModel's header comment), a general "gated
              property" upgrade rather than a requirement-gated feature. */}
          {model.boundaryWall && (
            <group>
              {model.boundaryWall.segments.map((seg) => (
                <mesh key={seg.key} position={seg.position} castShadow receiveShadow>
                  <boxGeometry args={seg.size} />
                  <meshStandardMaterial color="#d8d2c4" roughness={0.85} wireframe={wireframe} />
                </mesh>
              ))}
              {model.boundaryWall.pillars.map((p) => (
                <mesh key={p.key} position={p.position} castShadow receiveShadow>
                  <boxGeometry args={p.size} />
                  <meshStandardMaterial color={model.accentColor} roughness={0.7} wireframe={wireframe} />
                </mesh>
              ))}
            </group>
          )}

          {/* Lantern fixtures: a warm emissive glow on the entrance posts and gate
              pillars — no real light source (kept cheap). Dim by day, bright at
              night, driven by `nightMode` rather than an always-on constant. */}
          {model.lanterns.map((lantern) => (
            <mesh key={lantern.key} position={lantern.position}>
              <sphereGeometry args={[lantern.radius, 10, 8]} />
              <meshStandardMaterial color="#fff2cf" emissive="#ffb84d" emissiveIntensity={lanternIntensity} roughness={0.4} wireframe={wireframe} />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}
