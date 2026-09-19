import { Scale } from 'lucide-react';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import { areaOf, areaUnitOf, floorCountOf, roomCountOf } from '../data/samples.js';
import { fmtINR } from '../lib/format.js';

export default function CompareDesigns({ designs, selectedIds, onToggleSelect, onGoMyDesigns, onNavigate }) {
  const selected = designs.filter((d) => selectedIds.includes(d.id));

  if (designs.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Scale size={30} strokeWidth={1.6} /></span>
        <p style={{ marginBottom: 14 }}>
          Nothing to compare yet — save at least two designs first, then come back here.
        </p>
        <div className="hero-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('create')}>Create a Design</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('home')}>Browse Samples</button>
        </div>
      </div>
    );
  }

  return (
    <div className="compare-page">
      <p className="section-sub" style={{ marginTop: 0 }}>Pick 2-3 designs to compare.</p>

      <div className="saved-grid">
        {designs.map((d) => (
          <label className={'saved-card saved-card--pick' + (selectedIds.includes(d.id) ? ' active' : '')} key={d.id}>
            <span className="saved-check">
              <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => onToggleSelect(d.id)} />
              {d.title}
            </span>
            <p>{areaOf(d.layout)} {areaUnitOf(d.layout)} · {floorCountOf(d.layout)} floor{floorCountOf(d.layout) > 1 ? 's' : ''}</p>
          </label>
        ))}
      </div>

      {selected.length > 0 && selected.length < 2 && (
        <p className="section-sub">Pick at least one more design to compare.</p>
      )}

      {selected.length >= 2 && (
        <div className="compare-wrap">
          {selected.map((d) => (
            <div className="compare-card" key={d.id}>
              <h4>{d.title}</h4>
              <HouseViewer3D layout={d.layout} height={260} skipIntro />
              <ul className="compare-stats">
                <li><span>Area</span><span>{areaOf(d.layout)} {areaUnitOf(d.layout)}</span></li>
                <li><span>Floors</span><span>{floorCountOf(d.layout)}</span></li>
                <li><span>Rooms</span><span>{roomCountOf(d.layout)}</span></li>
                <li><span>Est. cost</span><span>{d.cost ? fmtINR(d.cost.totalCost) : '—'}</span></li>
              </ul>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-ghost btn-sm" onClick={onGoMyDesigns} style={{ marginTop: 20 }}>
        ← Back to My Designs
      </button>
    </div>
  );
}
