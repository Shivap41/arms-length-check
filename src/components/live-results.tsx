import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listLiveFindings, liveResultLabels, type LiveFinding, type LiveScreeningName, type Reviewer } from "@/data/screeningService";

type Row = { row: LiveScreeningName; reviewer: Reviewer };
const stageOrder = ["publications", "institutions", "declarations", "done"] as const;
const ruleNames: Record<string, string> = {
  R1: "Recent co-authored work", R2: "Older co-authored work", R3: "Same current institution", R4: "Same past institution",
  R5: "Declared academic relationship", R6: "Declared personal or financial tie", LARGE_TEAM: "Large-team paper",
  NAME_ONLY: "Same name on a candidate paper", SAME_NAME_OTHER_PERSON: "Same name, different person (not counted)",
};

/** Shown when "See results" is clicked while checks are still running. */
export function LiveProgress({ rows, errors }: { rows: Row[]; errors: Record<string, string> }) {
  const confirmed = rows.filter(entry => entry.row.identity.status === "confirmed");
  const settled = confirmed.filter(entry => entry.row.checkStatus === "done" || entry.row.checkStatus === "failed" || errors[entry.row.id]).length;
  return <div className="live-progress" role="status" aria-live="polite">
    <h2 id="live-results-title">Checking {settled} of {confirmed.length}…</h2>
    <p className="identity-explainer">Results appear when every confirmed reviewer has been checked.</p>
    <ol className="live-progress-list">{confirmed.map(({ row, reviewer }) => {
      const done = row.checkStatus === "done" || row.checkStatus === "failed" || Boolean(errors[row.id]);
      const stageIndex = done ? 3 : Math.max(0, stageOrder.indexOf((row.checkStage ?? "publications") as typeof stageOrder[number]));
      return <li key={row.id}><span className="live-progress-name">{reviewer.name}</span><span className="live-progress-stages">{stageOrder.slice(0, 3).map((stage, index) => <span key={stage} className={index < stageIndex ? "stage-done" : index === stageIndex && !done ? "stage-current" : ""}>{stage[0]!.toUpperCase() + stage.slice(1)}</span>)}</span>{done ? <span>{errors[row.id] || row.checkStatus === "failed" ? "Couldn't check" : "Done"}</span> : <Loader2 className="check-spinner" aria-hidden="true" />}</li>;
    })}</ol>
  </div>;
}

function Works({ works }: { works: { title: string; year: number | null; doi: string | null; venue: string | null; author_count: number; byline?: string }[] }) {
  return <ul className="evidence-works">{works.map((work, index) => <li key={`${work.doi ?? work.title}-${index}`}>
    <span className="evidence-year">{work.year ?? "—"}</span>
    <span>{work.doi ? <a href={work.doi.startsWith("http") ? work.doi : `https://doi.org/${work.doi}`} target="_blank" rel="noreferrer">{work.title}<ExternalLink aria-hidden="true" /></a> : work.title}
      <span className="evidence-meta">{[work.venue, `${work.author_count} authors`, work.byline && `byline: ${work.byline}`].filter(Boolean).join(" · ")}</span></span>
  </li>)}</ul>;
}
function FindingEvidence({ finding }: { finding: LiveFinding }) {
  const evidence = finding.evidence as { works?: Parameters<typeof Works>[0]["works"]; institution?: { name: string; candidate_years: number[]; reviewer_years: number[]; candidate_source: string; reviewer_source: string; overlap?: number[] }; declaration?: { name: string; relationship: string; note: string | null }; name_scan?: { covered: number; total: number }; total?: number; note?: string };
  return <div className={`evidence-finding evidence-${finding.severity}`}>
    <h4>{ruleNames[finding.rule] ?? finding.rule} <span className="evidence-rule">{finding.rule} · {finding.severity}</span></h4>
    {evidence.note && <p>{evidence.note}</p>}
    {evidence.works && <Works works={evidence.works} />}
    {typeof evidence.total === "number" && evidence.works && evidence.total > evidence.works.length && <p className="evidence-meta">Showing {evidence.works.length} of {evidence.total}.</p>}
    {evidence.institution && <p>{evidence.institution.name}: candidate {Math.min(...evidence.institution.candidate_years)}–{Math.max(...evidence.institution.candidate_years)} ({evidence.institution.candidate_source}); reviewer {Math.min(...evidence.institution.reviewer_years)}–{Math.max(...evidence.institution.reviewer_years)} ({evidence.institution.reviewer_source})</p>}
    {evidence.declaration && <p>Declared by the candidate: {evidence.declaration.name}, {evidence.declaration.relationship.replace("_", "-")}{evidence.declaration.note ? ` (${evidence.declaration.note})` : ""}</p>}
    {evidence.name_scan && evidence.name_scan.covered < evidence.name_scan.total && <p className="evidence-meta">Name scan covered {evidence.name_scan.covered} of {evidence.name_scan.total} works.</p>}
  </div>;
}

