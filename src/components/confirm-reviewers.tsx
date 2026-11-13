import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RotateCw, Undo2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { logIdentityDecision, markResultsSeen, markRowOpened } from "@/lib/research-session";
import { CHECK_FAILED_MESSAGE, getCheckStates, retryCheck, searchProfiles, subscribeChecks, type CheckState, canReviewResults, confirmIdentity, getIdentityReviews, hasIdentityUndo, identitySchema, startScreening, undoLastIdentity, type IdentityProfile, type IdentityReview } from "@/data/screeningService";

function selectionOf(row: IdentityReview | undefined): string {
  if (!row || row.status === "needs-you") return "";
  if (row.status === "cant-tell") return "cant-tell";
  return [...row.selectedIds].sort().join("+");
}

function ProfileDetails({ profile }: { profile: IdentityProfile }) {
  return <><h3>{profile.displayName}</h3><p className="profile-institution">{profile.currentInstitution}<span>{profile.currentSince}–{profile.currentUntil ?? "present"}</span></p>{profile.pastInstitutions.length > 0 && <p className="profile-past">{profile.pastInstitutions.map(past => `${past.institution} · ${past.fromYear}–${past.toYear}`).join("; ")}</p>}<div className="profile-topics">{profile.topics.map(topic => <span key={topic}>{topic}</span>)}</div><p className="profile-works">{profile.worksCount} works</p><ol className="profile-papers">{profile.recentPapers.map(paper => <li key={paper.doi}><span>{paper.year}</span>{paper.title}</li>)}</ol><span className="profile-pick">This is the person</span></>;
}

