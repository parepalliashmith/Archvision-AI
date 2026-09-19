import { useEffect, useState } from 'react';
import { getFloorPlans } from '../lib/api.js';

// Same palette as the 3D viewer (viewer3d.js), as CSS colors instead of hex numbers,
// so a room reads the same color in both the 2D plan and the 3D model.
const ROOM_FILL = {
  living: '#f4d58d', bedroom: '#a7c7e7', kitchen: '#b7e4c7', bathroom: '#9fd8ef',
  dining: '#ffcf99', garage: '#c9d1d3', hallway: '#e3e3e3', balcony: '#cdeac0',
  study: '#d0bdf4', utility: '#d8cab8', other: '#e9e9e9',
};

export default function FloorPlan2D({ design }) {
  const [floorPlans, setFloorPlans] = useState(null);
  const [floorIndex, setFloorIndex] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setFloorPlans(null);
    setError(null);
    setFloorIndex(0);
    getFloorPlans(design)
      .then((data) => { if (!cancelled) setFloorPlans(data.floorPlans); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not draw the floor plan.'); });
    return () => { cancelled = true; };
  }, [design]);

  if (error) return <p className="empty-state">{error}</p>;
  if (!floorPlans) return <p className="section-sub">Drawing floor plan…</p>;

  const fp = floorPlans[floorIndex];
  const fontLg = Math.max(fp.plot.width, fp.plot.depth) * 0.028;
  const fontSm = fontLg * 0.75;

  return (
    <div className="floorplan2d">
      {floorPlans.length > 1 && (
        <div className="floorplan2d-tabs">
          {floorPlans.map((f, i) => (
            <button key={f.level} className={'tab-sm' + (i === floorIndex ? ' active' : '')} onClick={() => setFloorIndex(i)}>
              {f.level === 0 ? 'Ground Floor' : `Floor ${f.level + 1}`}
            </button>
          ))}
        </div>
      )}
      <svg viewBox={`${fp.bounds.x} ${fp.bounds.y} ${fp.bounds.width} ${fp.bounds.height}`} className="floorplan2d-svg">
        <rect x={fp.bounds.x} y={fp.bounds.y} width={fp.bounds.width} height={fp.bounds.height} fill="#f7f5f0" />

        {/* Plot outline */}
        <rect x={fp.plot.x} y={fp.plot.y} width={fp.plot.width} height={fp.plot.depth} fill="none" stroke="#b0a99a" strokeDasharray={fontSm * 0.4} strokeWidth={fontSm * 0.08} />

        {/* Open space */}
        {fp.openSpace && (
          <g>
            <rect x={fp.openSpace.x} y={fp.openSpace.y} width={fp.openSpace.width} height={fp.openSpace.depth} fill="#cdeac0" fillOpacity="0.5" stroke="#8fbf7f" strokeDasharray={fontSm * 0.3} strokeWidth={fontSm * 0.06} />
            <text x={fp.openSpace.x + fp.openSpace.width / 2} y={fp.openSpace.y + fp.openSpace.depth / 2} fontSize={fontSm} textAnchor="middle" fill="#3d6b2f">Open Space</text>
          </g>
        )}

        {/* Parking */}
        {fp.parking && (
          <g>
            <rect x={fp.parking.x} y={fp.parking.y} width={fp.parking.width} height={fp.parking.depth} fill="#c9d1d3" fillOpacity="0.6" stroke="#8a949a" strokeWidth={fontSm * 0.06} />
            <text x={fp.parking.x + fp.parking.width / 2} y={fp.parking.y + fp.parking.depth / 2} fontSize={fontSm} textAnchor="middle" fill="#4a5257">
              Parking ({fp.parking.capacity})
            </text>
          </g>
        )}

        {/* Rooms: fill + name + dimensions */}
        {fp.rooms.map((r, i) => (
          <g key={i}>
            <rect x={r.x} y={r.y} width={r.width} height={r.depth} fill={ROOM_FILL[r.type] || ROOM_FILL.other} stroke="none" />
            <text x={r.x + r.width / 2} y={r.y + r.depth / 2 - fontLg * 0.5} fontSize={fontLg} textAnchor="middle" fontWeight="600" fill="#1c2128">
              {r.name}
            </text>
            <text x={r.x + r.width / 2} y={r.y + r.depth / 2 + fontLg * 0.7} fontSize={fontSm} textAnchor="middle" fill="#565f6b">
              {r.dimensionLabel}
            </text>
          </g>
        ))}

        {/* Stairs: outline + steps + direction label */}
        {fp.stairs.map((s, i) => (
          <g key={i}>
            <rect x={s.x} y={s.y} width={s.width} height={s.depth} fill="#efe6da" stroke="#8a6a52" strokeWidth={fontSm * 0.06} />
            {s.steps.map((step, j) => (
              <line key={j} x1={step.x1} y1={step.y1} x2={step.x2} y2={step.y2} stroke="#8a6a52" strokeWidth={fontSm * 0.05} />
            ))}
            <text x={s.x + s.width / 2} y={s.y + s.depth / 2} fontSize={fontSm} textAnchor="middle" fill="#5b4632" transform={s.depth > s.width ? `rotate(90 ${s.x + s.width / 2} ${s.y + s.depth / 2})` : undefined}>
              {s.label} STAIRS
            </text>
          </g>
        ))}

        {/* Walls — exterior thicker than interior */}
        {fp.walls.map((w, i) => (
          <line
            key={i}
            x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
            stroke="#2b2f36"
            strokeWidth={w.kind === 'exterior' ? fp.wallThickness.exterior : fp.wallThickness.interior}
            strokeLinecap="square"
          />
        ))}

        {/* Windows: double-line symbol across the wall */}
        {fp.windows.map((win, i) => {
          const off = fp.wallThickness.exterior * 0.35;
          const dx = win.orientation === 'v' ? off : 0;
          const dy = win.orientation === 'h' ? off : 0;
          return (
            <g key={i}>
              <line x1={win.x1 - dx} y1={win.y1 - dy} x2={win.x2 - dx} y2={win.y2 - dy} stroke="#4a90c4" strokeWidth={fp.wallThickness.interior * 0.5} />
              <line x1={win.x1 + dx} y1={win.y1 + dy} x2={win.x2 + dx} y2={win.y2 + dy} stroke="#4a90c4" strokeWidth={fp.wallThickness.interior * 0.5} />
            </g>
          );
        })}

        {/* Doors: leaf (solid) + swing arc (dashed) — the main entrance leaf is drawn
            in the accent color so it stands out from ordinary interior doors. */}
        {fp.doors.map((d, i) => (
          <g key={i}>
            <line x1={d.hinge.x} y1={d.hinge.y} x2={d.leafEnd.x} y2={d.leafEnd.y} stroke={d.isEntrance ? '#c2660c' : '#8a5a2b'} strokeWidth={fp.wallThickness.interior * (d.isEntrance ? 0.9 : 0.6)} />
            <path d={d.arcPath} fill="none" stroke={d.isEntrance ? '#c2660c' : '#8a5a2b'} strokeWidth={fp.wallThickness.interior * 0.3} strokeDasharray={fontSm * 0.15} />
          </g>
        ))}

        {/* Main entrance marker: a small "welcome mat" just outside the front wall
            plus an ENTRANCE label, so the front door is unmistakable at a glance. */}
        {fp.entranceMarker && (
          <g>
            <line
              x1={fp.entranceMarker.matStart.x} y1={fp.entranceMarker.matStart.y}
              x2={fp.entranceMarker.matEnd.x} y2={fp.entranceMarker.matEnd.y}
              stroke="#c2660c" strokeWidth={fontSm * 0.35} strokeLinecap="round"
            />
            <text
              x={fp.entranceMarker.outX} y={fp.entranceMarker.outY}
              fontSize={fontSm} fontWeight="700" textAnchor="middle" fill="#c2660c"
            >
              ENTRANCE
            </text>
          </g>
        )}

        {/* Overall plot dimension lines */}
        {fp.dimensionLines.map((dl, i) => (
          <g key={i} stroke="#8a94a0" strokeWidth={fontSm * 0.05}>
            <line x1={dl.x1} y1={dl.y1} x2={dl.x2} y2={dl.y2} />
            <line x1={dl.x1} y1={dl.y1 - (dl.vertical ? fontSm * 0.3 : 0) - (dl.vertical ? 0 : 0)} x2={dl.x1} y2={dl.y1} strokeDasharray="none" />
            <text
              x={dl.vertical ? dl.x1 - fontSm * 0.4 : (dl.x1 + dl.x2) / 2}
              y={dl.vertical ? (dl.y1 + dl.y2) / 2 : dl.y1 - fontSm * 0.4}
              fontSize={fontSm}
              textAnchor="middle"
              fill="#565f6b"
              stroke="none"
              transform={dl.vertical ? `rotate(-90 ${dl.x1 - fontSm * 0.4} ${(dl.y1 + dl.y2) / 2})` : undefined}
            >
              {dl.text}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
