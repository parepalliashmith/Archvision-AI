import { useState } from 'react';

// Renders one of the 4 architectural elevations (buildElevations() in
// elevations.js) as an SVG — the exterior facade viewed straight-on, not the
// top-down floor plan and not a 3D perspective. Elevation data's y-axis grows
// UPWARD from the ground (y=0); SVG's grows downward, so every y coordinate
// is flipped via toSvgY() rather than a CSS transform, which would also flip
// the text labels upside down.
export default function Elevation2D({ elevations, wallColor, roofColor, accentColor }) {
  const [index, setIndex] = useState(0);
  if (!elevations || !elevations.length) return null;
  const el = elevations[index];

  const roofTop = Math.max(el.wallTop, ...el.roofPoints.map((p) => p.y));
  const margin = Math.max(el.width, roofTop) * 0.16;
  const boundsWidth = el.width + margin * 2;
  const boundsHeight = roofTop + margin * 2.2;
  const fontLg = Math.max(el.width, roofTop) * 0.045;
  const fontSm = fontLg * 0.68;
  const toSvgY = (y) => roofTop - y;

  const roofPointsAttr = el.roofPoints.map((p) => `${p.x},${toSvgY(p.y)}`).join(' ');

  return (
    <div className="floorplan2d elevation2d">
      <div className="floorplan2d-tabs">
        {elevations.map((e, i) => (
          <button key={e.key} className={'tab-sm' + (i === index ? ' active' : '')} onClick={() => setIndex(i)}>
            {e.label}
          </button>
        ))}
      </div>
      <svg
        viewBox={`${-margin} ${-margin * 0.6} ${boundsWidth} ${boundsHeight}`}
        className="floorplan2d-svg"
      >
        <rect x={-margin} y={-margin * 0.6} width={boundsWidth} height={boundsHeight} fill="#f7f5f0" />

        {/* Ground line */}
        <line x1={-margin * 0.4} y1={toSvgY(0)} x2={el.width + margin * 0.4} y2={toSvgY(0)} stroke="#565f6b" strokeWidth={fontSm * 0.12} />

        {/* Roof silhouette, filled */}
        <polygon points={roofPointsAttr} fill={roofColor || '#a2543a'} stroke="#2b2f36" strokeWidth={fontSm * 0.06} />

        {/* Wall face */}
        <rect x={0} y={toSvgY(el.wallTop)} width={el.width} height={el.wallTop} fill={wallColor || '#e4d6b8'} stroke="#2b2f36" strokeWidth={fontSm * 0.08} />

        {/* Floor division lines, dashed, one per upper floor */}
        {Array.from({ length: el.floorCount - 1 }, (_, i) => (i + 1) * el.floorToFloor).map((y, i) => (
          <line key={i} x1={0} y1={toSvgY(y)} x2={el.width} y2={toSvgY(y)} stroke="#8a94a0" strokeDasharray={fontSm * 0.3} strokeWidth={fontSm * 0.05} />
        ))}

        {/* Windows: glass fill + frame outline, echoing the 3D model's look */}
        {el.windows.map((w, i) => (
          <g key={i}>
            <rect x={w.x} y={toSvgY(w.y + w.height)} width={w.width} height={w.height} fill="#bfe6f5" fillOpacity="0.75" stroke={accentColor || '#8a6a52'} strokeWidth={fontSm * 0.1} />
            <line x1={w.x + w.width / 2} y1={toSvgY(w.y + w.height)} x2={w.x + w.width / 2} y2={toSvgY(w.y)} stroke={accentColor || '#8a6a52'} strokeWidth={fontSm * 0.05} />
          </g>
        ))}

        {/* Entrance door, if this is the facing elevation */}
        {el.door && (
          <g>
            <rect x={el.door.x} y={toSvgY(el.door.y + el.door.height)} width={el.door.width} height={el.door.height} fill={accentColor || '#6b4a36'} stroke="#2b2f36" strokeWidth={fontSm * 0.08} />
            <text x={el.door.x + el.door.width / 2} y={toSvgY(el.door.y + el.door.height / 2)} fontSize={fontSm * 0.85} textAnchor="middle" fill="#fff">ENTRANCE</text>
          </g>
        )}

        {/* Overall width + height dimension lines, matching FloorPlan2D's style */}
        <g stroke="#8a94a0" strokeWidth={fontSm * 0.05}>
          <line x1={0} y1={toSvgY(0) + margin * 0.35} x2={el.width} y2={toSvgY(0) + margin * 0.35} />
          <text x={el.width / 2} y={toSvgY(0) + margin * 0.55} fontSize={fontSm} textAnchor="middle" fill="#565f6b" stroke="none">
            {el.width.toFixed(1)} {el.unit}
          </text>
          <line x1={-margin * 0.35} y1={toSvgY(0)} x2={-margin * 0.35} y2={toSvgY(roofTop)} />
          <text x={-margin * 0.5} y={(toSvgY(0) + toSvgY(roofTop)) / 2} fontSize={fontSm} textAnchor="middle" fill="#565f6b" stroke="none" transform={`rotate(-90 ${-margin * 0.5} ${(toSvgY(0) + toSvgY(roofTop)) / 2})`}>
            {roofTop.toFixed(1)} {el.unit}
          </text>
        </g>

        <text x={el.width / 2} y={toSvgY(roofTop) - margin * 0.15} fontSize={fontLg} fontWeight="600" textAnchor="middle" fill="#1c2128">
          {el.label}
        </text>
      </svg>
    </div>
  );
}