/** Re-renders whenever a simulated check changes stage or finishes. */
export function useCheckStates(screeningId: string): Record<string, CheckState> {
  const [states, setStates] = useState<Record<string, CheckState>>(() => getCheckStates(screeningId));
  useEffect(() => { setStates(getCheckStates(screeningId)); return subscribeChecks(() => setStates(getCheckStates(screeningId))); }, [screeningId]);
  return states;
}
export function CheckStatus({ state, onRetry }: { state: CheckState | undefined; onRetry: () => void }) {
  if (!state) return null;
  if (state.status === "running") return <span className="check-status check-running" role="status"><Loader2 className="check-spinner" aria-hidden="true" />Checking…</span>;
  if (state.status === "done") return <span className="check-status check-done"><Check aria-hidden="true" />Checked</span>;
  return <span className="check-status check-failed"><AlertTriangle aria-hidden="true" />{CHECK_FAILED_MESSAGE}<Button size="sm" variant="outline" onClick={onRetry}><RotateCw />Retry</Button></span>;
}
function ProfileSkeletons() {
  return <div className="identity-profiles" role="status" aria-label="Searching for matching profiles">{[0, 1, 2].map(index => <div key={index} className="identity-profile-skeleton" aria-hidden="true"><Skeleton className="skeleton-line skeleton-title" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line skeleton-short" /><Skeleton className="skeleton-block" /></div>)}<span className="sr-only">Searching for matching profiles…</span></div>;
}

export function ConfirmReviewers({ screeningId, caseId, reviewerId }: { screeningId: string; caseId: string; reviewerId: string | undefined }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(() => getIdentityReviews(screeningId));
  const [openId, setOpenId] = useState(() => reviewerId ?? getIdentityReviews(screeningId).find(row => row.status === "needs-you")?.reviewer.id);
  const [merge, setMerge] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [undoAvailable, setUndoAvailable] = useState(() => hasIdentityUndo(screeningId));
  const pasteRef = useRef<HTMLInputElement>(null);
  const checkStates = useCheckStates(screeningId);
  const [searchedIds, setSearchedIds] = useState<string[]>([]);
  const openRow = rows.find(row => row.reviewer.id === openId);
  const searching = Boolean(openRow && openRow.status === "needs-you" && !searchedIds.includes(openRow.reviewer.id));
  const ordered = [...rows].sort((a, b) => Number(b.status === "needs-you") - Number(a.status === "needs-you"));
  const confirmed = rows.filter(row => row.status === "orcid" || row.status === "chair").length;
  const unresolved = rows.filter(row => row.status === "needs-you").length;
  function resetControls() { setMerge(false); setPasteOpen(false); setPaste(""); setError(""); setSelectedIndex(undefined); }
  function refresh(nextId?: string) {
    const nextRows = getIdentityReviews(screeningId);
    setRows(nextRows); setUndoAvailable(hasIdentityUndo(screeningId));
    setOpenId(nextId ?? nextRows.find(row => row.status === "needs-you")?.reviewer.id);
    resetControls();
  }
  function choose(profile: IdentityProfile) {
    if (!openRow) return;
    const profileIds = merge ? [...new Set([...openRow.selectedIds, profile.id])] : [profile.id];
    confirmIdentity(screeningId, openRow.reviewer.id, { action: "select-profiles", profileIds });
    logIdentityDecision(merge ? "second_profile_added" : "card_picked", { reviewerId: openRow.reviewer.id, optionPosition: openRow.options.findIndex(option => option.id === profile.id) + 1 || undefined, profileId: profile.id, selection: [...profileIds].sort().join("+") });
    refresh();
  }
  function cantTell() { if (!openRow) return; confirmIdentity(screeningId, openRow.reviewer.id, { action: "cant-tell" }); logIdentityDecision("cant_tell", { reviewerId: openRow.reviewer.id, selection: "cant-tell" }); refresh(); }
  function logUndo(id: string) { logIdentityDecision("undo", { reviewerId: id, selection: selectionOf(getIdentityReviews(screeningId).find(row => row.reviewer.id === id)) }); }
  function undo() { const id = undoLastIdentity(screeningId); if (id) { logUndo(id); refresh(id); } }
  function change(row: IdentityReview) { setOpenId(row.reviewer.id); resetControls(); }
  function pasteProfile() {
    if (!openRow) return;
    const parsed = identitySchema.refine(value => value.length > 0, "Enter an ORCID or profile link.").safeParse(paste);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid profile."); return; }
    try { const id = openRow.reviewer.id; confirmIdentity(screeningId, id, { action: "paste-profile", link: parsed.data }); const after = getIdentityReviews(screeningId).find(row => row.reviewer.id === id); logIdentityDecision("orcid_pasted", { reviewerId: id, profileId: after?.selectedIds[0], selection: selectionOf(after) }); refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Profile not found."); }
  }
  useEffect(() => {
    if (!openId || !searching) return;
    let active = true;
    void searchProfiles(openId).then(() => { if (active) setSearchedIds(ids => [...ids, openId]); });
    return () => { active = false; };
  }, [openId, searching]);
  // Row timing starts when profiles appear, so simulated search time never counts against the chair.
  useEffect(() => { if (openId && !searching) markRowOpened(openId); }, [openId, searching]);
  useEffect(() => { if (pasteOpen) pasteRef.current?.focus(); }, [pasteOpen]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input,textarea,select") || target.isContentEditable || target.closest('[role="menu"]'))) return;
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); undo(); return; }
      if (!openRow || searching) return;
      if (["1", "2", "3"].includes(key)) { const index = Number(key) - 1; const profile = openRow.options[index]; if (profile && (!merge || !openRow.selectedIds.includes(profile.id))) { event.preventDefault(); choose(profile); } }
      else if (key === "p") { event.preventDefault(); setPasteOpen(true); }
      else if (key === "c") { event.preventDefault(); cantTell(); }
      else if (key === "enter" && !(target instanceof HTMLElement && target.closest('button,a'))) { const profile = openRow.options[selectedIndex ?? 0]; if (profile) { event.preventDefault(); choose(profile); } }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  async function seeResults() {
    const id = startScreening(caseId, screeningId);
    markResultsSeen();
    await navigate({ to: "/cases/$caseId/screening/results", params: { caseId }, search: { screeningId: id } });
  }
  return <>
    <header className="case-header identity-heading"><h1>Check for conflicts</h1></header>
    <ol className="case-steps identity-steps" aria-label="Screening progress"><li className="step-current" aria-current="step"><span className="step-symbol">1</span>Confirm reviewers<ChevronRight className="step-arrow" /></li><li><span className="step-symbol">2</span>Review results</li></ol>
    <div className="identity-progress"><h2>Confirm who each reviewer is</h2><span role="status" aria-live="polite">{confirmed} of {rows.length} confirmed{rows.some(row => row.status === "cant-tell") ? ` · ${rows.filter(row => row.status === "cant-tell").length} can't tell` : ""}</span></div>
    <p className="identity-explainer">We check publications only for people you've confirmed. A reviewer with an ORCID is confirmed automatically.</p>
    <div className="identity-toolbar"><p className="keyboard-hints"><kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> pick · <kbd>P</kbd> paste · <kbd>C</kbd> can't tell · <kbd>Enter</kbd> confirm · <kbd>Z</kbd> undo</p><Button variant="ghost" onClick={undo} disabled={!undoAvailable}><Undo2 />Undo last choice</Button></div>
    <div className="identity-list">{ordered.map(row => {
      const isOpen = row.reviewer.id === openId;
      const profiles = row.matchedProfiles;
      const label = row.status === "orcid" ? "Confirmed · ORCID" : row.status === "chair" ? "Confirmed by you" : row.status === "cant-tell" ? "Can't tell" : "Needs you";
      return <section key={row.reviewer.id} className={`identity-row ${isOpen ? "identity-row-open" : ""}`} aria-label={`${row.reviewer.name} reviewer`}>
        <div className="identity-row-heading"><Button variant="ghost" className="identity-row-toggle" aria-expanded={isOpen} onClick={() => { setOpenId(isOpen ? undefined : row.reviewer.id); resetControls(); }}><span>{row.reviewer.name}<span className="identity-typed-institution">{row.reviewer.institution}</span></span><ChevronDown /></Button><span className={`identity-chip identity-chip-${row.status}`}>{row.status === "orcid" && <Check />}{label}</span></div>
        {row.status !== "needs-you" && <CheckStatus state={checkStates[row.reviewer.id]} onRetry={() => retryCheck(screeningId, row.reviewer.id)} />}
        {row.status !== "needs-you" && <div className="identity-summary"><span>{row.status === "cant-tell" ? "Identity not confirmed" : `${row.status === "chair" ? "Confirmed by you: " : ""}${profiles.map(profile => `${profile.displayName}, ${profile.currentInstitution}`).join(" + ")}`}</span>{profiles.map(profile => <Button variant="link" className="profile-link" asChild key={profile.id}><Link to="/cases/$caseId/screening/profile/$profileId" params={{ caseId, profileId: profile.id }} search={{ screeningId }}>Profile<ExternalLink /></Link></Button>)}{row.status === "orcid" ? <Button variant="link" className="identity-change" onClick={() => { confirmIdentity(screeningId, row.reviewer.id, "undo"); logUndo(row.reviewer.id); refresh(row.reviewer.id); }}>Not right? Undo</Button> : <Button variant="link" className="identity-change" onClick={() => change(row)}>Change</Button>}{row.status === "chair" && row.selectedIds.length === 1 && !isOpen && <Button variant="link" className="identity-change" onClick={() => { change(row); setMerge(true); }}>Same person, second profile</Button>}</div>}
        {isOpen && <div className="identity-row-content"><p className="identity-brief"><strong>From the CV:</strong> {row.brief}</p>{merge && <p className="merge-notice">Add a second profile for {profiles[0]?.displayName}.</p>}{isOpen && searching ? <ProfileSkeletons /> : <><div className="identity-profiles">{row.options.slice(0, 3).map((profile, index) => <Button variant="outline" key={profile.id} className="identity-profile-card" aria-label={`This is the person: ${profile.displayName}, ${profile.currentInstitution}, ${profile.topics[0]}`} disabled={merge && row.selectedIds.includes(profile.id)} onFocus={() => setSelectedIndex(index)} onClick={() => choose(profile)}><ProfileDetails profile={profile} /></Button>)}</div>
          {!row.options.length && <p className="field-help">No profile matches are available in this prototype.</p>}</>}
          <div className="identity-secondary">{row.selectedIds.length === 1 && <Button variant="outline" onClick={() => setMerge(!merge)}>{merge ? "Cancel second profile" : "Same person, second profile"}</Button>}<Button variant="outline" onClick={() => setPasteOpen(!pasteOpen)}>Paste ORCID or profile link</Button><Button variant="outline" onClick={cantTell}>Can't tell</Button></div>
          {pasteOpen && <form className="identity-paste" noValidate onSubmit={event => { event.preventDefault(); pasteProfile(); }}><label htmlFor={`identity-paste-${row.reviewer.id}`}>ORCID iD or profile link</label><div><input ref={pasteRef} id={`identity-paste-${row.reviewer.id}`} value={paste} maxLength={500} onChange={event => { setPaste(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "identity-paste-error" : undefined} /><Button type="submit">Confirm profile</Button></div>{error && <p id="identity-paste-error" className="field-error" role="alert">{error}</p>}</form>}
        </div>}
      </section>;
    })}</div>
    <div className="identity-footer"><Link to="/cases/$caseId" params={{ caseId }} className="back-link">Back to external evaluations</Link>{unresolved === 0 && canReviewResults(screeningId) && <Button onClick={seeResults}>See results<ChevronRight /></Button>}</div>
  </>;
}