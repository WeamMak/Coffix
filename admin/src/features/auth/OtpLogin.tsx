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
  if (!ready) return <main className="login-page"><p role="status" className="empty-state">משחזרים את החיבור…</p></main>;
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
        <p className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 8h12v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3M11 2v3" /></svg></span><span><bdi dir="ltr">Coffix</bdi><small>מערכת ניהול</small></span></p>
        <h1 id="login-title">כניסה לצוות</h1>
        <p className="muted">הזינו את מספר הטלפון המשויך לחשבון הצוות שלכם.</p>
        <ProblemBanner error={error ?? sessionError} />
        <form onSubmit={submit}>
          <FormField label="מספר טלפון" type="tel" autoComplete="tel" inputMode="tel"
            placeholder="0501234567" required pattern="(?:0[0-9]{9}|\+972[0-9]{9})"
            value={phone} onChange={(event) => setPhone(event.target.value)} disabled={busy || sent} />
          {sent ? <>
            <p role="status">הזינו את קוד האימות בן שש הספרות שנשלח למספר <bdi dir="ltr">{phone}</bdi>.</p>
            <FormField label="קוד אימות" autoComplete="one-time-code" inputMode="numeric"
              pattern="[0-9]{6}" maxLength={6} required autoFocus value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} />
          </> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? 'אנא המתינו…' : sent ? 'כניסה' : 'שליחת קוד'}</button>
          {sent ? <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(null); }}>שינוי מספר או שליחה חוזרת</button> : null}
        </form>
        <p className="muted">הכניסה מיועדת למנהלים ולטכנאים בלבד.</p>
      </section>
    </main>
  );
}
