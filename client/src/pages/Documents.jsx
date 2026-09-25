import { Download, FileText } from 'lucide-react';
import { areaOf, areaUnitOf, bedroomCountOf, floorCountOf, getAllRooms, getPlotSize } from '../lib/layout.js';
import { fmtINR } from '../lib/format.js';

// A plain-text project brief built from a saved design — the thing you would
// hand a builder or an architect. Generated in the browser; nothing uploaded.
function buildBrief(d) {
  const plot = getPlotSize(d.layout);
  const unit = areaUnitOf(d.layout);
  const lines = [
    `PROJECT BRIEF — ${d.title}`,
    `Generated ${new Date().toLocaleDateString()} by ArchVision AI`,
    '',
    'OVERVIEW',
    `  Plot size:      ${plot.width} x ${plot.depth} ${plot.unit}`,
    `  Built-up area:  ${areaOf(d.layout)} ${unit}`,
    `  Floors:         ${floorCountOf(d.layout)}`,
    `  Bedrooms:       ${bedroomCountOf(d.layout)}`,
    `  Style:          ${d.layout.style || 'Not specified'}`,
    '',
    'ROOMS',
    ...getAllRooms(d.layout).map((r) => `  - ${r.name || r.type} (${r.type}): ${Math.round(r.width * 10) / 10} x ${Math.round(r.depth * 10) / 10}${d.layout.plot ? ' ft' : ' m'}${r.floor !== undefined ? `, floor ${r.floor}` : ''}`),
  ];
  if (d.cost) {
    lines.push('', 'APPROXIMATE COST');
    lines.push(`  Total: ${fmtINR(d.cost.totalCost)}  (${d.cost.areaSqft} sqft @ ${fmtINR(d.cost.ratePerSqft)}/sqft base)`);
    lines.push(`  Base construction: ${fmtINR(d.cost.baseCost)}`);
    (d.cost.adjustments || []).forEach((a) => lines.push(`  ${a.label}: ${fmtINR(a.amount)}`));
    if (d.cost.disclaimer) lines.push('', `  ${d.cost.disclaimer}`);
  }
  lines.push('', 'This is a design-assistance summary, not a construction drawing. Have it reviewed by a licensed architect or structural engineer.');
  return lines.join('\n');
}

function download(d) {
  const blob = new Blob([buildBrief(d)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(d.title || 'design').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-brief.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Documents({ designs, onNavigate }) {
  if (designs.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><FileText size={34} strokeWidth={1.6} /></span>
        <p style={{ marginBottom: 14 }}>Save a design and its project brief will appear here, ready to download and share with a builder.</p>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('create')}>Create a Design</button>
      </div>
    );
  }
  return (
    <div>
      <p className="section-sub" style={{ marginTop: 0 }}>A downloadable project brief for each saved design.</p>
      <ul className="doc-list">
        {designs.map((d) => (
          <li key={d.id} className="doc-row">
            <span className="doc-icon"><FileText size={20} strokeWidth={1.7} /></span>
            <div className="doc-info">
              <strong>{d.title} — Project brief</strong>
              <small>Text file · {new Date(d.createdAt).toLocaleDateString()}</small>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => download(d)}><Download size={14} /> Download</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
