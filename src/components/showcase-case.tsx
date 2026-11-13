import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { parseProfileLink, SEARCH_FAILED_MESSAGE, type IdentifyResult, type LiveProfile } from "@/lib/identity";
import { QUOTA_MESSAGE } from "@/lib/showcase";
import {
  newShowcaseSession, showcaseIdentifyPerson, showcasePrefetchCandidate, showcaseResolveLink, showcaseResultLabels, showcaseRunCheck,
  type ShowcaseCheckResult, type ShowcaseFinding,
} from "@/data/showcaseService";

// D59: a screening held entirely in this tab. Same identity step and evidence as the app,
// with live OpenAlex/ORCID calls through the showcase server functions.

export type ShowcasePersonInput = { name: string; institution: string; orcid: string; hint?: string };
type Lookup = { state: "loading" } | { state: "done"; result: IdentifyResult } | { state: "unreachable" };
type Identity = { status: "needs_chair" | "confirmed" | "cant_tell"; method?: "orcid" | "chair_pick" | "chair_paste"; profiles: LiveProfile[]; reason?: string };
type CheckState = { status: "idle" } | { status: "running"; startedAt: number } | ShowcaseCheckResult;
type Row = { key: string; person: ShowcasePersonInput; lookup?: Lookup; identity: Identity; check: CheckState };
const fresh = (): Identity => ({ status: "needs_chair", profiles: [] });

