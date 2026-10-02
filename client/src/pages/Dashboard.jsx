import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Calculator, Box, FileUp, HardHat, LifeBuoy, PencilRuler, Star, UserSearch, Sparkles, Layers, Users } from 'lucide-react';
import { listBuilders, listMyInquiries } from '../lib/api.js';
import RelationshipTimeline, { relationshipStatus } from '../components/RelationshipTimeline.jsx';
import { areaOf, areaUnitOf, bedroomCountOf, floorCountOf, getPlotSize } from '../lib/layout.js';
import { fmtINR } from '../lib/format.js';
import { BUILDERS } from '../data/builders.js';
import { normalizeRealBuilder } from '../lib/builderDirectory.js';
import HouseGlyph from '../components/HouseGlyph.jsx';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import FloorPlan2D from '../components/FloorPlan2D.jsx';

const ACTIONS = [
  { id: 'create', icon: Sparkles, title: 'Create New Design', body: 'Tell us your requirements and get AI designs.' },
  { id: 'create', icon: Box, title: 'Explore 3D Model', body: 'Walk through your home in interactive 3D.' },
  { id: 'cost-estimator', icon: Calculator, title: 'Check Cost Estimate', body: 'Get detailed construction cost breakdown.' },
  { id: 'find-builders', icon: UserSearch, title: 'Connect with Builder', body: 'Find verified builders & civil engineers.' },
];

const STRIP = [
  { icon: Sparkles, a: 'AI Generated', b: 'Designs' },
  { icon: Layers, a: '2D & 3D', b: 'Visualization' },
  { icon: Calculator, a: 'Cost', b: 'Estimation' },
  { icon: Users, a: 'Verified Builders', b: '& Engineers' },
];

