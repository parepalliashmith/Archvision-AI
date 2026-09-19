import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { listMyInquiries } from '../lib/api.js';

export default function MyEnquiries({ onOpen, onNavigate }) {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyInquiries()
      .then((data) => setInquiries(data.inquiries || []))
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="section-sub">Loading your enquiries…</p>;
  }

  if (inquiries.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><MessageSquare size={34} strokeWidth={1.6} /></span>
        <p style={{ marginBottom: 14 }}>
          No enquiries yet. Reach out to a builder from a design's "Get a Builder Quote" or a
          builder profile page, and the conversation will show up here.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('find-builders')}>Find Builders</button>
      </div>
    );
  }

  return (
    <div className="design-grid">
      {inquiries.map((inq, i) => (
        <motion.div
          className="design-card design-card--pick"
          key={inq.id}
          onClick={() => onOpen(inq.id)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
          whileHover={{ y: -4 }}
        >
          <div className="design-card-body">
            <h4>{inq.builderName || 'General enquiry'}</h4>
            <p className="section-sub" style={{ margin: 0 }}>{inq.intent || inq.message || '—'}</p>
            <p className="design-card-date">{new Date(inq.createdAt).toLocaleDateString()}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
