import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, XCircle } from 'lucide-react';
import { decideVerification, listVerifications, openVerificationDoc } from '../lib/api.js';
import { PhoneBadge } from './Profile.jsx';

// Staff screen: review builder verification requests. Documents open in a new tab through an
// authenticated request; approving sets the public Verified badge, rejecting requires a reason.
export default function AdminVerifications() {
  const [tab, setTab] = useState('pending');
  const [items, setItems] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');

  const load = () => listVerifications(tab).then((d) => setItems(d.verifications || [])).catch((e) => { setItems([]); setError(e.message); });
  useEffect(() => { setItems(null); load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id, decision) {
    setError('');
    try { await decideVerification(id, decision, notes[id] || ''); await load(); } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="view-toggle">
        {['pending', 'approved', 'rejected'].map((t) => <button key={t} className={'tab-sm' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      {error && <p className="quote-form-error">{error}</p>}
      {!items ? <p className="section-sub">Loading…</p> : items.length === 0 ? (
        <div className="empty-state"><p>No {tab} verification requests.</p></div>
      ) : (
        <div className="project-list">
          {items.map((v) => (
            <div key={v.id} className="project-card project-card--rel">
              <div className="project-card-main">
                <h4 style={{ margin: 0 }}>{v.builder.name}</h4>
                <p className="section-sub" style={{ margin: '2px 0 8px' }}>{v.builder.owner} · {v.builder.email} · {v.builder.phone} · {v.builder.location}{v.builder.yearsExperience ? ` · ${v.builder.yearsExperience} yrs` : ''}</p>
                <div className="trust-row"><span className="trust-item trust-item--ok">✓ Email verified</span><PhoneBadge account={{ phone: v.builder.phone, phoneVerified: v.builder.phoneVerified, phoneVerifiedVia: v.builder.phoneVerifiedVia }} /></div>
                <ul className="project-facts">
                  <li><span>Firm</span><strong>{v.details.firmName}</strong></li>
                  <li><span>Registration no.</span><strong>{v.details.registrationNo}</strong></li>
                  <li><span>Licence type</span><strong>{v.details.licenseType || '—'}</strong></li>
                  <li><span>Submitted</span><strong>{new Date(v.submittedAt).toLocaleString()}</strong></li>
                </ul>
                {v.details.notes && <p className="rel-last">“{v.details.notes}”</p>}
                <div className="hero-actions" style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openVerificationDoc(v.id, 'id')}><FileText size={14} /> ID: {v.idDoc.name}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openVerificationDoc(v.id, 'license')}><FileText size={14} /> Licence: {v.licenseDoc.name}</button>
                </div>
                {v.status !== 'pending' && <p className="muted-note">{v.status === 'approved' ? 'Approved' : 'Rejected'} {v.reviewedAt ? new Date(v.reviewedAt).toLocaleString() : ''}{v.reviewerNote ? ` — ${v.reviewerNote}` : ''}</p>}
              </div>
              {v.status === 'pending' && (
                <div className="side-card">
                  <label className="field">Note (required to reject)<textarea rows={2} value={notes[v.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [v.id]: e.target.value }))} /></label>
                  <div className="hero-actions">
                    <button className="btn btn-navy btn-sm" onClick={() => decide(v.id, 'approve')}><CheckCircle2 size={14} /> Approve</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => decide(v.id, 'reject')}><XCircle size={14} /> Reject</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
