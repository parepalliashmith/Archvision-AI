import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, MessageCircle } from 'lucide-react';
import { listMyInquiries } from '../lib/api.js';

// A "project" is an enquiry you have sent to a builder — that is the point at
// which a design becomes a real conversation. Status is what we can actually
// know (sent, and whether the builder has a real account); the rest of a
// build happens between you and the builder, off-platform.
export default function MyProjects({ onOpen, onNavigate }) {
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    listMyInquiries().then((d) => setProjects(d.inquiries || [])).catch(() => setProjects([]));
  }, []);

  if (!projects) return <p className="section-sub">Loading your projects…</p>;

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Briefcase size={34} strokeWidth={1.6} /></span>
        <p style={{ marginBottom: 14 }}>
          No projects yet. When you send a design to a builder, it shows up here with the conversation attached.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('find-builders')}>Find a Builder</button>
      </div>
    );
  }

  return (
    <div className="project-list">
      {projects.map((p, i) => (
        <motion.div
          className="project-card"
          key={p.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
        >
          <div className="project-card-main">
            <h4>{p.builderName || 'General enquiry'}</h4>
            <p className="section-sub" style={{ margin: 0 }}>{p.intent || p.message || '—'}</p>
            {p.designSummary && (
              <ul className="project-facts">
                {Object.entries(p.designSummary).slice(0, 4).map(([k, v]) => <li key={k}><span>{k}</span><strong>{String(v)}</strong></li>)}
              </ul>
            )}
          </div>
          <div className="project-card-side">
            <span className="status-pill">Enquiry sent</span>
            <small>{new Date(p.createdAt).toLocaleDateString()}</small>
            <button className="btn btn-ghost btn-sm" onClick={() => onOpen(p.id)}><MessageCircle size={14} /> Open conversation</button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
