import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Handshake } from 'lucide-react';
import { listMyInquiries } from '../lib/api.js';
import { fmtINR } from '../lib/format.js';
import RelationshipTimeline, { relationshipStatus } from '../components/RelationshipTimeline.jsx';

// The customer's Connection Center: every project request they have sent, with where it
// stands (requested -> reviewing -> accepted -> contact -> discussion -> quotation -> project).
export default function Connections({ onOpen, onNavigate }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    listMyInquiries().then((d) => setItems(d.inquiries || [])).catch(() => setItems([]));
  }, []);

  if (!items) return <p className="section-sub">Loading your connections…</p>;

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Handshake size={34} strokeWidth={1.6} /></span>
        <p style={{ marginBottom: 14 }}>
          No connections yet. Finish a design, then send it to a builder as a project request. The builder's response, contact details,
          messages and quotation will all appear here.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('find-builders')}>Find a Builder</button>
      </div>
    );
  }

  return (
    <div className="project-list">
      {items.map((p, i) => (
        <motion.div
          className="project-card project-card--rel"
          key={p.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.06 }}
        >
          <div className="rel-parties">
            <span className="rel-party rel-party--you">You</span>
            <span className="rel-link" aria-hidden="true" />
            <span className="rel-party rel-party--builder">{p.builderName || 'Builder'}</span>
          </div>
          <RelationshipTimeline rel={p.relationship} />
          <div className="project-card-main">
            <p className="section-sub" style={{ margin: '0 0 6px' }}>{p.intent || p.message || '—'}</p>
            {p.designSummary && (
              <ul className="project-facts">
                {Object.entries(p.designSummary).slice(0, 4).map(([k, v]) => <li key={k}><span>{k}</span><strong>{String(v)}</strong></li>)}
              </ul>
            )}
            {p.quotation && <p className="rel-last"><strong>Quotation:</strong> {fmtINR(p.quotation.amount)}{p.quotation.weeks ? ` · ${p.quotation.weeks} weeks` : ''}</p>}
            {p.relationship?.lastMessage && (
              <p className="rel-last"><strong>{p.relationship.lastMessage.senderRole === 'builder' ? p.builderName || 'Builder' : 'You'}:</strong> {p.relationship.lastMessage.body}</p>
            )}
          </div>
          <div className="project-card-side project-card-side--row">
            <span className={'status-pill' + (p.relationship?.stages?.declined ? ' status-pill--bad' : '')}>{relationshipStatus(p.relationship, 'customer')}</span>
            <small>{new Date(p.createdAt).toLocaleDateString()}</small>
            <button className="btn btn-navy btn-sm" onClick={() => onOpen(p.id)}>Open project workspace <ArrowRight size={14} /></button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
