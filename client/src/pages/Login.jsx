import { useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { requestOtp, verifyOtp } from '../lib/api.js';
import { setSession } from '../lib/auth.js';

// Email-OTP login/signup for both roles — no passwords anywhere in this app.
// Two steps: request a code, then verify it. A first-time verify silently
// creates the account (see server.js's /api/auth/verify-otp).
export default function Login({ defaultRole = 'customer', onSuccess }) {
  const [role, setRole] = useState(defaultRole);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // email | code
  const [state, setState] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState('');

  async function handleRequestOtp(e) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const result = await requestOtp({ email: email.trim(), role });
      setDevCode(result.devCode || '');
      setStep('code');
      setState('idle');
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
      setState('error');
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const result = await verifyOtp({ email: email.trim(), role, code: code.trim() });
      setSession(result.token, result.account);
      onSuccess?.({ account: result.account, needsBuilderProfile: result.needsBuilderProfile });
    } catch (err) {
      setError(err.message || 'Invalid or expired code.');
      setState('error');
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2><KeyRound size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />Sign in</h2>
        <p className="section-sub" style={{ marginTop: 0 }}>
          No passwords — we email you a one-time code instead.
        </p>

        <div className="login-role-toggle">
          <button
            type="button"
            className={'btn btn-sm' + (role === 'customer' ? ' btn-primary' : ' btn-ghost')}
            onClick={() => setRole('customer')}
            disabled={step === 'code'}
          >
            I'm a customer
          </button>
          <button
            type="button"
            className={'btn btn-sm' + (role === 'builder' ? ' btn-primary' : ' btn-ghost')}
            onClick={() => setRole('builder')}
            disabled={step === 'code'}
          >
            I'm a builder
          </button>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} className="login-form">
            <label className="field">Email
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={state === 'sending'}
              />
            </label>
            {error && <p className="quote-form-error">{error}</p>}
            <button type="submit" className={'btn btn-primary' + (state === 'sending' ? ' btn-loading' : '')} disabled={state === 'sending' || !email.trim()}>
              {state === 'sending' ? (<><span className="spinner" /> Sending…</>) : (<><Mail size={15} /> Send code</>)}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="login-form">
            <p className="section-sub" style={{ marginTop: 0 }}>
              Enter the 6-digit code we emailed to <strong>{email}</strong>.
            </p>
            {devCode && (
              <p className="notice notice--pending" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                Email isn't configured on this server — your code is <strong>{devCode}</strong>.
              </p>
            )}
            <label className="field">Code
              <input
                type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} required
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                disabled={state === 'sending'}
              />
            </label>
            {error && <p className="quote-form-error">{error}</p>}
            <div className="hero-actions">
              <button type="submit" className={'btn btn-primary' + (state === 'sending' ? ' btn-loading' : '')} disabled={state === 'sending' || code.trim().length !== 6}>
                {state === 'sending' ? (<><span className="spinner" /> Verifying…</>) : 'Verify & sign in'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep('email'); setCode(''); setError(''); }} disabled={state === 'sending'}>
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
