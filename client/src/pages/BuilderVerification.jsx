import { useEffect, useState } from 'react';
import { BadgeCheck, Clock, FileUp, XCircle } from 'lucide-react';
import { getBuilderVerification, submitBuilderVerification } from '../lib/api.js';

// The builder's side of verification: submit firm details + ID + licence documents. An admin reviews
// them; only an approval shows the public "Verified" badge. Documents are visible to the reviewers only.
export default function BuilderVerification({ onNavigate }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ firmName: '', registrationNo: '', licenseType: '', notes: '' });
  const [files, setFiles] = useState({ idDoc: null, licenseDoc: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => getBuilderVerification().then(setStatus).catch(() => setStatus({ verified: false, latest: null }));
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.set(k, v));
      fd.set('idDoc', files.idDoc); fd.set('licenseDoc', files.licenseDoc);
      await submitBuilderVerification(fd);
      setFiles({ idDoc: null, licenseDoc: null });
      await load();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  if (!status) return <p className="section-sub">Loading…</p>;
  const latest = status.latest;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (status.verified) {
    return (
      <div className="action-banner action-banner--ok"><BadgeCheck size={20} /><div><strong>Your profile is verified</strong><p>Customers see the Verified badge on your profile and in the directory. Approved {status.verifiedAt ? new Date(status.verifiedAt).toLocaleDateString() : ''}.</p></div></div>
    );
  }

  return (
    <div className="verify-page">
      <p className="section-sub" style={{ marginTop: 0 }}>
        Verification helps customers trust your profile. Upload your government ID and your licence or firm registration. Our team reviews them
        and, if they are in order, adds a <strong>Verified</strong> badge. Your documents are seen only by the reviewers and are never shown publicly.
      </p>

      {latest?.status === 'pending' && (
        <div className="action-banner action-banner--quiet"><Clock size={20} /><div><strong>Under review</strong><p>Submitted {new Date(latest.submittedAt).toLocaleString()}. You will get an email when it is decided.</p></div></div>
      )}
      {latest?.status === 'rejected' && (
        <div className="action-banner action-banner--quiet"><XCircle size={20} /><div><strong>Not approved</strong><p>{latest.reviewerNote}</p><p className="muted-note">Fix the issue and submit again below.</p></div></div>
      )}

      {latest?.status !== 'pending' && (
        <form className="side-card profile-form" onSubmit={submit}>
          <h4><FileUp size={16} style={{ verticalAlign: '-3px' }} /> Submit documents</h4>
          <div className="quote-form-grid">
            <label className="field">Firm / company name<input required value={form.firmName} onChange={set('firmName')} disabled={busy} /></label>
            <label className="field">Registration / licence number<input required value={form.registrationNo} onChange={set('registrationNo')} disabled={busy} /></label>
            <label className="field">Licence type<input value={form.licenseType} onChange={set('licenseType')} placeholder="e.g. Civil contractor licence" disabled={busy} /></label>
            <label className="field field-wide">Notes for the reviewer (optional)<textarea rows={2} value={form.notes} onChange={set('notes')} disabled={busy} /></label>
            <label className="field">Government ID (image or PDF, max 3 MB)<input type="file" required accept="image/*,application/pdf" onChange={(e) => setFiles((f) => ({ ...f, idDoc: e.target.files[0] || null }))} disabled={busy} /></label>
            <label className="field">Licence / registration document (image or PDF, max 3 MB)<input type="file" required accept="image/*,application/pdf" onChange={(e) => setFiles((f) => ({ ...f, licenseDoc: e.target.files[0] || null }))} disabled={busy} /></label>
          </div>
          {error && <p className="quote-form-error">{error}</p>}
          <div className="hero-actions">
            <button className="btn btn-navy" disabled={busy || !files.idDoc || !files.licenseDoc}>{busy ? 'Uploading…' : 'Submit for review'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('builder-dashboard')}>Later</button>
          </div>
        </form>
      )}
    </div>
  );
}
