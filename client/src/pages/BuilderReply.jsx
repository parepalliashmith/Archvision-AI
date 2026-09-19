import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getInquiry } from '../lib/api.js';
import MessageThread from '../components/MessageThread.jsx';

// Reached only via the link in a builder's notification email
// (?view=builder-reply&inquiry=ID&token=TOKEN) — the token is this build's
// only "builder credential" for this one thread, no account/login involved.
// There is no re-issue flow if the link is lost or the token is wrong; a
// deliberate limitation, see the messaging-thread plan's non-goals.
export default function BuilderReply({ inquiryId, token, onNavigateHome }) {
  const [state, setState] = useState('loading'); // loading | ready | error
  const [inquiry, setInquiry] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!inquiryId || !token) {
      setError('This link is missing information and cannot be opened.');
      setState('error');
      return;
    }
    getInquiry({ id: inquiryId, token })
      .then((data) => {
        setInquiry(data.inquiry);
        setState('ready');
      })
      .catch((err) => {
        setError(err.message || 'This link is no longer valid.');
        setState('error');
      });
  }, [inquiryId, token]);

  if (state === 'loading') {
    return <p className="section-sub">Loading conversation…</p>;
  }

  if (state === 'error') {
    return (
      <div className="notice notice--error">
        <span className="notice-icon"><AlertTriangle size={22} strokeWidth={1.8} /></span>
        <div>
          <h4>Link no longer works</h4>
          <p>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={onNavigateHome} style={{ marginTop: 8 }}>Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="builder-reply-page">
      <h4>Enquiry from {inquiry.customerName}</h4>
      <ul className="enquiry-overview">
        <li><span>Email</span><strong>{inquiry.customerEmail}</strong></li>
        {inquiry.customerPhone && <li><span>Phone</span><strong>{inquiry.customerPhone}</strong></li>}
        {inquiry.location && <li><span>Location</span><strong>{inquiry.location}</strong></li>}
        {inquiry.intent && <li><span>Intent</span><strong>{inquiry.intent}</strong></li>}
        {inquiry.designSummary && Object.entries(inquiry.designSummary).map(([k, v]) => (
          <li key={k}><span>{k}</span><strong>{String(v)}</strong></li>
        ))}
      </ul>
      {inquiry.message && (
        <p className="section-sub">"{inquiry.message}"</p>
      )}
      <MessageThread inquiryId={inquiry.id} token={token} viewerRole="builder" />
    </div>
  );
}
