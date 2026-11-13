import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, ClipboardList, Info, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  addLiveDeclaration,
  addLiveReviewers,
  declarationRelationshipLabels,
  declarationRelationships,
  getLiveCase,
  listLiveDeclarations,
  listLiveReviewers,
  liveDeclarationSchema,
  parseReviewerList,
  removeLiveReviewer,
  reviewerSchema,
  setLiveCandidateConfirmed,
  type DeclarationRelationship,
  type LiveCase,
  type LiveDeclaration,
  type Reviewer,
} from "@/data/screeningService";

export const Route = createFileRoute("/_authenticated/live/$caseId")({
  head: () => ({ meta: [
    { title: "Live case | Faculty Review" },
    { name: "description", content: "Live external review case with real reviewer data." },
    { property: "og:title", content: "Live case | Faculty Review" },
    { property: "og:description", content: "Live external review case with real reviewer data." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LiveCaseDetail,
});

function LiveCaseDetail() {
  const { caseId } = Route.useParams();
  const [caseRecord, setCaseRecord] = useState<LiveCase>();
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [declarations, setDeclarations] = useState<LiveDeclaration[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState({ name: "", institution: "", identity: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [unreadLines, setUnreadLines] = useState<ReturnType<typeof parseReviewerList>["errors"]>([]);
  const [notice, setNotice] = useState("");
  const [declarationDraft, setDeclarationDraft] = useState<{ name: string; relationship: DeclarationRelationship; note: string }>({ name: "", relationship: "advisor", note: "" });
  const [declarationError, setDeclarationError] = useState("");

  const refresh = useCallback(async () => {
    const [nextCase, nextReviewers, nextDeclarations] = await Promise.all([getLiveCase(caseId), listLiveReviewers(caseId), listLiveDeclarations(caseId)]);
    setCaseRecord(nextCase); setReviewers(nextReviewers); setDeclarations(nextDeclarations);
  }, [caseId]);

  useEffect(() => {
    let active = true;
    Promise.all([refresh(), supabase.auth.getUser()])
      .then(([, { data }]) => { if (active) { setUserEmail(data.user?.email ?? ""); setLoaded(true); } })
      .catch(() => { if (active) { setLoadError("Couldn't load this case. It may belong to another account."); setLoaded(true); } });
    return () => { active = false; };
  }, [refresh]);

  if (!loaded) return <p role="status">Loading case…</p>;
  if (loadError || !caseRecord) return <><header className="case-header"><h1>Case unavailable</h1><p>{loadError || "This case doesn't exist."}</p></header><Link to="/cases" className="text-primary">Back to cases</Link></>;

  async function addReviewer(event: React.FormEvent) {
    event.preventDefault();
    const result = reviewerSchema.safeParse(draft);
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message]))); return; }
    try {
      setReviewers(await addLiveReviewers(caseId, [result.data]));
      setDraft({ name: "", institution: "", identity: "" }); setErrors({}); setNotice("Reviewer added.");
    } catch { setNotice("Couldn't save the reviewer. Try again."); }
  }
  async function addList() {
    const result = parseReviewerList(paste);
    if (result.rows.length) {
      try { setReviewers(await addLiveReviewers(caseId, result.rows)); } catch { setNotice("Couldn't save the list. Try again."); return; }
    }
    setUnreadLines(result.errors);
    setPaste(result.errors.map(error => error.text).join("\n"));
    setNotice(result.rows.length ? `${result.rows.length} reviewer${result.rows.length === 1 ? "" : "s"} added.` : "No reviewers added. Check the list format.");
  }
  async function addDeclaration(event: React.FormEvent) {
    event.preventDefault();
    const result = liveDeclarationSchema.safeParse(declarationDraft);
    if (!result.success) { setDeclarationError(result.error.issues[0]?.message ?? "Check the declaration."); return; }
    try {
      setDeclarations(await addLiveDeclaration(caseId, result.data));
      setDeclarationDraft({ name: "", relationship: "advisor", note: "" }); setDeclarationError(""); setNotice("Declaration added.");
    } catch { setDeclarationError("Couldn't save the declaration. Try again."); }
  }
  async function confirmCandidate(next: boolean) {
    setCaseRecord(previous => previous ? { ...previous, candidateConfirmedBy: next ? userEmail : "" } : previous);
    try { await setLiveCandidateConfirmed(caseId, next ? userEmail : ""); }
    catch { setCaseRecord(previous => previous ? { ...previous, candidateConfirmedBy: next ? "" : userEmail } : previous); setNotice("Couldn't save the confirmation. Try again."); }
  }

  return <><header className="case-header"><h1>{caseRecord.title} <span className="live-badge">Live data</span></h1><p>{caseRecord.candidateName} · {caseRecord.candidateInstitution}{caseRecord.candidateOrcid ? ` · ORCID ${caseRecord.candidateOrcid}` : ""}</p></header>
    <ol className="case-steps" aria-label="Review progress">{["Packet submitted", "External evaluations", "Department vote", "College review", "Decision"].map((step, index) => <li key={step} className={index === 0 ? "step-done" : index === 1 ? "step-current" : ""} aria-current={index === 1 ? "step" : undefined}><span className="step-symbol">{index === 0 ? <Check /> : index + 1}</span><span>{step}</span>{index < 4 && <ChevronRight className="step-arrow" />}</li>)}</ol>
    <Tabs defaultValue="External evaluations"><TabsList className="case-tabs">{["Overview", "Packet", "External evaluations", "Committee", "Decision"].map(tab => <TabsTrigger className="case-tab" value={tab} key={tab}>{tab}</TabsTrigger>)}</TabsList>
      <TabsContent value="External evaluations">
        <div className="evaluations-layout"><section className="reviewer-workspace" aria-labelledby="reviewer-title">
          <section className="candidate-declarations" id="candidate-declarations" aria-labelledby="declarations-title">
            <h2 id="declarations-title">Candidate declarations</h2>
            {declarations.length ? <dl>{declarations.map(declaration => <div key={declaration.id}><dt>{declarationRelationshipLabels[declaration.relationship]}:</dt><dd>{declaration.name}{declaration.note ? ` — ${declaration.note}` : ""}</dd></div>)}</dl> : <p>No declarations recorded yet.</p>}
            <form className="declaration-form" onSubmit={addDeclaration} noValidate>
              <h3>Add declaration</h3>
              <div className="reviewer-fields">
                <div className="reviewer-field"><label htmlFor="declaration-name">Name<span aria-hidden="true"> *</span></label><input id="declaration-name" value={declarationDraft.name} required maxLength={150} onChange={event => setDeclarationDraft({ ...declarationDraft, name: event.target.value })} /></div>
                <div className="reviewer-field"><label htmlFor="declaration-relationship">Relationship<span aria-hidden="true"> *</span></label><select id="declaration-relationship" value={declarationDraft.relationship} onChange={event => setDeclarationDraft({ ...declarationDraft, relationship: event.target.value as DeclarationRelationship })}>{declarationRelationships.map(relationship => <option key={relationship} value={relationship}>{declarationRelationshipLabels[relationship]}</option>)}</select></div>
                <div className="reviewer-field"><label htmlFor="declaration-note">Note<span className="optional-label"> (optional)</span></label><input id="declaration-note" value={declarationDraft.note} maxLength={500} onChange={event => setDeclarationDraft({ ...declarationDraft, note: event.target.value })} /></div>
              </div>
              {declarationError && <p className="field-error" role="alert">{declarationError}</p>}
              <Button type="submit" variant="outline"><Plus />Add declaration</Button>
            </form>
            <p>Declarations are checked against every proposed reviewer.</p>
          </section>
          <div className="reviewer-title-row"><h2 id="reviewer-title">Proposed external reviewers</h2></div>
          <div className="reviewer-table-scroll"><table className="reviewer-table"><thead><tr><th>Name</th><th>Institution</th><th>ORCID iD <span className="optional-label">(optional)</span></th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{reviewers.length ? reviewers.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.institution}</td><td>{row.identity || "—"}</td><td><Button variant="ghost" size="icon" title={`Remove ${row.name}`} aria-label={`Remove ${row.name}`} onClick={() => { void removeLiveReviewer(caseId, row.id).then(() => listLiveReviewers(caseId)).then(setReviewers).then(() => setNotice(`${row.name} removed.`)).catch(() => setNotice("Couldn't remove the reviewer. Try again.")); }}><Trash2 /></Button></td></tr>) : <tr><td colSpan={4} className="empty-reviewers">No reviewers proposed yet.</td></tr>}</tbody></table></div>
          <form className="reviewer-form" onSubmit={addReviewer} noValidate>
            <h3>Add reviewer</h3>
            <div className="reviewer-fields">{(["name", "institution", "identity"] as const).map(field => <div className="reviewer-field" key={field}><label htmlFor={`live-reviewer-${field}`}>{field === "name" ? "Name" : field === "institution" ? "Institution" : "ORCID iD or profile link"}{field === "identity" ? <span className="optional-label"> (optional)</span> : <span aria-hidden="true"> *</span>}</label><input id={`live-reviewer-${field}`} value={draft[field]} required={field !== "identity"} maxLength={field === "name" ? 150 : field === "institution" ? 200 : 500} aria-invalid={Boolean(errors[field])} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />{errors[field] && <p className="field-error">{errors[field]}</p>}</div>)}</div>
            <Button type="submit" variant="outline"><Plus />Add reviewer</Button>
          </form>
          <div className="paste-controls"><Button variant="link" className="paste-toggle" aria-expanded={pasteOpen} onClick={() => setPasteOpen(!pasteOpen)}><ClipboardList />Paste a list</Button>{pasteOpen && <div className="paste-form"><label htmlFor="live-reviewer-list">Name, Institution, ORCID (optional) — one reviewer per line</label><textarea id="live-reviewer-list" value={paste} onChange={event => setPaste(event.target.value)} maxLength={30000} rows={5} /><Button variant="outline" onClick={() => void addList()} disabled={!paste.trim()}><Plus />Add list</Button>{unreadLines.length > 0 && <div className="paste-errors" role="alert"><h3>Lines that could not be read</h3><ul>{unreadLines.map(error => <li key={error.line}>Line {error.line}: {error.text}<br />{error.message}</li>)}</ul></div>}</div>}</div>
          {notice && <p className="reviewer-notice" role="status">{notice}</p>}
          <div className="candidate-confirmation"><Checkbox id="live-candidate-confirmed" checked={Boolean(caseRecord.candidateConfirmedBy)} onCheckedChange={value => void confirmCandidate(value === true)} /><label htmlFor="live-candidate-confirmed">I confirm the candidate is {caseRecord.candidateName}, {caseRecord.candidateInstitution}.</label></div>
          <div className="screening-action"><Button disabled title="Live conflict checking connects to OpenAlex and ORCID in the next step.">Check for conflicts</Button><p className="field-help">Live conflict checking connects to OpenAlex and ORCID in the next step.</p></div>
        </section><aside className="screening-info"><Info aria-hidden="true" /><p>Arm's Length Check flags possible conflicts of interest using public publication data. It never decides: you do.</p></aside></div>
      </TabsContent>
      {["Overview", "Packet", "Committee", "Decision"].map(tab => <TabsContent value={tab} key={tab}><p className="prototype-unavailable">Not part of this prototype</p></TabsContent>)}
    </Tabs>
  </>;
}
