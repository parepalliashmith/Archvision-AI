import { useEffect, useState } from 'react';
import { BadgeCheck, Lock, Mail, Phone, ShieldCheck } from 'lucide-react';
import { changePassword, getMe, savePhone } from '../lib/api.js';
import { getToken, setSession, updateStoredAccount } from '../lib/auth.js';
import { displayName, initialsOf } from '../components/Navbar.jsx';
import PhoneVerification from '../components/PhoneVerification.jsx';

export function PhoneBadge({ account }) {
  if (!account?.phone) return <span className="trust-item">No phone</span>;
  if (account.phoneVerified && account.phoneVerifiedVia === 'sms') return <span className="trust-item trust-item--ok">✓ Phone verified by SMS</span>;
  if (account.phoneVerified) return <span className="trust-item trust-item--demo">Phone confirmed in demo mode (no SMS)</span>;
  return <span className="trust-item trust-item--warn">Phone not verified</span>;
}

// Account details and security: verified email, phone verification, password change.
export default function Profile({ account, onAccountChange, onEditBuilder, onNavigate }) {
  const [phone, setPhone] = useState(account?.phone || '');
  const [builderProfile, setBuilderProfile] = useState(null);
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwState, setPwState] = useState({ busy: false, msg: '', err: '' });

  const refresh = (acc) => { updateStoredAccount(acc); onAccountChange?.({ ...account, ...acc }); };

  useEffect(() => {
    getMe().then((d) => {
      setBuilderProfile(d.builderProfile || null);
      if (d.account) { setPhone(d.account.phone || ''); refresh(d.account); }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSavePhone(e) {
    e.preventDefault();
    setState('saving'); setError('');
    try {
      const result = await savePhone(phone.trim());
      refresh(result.account); setPhone(result.account.phone);
      setState('saved');
      if (!result.account.phoneVerified) setVerifying(true);
    } catch (err) { setError(err.message || 'Could not save — please try again.'); setState('error'); }
  }

  async function handlePassword(e) {
    e.preventDefault();
    if (pw.next !== pw.confirm) { setPwState({ busy: false, msg: '', err: 'The new passwords do not match.' }); return; }
    setPwState({ busy: true, msg: '', err: '' });
    try {
      const r = await changePassword({ currentPassword: pw.current, newPassword: pw.next });
      setSession(r.token, r.account); // the old session was signed out; keep this one
      setPw({ current: '', next: '', confirm: '' });
      setPwState({ busy: false, msg: 'Password changed. Other devices were signed out.', err: '' });
    } catch (err) { setPwState({ busy: false, msg: '', err: err.message }); }
  }

  const isBuilder = account?.role === 'builder';
  const acc = { ...account };

  return (
    <div className="profile-page">
      <div className="profile-head">
        <span className="avatar avatar--xl">{initialsOf(account)}</span>
        <div>
          <h3 style={{ margin: 0 }}>{account?.name || displayName(account)}</h3>
          <p style={{ margin: 0 }}>{isBuilder ? (account?.company ? `${account.company} · Builder / Civil Engineer` : 'Builder / Civil Engineer') : account?.role === 'admin' ? 'Staff' : 'Customer'}{account?.location ? ` · ${account.location}` : ''}</p>
        </div>
      </div>

      <div className="side-card">
        <h4><ShieldCheck size={16} style={{ verticalAlign: '-3px' }} /> Verification status</h4>
        <div className="trust-row">
          <span className="trust-item trust-item--ok">✓ Email verified</span>
          <PhoneBadge account={acc} />
          {isBuilder && (builderProfile?.verified
            ? <span className="trust-item trust-item--ok"><BadgeCheck size={13} style={{ verticalAlign: '-2px' }} /> Verified builder (documents reviewed)</span>
            : <span className="trust-item">Documents not yet verified</span>)}
        </div>
        {isBuilder && !builderProfile?.verified && (
          <p className="muted-note">A Verified badge appears on your public profile only after an admin reviews your documents. <button className="link-btn" onClick={() => onNavigate?.('builder-verification')}>Open Verification</button></p>
        )}
        <p className="muted-note">You need a verified phone to send or accept project requests.</p>
      </div>

      <form className="side-card profile-form" onSubmit={handleSavePhone}>
        <h4>Contact details</h4>
        <p className="section-sub" style={{ marginTop: 0 }}>
          {isBuilder ? 'Customers can call or WhatsApp you on this number after you accept their request.' : 'A builder can call or WhatsApp you on this number after they accept your request.'}
        </p>
        <label className="field">Email <span className="field-hint">(your login — cannot be changed)</span>
          <span className="readonly-field"><Mail size={15} /> {account?.email}</span>
        </label>
        <label className="field">Registered phone
          <input type="tel" required value={phone} onChange={(e) => { setPhone(e.target.value); setState('idle'); }} placeholder="+91 90000 00000" disabled={state === 'saving'} />
        </label>
        {error && <p className="quote-form-error">{error}</p>}
        <div className="hero-actions">
          <button type="submit" className={'btn btn-primary btn-sm' + (state === 'saving' ? ' btn-loading' : '')} disabled={state === 'saving' || !phone.trim() || phone.trim() === account?.phone}>
            {state === 'saving' ? (<><span className="spinner" /> Saving…</>) : (<><Phone size={14} /> Save new number</>)}
          </button>
          {!account?.phoneVerified && account?.phone && <button type="button" className="btn btn-navy btn-sm" onClick={() => setVerifying((v) => !v)}>Verify this number</button>}
          {state === 'saved' && <span className="saved-note">Saved ✓ — changing the number clears its verification.</span>}
        </div>
        {verifying && !account?.phoneVerified && (
          <PhoneVerification initialPhone={account?.phone || phone} compact onVerified={(a) => { refresh(a); setVerifying(false); }} />
        )}
      </form>

      <form className="side-card profile-form" onSubmit={handlePassword}>
        <h4><Lock size={16} style={{ verticalAlign: '-3px' }} /> Password</h4>
        <label className="field">Current password<input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></label>
        <label className="field">New password<input type="password" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /><span className="field-hint">At least 8 characters, with a letter and a number.</span></label>
        <label className="field">Confirm new password<input type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></label>
        {pwState.err && <p className="quote-form-error">{pwState.err}</p>}
        {pwState.msg && <p className="saved-note">{pwState.msg}</p>}
        <div className="hero-actions"><button className="btn btn-primary btn-sm" disabled={pwState.busy || !pw.next}>Change password</button></div>
      </form>

      {isBuilder && builderProfile && (
        <div className="side-card">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>{builderProfile.name}</h4>
            <button className="link-btn" onClick={() => onEditBuilder?.(builderProfile)}>Edit profile</button>
          </div>
          <ul className="project-facts">
            <li><span>Specializations</span><strong>{(builderProfile.specializations || []).join(', ')}</strong></li>
            <li><span>Service locations</span><strong>{(builderProfile.serviceLocations || []).join(', ')}</strong></li>
            <li><span>Experience</span><strong>{builderProfile.yearsExperience} yrs</strong></li>
            <li><span>Price range</span><strong>₹{(builderProfile.priceRange || [])[0]}–{(builderProfile.priceRange || [])[1]}/sqft</strong></li>
          </ul>
          {builderProfile.about && <p style={{ marginBottom: 0 }}>{builderProfile.about}</p>}
        </div>
      )}
    </div>
  );
}
