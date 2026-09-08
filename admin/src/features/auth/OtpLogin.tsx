import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from './useWebSession';

export function OtpLogin() {
  const { session, ready, error: sessionError, client } = useWebSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!ready) return <p role="status">Restoring session…</p>;
  if (session) return <Navigate to={session.role === 'admin' ? '/overview' : '/jobs'} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (sent) await client.login(phone, code);
      else { await client.requestCode(phone); setSent(true); }
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="brand">coffix<span> / staff</span></p>
        <h1 id="login-title">Staff sign in</h1>
        <p className="muted">Use the phone number linked to your staff account.</p>
        <ProblemBanner error={error ?? sessionError} />
        <form onSubmit={submit}>
          <FormField label="Phone number" type="tel" autoComplete="tel" inputMode="tel"
            placeholder="0501234567" required pattern="(?:0[0-9]{9}|\+972[0-9]{9})"
            value={phone} onChange={(event) => setPhone(event.target.value)} disabled={busy || sent} />
          {sent ? <>
            <p role="status">Enter the six-digit code sent to {phone}.</p>
            <FormField label="Verification code" autoComplete="one-time-code" inputMode="numeric"
              pattern="[0-9]{6}" maxLength={6} required autoFocus value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} />
          </> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Sign in' : 'Send code'}</button>
          {sent ? <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(null); }}>Change number or resend</button> : null}
        </form>
        <p className="muted">Administrator and technician accounts only.</p>
      </section>
    </main>
  );
}
