import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getInquiry, listMessages } from '../lib/api.js';
import MessageThread from '../components/MessageThread.jsx';
import ContactCard from '../components/ContactCard.jsx';
import RelationshipTimeline from '../components/RelationshipTimeline.jsx';

// Customer-side thread view — reached from "My Enquiries" or the
// ?view=my-enquiry&inquiry=ID link in a "new reply" email. Authorized by the
// logged-in session (see auth.js/api.js's authHeaders()).
export default function InquiryThread({ inquiryId, onBack }) {
  const [state, setState] = useState('loading'); // loading | ready | error
  const [inquiry, setInquiry] = useState(null);
  const [contact, setContact] = useState(null);
  const [relReplied, setRelReplied] = useState(false);
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
        setContact(data.contact);
        setState('ready');
        listMessages({ inquiryId }).then((m) => setRelReplied((m.messages || []).some((x) => x.senderRole === 'builder'))).catch(() => {});
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
      <RelationshipTimeline rel={{ designShared: !!inquiry.designSummary, builderReplied: relReplied, contactShared: !!contact }} />
      {contact
        ? <ContactCard title="Builder contact" name={contact.name || 'Builder'} email={contact.email} phone={contact.phone} />
        : <p className="section-sub">This builder is a demo profile, so there is no direct phone or email — use the messages below.</p>}
      <MessageThread inquiryId={inquiry.id} viewerRole="customer" />
    </div>
  );
}
