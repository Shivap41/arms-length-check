import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Asks for the research passcode; the server checks it on every call. */
export function PasscodeGate({ title, intro, onUnlock }: { title: string; intro: string; onUnlock: (passcode: string) => Promise<string | null> }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const problem = await onUnlock(passcode); if (problem) setError(problem); }
    catch { setError("Could not reach the server. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="session-page"><header className="case-header"><h1>{title}</h1><p>{intro}</p></header>
    <form className="session-form" onSubmit={submit} noValidate><div className="reviewer-field"><label htmlFor="admin-passcode">Research passcode</label><input id="admin-passcode" type="password" autoComplete="current-password" maxLength={200} value={passcode} aria-invalid={Boolean(error)} onChange={event => setPasscode(event.target.value)} />{error && <p className="field-error" role="alert">{error}</p>}</div><div className="session-actions"><Button type="submit" disabled={!passcode || busy}>{busy ? "Checking…" : "Continue"}</Button></div></form>
  </div>;
}
