import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Info, Plus, Trash2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logResearchEvent } from "@/lib/research-session";
import { Checkbox } from "@/components/ui/checkbox";
import { addReviewers, canStartScreening, getCase, listReviewers, loadDemoReviewers, parseReviewerList, removeReviewer, reviewerSchema, setCandidateConfirmed, startScreening, type CaseRecord } from "@/data/screeningService";

export function ExternalEvaluations({ caseRecord }: { caseRecord: CaseRecord }) {
  const navigate = useNavigate();
  const [reviewers, setReviewers] = useState(() => listReviewers(caseRecord.id));
  const [confirmed, setConfirmed] = useState(caseRecord.candidateConfirmed);
  const [draft, setDraft] = useState({ name: "", institution: "", identity: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [unreadLines, setUnreadLines] = useState<ReturnType<typeof parseReviewerList>["errors"]>([]);
  const [notice, setNotice] = useState("");
  const refresh = () => setReviewers(listReviewers(caseRecord.id));
  function loadDemo() {
    const result = loadDemoReviewers(caseRecord.id);
    refresh();
    setConfirmed(getCase(caseRecord.id)?.candidateConfirmed ?? false);
    setNotice(result.message);
  }
  function addReviewer(event: React.FormEvent) {
    event.preventDefault();
    const result = reviewerSchema.safeParse(draft);
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message]))); return; }
    addReviewers(caseRecord.id, [result.data]); refresh(); setDraft({ name: "", institution: "", identity: "" }); setErrors({}); setNotice("Reviewer added.");
  }
  function addList() {
    const result = parseReviewerList(paste);
    if (result.rows.length) { addReviewers(caseRecord.id, result.rows); refresh(); }
    setUnreadLines(result.errors);
    setPaste(result.errors.map(error => error.text).join("\n"));
    setNotice(result.rows.length ? `${result.rows.length} reviewer${result.rows.length === 1 ? "" : "s"} added.` : "No reviewers added. Check the list format.");
  }
  async function checkConflicts() {
    const screeningId = startScreening(caseRecord.id);
    logResearchEvent("screening_started");
    await navigate({ to: "/cases/$caseId/screening", params: { caseId: caseRecord.id }, search: { screeningId } });
  }
  return <div className="evaluations-layout"><section className="reviewer-workspace" aria-labelledby="reviewer-title">
    <section className="candidate-declarations" id="candidate-declarations" aria-labelledby="declarations-title"><h2 id="declarations-title">Candidate declarations (submitted {caseRecord.declarations.submitted})</h2><dl><div><dt>Former PhD advisor:</dt><dd>{caseRecord.declarations.formerPhdAdvisor}.</dd></div><div><dt>Postdoctoral mentor:</dt><dd>{caseRecord.declarations.postdoctoralMentor}.</dd></div><div><dt>Personal or financial ties:</dt><dd>{caseRecord.declarations.personalOrFinancialTies}.</dd></div></dl><p>Declarations are checked against every proposed reviewer.</p></section>
    <div className="reviewer-title-row"><h2 id="reviewer-title">Proposed external reviewers</h2><Button variant="outline" onClick={loadDemo}>Load demo list</Button></div>
    <div className="reviewer-table-scroll"><table className="reviewer-table"><thead><tr><th>Name</th><th>Institution</th><th>ORCID iD <span className="optional-label">(optional)</span></th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{reviewers.length ? reviewers.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.institution}</td><td>{row.identity || "—"}</td><td><Button variant="ghost" size="icon" title={`Remove ${row.name}`} aria-label={`Remove ${row.name}`} onClick={() => { removeReviewer(caseRecord.id, row.id); refresh(); setNotice(`${row.name} removed.`); }}><Trash2 /></Button></td></tr>) : <tr><td colSpan={4} className="empty-reviewers">No reviewers proposed yet.</td></tr>}</tbody></table></div>
    <form className="reviewer-form" onSubmit={addReviewer} noValidate>
      <h3>Add reviewer</h3>
      <div className="reviewer-fields">{(["name", "institution", "identity"] as const).map(field => <div className="reviewer-field" key={field}><label htmlFor={`reviewer-${field}`}>{field === "name" ? "Name" : field === "institution" ? "Institution" : "ORCID iD or profile link"}{field === "identity" ? <span className="optional-label"> (optional)</span> : <span aria-hidden="true"> *</span>}</label><input id={`reviewer-${field}`} value={draft[field]} required={field !== "identity"} maxLength={field === "name" ? 150 : field === "institution" ? 200 : 500} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${field}-error` : field === "identity" ? "identity-help" : undefined} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />{field === "identity" && <p id="identity-help" className="field-help">Often on the reviewer's CV or university page. Speeds up checking.</p>}{errors[field] && <p id={`${field}-error`} className="field-error">{errors[field]}</p>}</div>)}</div>
      <Button type="submit" variant="outline"><Plus />Add reviewer</Button>
    </form>
    <div className="paste-controls"><Button variant="link" className="paste-toggle" aria-expanded={pasteOpen} onClick={() => setPasteOpen(!pasteOpen)}><ClipboardList />Paste a list</Button>{pasteOpen && <div className="paste-form"><label htmlFor="reviewer-list">Name, Institution, ORCID (optional) — one reviewer per line</label><textarea id="reviewer-list" value={paste} onChange={event => setPaste(event.target.value)} maxLength={30000} rows={5} /><Button variant="outline" onClick={addList} disabled={!paste.trim()}><Plus />Add list</Button>{unreadLines.length > 0 && <div className="paste-errors" role="alert"><h3>Lines that could not be read</h3><ul>{unreadLines.map(error => <li key={error.line}>Line {error.line}: {error.text}<br />{error.message}</li>)}</ul></div>}</div>}</div>
    {notice && <p className="reviewer-notice" role="status">{notice}</p>}
    <div className="candidate-confirmation"><Checkbox id="candidate-confirmed" checked={confirmed} onCheckedChange={value => { const next = value === true; setConfirmed(next); setCandidateConfirmed(caseRecord.id, next); }} /><label htmlFor="candidate-confirmed">I confirm the candidate is Dr. Maya Ortiz, Northbridge University.</label></div>
    <div className="screening-action"><Button disabled={!canStartScreening(reviewers.length, confirmed)} onClick={checkConflicts}>Check for conflicts</Button></div>
  </section><aside className="screening-info"><Info aria-hidden="true" /><p>Arm's Length Check flags possible conflicts of interest using public publication data. It never decides: you do.</p></aside></div>;
}