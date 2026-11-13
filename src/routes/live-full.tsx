import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeading } from "@/components/faculty-shell";
import { ShowcaseCase, type ShowcasePersonInput } from "@/components/showcase-case";
import { Button } from "@/components/ui/button";
import { verifyShowcaseCode } from "@/data/showcaseService";
import { isValidOrcid } from "@/lib/identity";

const description = "Full live mode: enter a candidate and proposed reviewers and check them live. Requires an access code.";
export const Route = createFileRoute("/live-full")({
  ssr: false,
  head: () => ({ meta: [{ title: "Full live mode | Arm's Length Check" }, { name: "description", content: description }, { name: "robots", content: "noindex" }] }),
  component: LiveFull,
});

function parseReviewers(text: string): { rows: ShowcasePersonInput[]; errors: string[] } {
  const rows: ShowcasePersonInput[] = [], errors: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const parts = line.split(";").map(part => part.trim());
    const [name = "", institution = "", orcid = ""] = parts;
    if (parts.length > 3 || !name || !institution) errors.push(`Line ${index + 1}: use Name; Institution; ORCID (optional)`);
    else if (orcid && !isValidOrcid(orcid)) errors.push(`Line ${index + 1}: "${orcid}" is not a valid ORCID iD`);
    else rows.push({ name: name.slice(0, 150), institution: institution.slice(0, 200), orcid });
  });
  if (rows.length > 15) errors.push("Up to 15 reviewers at a time.");
  return { rows: rows.slice(0, 15), errors };
}

function LiveFull() {
  const [code, setCode] = useState<string>();
  const [draftCode, setDraftCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState({ name: "", institution: "", orcid: "" });
  const [list, setList] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [started, setStarted] = useState<{ candidate: ShowcasePersonInput; reviewers: ShowcasePersonInput[] }>();

  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setCodeError("");
    const result = await verifyShowcaseCode(draftCode.trim());
    setBusy(false);
    if (result.ok) setCode(draftCode.trim()); else setCodeError(result.error);
  }
  function start(event: React.FormEvent) {
    event.preventDefault();
    const errors: string[] = [];
    if (!candidate.name.trim() || !candidate.institution.trim()) errors.push("Enter the candidate's name and institution.");
    if (candidate.orcid.trim() && !isValidOrcid(candidate.orcid.trim())) errors.push("The candidate's ORCID iD is not valid.");
    const parsed = parseReviewers(list);
    if (!parsed.rows.length) errors.push("Add at least one reviewer.");
    setFormErrors([...errors, ...parsed.errors]);
    if (!errors.length && !parsed.errors.length) setStarted({ candidate: { name: candidate.name.trim(), institution: candidate.institution.trim(), orcid: candidate.orcid.trim() }, reviewers: parsed.rows });
  }

  if (!code) return <>
    <PageHeading title="Full live mode" />
    <p className="showcase-intro">Enter any candidate and reviewers and check them live against OpenAlex and ORCID. Live lookups draw on a shared daily budget, so this mode needs an access code. The <a className="text-primary" href="/live-example">live example</a> needs none.</p>
    <form className="showcase-form" onSubmit={unlock} noValidate><div className="reviewer-field"><label htmlFor="access-code">Access code</label><input id="access-code" type="password" autoComplete="off" maxLength={200} value={draftCode} aria-invalid={Boolean(codeError)} onChange={event => { setDraftCode(event.target.value); setCodeError(""); }} />{codeError && <p className="field-error" role="alert">{codeError}</p>}</div><div><Button type="submit" disabled={!draftCode.trim() || busy}>{busy ? "Checking…" : "Unlock"}</Button></div></form>
  </>;
  if (started) return <>
    <PageHeading title="Full live mode" />
    <p className="showcase-intro">Candidate: <strong>{started.candidate.name}</strong>, {started.candidate.institution}{started.candidate.orcid ? ` (ORCID ${started.candidate.orcid})` : ""}. Nothing is saved: this screening lives only in your browser tab. <Button variant="link" onClick={() => setStarted(undefined)}>Start over</Button></p>
    <ShowcaseCase code={code} candidate={started.candidate} reviewers={started.reviewers} />
  </>;
  return <>
    <PageHeading title="Full live mode" />
    <form className="showcase-form" onSubmit={start} noValidate>
      {(["name", "institution", "orcid"] as const).map(field => <div className="reviewer-field" key={field}><label htmlFor={`candidate-${field}`}>Candidate {field === "orcid" ? "ORCID iD (optional, confirms automatically)" : field}</label><input id={`candidate-${field}`} value={candidate[field]} maxLength={field === "institution" ? 200 : 150} onChange={event => setCandidate({ ...candidate, [field]: event.target.value })} /></div>)}
      <div className="reviewer-field"><label htmlFor="reviewer-list">Proposed reviewers, one per line: Name; Institution; ORCID (optional). Up to 15.</label><textarea id="reviewer-list" rows={8} value={list} maxLength={6000} onChange={event => setList(event.target.value)} /></div>
      {formErrors.length > 0 && <ul className="field-error" role="alert">{formErrors.map(error => <li key={error}>{error}</li>)}</ul>}
      <div><Button type="submit">Start screening</Button></div>
    </form>
  </>;
}
