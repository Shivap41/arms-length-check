import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BookOpen, Building2, Check, ChevronDown, ChevronRight, Download, ExternalLink, FileText, Loader2, RotateCw, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useCheckStates } from "@/components/confirm-reviewers";
import { logResearchEvent } from "@/lib/research-session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { downloadAudit } from "@/lib/audit-download";
import { CHECK_FAILED_MESSAGE, allChecksSettled, checkStages, retryCheck, type CheckStage, canDownloadAudit, countDecisions, getAuditRecord, recordDecision, confirmNameMatch, countResults, getResultRows, getScreening, resultStatuses, type ResultPaper, type ResultRow, type ResultStatus, type Screening } from "@/data/screeningService";

const statusClasses: Record<ResultStatus, string> = { Conflict: "status-conflict", Potential: "status-potential", "Insufficient data": "status-insufficient", "No conflict found": "status-clear" };
function PaperEvidence({ paper, notCounted = false }: { paper: ResultPaper; notCounted?: boolean }) {
  return <li className="evidence-paper"><strong>{paper.title}</strong><p>{paper.year} · {paper.venue} · {paper.authorCount} authors{notCounted && <span className="not-counted">Not counted</span>}</p><a className="doi-link" href={`https://doi.org/${encodeURIComponent(paper.doi).replace(/%2F/g, "/")}`} target="_blank" rel="noopener noreferrer">{paper.doi}<ExternalLink /></a></li>;
}
function Evidence({ row, onNameMatch }: { row: ResultRow; onNameMatch: (choice: "confirmed" | "different") => void }) {
  const result = row.result;
  const nameOnly = result.sharedPapers.some(paper => paper.authorIdMissing);
  const rule = result.rule === "R1" ? "R1: co-authored in the last 5 years → Conflict" : result.rule === "R2" ? "R2: older co-authorship → Potential" : result.rule === "R3" ? "R3: same current institution → Conflict" : result.rule === "R5" ? "R5: declared former PhD advisor → Conflict" : undefined;
  return <div className="result-evidence" id={`evidence-${row.reviewer.id}`}>
    <h3>Evidence</h3>
    {result.sharedPapers.length > 0 && <ul className="evidence-papers">{result.sharedPapers.map(paper => <PaperEvidence key={paper.doi} paper={paper} notCounted={row.nameMatch === "different"} />)}</ul>}
    {rule && <p className="evidence-rule">{rule}</p>}
    {result.employment && <><dl className="employment-evidence"><div><dt>Candidate</dt><dd>{row.candidateProfile.displayName} · {row.candidateProfile.currentInstitution} · {row.candidateProfile.currentSince}–present</dd></div><div><dt>Reviewer</dt><dd>{row.profiles[0]?.displayName ?? row.reviewer.name} · {result.employment.institution} · {row.profiles[0]?.currentSince ?? "Start year not available"}–present</dd></div></dl><p className="evidence-source">ORCID employment, current · no end date</p></>}
    {result.declaredRelationship && <blockquote className="candidate-statement">Candidate's statement: “Marco Bianchi was my PhD advisor.”<cite>Dr. Maya Ortiz · candidate declaration (fictional)</cite></blockquote>}
    {nameOnly && <div className="name-match-evidence"><p>Byline exactly as printed: <strong>“{result.sharedPapers.find(paper => paper.authorIdMissing)?.authorLabel}”</strong> · no author ID</p><div><Button variant={row.nameMatch === "confirmed" ? "default" : "outline"} aria-pressed={row.nameMatch === "confirmed"} onClick={() => onNameMatch("confirmed")}><Check />This is them</Button><Button variant="outline" aria-pressed={row.nameMatch === "different"} onClick={() => onNameMatch("different")}><X />Different person</Button></div></div>}
    {result.sharedPapers.some(paper => paper.authorCount === 120) && <p className="evidence-source">Large-team co-authorship is flagged as Potential for the chair to assess.</p>}
    {result.status === "No conflict found" && <p className="result-help">No shared papers or institutions found in public data. This is not proof of independence.</p>}
    {result.status === "Insufficient data" && <><p>{result.explanation}</p><p className="result-help">Ask the reviewer to confirm independence or add their ORCID.</p></>}
    {result.note && <details className="decoy-evidence"><summary>Different person with the same name</summary><p>{result.note.text}</p><ul className="evidence-papers">{row.decoyPapers.map(paper => <PaperEvidence key={paper.doi} paper={paper} notCounted />)}</ul></details>}
    <p className="fictional-evidence-note">Fictional demo evidence · DOI links do not identify real publications.</p>
  </div>;
}
const stageIcons: Record<CheckStage, typeof Check> = { Publications: BookOpen, Institutions: Building2, Declarations: FileText, Done: Check, Failed: AlertTriangle };
function CheckProgress({ screening }: { screening: Screening }) {
  const states = useCheckStates(screening.id);
  const total = screening.reviewers.length;
  const done = screening.reviewers.filter(row => states[row.id] && states[row.id]?.status !== "running").length;
  return <section className="check-progress" aria-labelledby="check-progress-title">
    <h2 id="check-progress-title">Checking {total} reviewers</h2>
    <Progress value={total ? (done / total) * 100 : 0} aria-label="Checks complete" className="check-progress-bar" />
    <p role="status" aria-live="polite" className="check-progress-count">{done} of {total} done</p>
    <p className="check-progress-note">Using public publication data (OpenAlex, ORCID) and the candidate's declarations. This usually takes under 20 seconds.</p>
    <ol className="check-progress-list">{screening.reviewers.map(row => {
      const state = states[row.id];
      const stage: CheckStage = state?.stage ?? "Publications";
      const Icon = state?.status === "running" ? Loader2 : stageIcons[stage];
      return <li key={row.id} className={`check-progress-row check-stage-${stage.toLowerCase()}`}><span className="check-progress-name">{row.name}</span><span className="check-progress-stage"><Icon aria-hidden="true" className={state?.status === "running" ? "check-spinner" : undefined} />{stage === "Failed" ? "Couldn't check" : stage}</span><span className="sr-only">Stages: {checkStages.join(", ")}</span></li>;
    })}</ol>
  </section>;
}
export function ReviewResults({ initialScreening }: { initialScreening: Screening }) {
  const states = useCheckStates(initialScreening.id);
  const [waiting, setWaiting] = useState(() => !allChecksSettled(initialScreening.id));
  const logged = useRef(false);
  useEffect(() => { if (waiting && !logged.current) { logged.current = true; logResearchEvent("results_wait_started"); } }, [waiting]);
  useEffect(() => { if (waiting && allChecksSettled(initialScreening.id)) { setWaiting(false); logResearchEvent("results_wait_finished"); } }, [states, waiting, initialScreening.id]);
  if (waiting) return <CheckProgress screening={initialScreening} />;
  return <ResultsTable initialScreening={initialScreening} />;
}
function ResultsTable({ initialScreening }: { initialScreening: Screening }) {
  const checkStates = useCheckStates(initialScreening.id);
  const [screening, setScreening] = useState(initialScreening);
  const [filter, setFilter] = useState<ResultStatus>();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [approving, setApproving] = useState<ResultRow>();
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const rows = getResultRows(screening);
  const counts = countResults(rows);
  const visible = filter ? rows.filter(row => !row.checkFailed && row.result.status === filter) : rows;
  function decide(reviewerId: string, decision: "approve" | "exclude", reason = "") {
    try {
      recordDecision(screening.id, reviewerId, decision, reason);
      const updated = getScreening(screening.id);
      if (updated) setScreening(updated);
      setApproving(undefined); setDecisionError("");
    } catch (error) { setDecisionError(error instanceof Error ? error.message : "Decision could not be recorded."); }
  }
  function approve(row: ResultRow) {
    if (row.result.status === "Conflict" || row.result.status === "Potential") { setApproving(row); setDecisionReason(screening.decisions[row.reviewer.id]?.reason ?? ""); setDecisionError(""); }
    else decide(row.reviewer.id, "approve");
  }
  function nameMatch(reviewerId: string, choice: "confirmed" | "different") {
    confirmNameMatch(screening.id, reviewerId, choice);
    const updated = getScreening(screening.id);
    if (updated) setScreening(updated);
  }
  return <>
    <div className="decision-toolbar"><span role="status">{countDecisions(screening)} of {screening.reviewers.length} decided</span><Button variant="outline" disabled={!canDownloadAudit(screening)} onClick={() => downloadAudit(getAuditRecord(screening.id))}><Download />Download audit record</Button></div>
    {decisionError && !approving && <p className="field-error" role="alert">{decisionError}</p>}
    <div className="summary-band results-summary" aria-label="Result summary">{resultStatuses.map(status => <Button variant="outline" className={`result-summary-card ${statusClasses[status]}`} key={status} aria-pressed={filter === status} aria-label={`Filter ${status}: ${counts[status]}`} onClick={() => setFilter(filter === status ? undefined : status)}><span className="result-summary-title">{status}</span><span className="result-summary-count">{counts[status]}</span></Button>)}</div>
    <div className="results-heading"><h2 className="identity-section-title">{filter ?? "All reviewers"}</h2><span role="status">{visible.length} of {rows.length} reviewers</span>{filter && <Button variant="link" onClick={() => setFilter(undefined)}>Clear filter<X /></Button>}</div>
    <div className="results-table-scroll"><table className="results-table"><caption className="sr-only">Reviewer conflict screening results</caption><thead><tr><th>Reviewer</th><th>Result</th><th>Reason</th><th>Evidence</th><th>Chair decision</th></tr></thead><tbody>{visible.map(row => {
      const open = expanded.includes(row.reviewer.id);
      const decision = screening.decisions[row.reviewer.id];
      return <Fragment key={row.reviewer.id}><tr className="result-row" data-reviewer-id={row.reviewer.id}><td><strong>{row.reviewer.name}</strong><span className="result-institution">{row.reviewer.institution}</span><span className="result-identity-source">Identity: {row.source}</span><Button variant="link" asChild className="change-result-identity"><Link to="/cases/$caseId/screening" params={{ caseId: screening.caseId }} search={{ screeningId: screening.id, reviewerId: row.reviewer.id }}>Change identity</Link></Button></td><td>{checkStates[row.reviewer.id]?.status === "running" ? <span className="check-status check-running" role="status"><Loader2 className="check-spinner" aria-hidden="true" />Checking…</span> : row.checkFailed ? <span className="result-chip status-failed"><AlertTriangle aria-hidden="true" />Couldn't check</span> : <span className={`result-chip ${statusClasses[row.result.status]}`}>{row.result.status}</span>}</td><td>{row.checkFailed ? <><p>{CHECK_FAILED_MESSAGE}</p><Button size="sm" variant="outline" onClick={() => retryCheck(screening.id, row.reviewer.id)}><RotateCw />Retry</Button></> : checkStates[row.reviewer.id]?.status === "running" ? "Checking this reviewer again…" : <>{row.reason}{row.result.declaredRelationship && <Button variant="link" asChild className="declaration-link"><Link to="/cases/$caseId" params={{ caseId: screening.caseId }} hash="candidate-declarations">Candidate declarations<ExternalLink /></Link></Button>}{row.result.status === "No conflict found" && <p className="result-help">No shared papers or institutions found in public data. This is not proof of independence.</p>}{row.result.status === "Insufficient data" && <p className="result-help">Ask the reviewer to confirm independence or add their ORCID.</p>}</>}</td><td>{!row.checkFailed && checkStates[row.reviewer.id]?.status !== "running" && <Button variant="link" className="evidence-toggle" aria-expanded={open} aria-controls={`evidence-${row.reviewer.id}`} onClick={() => setExpanded(open ? expanded.filter(id => id !== row.reviewer.id) : [...expanded, row.reviewer.id])}>{open ? "Hide evidence" : "Show evidence"}{open ? <ChevronDown /> : <ChevronRight />}</Button>}</td><td><div className="decision-actions"><Button size="sm" variant={decision?.decision === "approve" ? "default" : "outline"} aria-pressed={decision?.decision === "approve"} disabled={row.checkFailed || checkStates[row.reviewer.id]?.status === "running"} onClick={() => approve(row)}><Check />Approve</Button><Button size="sm" variant={decision?.decision === "exclude" ? "default" : "outline"} aria-pressed={decision?.decision === "exclude"} onClick={() => decide(row.reviewer.id, "exclude")}><X />Exclude</Button></div><p className="decision-label">{decision ? decision.decision === "approve" ? "Approved" : "Excluded" : "Not decided"}</p>{decision?.reason && <p className="decision-reason">{decision.reason}</p>}</td></tr>{open && !row.checkFailed && <tr className="evidence-row"><td colSpan={5}><Evidence row={row} onNameMatch={choice => nameMatch(row.reviewer.id, choice)} /></td></tr>}</Fragment>;
    })}{!visible.length && <tr><td colSpan={5} className="results-empty">No reviewers with this result.</td></tr>}</tbody></table></div>
    <Dialog open={Boolean(approving)} onOpenChange={open => { if (!open) { setApproving(undefined); setDecisionError(""); } }}><DialogContent className="approval-dialog"><DialogHeader><DialogTitle>Approve {approving?.reviewer.name}</DialogTitle><DialogDescription>You're approving a reviewer with a flagged possible conflict.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (approving) decide(approving.reviewer.id, "approve", decisionReason); }}><label htmlFor="decision-reason">Reason (at least 10 characters)</label><Textarea id="decision-reason" value={decisionReason} onChange={event => setDecisionReason(event.target.value)} maxLength={2000} aria-invalid={Boolean(decisionError)} aria-describedby={decisionError ? "decision-error" : undefined} autoFocus />{decisionError && <p id="decision-error" className="field-error" role="alert">{decisionError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setApproving(undefined)}>Cancel</Button><Button type="submit" disabled={decisionReason.trim().length < 10}><Check />Approve reviewer</Button></DialogFooter></form></DialogContent></Dialog>
    <p className="results-footer-note">Results are based on public publication data and the candidate's declarations. The tool flags; the chair decides.</p>
  </>;
}