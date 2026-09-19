import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Inbox } from 'lucide-react';
import { listBuilderInquiries } from '../lib/api.js';
import MessageThread from '../components/MessageThread.jsx';

// A logged-in builder's own inquiries — the real-account equivalent of the
// demo builders' emailed token-link flow (which stays untouched; see
// server.js's authorizeInquiryAccess). Only inquiries with a matching
// builderAccountId show up here.
export default function BuilderDashboard() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    listBuilderInquiries()
      .then((data) => setInquiries(data.inquiries || []))
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="section-sub">Loading your inquiries…</p>;
  }

  if (selected) {
    return (
      <div className="inquiry-thread-page">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: 14 }}>
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
        <h4>Conversation with {selected.customerName}</h4>
        <p className="section-sub" style={{ marginTop: 0 }}>
          Started {new Date(selected.createdAt).toLocaleDateString()}{selected.intent ? ` · ${selected.intent}` : ''}
        </p>
        <MessageThread inquiryId={selected.id} viewerRole="builder" />
      </div>
    );
  }

  if (inquiries.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Inbox size={34} strokeWidth={1.6} /></span>
        <p>No inquiries yet — they'll show up here as soon as a customer contacts you through your Find Builders profile.</p>
      </div>
    );
  }

  return (
    <div className="design-grid">
      {inquiries.map((inq, i) => (
        <motion.div
          className="design-card design-card--pick"
          key={inq.id}
          onClick={() => setSelected(inq)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
          whileHover={{ y: -4 }}
        >
          <div className="design-card-body">
            <h4>{inq.customerName}</h4>
            <p className="section-sub" style={{ margin: 0 }}>{inq.intent || inq.message || '—'}</p>
            <p className="design-card-date">{new Date(inq.createdAt).toLocaleDateString()}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
