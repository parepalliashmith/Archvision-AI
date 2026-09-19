import { useState } from 'react';
import { LogIn, Mail, Send } from 'lucide-react';
import { requestBuilderQuote } from '../lib/api.js';
import { isLoggedIn } from '../lib/auth.js';
import { areaOf, areaUnitOf, bedroomCountOf, floorCountOf, getPlotSize } from '../lib/layout.js';
import { fmtINR } from '../lib/format.js';
import MessageThread from './MessageThread.jsx';

// Builds the read-only "Project Overview" block (spec section 4) from data
// the app already has — never re-asks the customer anything already known
// from generating the design.
function overview(design) {
  if (!design?.layout) return [];
  const { layout, cost, requirements } = design;
  const plot = getPlotSize(layout);
  return [
    ['Plot size', `${plot.width}×${plot.depth}${plot.unit}`],
    ['Built-up area', `${areaOf(layout)} ${areaUnitOf(layout)}`],
    ['Floors', floorCountOf(layout)],
    ['Bedrooms', bedroomCountOf(layout) || '—'],
    ['Parking', requirements?.parking ? 'Required' : 'Not required'],
    ['Estimated budget', cost?.totalCost ? fmtINR(cost.totalCost) : 'Not calculated'],
    ['Style', layout.style || 'Not specified'],
  ];
}

function summarize(design) {
  const entries = overview(design);
  return entries.length ? Object.fromEntries(entries) : null;
}

// The one enquiry form behind "Talk to a Construction Expert" (generic,
// builder=null), and behind Contact/Request Quotation/Schedule Consultation
// on a builder profile (builder set, a different pre-filled `intent`
// message per button — see BuilderProfile.jsx). Same submit pipeline either
// way: POST /api/inquiries, which always saves and best-effort emails.
export default function ProjectEnquiryForm({ design, builder, intent, onClose, onNavigate }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', location: '', message: intent || '' });
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [emailSent, setEmailSent] = useState(false);
  const [inquiryId, setInquiryId] = useState(null);
  const [error, setError] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const result = await requestBuilderQuote({
        customerName: form.name.trim(),
        customerEmail: form.email.trim(),
        customerPhone: form.phone.trim(),
        message: form.message.trim(),
        location: form.location.trim(),
        designSummary: summarize(design),
        builderId: builder?.id,
        builderName: builder?.name,
        intent: intent || 'General enquiry',
      });
      setEmailSent(!!result.emailSent);
      setInquiryId(result.id);
      setState('done');
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div>
        <div className="notice notice--pending">
          <span className="notice-icon"><Mail size={22} strokeWidth={1.8} /></span>
          <div>
            <h4>Enquiry sent{builder ? ` to ${builder.name}` : ''}</h4>
            <p>
              {emailSent
                ? "We've emailed you a confirmation, and the builder has been notified — they'll reach out shortly."
                : "Your enquiry has been recorded. Email delivery isn't configured on this server yet, but it's saved for follow-up."}
            </p>
            {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ marginTop: 8 }}>Close</button>}
          </div>
        </div>
        {inquiryId && <MessageThread inquiryId={inquiryId} viewerRole="customer" />}
      </div>
    );
  }

  const overviewRows = overview(design);

  if (!isLoggedIn()) {
    return (
      <div className="notice notice--pending">
        <span className="notice-icon"><LogIn size={22} strokeWidth={1.8} /></span>
        <div>
          <h4>Log in to continue</h4>
          <p>Sign in with a one-time email code to send this enquiry and keep track of the reply.</p>
          <div className="hero-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('login')}>Sign In</button>
            {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="enquiry-form" onSubmit={handleSubmit}>
      {overviewRows.length > 0 ? (
        <>
          <h4>Project Overview</h4>
          <ul className="enquiry-overview">
            {overviewRows.map(([label, value]) => (
              <li key={label}><span>{label}</span><strong>{value}</strong></li>
            ))}
          </ul>
        </>
      ) : (
        <p className="section-sub" style={{ marginTop: 0 }}>
          No project selected yet — describe what you're looking for in your message below, or{' '}
          generate a design first for it to be attached automatically.
        </p>
      )}

      <h4>Your details</h4>
      <div className="quote-form-grid">
        <label className="field">Name
          <input type="text" required value={form.name} onChange={update('name')} placeholder="Your name" disabled={state === 'sending'} />
        </label>
        <label className="field">Email
          <input type="email" required value={form.email} onChange={update('email')} placeholder="you@example.com" disabled={state === 'sending'} />
        </label>
        <label className="field">Phone <span className="field-hint">(optional)</span>
          <input type="tel" value={form.phone} onChange={update('phone')} placeholder="+91 90000 00000" disabled={state === 'sending'} />
        </label>
        <label className="field">Location <span className="field-hint">(for matching)</span>
          <input type="text" required value={form.location} onChange={update('location')} placeholder="City" disabled={state === 'sending'} />
        </label>
        <label className="field field-wide">Message
          <textarea rows={3} required value={form.message} onChange={update('message')} disabled={state === 'sending'} />
        </label>
      </div>
      {error && <p className="quote-form-error">{error}</p>}
      <div className="hero-actions">
        <button type="submit" className={'btn btn-primary btn-sm' + (state === 'sending' ? ' btn-loading' : '')} disabled={state === 'sending'}>
          {state === 'sending' ? (<><span className="spinner" /> Sending…</>) : (<><Send size={14} /> Send Project Enquiry</>)}
        </button>
        {onClose && <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={state === 'sending'}>Cancel</button>}
      </div>
    </form>
  );
}
