import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Calculator, Check, FileUp, Hammer, LifeBuoy, PencilRuler, Search, UserSearch } from 'lucide-react';
import { listMyInquiries, listBuilders } from '../lib/api.js';
import { areaOf, areaUnitOf, getPlotSize } from '../lib/layout.js';
import { fmtINR } from '../lib/format.js';
import { BUILDERS } from '../data/builders.js';
import { normalizeRealBuilder } from '../lib/builderDirectory.js';
import { displayName } from '../components/Navbar.jsx';
import BuilderCard from '../components/BuilderCard.jsx';
import HouseGlyph from '../components/HouseGlyph.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { id: 'create', icon: PencilRuler, title: 'Create New Design', body: 'Tell us your requirements and get a 3D design.' },
  { id: 'find-builders', icon: UserSearch, title: 'Find a Builder', body: 'Connect with builders and civil engineers.' },
  { id: 'upload', icon: FileUp, title: 'Upload 2D Plan', body: 'Turn an existing plan into 3D.' },
  { id: 'cost-estimator', icon: Calculator, title: 'Check Cost Estimate', body: 'Get a construction cost breakdown.' },
];

// Customer home once signed in. Everything here is derived from the account's
// real data — saved designs, enquiries sent — nothing is invented: the
// progress tracker only ticks a step when the matching record actually exists.
export default function Dashboard({ account, designs, onNavigate, onLoad, onViewProfile, onContact }) {
  const [enquiries, setEnquiries] = useState(null);
  const [realBuilders, setRealBuilders] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    listMyInquiries().then((d) => setEnquiries(d.inquiries || [])).catch(() => setEnquiries([]));
    listBuilders().then((d) => setRealBuilders((d.builders || []).map(normalizeRealBuilder))).catch(() => {});
  }, []);

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    return designs.filter((d) => !q || (d.title || '').toLowerCase().includes(q)).slice(0, 3);
  }, [designs, query]);

  const featured = useMemo(() => [...realBuilders, ...BUILDERS].slice(0, 3), [realBuilders]);

  const hasDesign = designs.length > 0;
  const hasCost = designs.some((d) => d.cost);
  const hasEnquiry = (enquiries || []).length > 0;
  const steps = [
    { label: 'Design saved', hint: 'Generate and save a design', done: hasDesign },
    { label: 'Cost estimated', hint: 'Save a design with its cost', done: hasCost },
    { label: 'Builder enquiry sent', hint: 'Contact a builder', done: hasEnquiry },
    { label: 'Construction', hint: 'Agreed directly with your builder', done: false },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div>
          <h2 className="dashboard-greeting">{greeting()}, {displayName(account).split(' ')[0]} <span aria-hidden="true">👋</span></h2>
          <p className="section-sub" style={{ margin: 0 }}>Let's design your dream home or find the right builder for your project.</p>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input type="text" placeholder="Search your designs…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="quick-grid">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.id} className="quick-card" onClick={() => onNavigate(a.id)}>
            <span className="quick-card-icon"><a.icon size={20} strokeWidth={1.8} /></span>
            <span className="quick-card-text"><strong>{a.title}</strong><small>{a.body}</small></span>
            <ArrowRight size={15} className="quick-card-arrow" />
          </button>
        ))}
      </div>

      <div className="dashboard-cols">
        <div className="dashboard-main">
          <div className="section-head">
            <div><h3>Recent Designs</h3><p>Your latest saved home designs</p></div>
            <button className="link-btn" onClick={() => onNavigate('my-designs')}>View All <ArrowRight size={13} /></button>
          </div>

          {recent.length === 0 ? (
            <div className="empty-state">
              <p style={{ marginBottom: 14 }}>{designs.length === 0 ? 'No saved designs yet — create your first one.' : 'No designs match your search.'}</p>
              {designs.length === 0 && <button className="btn btn-primary btn-sm" onClick={() => onNavigate('create')}>Create a Design</button>}
            </div>
          ) : (
            <div className="recent-grid">
              {recent.map((d, i) => {
                const plot = getPlotSize(d.layout);
                return (
                  <motion.button
                    className="recent-card"
                    key={d.id}
                    onClick={() => onLoad(d)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.06 }}
                    whileHover={{ y: -3 }}
                  >
                    <span className="recent-card-visual"><HouseGlyph /><span className="chip">3D View</span></span>
                    <span className="recent-card-body">
                      <strong>{d.title}</strong>
                      <small>Plot: {plot.width} × {plot.depth}{plot.unit} · Built-up: {areaOf(d.layout)} {areaUnitOf(d.layout)}</small>
                      <span className="recent-card-foot">
                        <b>{d.cost ? fmtINR(d.cost.totalCost) : 'Cost not calculated'}</b>
                        <em>{new Date(d.createdAt).toLocaleDateString()}</em>
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          )}

          <div className="section-head" style={{ marginTop: 34 }}>
            <div><h3>Featured Builders</h3><p>Builders and civil engineers you can contact</p></div>
            <button className="link-btn" onClick={() => onNavigate('find-builders')}>View All <ArrowRight size={13} /></button>
          </div>
          <div className="builder-grid">
            {featured.map((b) => (
              <BuilderCard key={b.id} entry={b} match={null} onViewProfile={onViewProfile} onContact={onContact} />
            ))}
          </div>
        </div>

        <aside className="dashboard-side">
          <div className="connect-banner">
            <h3>Connect with Builders</h3>
            <p>Send your design, get quotes, and talk to a builder by email and phone.</p>
            <button className="btn btn-gold btn-sm" onClick={() => onNavigate('find-builders')}>Find Builders <ArrowRight size={14} /></button>
          </div>

          <div className="side-card">
            <div className="section-head" style={{ marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>Project Progress</h4>
              <button className="link-btn" onClick={() => onNavigate('my-projects')}>View <ArrowRight size={13} /></button>
            </div>
            <ol className="progress-list">
              {steps.map((s, i) => (
                <li key={s.label} className={s.done ? 'done' : i === currentIdx ? 'current' : ''}>
                  <span className="progress-dot">{s.done ? <Check size={13} strokeWidth={3} /> : <Hammer size={12} />}</span>
                  <span className="progress-text"><strong>{s.label}</strong><small>{s.done ? 'Completed' : i === currentIdx ? 'Up next' : 'Pending'}</small></span>
                </li>
              ))}
            </ol>
          </div>

          <div className="side-card help-card">
            <span className="avatar avatar--lg"><LifeBuoy size={20} /></span>
            <div>
              <strong>Need help?</strong>
              <p>See how the platform works, step by step.</p>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('how-it-works')}>How It Works <ArrowRight size={13} /></button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
