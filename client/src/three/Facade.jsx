import { Bush } from './Landscaping.jsx';

// Renders houseModel.js's buildModernFacade() data: timber slat bay, vertical fins,
// the cantilevered car-porch slab with its timber soffit, full-height glazing, warm
// downlights and foundation shrubs. Plain boxes and flat emissive shapes — no real
// light sources, so no per-frame cost; the glow simply brightens at dusk/night
// (`glow`), where the existing Bloom pass lifts it.
function Box({ item, wireframe, roughness = 0.7, metalness = 0 }) {
  return (
    <mesh position={item.position} castShadow receiveShadow>
      <boxGeometry args={item.size} />
      <meshStandardMaterial color={item.color} roughness={roughness} metalness={metalness} wireframe={wireframe} />
    </mesh>
  );
}

const FRAME_COLOR = '#23262c';

export default function Facade({ facade, wireframe = false, glow = 0.3, lite = false }) {
  const { timber, fins, porch, lights, strips, glazing = [], plants = [] } = facade;
  const lit = glow > 1; // dusk / night
  return (
    <group>
      {timber && (
        <group>
          <Box item={timber.backing} wireframe={wireframe} roughness={0.9} />
          {timber.slats.map((slat) => <Box key={slat.key} item={slat} wireframe={wireframe} roughness={0.62} />)}
        </group>
      )}
      {fins.map((fin) => <Box key={fin.key} item={fin} wireframe={wireframe} roughness={0.62} />)}

      {glazing.map((g) => (
        <group key={g.key}>
          <mesh position={g.glass.position}>
            <boxGeometry args={g.glass.size} />
            <meshStandardMaterial
              color={lit ? '#3a2f22' : '#1e2c3a'}
              emissive="#ffc978"
              emissiveIntensity={lit ? 0.85 : 0.04}
              roughness={0.12}
              metalness={0.35}
              wireframe={wireframe}
            />
          </mesh>
          {g.bars.map((b, i) => (
            <mesh key={i} position={b.position} castShadow>
              <boxGeometry args={b.size} />
              <meshStandardMaterial color={FRAME_COLOR} roughness={0.5} metalness={0.4} wireframe={wireframe} />
            </mesh>
          ))}
        </group>
      ))}

      <Box item={porch.slab} wireframe={wireframe} roughness={0.55} />
      <Box item={porch.soffit} wireframe={wireframe} roughness={0.6} />
      {porch.columns.map((col) => <Box key={col.key} item={col} wireframe={wireframe} roughness={0.5} metalness={0.3} />)}

      {lights.map((l) => (
        <mesh key={l.key} position={l.position} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[l.radius, 14]} />
          <meshStandardMaterial color="#fff4dc" emissive="#ffc46b" emissiveIntensity={glow * 1.4} side={2} />
        </mesh>
      ))}
      {strips.map((s) => (
        <mesh key={s.key} position={s.position}>
          <boxGeometry args={s.size} />
          <meshStandardMaterial color="#fff0d0" emissive="#ffb85c" emissiveIntensity={glow} />
        </mesh>
      ))}

      {plants.map((b) => <Bush key={b.key} bush={b} wireframe={wireframe} lite={lite} />)}
    </group>
  );
}
