import { useState } from 'react';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { forgotPassword, loginWithPassword, registerAccount, resendEmailCode, resetPassword, verifyEmail } from '../lib/api.js';
import { getAccount, setSession, updateStoredAccount } from '../lib/auth.js';
import PhoneVerification from '../components/PhoneVerification.jsx';

const PW_HINT = 'At least 8 characters, with a letter and a number.';

// Sign in / create account for both roles. Registration: details -> email code -> phone code.
// Sign-in is by password; a forgotten password is reset with an emailed code. Staff (admin) accounts
// use the same screens, offered through a small link and honoured only for authorised emails.
export default function Login({ defaultRole = 'customer', onSuccess }) {
  const [mode, setMode] = useState('signin'); // signin | register | verify-email | verify-phone | forgot | reset
  const [role, setRole] = useState(defaultRole);
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', location: '', yearsExperience: '', password: '', confirm: '', code: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devCode, setDevCode] = useState('');
  const [session, setSessionState] = useState(null);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const email = f.email.trim().toLowerCase();
  const isBuilder = role === 'builder';
  const isStaff = role === 'admin';

  function go(next) { setMode(next); setError(''); setInfo(''); }

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err.message || 'Something went wrong — please try again.'); return err; } finally { setBusy(false); }
  }

  function finish(sess, phoneStep) {
    setSession(sess.token, sess.account);
    setSessionState(sess);
    if (phoneStep && !sess.account.phoneVerified) { go('verify-phone'); return; }
    onSuccess?.({ account: sess.account, needsBuilderProfile: sess.needsBuilderProfile });
  }

  const submitRegister = (e) => {
    e.preventDefault();
    if (f.password !== f.confirm) { setError('The two passwords do not match.'); return; }
    run(async () => {
      const r = await registerAccount({ role, name: f.name.trim(), company: f.company.trim(), email, phone: f.phone.trim(), location: f.location.trim(), yearsExperience: f.yearsExperience, password: f.password });
      setDevCode(r.devCode || ''); go('verify-email');
    });
  };

  const submitSignin = (e) => {
    e.preventDefault();
    run(async () => {
      const err = await loginWithPassword({ email, role, password: f.password }).then((s) => { finish(s, false); return null; }).catch((x) => x);
      if (!err) return;
      if (err.code === 'EMAIL_NOT_VERIFIED') { setDevCode(err.data?.devCode || ''); setInfo('Please verify your email first — we sent you a new code.'); go('verify-email'); return; }
      if (err.code === 'NEEDS_PASSWORD') { setInfo('This account has no password yet. Request a code to set one.'); go('forgot'); return; }
      throw err;
    });
  };

  const submitVerifyEmail = (e) => {
    e.preventDefault();
    run(async () => { finish(await verifyEmail({ email, role, code: f.code.trim() }), true); });
  };

  const resend = () => run(async () => { const r = await resendEmailCode({ email, role }); setDevCode(r.devCode || ''); setInfo('A new code was sent.'); });

  const submitForgot = (e) => {
    e.preventDefault();
    run(async () => { const r = await forgotPassword({ email, role }); setDevCode(r.devCode || ''); setInfo('If that email has an account, a code is on its way.'); setMode('reset'); });
  };

  const submitReset = (e) => {
    e.preventDefault();
    run(async () => { finish(await resetPassword({ email, role, code: f.code.trim(), newPassword: f.newPassword }), false); });
  };

  const title = { signin: 'Sign in', register: 'Create your account', 'verify-email': 'Verify your email', 'verify-phone': 'Verify your phone', forgot: 'Reset your password', reset: 'Choose a new password' }[mode];
  const showRoles = mode === 'signin' || mode === 'register' || mode === 'forgot';
  const regStep = mode === 'register' ? 1 : mode === 'verify-email' ? 2 : mode === 'verify-phone' ? 3 : 0;
  const devNote = devCode && (
    <p className="notice notice--pending" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
      <span>Email is not configured on this server — your code is <strong>{devCode}</strong>.</span>
    </p>
  );

  return (
    <div className="login-page">
      <div className="login-card login-card--wide">
        {(mode === 'forgot' || mode === 'reset') && <button className="btn btn-ghost btn-sm" onClick={() => go('signin')} style={{ marginBottom: 10 }}><ArrowLeft size={14} /> Back to sign in</button>}
        <h2><KeyRound size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />{title}</h2>

        {regStep > 0 && (
          <ol className="auth-steps">
            {['Details', 'Email', 'Phone'].map((l, i) => <li key={l} className={i + 1 < regStep ? 'done' : i + 1 === regStep ? 'on' : ''}><b>{i + 1 < regStep ? '✓' : i + 1}</b>{l}</li>)}
          </ol>
        )}

        {showRoles && !isStaff && (
          <>
            <p className="login-question">{mode === 'register' ? 'How will you use BuildBridge AI?' : 'Signing in as'}</p>
            <div className="role-cards">
              <button type="button" className={'role-card' + (role === 'customer' ? ' active' : '')} onClick={() => setRole('customer')}>
                <strong>I want to build a home</strong>
                <small>Design a house, see it in 3D, estimate the cost and send it to a builder.</small>
              </button>
              <button type="button" className={'role-card' + (role === 'builder' ? ' active' : '')} onClick={() => setRole('builder')}>
                <strong>I'm a Builder / Civil Engineer</strong>
                <small>Create a profile, get verified and receive project requests with the customer's design.</small>
              </button>
            </div>
          </>
        )}
        {isStaff && showRoles && <p className="notice notice--pending" style={{ padding: '8px 12px' }}><span>Staff access — only authorised email addresses can use this.</span></p>}

        {info && <p className="section-sub" style={{ marginTop: 0 }}>{info}</p>}

        {mode === 'signin' && (
          <form onSubmit={submitSignin} className="login-form">
            <label className="field">Email<input type="email" required value={f.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" disabled={busy} /></label>
            <label className="field">Password<input type="password" required value={f.password} onChange={set('password')} autoComplete="current-password" disabled={busy} /></label>
            {error && <p className="quote-form-error">{error}</p>}
            <button className={'btn btn-navy' + (busy ? ' btn-loading' : '')} disabled={busy || !f.email.trim() || !f.password}>{busy ? <><span className="spinner" /> Signing in…</> : 'Sign in'}</button>
            <div className="auth-links">
              <button type="button" className="link-btn" onClick={() => go('forgot')}>Forgot password?</button>
              <button type="button" className="link-btn" onClick={() => go('register')}>New here? Create an account</button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={submitRegister} className="login-form">
            <div className="quote-form-grid">
              <label className="field">{isBuilder ? 'Full name' : 'Name'}<input type="text" required value={f.name} onChange={set('name')} autoComplete="name" disabled={busy} /></label>
              {isBuilder && <label className="field">Company / firm name<input type="text" required value={f.company} onChange={set('company')} disabled={busy} /></label>}
              <label className="field">Email<input type="email" required value={f.email} onChange={set('email')} autoComplete="email" disabled={busy} /></label>
              <label className="field">Phone number<input type="tel" required value={f.phone} onChange={set('phone')} placeholder="+91 90000 00000" disabled={busy} /></label>
              <label className="field">Location (city)<input type="text" required value={f.location} onChange={set('location')} disabled={busy} /></label>
              {isBuilder && <label className="field">Years of experience<input type="number" min="0" max="70" value={f.yearsExperience} onChange={set('yearsExperience')} disabled={busy} /></label>}
              <label className="field">Password<input type="password" required value={f.password} onChange={set('password')} autoComplete="new-password" disabled={busy} /><span className="field-hint">{PW_HINT}</span></label>
              <label className="field">Confirm password<input type="password" required value={f.confirm} onChange={set('confirm')} autoComplete="new-password" disabled={busy} /></label>
            </div>
            <p className="muted-note" style={{ margin: 0 }}>Your email and phone are never shown publicly. They are shared only after a builder accepts a project request.</p>
            {error && <p className="quote-form-error">{error}</p>}
            <button className={'btn btn-navy' + (busy ? ' btn-loading' : '')} disabled={busy}>{busy ? <><span className="spinner" /> Creating…</> : 'Create account & send code'}</button>
            <div className="auth-links"><button type="button" className="link-btn" onClick={() => go('signin')}>Already have an account? Sign in</button></div>
          </form>
        )}

        {mode === 'verify-email' && (
          <form onSubmit={submitVerifyEmail} className="login-form">
            <p className="section-sub" style={{ marginTop: 0 }}>Enter the 6-digit code we emailed to <strong>{email}</strong>.</p>
            {devNote}
            <label className="field">Code<input type="text" inputMode="numeric" maxLength={6} required value={f.code} onChange={(e) => setF((v) => ({ ...v, code: e.target.value.replace(/\D/g, '') }))} placeholder="123456" disabled={busy} /></label>
            {error && <p className="quote-form-error">{error}</p>}
            <div className="hero-actions">
              <button className="btn btn-navy" disabled={busy || f.code.length !== 6}><Mail size={15} /> Verify email</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={busy}>Resend code</button>
            </div>
          </form>
        )}

        {mode === 'verify-phone' && (
          <div>
            <p className="section-sub" style={{ marginTop: 0 }}>Builders and customers can only exchange contact details once both phone numbers are confirmed. You can also do this later from your Profile.</p>
            <PhoneVerification
              initialPhone={f.phone || session?.account?.phone || ''}
              onVerified={(acc) => { updateStoredAccount(acc); onSuccess?.({ account: { ...(session?.account || getAccount()), ...acc }, needsBuilderProfile: session?.needsBuilderProfile }); }}
              onSkip={() => onSuccess?.({ account: session.account, needsBuilderProfile: session.needsBuilderProfile })}
            />
          </div>
        )}

        {mode === 'forgot' && (
          <form onSubmit={submitForgot} className="login-form">
            <label className="field">Email<input type="email" required value={f.email} onChange={set('email')} placeholder="you@example.com" disabled={busy} /></label>
            {error && <p className="quote-form-error">{error}</p>}
            <button className="btn btn-navy" disabled={busy || !f.email.trim()}>Send reset code</button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={submitReset} className="login-form">
            {devNote}
            <label className="field">Code from your email<input type="text" inputMode="numeric" maxLength={6} required value={f.code} onChange={(e) => setF((v) => ({ ...v, code: e.target.value.replace(/\D/g, '') }))} disabled={busy} /></label>
            <label className="field">New password<input type="password" required value={f.newPassword} onChange={set('newPassword')} autoComplete="new-password" disabled={busy} /><span className="field-hint">{PW_HINT}</span></label>
            {error && <p className="quote-form-error">{error}</p>}
            <button className="btn btn-navy" disabled={busy || f.code.length !== 6 || !f.newPassword}>Set new password & sign in</button>
          </form>
        )}

        {(mode === 'signin' || mode === 'register') && (
          <p className="auth-staff">
            {isStaff
              ? <button type="button" className="link-btn" onClick={() => setRole('customer')}>Back to customer / builder sign-in</button>
              : <button type="button" className="link-btn" onClick={() => setRole('admin')}>Staff sign-in</button>}
          </p>
        )}
      </div>
    </div>
  );
}
