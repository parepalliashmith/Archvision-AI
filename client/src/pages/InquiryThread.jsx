import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getInquiry } from '../lib/api.js';
import MessageThread from '../components/MessageThread.jsx';

// Customer-side thread view — reached from "My Enquiries" or the
// ?view=my-enquiry&inquiry=ID link in a "new reply" email. Authorized by the
// logged-in session (see auth.js/api.js's authHeaders()).
export default function InquiryThread({ inquiryId, onBack }) {
  const [state, setState] = useState('loading'); // loading | ready | error
  const [inquiry, setInquiry] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!inquiryId) {
      setError('No conversation selected.');
      setState('error');
      return;
    }
    getInquiry({ id: inquiryId })
      .then((data) => {
        setInquiry(data.inquiry);
        setState('ready');
      })
      .catch((err) => {
        setError(err.message || 'This conversation could not be found.');
        setState('error');
      });
  }, [inquiryId]);

  if (state === 'loading') {
    return <p className="section-sub">Loading conversation…</p>;
  }

  if (state === 'error') {
    return (
      <div className="notice notice--error">
        <div>
          <h4>Couldn't load this conversation</h4>
          <p>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginTop: 8 }}>
            <ArrowLeft size={14} /> Back to My Enquiries
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inquiry-thread-page">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 14 }}>
        <ArrowLeft size={14} /> Back to My Enquiries
      </button>
      <h4>Conversation with {inquiry.builderName || 'the builder'}</h4>
      <p className="section-sub" style={{ marginTop: 0 }}>
        Started {new Date(inquiry.createdAt).toLocaleDateString()}{inquiry.intent ? ` · ${inquiry.intent}` : ''}
      </p>
      <MessageThread inquiryId={inquiry.id} viewerRole="customer" />
    </div>
  );
}
