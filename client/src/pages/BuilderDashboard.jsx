import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { listBuilderInquiries } from '../lib/api.js';
import { fmtINR } from '../lib/format.js';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import RelationshipTimeline, { relationshipStatus } from '../components/RelationshipTimeline.jsx';

// A logged-in builder's project requests, split into the sections of the builder sidebar:
// overview, new requests, active projects, messages and quotations. The demo builders'
// emailed token-link flow is separate (see BuilderReply.jsx).
const FILTERS = {
  overview: () => true,
  requests: (i) => ['requested', 'reviewing'].includes(i.status),
  active: (i) => ['accepted', 'quotation', 'project'].includes(i.status),
  messages: (i) => ['accepted', 'quotation', 'project'].includes(i.status) && i.relationship?.messageCount > 0,
  quotations: (i) => ['quotation', 'project'].includes(i.status),
};
const EMPTY = {
  requests: 'No new project requests. They appear here when a customer sends you their design.',
  active: 'No active projects yet. Accept a request to start working with a customer.',
  messages: 'No conversations yet. Messages open when you accept a request.',
  quotations: 'No quotations yet. Send one from an accepted project.',
};

export default function BuilderDashboard({ mode = 'overview' }) {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = () => listBuilderInquiries().then((d) => setInquiries(d.inquiries || [])).catch(() => setInquiries([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, [selected]);

  const counts = useMemo(() => ({
    requests: inquiries.filter(FILTERS.requests).length,
    active: inquiries.filter(FILTERS.active).length,
    quotations: inquiries.filter((i) => i.status === 'quotation').length,
    conversations: inquiries.filter(FILTERS.messages).length,
  }), [inquiries]);

  if (loading) return <p className="section-sub">Loading your requests…</p>;

  if (selected) {
    return <ProjectWorkspace inquiryId={selected} viewer="builder" onBack={() => setSelected(null)} backLabel="Back to requests" />;
  }

  const list = inquiries.filter(FILTERS[mode] || FILTERS.overview);
  const ordered = mode === 'overview' ? [...list].sort((a, b) => Number(FILTERS.requests(b)) - Number(FILTERS.requests(a))) : list;

  return (
    <div>
      {mode === 'overview' && (
        <div className="stat-tiles">
          <div className="stat-tile stat-tile--hot"><b>{counts.requests}</b><span>New requests</span></div>
          <div className="stat-tile"><b>{counts.active}</b><span>Active projects</span></div>
          <div className="stat-tile"><b>{counts.quotations}</b><span>Pending quotations</span></div>
          <div className="stat-tile"><b>{counts.conversations}</b><span>Active conversations</span></div>
        </div>
      )}

      {ordered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon"><Inbox size={34} strokeWidth={1.6} /></span>
          <p>{EMPTY[mode] || 'No project requests yet. They appear here as soon as a customer contacts you through your profile.'}</p>
        </div>
      ) : (
        <div className="design-grid">
          {ordered.map((inq, i) => (
            <motion.div
              className="design-card design-card--pick"
              key={inq.id}
              onClick={() => setSelected(inq.id)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.06 }}
              whileHover={{ y: -4 }}
            >
              <div className="design-card-body">
                <div className="rel-parties">
                  <span className="rel-party rel-party--you">{inq.customerName}</span>
                  <span className="rel-link" aria-hidden="true" />
                  <span className="rel-party rel-party--builder">You</span>
                </div>
                <RelationshipTimeline rel={inq.relationship} compact />
                <p className="section-sub" style={{ margin: 0 }}>{inq.intent || inq.message || '—'}</p>
                {inq.designSummary && <p className="rel-last">{Object.entries(inq.designSummary).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
                {inq.quotation && <p className="rel-last"><strong>Quotation:</strong> {fmtINR(inq.quotation.amount)}</p>}
                {inq.customerPhone ? <p className="rel-last">📞 {inq.customerPhone}</p> : <p className="rel-last">Contact unlocks when you accept</p>}
                <span className={'status-pill' + (FILTERS.requests(inq) ? ' status-pill--new' : '')}>{relationshipStatus(inq.relationship, 'builder')}</span>
                <p className="design-card-date">{new Date(inq.createdAt).toLocaleDateString()}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