function ProfileDetails({ profile }: { profile: LiveProfile }) {
  return <>
    <h3>{profile.displayName}</h3>
    <p className="profile-institution">{profile.currentInstitutions.join(" · ") || "No current institution listed"}</p>
    {profile.pastAffiliations.length > 0 && <p className="profile-past">{profile.pastAffiliations.map(past => `${past.institution} · ${past.fromYear}–${past.toYear}`).join("; ")}</p>}
    {profile.topics.length > 0 && <div className="profile-topics">{profile.topics.map(topic => <span key={topic}>{topic}</span>)}</div>}
    <p className="profile-works">{profile.worksCount} works{profile.orcid ? ` · ORCID ${profile.orcid}` : ""} · {profile.id}</p>
    {profile.recentWorks.length > 0 && <ol className="profile-papers">{profile.recentWorks.map((work, index) => <li key={`${work.doi ?? work.title}-${index}`}><span>{work.year ?? "—"}</span>{work.title}</li>)}</ol>}
  </>;
}
function Skeletons() {
  return <div className="identity-profiles" role="status" aria-label="Searching for matching profiles">{[0, 1, 2].map(index => <div key={index} className="identity-profile-skeleton" aria-hidden="true"><Skeleton className="skeleton-line skeleton-title" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line skeleton-short" /><Skeleton className="skeleton-block" /></div>)}<span className="sr-only">Searching for matching profiles…</span></div>;
}
/** A failed search is never shown as "no matches". */
function Options({ lookup, onPick, onRetry, disabledIds }: { lookup: Lookup | undefined; onPick: (profile: LiveProfile) => void; onRetry: () => void; disabledIds: string[] }) {
  if (!lookup || lookup.state === "loading") return <Skeletons />;
  if (lookup.state === "unreachable" || lookup.result.status === "error") {
    const message = lookup.state === "done" && lookup.result.status === "error" && (lookup.result.error === QUOTA_MESSAGE || !lookup.result.error.startsWith("Couldn't search")) ? lookup.result.error : SEARCH_FAILED_MESSAGE;
    return <p className="identity-search-failed" role="alert"><AlertTriangle aria-hidden="true" />{message}<Button size="sm" variant="outline" onClick={onRetry}><RotateCw />Retry</Button></p>;
  }
  const result = lookup.result;
  if (result.status === "invalid") return <p className="field-error" role="alert">{result.error}</p>;
  if (result.status === "insufficient") return <p className="field-help">{result.reason}. Paste another ORCID or profile link, or choose Can't tell.</p>;
  const options = result.status === "confirmed" ? [{ ...result.profile, match: { score: 1, name: true, institution: true, manyWorks: result.profile.worksCount >= 20 } }] : result.options;
  if (!options.length) return <p className="field-help">OpenAlex returned no profiles for this name. Paste an ORCID or profile link, or choose Can't tell.</p>;
  return <div className="identity-profiles">{options.map(profile => <Button variant="outline" key={profile.id} className="identity-profile-card" disabled={disabledIds.includes(profile.id)} aria-label={`This is the person: ${profile.displayName}, ${profile.currentInstitutions[0] ?? "no current institution"}`} onClick={() => onPick(profile)}>
    <ProfileDetails profile={profile} />
    <span className="profile-match">Match {profile.match.score.toFixed(1)}: {[profile.match.name && "name", profile.match.institution && "institution", profile.match.manyWorks && "20+ works"].filter(Boolean).join(", ") || "weak"}</span>
    <span className="profile-pick">This is the person</span>
  </Button>)}</div>;
}

function provenance(notes: { durationMs: number; calls: { fresh: number; cached: number } }) {
  return `Live data from OpenAlex and ORCID · ${(notes.durationMs / 1000).toFixed(1)} s · ${notes.calls.fresh} fresh API call${notes.calls.fresh === 1 ? "" : "s"}, ${notes.calls.cached} from the 24-hour cache`;
}
function CheckLine({ row, onRetry }: { row: Row; onRetry: () => void }) {
  const check = row.check;
  if (row.identity.status !== "confirmed" || check.status === "idle") return null;
  if (check.status === "running") return <p className="check-status check-running" role="status"><Loader2 className="check-spinner" aria-hidden="true" />Checking live data…</p>;
  if (check.status === "failed") return <p className="check-status check-failed" role="alert"><AlertTriangle aria-hidden="true" />{check.quota ? QUOTA_MESSAGE : check.error}<Button size="sm" variant="outline" onClick={onRetry}><RotateCw />Retry</Button></p>;
  return <p className="check-status check-done"><Check aria-hidden="true" />Checked: {showcaseResultLabels[check.result]}<span className="check-provenance">{provenance(check.notes)}</span></p>;
}

function IdentityRow({ row, label, onPick, onPaste, onCantTell, onChange, onRetryLookup, onRetryCheck, resolve, open, onToggle }: {
  row: Row; label: string; open: boolean; onToggle: () => void;
  onPick: (profiles: LiveProfile[]) => void; onPaste: (profiles: LiveProfile[]) => void; onCantTell: () => void; onChange: () => void;
  onRetryLookup: () => void; onRetryCheck?: () => void; resolve: (link: string) => Promise<{ ok: true; profile: LiveProfile } | { ok: false; error: string }>;
}) {
  const [merge, setMerge] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [resolved, setResolved] = useState<LiveProfile>();
  const [busy, setBusy] = useState(false);
  const { identity, person } = row;
  const chip = identity.status === "confirmed" ? (identity.method === "orcid" ? "Confirmed · ORCID" : "Confirmed by you") : identity.status === "cant_tell" ? (identity.reason === "Identity not confirmed" ? "Can't tell" : "Insufficient data") : "Needs you";
  const chipClass = identity.status === "confirmed" ? (identity.method === "orcid" ? "identity-chip-orcid" : "identity-chip-chair") : identity.status === "cant_tell" ? "identity-chip-cant-tell" : "identity-chip-needs-you";
  const showChoices = open && (identity.status === "needs_chair" || merge);
  const reset = () => { setMerge(false); setPasteOpen(false); setPaste(""); setPasteError(""); setResolved(undefined); };
  async function lookUp(event: React.FormEvent) {
    event.preventDefault(); setResolved(undefined);
    const parsed = parseProfileLink(paste);
    if (!parsed.ok) { setPasteError(parsed.error); return; }
    setBusy(true); setPasteError("");
    try { const result = await resolve(paste); if (result.ok) setResolved(result.profile); else setPasteError(result.error); }
    catch { setPasteError(SEARCH_FAILED_MESSAGE); } finally { setBusy(false); }
  }
  return <section className={`identity-row ${open ? "identity-row-open" : ""}`} aria-label={`${label}: ${person.name}`}>
    <div className="identity-row-heading"><Button variant="ghost" className="identity-row-toggle" aria-expanded={open} onClick={() => { onToggle(); reset(); }}><span>{person.name}<span className="identity-typed-institution">{person.institution}{person.orcid ? ` · ${person.orcid}` : ""}</span></span><ChevronDown /></Button><span className={`identity-chip ${chipClass}`}>{identity.status === "confirmed" && identity.method === "orcid" && <Check />}{chip}</span></div>
    {onRetryCheck && <CheckLine row={row} onRetry={onRetryCheck} />}
    {identity.status !== "needs_chair" && <div className="identity-summary">
      <span>{identity.status === "cant_tell" ? identity.reason : identity.profiles.map(profile => `${profile.displayName}, ${profile.currentInstitutions[0] ?? "no current institution"} (${profile.id})`).join(" + ")}</span>
      <Button variant="link" className="identity-change" onClick={() => { reset(); onChange(); }}>Change</Button>
      {identity.status === "confirmed" && identity.method !== "orcid" && identity.profiles.length === 1 && <Button variant="link" className="identity-change" onClick={() => { if (!open) onToggle(); setMerge(true); }}>Same person, second profile</Button>}
    </div>}
    {showChoices && <div className="identity-row-content">
      {person.hint && identity.status === "needs_chair" && <p className="identity-hint">{person.hint}</p>}
      {merge && <p className="merge-notice">Add a second profile for {identity.profiles[0]?.displayName ?? person.name}.</p>}
      <Options lookup={row.lookup} onRetry={onRetryLookup} disabledIds={merge ? identity.profiles.map(profile => profile.id) : []} onPick={profile => { const next = merge ? [...identity.profiles, profile] : [profile]; reset(); onPick(next); }} />
      <div className="identity-secondary">
        <Button variant="outline" onClick={() => setPasteOpen(!pasteOpen)}>Paste ORCID or profile link</Button>
        {!merge ? <Button variant="outline" onClick={() => { reset(); onCantTell(); }}>Can't tell</Button> : <Button variant="outline" onClick={() => setMerge(false)}>Cancel second profile</Button>}
      </div>
      {pasteOpen && <form className="identity-paste" noValidate onSubmit={lookUp}>
        <label htmlFor={`paste-${row.key}`}>ORCID iD or openalex.org author link</label>
        <div><input id={`paste-${row.key}`} value={paste} maxLength={500} onChange={event => { setPaste(event.target.value); setPasteError(""); setResolved(undefined); }} aria-invalid={Boolean(pasteError)} /><Button type="submit" disabled={busy}>Look up</Button></div>
        {pasteError && <p className="field-error" role="alert">{pasteError}</p>}
        {resolved && <div className="identity-resolved" role="status"><p>Found: <strong>{resolved.displayName}</strong>, {resolved.currentInstitutions[0] ?? "no current institution"} · {resolved.worksCount} works · {resolved.id}</p><Button onClick={() => { const next = merge ? [...identity.profiles, resolved] : [resolved]; reset(); onPaste(next); }}>Use this profile</Button></div>}
      </form>}
    </div>}
  </section>;
}

const ruleNames: Record<string, string> = {
  R1: "Recent co-authored work", R2: "Older co-authored work", R3: "Same current institution", R4: "Same past institution",
  R5: "Declared academic relationship", R6: "Declared personal or financial tie", LARGE_TEAM: "Large-team paper",
  NAME_ONLY: "Same name on a candidate paper", SAME_NAME_OTHER_PERSON: "Same name, different person (not counted)",
};
type WorkEvidence = { title: string; year: number | null; doi: string | null; venue: string | null; author_count: number; byline?: string };
function Evidence({ finding }: { finding: ShowcaseFinding }) {
  const evidence = finding.evidence as { works?: WorkEvidence[]; total?: number; note?: string; institution?: { name: string; candidate_years: number[]; reviewer_years: number[]; candidate_source: string; reviewer_source: string }; name_scan?: { covered: number; total: number } };
  return <div className={`evidence-finding evidence-${finding.severity}`}>
    <h4>{ruleNames[finding.rule] ?? finding.rule} <span className="evidence-rule">{finding.rule} · {finding.severity}</span></h4>
    {evidence.note && <p>{evidence.note}</p>}
    {evidence.works && <ul className="evidence-works">{evidence.works.map((work, index) => <li key={`${work.doi ?? work.title}-${index}`}><span className="evidence-year">{work.year ?? "—"}</span><span>{work.doi ? <a href={work.doi.startsWith("http") ? work.doi : `https://doi.org/${work.doi}`} target="_blank" rel="noreferrer">{work.title}<ExternalLink aria-hidden="true" /></a> : work.title}<span className="evidence-meta">{[work.venue, `${work.author_count} authors`, work.byline && `byline: ${work.byline}`].filter(Boolean).join(" · ")}</span></span></li>)}</ul>}
    {typeof evidence.total === "number" && evidence.works && evidence.total > evidence.works.length && <p className="evidence-meta">Showing {evidence.works.length} of {evidence.total}.</p>}
    {evidence.institution && <p>{evidence.institution.name}: candidate {Math.min(...evidence.institution.candidate_years)}–{Math.max(...evidence.institution.candidate_years)} ({evidence.institution.candidate_source}); reviewer {Math.min(...evidence.institution.reviewer_years)}–{Math.max(...evidence.institution.reviewer_years)} ({evidence.institution.reviewer_source})</p>}
    {evidence.name_scan && evidence.name_scan.covered < evidence.name_scan.total && <p className="evidence-meta">Name scan covered {evidence.name_scan.covered} of {evidence.name_scan.total} works.</p>}
  </div>;
}
function Results({ rows, onRetry }: { rows: Row[]; onRetry: (key: string) => void }) {
  const [open, setOpen] = useState<string>();
  const order = (row: Row) => row.check.status === "done" ? { conflict: 1, potential: 2, insufficient: 3, no_conflict: 4 }[row.check.result] : row.check.status === "failed" ? 0 : 5;
  return <div className="live-results">{[...rows].sort((a, b) => order(a) - order(b)).map(row => {
    const check = row.check;
    const label = row.identity.status === "cant_tell" ? "Insufficient data" : check.status === "done" ? showcaseResultLabels[check.result] : check.status === "failed" ? "Couldn't check" : "Not checked";
    const chip = row.identity.status === "cant_tell" ? "insufficient" : check.status === "done" ? check.result : check.status === "failed" ? "failed" : "none";
    const isOpen = open === row.key;
    return <section key={row.key} className="live-result" aria-label={`${row.person.name}: ${label}`}>
      <div className="live-result-heading"><Button variant="ghost" className="identity-row-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : row.key)}><span>{row.person.name}<span className="identity-typed-institution">{row.person.institution}</span></span><ChevronDown /></Button><span className={`result-chip result-${chip}`}>{check.status === "failed" && <AlertTriangle aria-hidden="true" />}{label}</span></div>
      <p className="live-result-reason">{row.identity.status === "cant_tell" ? row.identity.reason : check.status === "done" ? check.reason : check.status === "failed" ? (check.quota ? QUOTA_MESSAGE : check.error) : ""}</p>
      {check.status === "failed" && <Button size="sm" variant="outline" onClick={() => onRetry(row.key)}><RotateCw />Retry</Button>}
      {(check.status === "done" || check.status === "failed") && check.notes && <p className="evidence-meta">{provenance(check.notes)}</p>}
      {isOpen && check.status === "done" && <div className="live-result-evidence">{check.findings.length ? check.findings.map((finding, index) => <Evidence key={`${finding.rule}-${index}`} finding={finding} />) : <p>No findings.</p>}</div>}
    </section>;
  })}</div>;
}

export function ShowcaseCase({ code, candidate, reviewers }: { code: string | null; candidate: ShowcasePersonInput; reviewers: ShowcasePersonInput[] }) {
  const session = useRef(newShowcaseSession()).current;
  const [cand, setCand] = useState<Row>({ key: "candidate", person: candidate, identity: fresh(), check: { status: "idle" } });
  const [rows, setRows] = useState<Row[]>(() => reviewers.map((person, index) => ({ key: `r${index}`, person, identity: fresh(), check: { status: "idle" } })));
  const [openKey, setOpenKey] = useState<string>();
  const [view, setView] = useState<"identity" | "results">("identity");
  const started = useRef(new Set<string>());
  const candidateConfirmed = cand.identity.status === "confirmed";
  const candidateIds = cand.identity.profiles.map(profile => profile.id);

  const update = useCallback((key: string, change: (row: Row) => Row) => {
    if (key === "candidate") setCand(change); else setRows(previous => previous.map(row => row.key === key ? change(row) : row));
  }, []);
  const runCheck = useCallback(async (row: Row, identity: Identity, candidateProfiles: string[]) => {
    update(row.key, current => ({ ...current, check: { status: "running", startedAt: Date.now() } }));
    const result = await showcaseRunCheck(session, code, { profileIds: candidateProfiles, orcid: candidate.orcid || null }, { profileIds: identity.profiles.map(profile => profile.id), typedName: row.person.name });
    update(row.key, current => current.identity === identity ? { ...current, check: result } : current);
  }, [code, candidate.orcid, session, update]);
  const confirm = useCallback((row: Row, identity: Identity) => {
    update(row.key, current => ({ ...current, identity, check: { status: "idle" } }));
    if (row.key === "candidate") return;
    if (identity.status === "confirmed" && candidateIds.length) void runCheck({ ...row, identity }, identity, candidateIds); // D53: check on confirmation
  }, [candidateIds, runCheck, update]);
  const lookup = useCallback(async (row: Row) => {
    update(row.key, current => ({ ...current, lookup: { state: "loading" } }));
    let result: IdentifyResult;
    try { result = await showcaseIdentifyPerson(session, code, { typedName: row.person.name, typedInstitution: row.person.institution, typedOrcid: row.person.orcid || null }); }
    catch { update(row.key, current => ({ ...current, lookup: { state: "unreachable" } })); return; }
    update(row.key, current => ({ ...current, lookup: { state: "done", result } }));
    if (!started.current.has(`auto:${row.key}`)) {
      started.current.add(`auto:${row.key}`);
      if (result.status === "confirmed") confirm(row, { status: "confirmed", method: "orcid", profiles: [result.profile] });
      if (result.status === "insufficient") confirm(row, { status: "cant_tell", method: "orcid", profiles: [], reason: result.reason });
    }
  }, [code, confirm, session, update]);

  // Candidate first; then reviewers. D58: prefetch the candidate's works once confirmed.
  useEffect(() => { if (!started.current.has("candidate")) { started.current.add("candidate"); void lookup(cand); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!candidateConfirmed) return;
    const key = `prefetch:${candidateIds.join("+")}`;
    if (!started.current.has(key)) { started.current.add(key); void showcasePrefetchCandidate(session, code, candidateIds, candidate.orcid || null); }
    for (const row of rows) if (!started.current.has(row.key)) { started.current.add(row.key); void lookup(row); }
  }, [candidateConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = (link: string) => showcaseResolveLink(session, code, link);
  const handlers = (row: Row) => ({
    onPick: (profiles: LiveProfile[]) => confirm(row, { status: "confirmed", method: "chair_pick", profiles }),
    onPaste: (profiles: LiveProfile[]) => confirm(row, { status: "confirmed", method: "chair_paste", profiles }),
    onCantTell: () => confirm(row, { status: "cant_tell", profiles: [], reason: "Identity not confirmed" }),
    onChange: () => { setOpenKey(row.key); update(row.key, current => ({ ...current, identity: fresh(), check: { status: "idle" } })); },
    onRetryLookup: () => void lookup(row),
  });
  const needsYou = rows.filter(row => row.identity.status === "needs_chair").length;
  const running = rows.filter(row => row.check.status === "running").length;
  const confirmedRows = rows.filter(row => row.identity.status === "confirmed");

  if (view === "results") return <section className="live-identity" aria-labelledby="results-title">
    {running ? <div className="live-progress" role="status" aria-live="polite"><h2 id="results-title">Checking {confirmedRows.length - running} of {confirmedRows.length}…</h2><p className="identity-explainer">Results appear when every confirmed reviewer has been checked against live data.</p><ol className="live-progress-list">{confirmedRows.map(row => <li key={row.key}><span className="live-progress-name">{row.person.name}</span>{row.check.status === "running" ? <Loader2 className="check-spinner" aria-hidden="true" /> : <span>{row.check.status === "failed" ? "Couldn't check" : "Done"}</span>}</li>)}</ol></div>
      : <><h2 id="results-title">Results</h2><p className="identity-explainer">The tool flags; the chair decides. Open a reviewer to see the evidence.</p><Results rows={rows} onRetry={key => { const row = rows.find(item => item.key === key); if (row) void runCheck(row, row.identity, candidateIds); }} /></>}
    <div className="identity-footer"><Button variant="link" className="back-link" onClick={() => setView("identity")}>Back to confirming identities</Button></div>
  </section>;

  return <section className="live-identity" aria-labelledby="identity-title">
    <h2 id="identity-title">Step 1: Confirm who each person is</h2>
    <p className="identity-explainer">Checks run only on people you've confirmed. Someone with a valid ORCID is confirmed automatically; nobody else is. Each reviewer's live check starts the moment you confirm them.</p>
    <h3>Candidate</h3>
    <IdentityRow row={cand} label="Candidate" open={openKey === "candidate" || cand.identity.status === "needs_chair"} onToggle={() => setOpenKey(openKey === "candidate" ? undefined : "candidate")} resolve={resolve} {...handlers(cand)} />
    <h3>Reviewers</h3>
    {!candidateConfirmed ? <p className="field-help" role="status">Confirm the candidate first. No reviewer can be identified or checked until then.</p> : <>
      <p className="identity-progress" role="status">{rows.length - needsYou} of {rows.length} handled{needsYou ? ` · ${needsYou} need you` : ""}</p>
      <div className="identity-list">{rows.map(row => <IdentityRow key={row.key} row={row} label="Reviewer" open={openKey === row.key || (row.identity.status === "needs_chair" && openKey === undefined)} onToggle={() => setOpenKey(openKey === row.key ? "" : row.key)} resolve={resolve} onRetryCheck={() => void runCheck(row, row.identity, candidateIds)} {...handlers(row)} />)}</div>
      {needsYou === 0 && <div className="identity-footer"><span /><Button onClick={() => setView("results")}>See results<ChevronRight /></Button></div>}
    </>}
  </section>;
}