const initials = (name) => name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Customer home once signed in. Everything shown comes from the account's real data
// (saved designs and their costs); sections with nothing to show say so instead of
// inventing sample content.
export default function Dashboard({ designs, onNavigate, onLoad, onViewProfile, onContact, onOpenInquiry }) {
  const [realBuilders, setRealBuilders] = useState([]);
  const [connections, setConnections] = useState(null);

  useEffect(() => {
    listMyInquiries().then((d) => setConnections(d.inquiries || [])).catch(() => setConnections([]));
    listBuilders().then((d) => setRealBuilders((d.builders || []).map(normalizeRealBuilder))).catch(() => {});
  }, []);

  const latest = designs[0] || null;
  const topBuilders = useMemo(
    () => [...realBuilders, ...BUILDERS].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3),
    [realBuilders]
  );
  const plot = latest ? getPlotSize(latest.layout) : null;

  return (
    <div className="dash2">
      <div className="dash2-main">
        <section className="dash-hero">
          <div className="dash-hero-copy">
            <span className="dash-eyebrow">AI powered home design &amp; builder connect</span>
            <h2>Design Your Dream Home<br />with AI</h2>
            <p>Visualize in 2D &amp; 3D, get estimated cost, and connect with verified builders &amp; civil engineers — all in one place.</p>
            <div className="hero-actions">
              <button className="btn btn-navy" onClick={() => onNavigate('create')}>Start Designing <ArrowRight size={16} /></button>
              <button className="btn btn-ghost" onClick={() => onNavigate('find-builders')}>Find a Builder</button>
            </div>
            <ul className="dash-strip">
              {STRIP.map((s) => (
                <li key={s.a}><s.icon size={20} strokeWidth={1.5} /><span><strong>{s.a}</strong><small>{s.b}</small></span></li>
              ))}
            </ul>
          </div>
          <div className="dash-hero-art" aria-hidden="true">
            <svg viewBox="0 0 420 260" fill="none">
              <rect x="0" y="212" width="420" height="48" rx="8" fill="currentColor" opacity="0.12" />
              <rect x="60" y="96" width="170" height="116" fill="#fff" stroke="currentColor" strokeWidth="2" />
              <rect x="150" y="38" width="170" height="108" fill="#fff" stroke="currentColor" strokeWidth="2" />
              <rect x="40" y="86" width="210" height="14" fill="currentColor" opacity="0.85" />
              <rect x="130" y="28" width="210" height="14" fill="currentColor" opacity="0.85" />
              <rect x="70" y="112" width="52" height="100" fill="#b5883a" opacity="0.85" />
              <rect x="134" y="112" width="84" height="64" fill="#cfe5ea" stroke="currentColor" strokeWidth="2" />
              <rect x="166" y="56" width="136" height="72" fill="#cfe5ea" stroke="currentColor" strokeWidth="2" />
              <rect x="232" y="150" width="120" height="62" fill="#b5883a" opacity="0.55" />
              <circle cx="372" cy="188" r="22" fill="currentColor" opacity="0.25" />
              <circle cx="30" cy="196" r="16" fill="currentColor" opacity="0.25" />
            </svg>
          </div>
        </section>

        <div className="action-grid">
          {ACTIONS.map((a) => (
            <button key={a.title} className="action-card" onClick={() => onNavigate(a.id)}>
              <span className="action-card-icon"><a.icon size={22} strokeWidth={1.6} /></span>
              <strong>{a.title}</strong>
              <small>{a.body}</small>
              <ArrowRight size={16} className="action-card-arrow" />
            </button>
          ))}
        </div>

        <div className="section-head" style={{ marginTop: 28 }}>
          <div><h3>My Designs</h3><p>Your saved AI-generated home designs</p></div>
          <button className="link-btn" onClick={() => onNavigate('my-designs')}>View All <ArrowRight size={13} /></button>
        </div>
        {designs.length === 0 ? (
          <div className="empty-state">
            <p style={{ marginBottom: 14 }}>No saved designs yet — create your first one.</p>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('create')}>Create a Design</button>
          </div>
        ) : (
          <div className="mydesign-row">
            {designs.slice(0, 4).map((d, i) => {
              const p = getPlotSize(d.layout);
              return (
                <motion.button
                  key={d.id} className="mydesign-card" onClick={() => onLoad(d)}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.06 }} whileHover={{ y: -3 }}
                >
                  <span className="mydesign-visual"><HouseGlyph /><span className="chip">3D View</span></span>
                  <span className="mydesign-body">
                    <strong>{d.title}</strong>
                    <small>{p.width}×{p.depth}{p.unit} · {bedroomCountOf(d.layout) || '—'} BHK · {floorCountOf(d.layout)} Floors</small>
                    <b>{d.cost ? fmtINR(d.cost.totalCost) : 'Cost not calculated'}</b>
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}

        <div className="triple-row">
          <div className="panel">
            <h4>Recent 3D View</h4>
            {latest ? (
              <div className="panel-viewer"><HouseViewer3D layout={latest.layout} height={230} skipIntro showLabels={false} /></div>
            ) : <p className="panel-empty">Save a design to see it here in 3D.</p>}
          </div>
          <div className="panel">
            <h4>Floor Plan</h4>
            {latest ? <div className="panel-plan"><FloorPlan2D design={latest.layout} /></div> : <p className="panel-empty">Your latest floor plan will appear here.</p>}
          </div>
          <div className="panel">
            <h4>Estimated Construction Cost</h4>
            {latest?.cost ? (
              <>
                <div className="panel-cost">{fmtINR(latest.cost.totalCost)} <span className="status-pill">Approximate</span></div>
                <ul className="cost-breakdown">
                  <li><span>Base construction</span><span>{fmtINR(latest.cost.baseCost)}</span></li>
                  {(latest.cost.adjustments || []).map((a) => <li key={a.label}><span>{a.label}</span><span>{fmtINR(a.amount)}</span></li>)}
                </ul>
                <button className="btn btn-navy btn-sm" style={{ width: '100%' }} onClick={() => onNavigate('documents')}>Get Project Brief</button>
              </>
            ) : <p className="panel-empty">Save a design with its cost estimate to see it here.</p>}
          </div>
        </div>
      </div>

      <aside className="dash2-side">
        <div className="side-card">
          <span className="side-label">My Latest Project</span>
          {latest ? (
            <>
              <h4 className="latest-title">{latest.title}</h4>
              <p className="latest-meta">{plot.width} × {plot.depth} {plot.unit} · {areaOf(latest.layout)} {areaUnitOf(latest.layout)} · {floorCountOf(latest.layout)} floors</p>
              <div className="hero-actions" style={{ gap: 8 }}>
                <button className="btn btn-navy btn-sm" onClick={() => onLoad(latest)}>View 3D</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('documents')}>Download Brief</button>
              </div>
            </>
          ) : <p className="panel-empty">No project yet.</p>}
        </div>

        <div className="side-card">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Your Builder Connections</h4>
            <button className="link-btn" onClick={() => onNavigate('my-projects')}>View All <ArrowRight size={13} /></button>
          </div>
          {connections === null ? <p className="panel-empty">Loading…</p> : connections.length === 0 ? (
            <p className="panel-empty">You have not contacted a builder yet. Pick one below and send your design — the conversation and their contact details will appear here.</p>
          ) : connections.slice(0, 3).map((c) => (
            <button key={c.id} className="connection-row" onClick={() => onOpenInquiry?.(c.id)}>
              <span className="connection-head"><strong>{c.builderName || 'Builder'}</strong><em>{relationshipStatus(c.relationship, 'customer')}</em></span>
              <RelationshipTimeline rel={c.relationship} compact />
              {c.relationship?.lastMessage && <small>{c.relationship.lastMessage.senderRole === 'builder' ? 'Builder' : 'You'}: {c.relationship.lastMessage.body}</small>}
            </button>
          ))}
        </div>

        <div className="side-card help-card">
          <span className="avatar avatar--lg"><LifeBuoy size={20} /></span>
          <div>
            <strong>Need Help?</strong>
            <p>See how the platform works, step by step.</p>
            <button className="btn btn-navy btn-sm" onClick={() => onNavigate('how-it-works')}>How It Works <ArrowRight size={13} /></button>
          </div>
        </div>

        <div className="side-card">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>Top Rated Builders</h4>
            <button className="link-btn" onClick={() => onNavigate('find-builders')}>View All <ArrowRight size={13} /></button>
          </div>
          {topBuilders.map((b) => (
            <div key={b.id} className="mini-builder">
              <span className="mini-builder-logo" style={{ background: b.avatarColor }}>{b.initials || initials(b.name)}</span>
              <div className="mini-builder-info">
                <strong>{b.name} {b.verified && <BadgeCheck size={14} className="mini-verified" />}</strong>
                <small><Star size={11} fill="currentColor" /> {b.rating ? b.rating : 'New'} · {b.yearsExperience} yrs · {(b.serviceLocations || [])[0]}</small>
                <button className="btn btn-ghost btn-xs" onClick={() => onContact(b.id)}>Contact</button>
              </div>
            </div>
          ))}
        </div>

        <div className="become-card">
          <span className="become-icon"><HardHat size={26} strokeWidth={1.6} /></span>
          <strong>Become a Builder</strong>
          <p>Grow your business. Get new projects. Join our professional network.</p>
          <button className="btn btn-outline-light btn-sm" onClick={() => onNavigate('become-builder')}>Register Now <ArrowRight size={13} /></button>
        </div>
      </aside>
    </div>
  );
}
