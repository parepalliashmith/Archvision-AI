import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { saveBuilderProfile } from '../lib/api.js';
import { getAccount, updateStoredAccount } from '../lib/auth.js';
import { SPECIALIZATIONS, SERVICE_LOCATIONS } from '../data/builders.js';

// Shown once, right after a first-time builder OTP verify (needsBuilderProfile
// from the verify-otp response) — required fields, on purpose: BuilderCard/
// BuilderProfile assume a real priceRange/specializations/serviceLocations
// exist, so leaving these optional would mean those components crash later
// on a half-filled real-builder record.
export default function BuilderProfileSetup({ onDone, initial }) {
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(getAccount()?.phone || '');
  const [specializations, setSpecializations] = useState(initial?.specializations || []);
  const [serviceLocations, setServiceLocations] = useState(initial?.serviceLocations || []);
  const [about, setAbout] = useState(initial?.about || '');
  const [priceMin, setPriceMin] = useState(initial?.priceRange?.[0] ?? '');
  const [priceMax, setPriceMax] = useState(initial?.priceRange?.[1] ?? '');
  const [yearsExperience, setYearsExperience] = useState(initial?.yearsExperience ?? '');
  const [state, setState] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const valid = name.trim() && phone.trim() && specializations.length > 0 && serviceLocations.length > 0 &&
    priceMin && priceMax && yearsExperience && about.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valid) return;
    setState('sending');
    setError('');
    try {
      const result = await saveBuilderProfile({
        name: name.trim(),
        phone: phone.trim(),
        specializations,
        serviceLocations,
        about: about.trim(),
        priceRange: [Number(priceMin), Number(priceMax)],
        yearsExperience: Number(yearsExperience),
      });
      if (result.account) updateStoredAccount({ phone: result.account.phone });
      onDone?.(result.builderProfile);
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
      setState('error');
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2><UserPlus size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />Complete your builder profile</h2>
        <p className="section-sub" style={{ marginTop: 0 }}>
          This appears on the Find Builders directory alongside our curated demo profiles.
          Real accounts always show as unrated and unverified until reviewed — no fabricated stats.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="field">Business name
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your company name" disabled={state === 'sending'} />
          </label>

          <label className="field">Phone number <span className="field-hint">(customers call or WhatsApp you on this)</span>
            <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" disabled={state === 'sending'} />
          </label>

          <div className="field">
            Specializations
            <div className="checkbox-grid">
              {SPECIALIZATIONS.map((s) => (
                <label key={s} className="checkbox-pill">
                  <input type="checkbox" checked={specializations.includes(s)} onChange={() => toggle(specializations, setSpecializations, s)} disabled={state === 'sending'} /> {s}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            Service locations
            <div className="checkbox-grid">
              {SERVICE_LOCATIONS.map((l) => (
                <label key={l} className="checkbox-pill">
                  <input type="checkbox" checked={serviceLocations.includes(l)} onChange={() => toggle(serviceLocations, setServiceLocations, l)} disabled={state === 'sending'} /> {l}
                </label>
              ))}
            </div>
          </div>

          <div className="quote-form-grid">
            <label className="field">Price range min (₹/sqft)
              <input type="number" min={0} required value={priceMin} onChange={(e) => setPriceMin(e.target.value)} disabled={state === 'sending'} />
            </label>
            <label className="field">Price range max (₹/sqft)
              <input type="number" min={0} required value={priceMax} onChange={(e) => setPriceMax(e.target.value)} disabled={state === 'sending'} />
            </label>
            <label className="field">Years of experience
              <input type="number" min={0} required value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} disabled={state === 'sending'} />
            </label>
            <label className="field field-wide">About
              <textarea rows={3} required value={about} onChange={(e) => setAbout(e.target.value)} placeholder="What do you specialize in?" disabled={state === 'sending'} />
            </label>
          </div>

          {error && <p className="quote-form-error">{error}</p>}
          <button type="submit" className={'btn btn-primary' + (state === 'sending' ? ' btn-loading' : '')} disabled={state === 'sending' || !valid}>
            {state === 'sending' ? (<><span className="spinner" /> Saving…</>) : 'Save profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