/** Results read only from the stored rows and findings. */
export function LiveResults({ rows, errors, onRetry }: { rows: Row[]; errors: Record<string, string>; onRetry: (nameId: string) => void }) {
  const [findings, setFindings] = useState<LiveFinding[]>();
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState<string>();
  const doneKey = rows.filter(entry => entry.row.checkStatus === "done").map(entry => `${entry.row.id}:${entry.row.checkStartedAt}`).join(",");
  useEffect(() => {
    let active = true;
    listLiveFindings(rows.map(entry => entry.row.id)).then(next => { if (active) setFindings(next); }).catch(() => { if (active) setLoadError("Couldn't load the findings. Reload to try again."); });
    return () => { active = false; };
  }, [doneKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = { conflict: 0, potential: 1, insufficient: 2, no_conflict: 3 } as const;
  const sorted = [...rows].sort((a, b) => (a.row.result ? order[a.row.result] : -1) - (b.row.result ? order[b.row.result] : -1));
  return <>
    <h2 id="live-results-title">Results</h2>
    <p className="identity-explainer">The tool flags; you decide. Each result lists the evidence it rests on.</p>
    {loadError && <p className="field-error" role="alert">{loadError}</p>}
    <div className="live-results">{sorted.map(({ row, reviewer }) => {
      const rowFindings = (findings ?? []).filter(finding => finding.screeningNameId === row.id);
      const failed = row.checkStatus === "failed" || Boolean(errors[row.id]);
      const label = failed ? "Couldn't check" : row.result ? liveResultLabels[row.result] : "Not checked";
      const isOpen = open === row.id;
      return <section key={row.id} className="live-result" aria-label={`${reviewer.name}: ${label}`}>
        <div className="live-result-heading">
          <Button variant="ghost" className="identity-row-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : row.id)}><span>{reviewer.name}<span className="identity-typed-institution">{reviewer.institution}</span></span><ChevronDown /></Button>
          <span className={`result-chip result-${failed ? "failed" : row.result ?? "none"}`}>{failed && <AlertTriangle aria-hidden="true" />}{label}</span>
        </div>
        <p className="live-result-reason">{failed ? (errors[row.id] || row.error) : row.reason}</p>
        {failed && <Button size="sm" variant="outline" onClick={() => onRetry(row.id)}><RotateCw />Retry</Button>}
        {isOpen && !failed && <div className="live-result-evidence">
          {findings === undefined ? <p role="status">Loading evidence…</p> : rowFindings.length ? rowFindings.map(finding => <FindingEvidence key={finding.id} finding={finding} />) : <p>No findings.</p>}
          {row.notes.durationMs !== undefined && <p className="evidence-meta">Checked in {(row.notes.durationMs / 1000).toFixed(1)} s · {row.notes.calls?.fresh ?? 0} fresh API calls, {row.notes.calls?.cached ?? 0} from cache{row.notes.nameScan ? ` · name scan covered ${row.notes.nameScan.covered} of ${row.notes.nameScan.total} candidate works` : ""}</p>}
        </div>}
      </section>;
    })}</div>
  </>;
}
