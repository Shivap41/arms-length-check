import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { Download, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasscodeGate } from "@/components/passcode-gate";
import { regressionPair, rulesSelftest } from "@/lib/admin.functions";
import { buildReport, KNOWN_FIXTURES, parseFixtures, RECALL_TARGET, reportToCsv, stopsRun, type PairOutcome, type RegressionPair } from "@/lib/regression";

const description = "Regression against the spike's frozen run 4 fixtures, with both people confirmed by ORCID.";
export const Route = createFileRoute("/admin/regression")({
  head: () => ({ meta: [{ title: "Regression | Faculty Review" }, { name: "description", content: description }, { name: "robots", content: "noindex" }] }),
  component: Regression,
});
const MAX_PARALLEL = 4;
const pct = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function Regression() {
  const check = useServerFn(rulesSelftest);
  const runPair = useServerFn(regressionPair);
  const [passcode, setPasscode] = useState("");
  const [fixtures, setFixtures] = useState<{ pairs: RegressionPair[]; format: string; hash: string }>();
  const [loadError, setLoadError] = useState("");
  const [paste, setPaste] = useState("");
  const [outcomes, setOutcomes] = useState<Record<number, PairOutcome>>({});
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState("");
  const [elapsed, setElapsed] = useState<number>();
  const cancel = useRef(false);
  const report = useMemo(() => fixtures ? buildReport(fixtures.pairs, outcomes) : undefined, [fixtures, outcomes]);

  async function unlock(code: string) { const result = await check({ data: { passcode: code } }); if (!result.ok) return result.error; setPasscode(code); return null; }
  async function load(text: string) {
    setLoadError(""); setOutcomes({}); setStopped(""); setElapsed(undefined);
    try { const parsed = parseFixtures(text); setFixtures({ ...parsed, hash: await sha256(text) }); }
    catch (error) { setFixtures(undefined); setLoadError(error instanceof Error ? `Couldn't read the fixtures: ${error.message.slice(0, 200)}` : "Couldn't read the fixtures."); }
  }
  async function run() {
    if (!fixtures) return;
    cancel.current = false; setRunning(true); setStopped(""); setOutcomes({});
    const started = Date.now();
    const queue = [...fixtures.pairs];
    let halt = "";
    // At most 4 pairs at a time; any rate-limit or auth/budget error stops the whole run.
    const worker = async () => {
      while (queue.length && !halt && !cancel.current) {
        const pair = queue.shift()!;
        let outcome: PairOutcome;
        try {
          const result = await runPair({ data: { passcode, candidateOrcid: pair.candidateOrcid, reviewerOrcid: pair.reviewerOrcid, reviewerName: pair.reviewer } });
          if (!result.ok) { halt = result.error; break; }
          outcome = result.outcome;
        } catch { outcome = { status: "failed", error: "Couldn't reach the server", errorType: "Network", calls: { fresh: 0, cached: 0 }, durationMs: 0 }; }
        if (stopsRun(outcome)) { halt = `Stopped at pair ${pair.id} (${pair.candidate} × ${pair.reviewer}): ${outcome.status === "failed" ? outcome.error : ""}. That pair and the rest were not scored.`; setOutcomes(previous => ({ ...previous, [pair.id]: { status: "not_run" } })); break; }
        setOutcomes(previous => ({ ...previous, [pair.id]: outcome }));
      }
    };
    await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));
    setElapsed(Date.now() - started);
    setStopped(halt || (cancel.current ? "Stopped by you. Remaining pairs were not run." : ""));
    setRunning(false);
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([reportToCsv(report)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `regression-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!passcode) return <PasscodeGate title="Regression" intro="Runs the live engine against the spike's frozen fixtures. This makes real OpenAlex and ORCID calls." onUnlock={unlock} />;
  const done = Object.values(outcomes).filter(outcome => outcome.status !== "not_run").length;
  const counts = fixtures ? (["coauthor", "unrelated", "decoy"] as const).map(kind => `${fixtures.pairs.filter(pair => pair.kind === kind).length} ${kind === "coauthor" ? "co-author" : kind}`).join(" · ") : "";
  return <div className="session-page admin-page">
    <header className="case-header"><h1>Regression</h1><p>Each pair: both people confirmed by ORCID, then check-reviewer. At most {MAX_PARALLEL} pairs at a time; a rate-limit or auth error stops the run.</p></header>
    <section className="admin-load">
      <div className="reviewer-field"><label htmlFor="fixtures-file">Fixtures file (JSON)</label><input id="fixtures-file" type="file" accept="application/json,.json" disabled={running} onChange={event => { const file = event.target.files?.[0]; if (file) void file.text().then(load); }} /></div>
      <details><summary>Or paste the JSON</summary><textarea aria-label="Fixtures JSON" rows={4} value={paste} onChange={event => setPaste(event.target.value)} /><Button variant="outline" disabled={!paste.trim() || running} onClick={() => void load(paste)}>Load pasted fixtures</Button></details>
      {loadError && <p className="field-error" role="alert">{loadError}</p>}
      {fixtures && <p className="field-help">{fixtures.pairs.length} pairs ({counts}) · {fixtures.format === "run4" ? "full run 4 file" : "slim file"} · SHA-256 {fixtures.hash.slice(0, 12)}… {KNOWN_FIXTURES[fixtures.hash] ? `matches the ${KNOWN_FIXTURES[fixtures.hash]}` : "(not a known frozen fixtures file)"}</p>}
    </section>
    {fixtures && <div className="admin-actions">
      {running ? <Button variant="outline" onClick={() => { cancel.current = true; }}><Square />Stop</Button> : <Button onClick={() => void run()}><Play />Run regression</Button>}
      {report && done > 0 && !running && <Button variant="outline" onClick={download}><Download />Download CSV</Button>}
      {running && <span role="status">Running… {done} of {fixtures.pairs.length}</span>}
    </div>}
    {stopped && <p className="field-error" role="alert">{stopped}</p>}
    {report && done > 0 && <>
      <dl className="metric-grid">
        <div className="metric"><dt>Recall (confirming DOI in findings)</dt><dd className={report.recall.pass === false ? "admin-fail" : report.recall.pass ? "admin-pass" : ""}>{pct(report.recall.value)} ({report.recall.found} of {report.recall.scored} scored; target ≥ {RECALL_TARGET * 100}%)</dd></div>
        <div className="metric"><dt>Conflicts on unrelated or decoy pairs</dt><dd className={report.negativeConflicts.pass === false ? "admin-fail" : report.negativeConflicts.pass ? "admin-pass" : ""}>{report.negativeConflicts.count} of {report.negativeConflicts.scored} (target 0)</dd></div>
        <div className="metric"><dt>Result matches expected</dt><dd>{report.matches.count} of {report.matches.scored}</dd></div>
        <div className="metric"><dt>API calls</dt><dd>{report.calls.total}: {report.calls.fresh} fresh, {report.calls.cached} from cache</dd></div>
        <div className="metric"><dt>Pairs</dt><dd>{report.scored} scored · {report.failed} couldn't check · {report.notRun} not run{elapsed !== undefined ? ` · ${(elapsed / 1000).toFixed(0)} s` : ""}</dd></div>
      </dl>
      {report.misses.length > 0 && <section><h2>Misses</h2><ul className="admin-misses">{report.misses.map(row => <li key={row.pair.id}>#{row.pair.id} {row.pair.candidate} × {row.pair.reviewer} ({row.pair.type}): expected {row.pair.expected}, got {row.actual}{row.doiFound === false ? "; no confirming DOI in findings" : ""}{row.outcome.status === "done" ? ` — ${row.outcome.reason}` : ""}</li>)}</ul></section>}
      <div className="reviewer-table-scroll"><table className="reviewer-table admin-table"><thead><tr><th>#</th><th>Candidate</th><th>Reviewer</th><th>Type</th><th>Expected</th><th>Actual</th><th>DOI found</th><th>Calls (fresh/cache)</th></tr></thead>
        <tbody>{report.rows.map(row => <tr key={row.pair.id} className={row.match === false || row.doiFound === false ? "admin-miss" : ""}><td>{row.pair.id}</td><td>{row.pair.candidate}</td><td>{row.pair.reviewer}</td><td>{row.pair.type}</td><td>{row.pair.expected}</td><td title={row.outcome.status === "done" ? row.outcome.reason : row.outcome.status === "failed" ? row.outcome.error : ""}>{row.actual}{row.outcome.status === "done" && row.outcome.rules.length ? ` (${[...new Set(row.outcome.rules)].join(", ")})` : ""}</td><td>{row.doiFound === null ? "—" : row.doiFound ? "yes" : "no"}</td><td>{row.outcome.status === "not_run" ? "—" : `${row.outcome.calls.fresh}/${row.outcome.calls.cached}`}</td></tr>)}</tbody>
      </table></div>
    </>}
  </div>;
}
