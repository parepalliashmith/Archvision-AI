import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Inbox } from 'lucide-react';
import { listBuilderInquiries } from '../lib/api.js';
import MessageThread from '../components/MessageThread.jsx';
import ContactCard from '../components/ContactCard.jsx';
import RelationshipTimeline, { relationshipStatus } from '../components/RelationshipTimeline.jsx';

// A logged-in builder's own inquiries — the real-account equivalent of the
// demo builders' emailed token-link flow (which stays untouched; see
// server.js's authorizeInquiryAccess). Only inquiries with a matching
// builderAccountId show up here. Unanswered ones are listed first.
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
        <RelationshipTimeline rel={selected.relationship} />
        <ContactCard title="Customer contact" name={selected.customerName} email={selected.customerEmail} phone={selected.customerPhone} />
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

  const waiting = inquiries.filter((i) => !i.relationship?.builderReplied).length;
  const sorted = [...inquiries].sort((a, b) => Number(!!a.relationship?.builderReplied) - Number(!!b.relationship?.builderReplied));

  return (
    <div>
      <p className="section-sub" style={{ marginTop: 0 }}>
        {inquiries.length} customer{inquiries.length === 1 ? '' : 's'} connected with you
        {waiting > 0 ? <> · <strong>{waiting} waiting for your reply</strong></> : ' · all replied'}
      </p>
      <div className="design-grid">
        {sorted.map((inq, i) => (
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
              <div className="rel-parties">
                <span className="rel-party rel-party--you">{inq.customerName}</span>
                <span className="rel-link" aria-hidden="true" />
                <span className="rel-party rel-party--builder">You</span>
              </div>
              <RelationshipTimeline rel={inq.relationship} compact />
              <p className="section-sub" style={{ margin: 0 }}>{inq.intent || inq.message || '—'}</p>
              {inq.customerPhone && <p className="rel-last">📞 {inq.customerPhone}</p>}
              {inq.relationship?.lastMessage && (
                <p className="rel-last"><strong>{inq.relationship.lastMessage.senderRole === 'builder' ? 'You' : inq.customerName}:</strong> {inq.relationship.lastMessage.body}</p>
              )}
              <span className={'status-pill' + (inq.relationship?.builderReplied ? '' : ' status-pill--new')}>{relationshipStatus(inq.relationship, 'builder')}</span>
              <p className="design-card-date">{new Date(inq.createdAt).toLocaleDateString()}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
