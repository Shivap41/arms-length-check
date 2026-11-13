import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getSessionResults } from "@/lib/session-results.functions";
import { ACCURACY_TARGET, metricsToCsv, type SessionMetrics, type TotalMetrics } from "@/lib/session-metrics";

const description = "Passcode-protected research session results for the Faculty Review prototype.";
export const Route = createFileRoute("/session/results")({
  head: () => ({ meta: [
    { title: "Session results | Faculty Review" }, { name: "description", content: description }, { name: "robots", content: "noindex" },
    { property: "og:title", content: "Session results | Faculty Review" }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Results,
});

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const secs = (ms: number | null) => ms === null ? "—" : ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;

function Results() {
  const load = useServerFn(getSessionResults);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ sessions: SessionMetrics[]; totals: TotalMetrics }>();
  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await load({ data: { passcode } }); if (result.ok) setData(result); else setError(result.error); }
    catch { setError("Could not load results. Try again."); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([metricsToCsv(data.sessions, data.totals)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `session-results-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!data) return <div className="session-page"><header className="case-header"><h1>Session results</h1><p>Enter the research passcode to view results.</p></header>
    <form className="session-form" onSubmit={unlock} noValidate><div className="reviewer-field"><label htmlFor="passcode">Passcode</label><input id="passcode" type="password" autoComplete="current-password" maxLength={200} value={passcode} aria-invalid={Boolean(error)} onChange={event => setPasscode(event.target.value)} />{error && <p className="field-error" role="alert">{error}</p>}</div><div className="session-actions"><Button type="submit" disabled={!passcode || busy}>{busy ? "Checking…" : "View results"}</Button></div></form></div>;
  const { sessions, totals } = data;
  return <div className="session-page session-results">
    <header className="case-header"><h1>Session results</h1><p>{totals.sessions} session{totals.sessions === 1 ? "" : "s"} · targets: identity accuracy at least 95%, chair time under 5 minutes (waiting for checks excluded).</p></header>
    <Button variant="outline" onClick={exportCsv}><Download />Export CSV</Button>
    <section aria-labelledby="totals-title"><h2 id="totals-title">All sessions</h2><dl className="metric-grid">
      <Metric label="Identity accuracy" value={`${pct(totals.accuracy)} (${totals.correct} of ${totals.needsYou})`} ok={totals.needsYou ? totals.accuracy >= ACCURACY_TARGET : undefined} />
      <Metric label="Added Elena Rossi's second profile" value={`${totals.splitProfileAdded} of ${totals.sessions}`} />
      <Metric label="Can't tell rate" value={`${pct(totals.cantTellRate)} · correct for Kenji Watanabe ${totals.cantTellCorrect} of ${totals.sessions} · wrongly used ${totals.cantTellWrong}×`} />
      <Metric label="Time per confirmation" value={`median ${secs(totals.medianConfirmationMs)} · longest ${secs(totals.longestConfirmationMs)}`} />
      <Metric label="Median chair time (excl. waiting)" value={secs(totals.medianChairMs)} ok={totals.medianChairMs === null ? undefined : totals.medianChairMs < 300000} />
      <Metric label="Median waiting for checks" value={secs(totals.medianWaitMs)} />
      <Metric label="Identity changes after results" value={String(totals.changedLater)} />
    </dl></section>
    {sessions.map(row => <section key={row.sessionId} className="session-card" aria-label={`Session ${row.participantCode}`}>
      <h2>{row.participantCode} <span>· {row.facilitator} · {new Date(row.startedAt).toLocaleString()}</span></h2>
      <dl className="metric-grid">
        <Metric label="Identity accuracy" value={`${pct(row.accuracy)} (${row.correct} of ${row.needsYou})`} ok={row.accuracy >= ACCURACY_TARGET} />
        <Metric label="Elena Rossi second profile" value={row.splitProfileAdded ? "Added" : "Not added"} ok={row.splitProfileAdded} />
        <Metric label="Can't tell" value={`${pct(row.cantTellRate)} · Kenji Watanabe ${row.cantTellCorrect ? "correct" : "missed"}${row.cantTellWrong.length ? ` · wrongly: ${row.cantTellWrong.join(", ")}` : ""}`} ok={row.cantTellCorrect && !row.cantTellWrong.length} />
        <Metric label="Time per confirmation" value={`median ${secs(row.medianConfirmationMs)} · longest ${secs(row.longestConfirmationMs)}`} />
        <Metric label="Chair time: Check for conflicts → results" value={`${secs(row.chairMs)} (total ${secs(row.totalMs)})`} ok={row.underFiveMinutes ?? undefined} />
        <Metric label="Waiting for checks" value={secs(row.waitMs)} />
        <Metric label="Changed after results" value={String(row.changedLater)} />
      </dl>
      {row.errors.length > 0 && <><h3>Errors</h3><ul className="session-errors">{row.errors.map(text => <li key={text}>{text}</li>)}</ul></>}
    </section>)}
    {!sessions.length && <p>No sessions recorded yet.</p>}
  </div>;
}
function Metric({ label, value, ok }: { label: string; value: string; ok?: boolean | undefined }) {
  return <div className={ok === undefined ? "" : ok ? "metric-ok" : "metric-miss"}><dt>{label}</dt><dd>{value}</dd></div>;
}
