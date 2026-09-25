import { useEffect, useState } from 'react';
import { Mail, Phone } from 'lucide-react';
import { getMe, savePhone } from '../lib/api.js';
import { updateStoredAccount } from '../lib/auth.js';
import { displayName, initialsOf } from '../components/Navbar.jsx';

// Account details. Email is the verified login and can't be edited; the phone
// number is what the other party calls or WhatsApps once an enquiry connects you.
export default function Profile({ account, onAccountChange, onEditBuilder }) {
  const [phone, setPhone] = useState(account?.phone || '');
  const [builderProfile, setBuilderProfile] = useState(null);
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');

  useEffect(() => {
    getMe().then((d) => {
      setBuilderProfile(d.builderProfile || null);
      if (d.account?.phone) setPhone(d.account.phone);
    }).catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setState('saving');
    setError('');
    try {
      const result = await savePhone(phone.trim());
      updateStoredAccount({ phone: result.account.phone });
      onAccountChange?.({ ...account, phone: result.account.phone });
      setPhone(result.account.phone);
      setState('saved');
    } catch (err) {
      setError(err.message || 'Could not save — please try again.');
      setState('error');
    }
  }

  const isBuilder = account?.role === 'builder';

  return (
    <div className="profile-page">
      <div className="profile-head">
        <span className="avatar avatar--xl">{initialsOf(account)}</span>
        <div>
          <h3 style={{ margin: 0 }}>{displayName(account)}</h3>
          <p style={{ margin: 0 }}>{isBuilder ? 'Builder / Civil Engineer' : 'Customer'}</p>
        </div>
      </div>

      <form className="side-card profile-form" onSubmit={handleSave}>
        <h4>Contact details</h4>
        <p className="section-sub" style={{ marginTop: 0 }}>
          {isBuilder
            ? 'Customers call or WhatsApp you on this number after they send an enquiry.'
            : 'Builders you send an enquiry to can call or WhatsApp you on this number.'}
        </p>
        <label className="field">Email <span className="field-hint">(verified login — cannot be changed)</span>
          <span className="readonly-field"><Mail size={15} /> {account?.email}</span>
        </label>
        <label className="field">Registered phone
          <input type="tel" required value={phone} onChange={(e) => { setPhone(e.target.value); setState('idle'); }} placeholder="+91 90000 00000" disabled={state === 'saving'} />
        </label>
        {error && <p className="quote-form-error">{error}</p>}
        <div className="hero-actions">
          <button type="submit" className={'btn btn-primary btn-sm' + (state === 'saving' ? ' btn-loading' : '')} disabled={state === 'saving' || !phone.trim()}>
            {state === 'saving' ? (<><span className="spinner" /> Saving…</>) : (<><Phone size={14} /> Save phone</>)}
          </button>
          {state === 'saved' && <span className="saved-note">Saved ✓</span>}
        </div>
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
