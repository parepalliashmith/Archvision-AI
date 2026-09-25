import { useState } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Plus } from 'lucide-react';
import { areaOf, areaUnitOf, bedroomCountOf, floorCountOf, getPlotSize, roomCountOf } from '../lib/layout.js';
import { fmtINR } from '../lib/format.js';
import HouseGlyph from '../components/HouseGlyph.jsx';

export default function MyDesigns({ designs, selectedIds, onToggleSelect, onLoad, onDelete, onGoCompare, onNavigate }) {
  const [confirmingId, setConfirmingId] = useState(null);

  function handleDeleteClick(id) {
    if (confirmingId === id) {
      onDelete(id);
      setConfirmingId(null);
    } else {
      setConfirmingId(id);
    }
  }

  return (
    <div className="my-designs-page">
      <div className="dashboard-welcome">
        <div>
          <h2>Create your next home.</h2>
          <p>
            Every design you save is kept here. Select 2-3 and head to Compare Designs to
            see them side by side.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate?.('create')}>
          <Plus size={17} /> New Design
        </button>
      </div>

      {designs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon"><FolderOpen size={34} strokeWidth={1.6} /></span>
          <p style={{ marginBottom: 14 }}>
            No saved designs yet. Generate one from your own requirements, or try a ready-made
            sample from the Home page — either way, "Save" adds it here.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('create')}>Create a Design</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('home')}>Browse Samples</button>
          </div>
        </div>
      ) : (
        <>
          <div className="my-designs-toolbar">
            <button className="btn btn-primary btn-sm" disabled={selectedIds.length < 2} onClick={onGoCompare}>
              Compare Selected ({selectedIds.length})
            </button>
            {selectedIds.length === 1 && (
              <span className="toolbar-hint">Pick at least one more to compare.</span>
            )}
            {selectedIds.length === 0 && (
              <span className="toolbar-hint">Tick a design below to compare it against others.</span>
            )}
          </div>
          <div className="design-grid">
            {designs.map((d, i) => {
              const plot = getPlotSize(d.layout);
              return (
                <motion.div
                  className={'design-card design-card--pick' + (selectedIds.includes(d.id) ? ' active' : '')}
                  key={d.id}
                  onClick={() => onToggleSelect(d.id)}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
                  whileHover={{ y: -4 }}
                >
                  <div className="design-card-visual">
                    <label className="design-card-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => onToggleSelect(d.id)} />
                    </label>
                    <HouseGlyph />
                  </div>
                  <div className="design-card-body">
                    <h4>{d.title}</h4>
                    <div className="design-card-stats">
                      <div className="design-card-stat">
                        <span className="design-card-stat-label">Plot</span>
                        <span className="design-card-stat-value">{plot.width}×{plot.depth}{plot.unit}</span>
                      </div>
                      <div className="design-card-stat">
                        <span className="design-card-stat-label">Est. cost</span>
                        <span className="design-card-stat-value">{d.cost ? fmtINR(d.cost.totalCost) : '—'}</span>
                      </div>
                      <div className="design-card-stat">
                        <span className="design-card-stat-label">Bedrooms</span>
                        <span className="design-card-stat-value">{bedroomCountOf(d.layout) || '—'}</span>
                      </div>
                      <div className="design-card-stat">
                        <span className="design-card-stat-label">Floors · Rooms</span>
                        <span className="design-card-stat-value">{floorCountOf(d.layout)} · {roomCountOf(d.layout)}</span>
                      </div>
                    </div>
                    <p className="design-card-date">
                      {areaOf(d.layout)} {areaUnitOf(d.layout)} · Last modified {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                    <div className="design-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => onLoad(d)}>Load</button>
                      {confirmingId === d.id ? (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteClick(d.id)}>Really delete?</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteClick(d.id)}>Delete</button>
                      )}
                      {confirmingId === d.id && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingId(null)}>Cancel</button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
