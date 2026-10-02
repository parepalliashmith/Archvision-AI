import { useState } from 'react';
import { CheckCircle2, Phone } from 'lucide-react';
import { requestPhoneCode, verifyPhoneCode } from '../lib/api.js';

// Verify a phone number with a 6-digit code. If an SMS provider is connected on the server the code is
// texted; otherwise the app is in DEMO MODE: the code is shown on screen and the result is recorded
// as a demo confirmation — which proves nothing about who owns the number, and is labelled that way.
export default function PhoneVerification({ initialPhone = '', onVerified, onSkip, compact = false }) {
  const [phone, setPhone] = useState(initialPhone);
  const [step, setStep] = useState('enter'); // enter | code | done
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [sentSms, setSentSms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e) {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await requestPhoneCode(phone.trim());
      setPhone(r.phone); setDevCode(r.devCode || ''); setSentSms(!!r.sent); setStep('code');
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await verifyPhoneCode(phone, code.trim());
      setStep('done');
      onVerified?.(r.account);
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  if (step === 'done') {
    return <p className="saved-note"><CheckCircle2 size={15} style={{ verticalAlign: '-3px' }} /> Phone confirmed.</p>;
  }

  return (
    <div className={'phone-verify' + (compact ? ' phone-verify--compact' : '')}>
      {step === 'enter' ? (
        <form onSubmit={send} className="login-form">
          <label className="field">Phone number
            <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" disabled={busy} />
          </label>
          {error && <p className="quote-form-error">{error}</p>}
          <div className="hero-actions">
            <button className="btn btn-navy btn-sm" disabled={busy || !phone.trim()}><Phone size={14} /> Send code</button>
            {onSkip && <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip}>Do this later</button>}
          </div>
        </form>
      ) : (
        <form onSubmit={verify} className="login-form">
          <p className="section-sub" style={{ margin: 0 }}>
            {sentSms ? <>We texted a 6-digit code to <strong>{phone}</strong>.</> : <>Enter the 6-digit code for <strong>{phone}</strong>.</>}
          </p>
          {devCode && (
            <p className="notice notice--pending" style={{ padding: '8px 12px', fontSize: '0.82rem', margin: 0 }}>
              <span>Demo mode — no SMS provider is connected, so your code is <strong>{devCode}</strong>. A demo confirmation does not prove ownership of the number.</span>
            </p>
          )}
          <label className="field">Code
            <input type="text" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" disabled={busy} />
          </label>
          {error && <p className="quote-form-error">{error}</p>}
          <div className="hero-actions">
            <button className="btn btn-navy btn-sm" disabled={busy || code.length !== 6}>Verify phone</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep('enter'); setCode(''); setError(''); }} disabled={busy}>Change number</button>
          </div>
        </form>
      )}
    </div>
  );
}
