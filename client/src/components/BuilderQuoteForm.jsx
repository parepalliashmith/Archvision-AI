import { useState } from 'react';
import { Hammer, LogIn, Mail } from 'lucide-react';
import { requestBuilderQuote } from '../lib/api.js';
import { isLoggedIn } from '../lib/auth.js';
import { areaOf, areaUnitOf, bedroomCountOf, floorCountOf, getPlotSize } from '../lib/layout.js';
import { fmtINR } from '../lib/format.js';
import MessageThread from './MessageThread.jsx';

// Builds the compact snapshot sent to the backend (and echoed back in both
// emails) — the same handful of stats already shown elsewhere on the design
// (dashboard cards, cost panel), not the full layout/cost objects.
function summarize(design) {
  const { layout, cost } = design;
  const plot = getPlotSize(layout);
  return {
    Design: layout.title || 'Untitled design',
    Plot: `${plot.width}×${plot.depth}${plot.unit}`,
    Area: `${areaOf(layout)} ${areaUnitOf(layout)}`,
    Bedrooms: bedroomCountOf(layout) || '—',
    Floors: floorCountOf(layout),
    'Estimated cost': cost?.totalCost ? fmtINR(cost.totalCost) : 'Not calculated',
  };
}

// Opens inline (no modal pattern exists anywhere in this app — see Save's own
// toggle-free button next to it) rather than as an overlay. `design` is
// {layout, cost, requirements} — the exact shape CreateDesign.jsx/UploadPlan.jsx
// already pass to onSave.
export default function BuilderQuoteForm({ design, triggerLabel = 'Get a Builder Quote', onNavigate }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
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
        designSummary: summarize(design),
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
      <div className="quote-notice">
        <div className="notice notice--pending">
          <span className="notice-icon"><Mail size={22} strokeWidth={1.8} /></span>
          <div>
            <h4>Request sent</h4>
            <p>
              {emailSent
                ? "We've emailed you a confirmation, and a builder has been notified — they'll reach out shortly."
                : "Your request has been recorded. Email delivery isn't configured on this server yet, but the inquiry is saved for follow-up."}
            </p>
          </div>
        </div>
        {inquiryId && <MessageThread inquiryId={inquiryId} viewerRole="customer" />}
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Hammer size={15} /> {triggerLabel}
      </button>
    );
  }

  if (!isLoggedIn()) {
    return (
      <div className="notice notice--pending">
        <span className="notice-icon"><LogIn size={22} strokeWidth={1.8} /></span>
        <div>
          <h4>Log in to continue</h4>
          <p>Sign in with a one-time email code to send this request and keep track of the reply.</p>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('login')} style={{ marginTop: 8 }}>Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <form className="quote-form" onSubmit={handleSubmit}>
      <h4><Hammer size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />{triggerLabel}</h4>
      <p className="section-sub" style={{ marginTop: 0 }}>
        Share your contact details and a builder will follow up about this design.
      </p>
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
        <label className="field field-wide">Message <span className="field-hint">(optional)</span>
          <textarea rows={2} value={form.message} onChange={update('message')} placeholder="Anything the builder should know?" disabled={state === 'sending'} />
        </label>
      </div>
      {error && <p className="quote-form-error">{error}</p>}
      <div className="hero-actions">
        <button type="submit" className={'btn btn-primary btn-sm' + (state === 'sending' ? ' btn-loading' : '')} disabled={state === 'sending'}>
          {state === 'sending' ? (<><span className="spinner" /> Sending…</>) : 'Send Request'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={state === 'sending'}>Cancel</button>
      </div>
    </form>
  );
}
