import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { parseProfileLink, SEARCH_FAILED_MESSAGE, type IdentifyResult, type LiveProfile } from "@/lib/identity";
import {
  canStartLiveChecks, getLiveScreening, identifyLive, resolveLiveLink, saveLiveCandidateIdentity, saveLiveReviewerIdentity, shouldAutoApply,
  type LiveCase, type LiveIdentity, type LiveIdentityChoice, type LiveScreening, type Reviewer,
} from "@/data/screeningService";

export type Lookup = { state: "loading" } | { state: "done"; result: IdentifyResult } | { state: "unreachable" };

function LiveProfileDetails({ profile }: { profile: LiveProfile }) {
  return <>
    <h3>{profile.displayName}</h3>
    <p className="profile-institution">{profile.currentInstitutions.join(" · ") || "No current institution listed"}</p>
    {profile.pastAffiliations.length > 0 && <p className="profile-past">{profile.pastAffiliations.map(past => `${past.institution} · ${past.fromYear}–${past.toYear}`).join("; ")}</p>}
    {profile.topics.length > 0 && <div className="profile-topics">{profile.topics.map(topic => <span key={topic}>{topic}</span>)}</div>}
    <p className="profile-works">{profile.worksCount} works{profile.orcid ? ` · ORCID ${profile.orcid}` : ""} · {profile.id}</p>
    {profile.recentWorks.length > 0 && <ol className="profile-papers">{profile.recentWorks.map((work, index) => <li key={work.doi ?? `${work.title}-${index}`}><span>{work.year ?? "—"}</span>{work.title}</li>)}</ol>}
  </>;
}
function ProfileSkeletons() {
  return <div className="identity-profiles" role="status" aria-label="Searching for matching profiles">{[0, 1, 2].map(index => <div key={index} className="identity-profile-skeleton" aria-hidden="true"><Skeleton className="skeleton-line skeleton-title" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line skeleton-short" /><Skeleton className="skeleton-block" /></div>)}<span className="sr-only">Searching for matching profiles…</span></div>;
}

/** What the chair sees while a row needs them. A failed search is never shown as "no matches". */
export function IdentityOptions({ lookup, onPick, onRetry, disabledIds = [] }: { lookup: Lookup | undefined; onPick: (profile: LiveProfile) => void; onRetry: () => void; disabledIds?: string[] }) {
  if (!lookup || lookup.state === "loading") return <ProfileSkeletons />;
  if (lookup.state === "unreachable" || lookup.result.status === "error") {
    return <p className="identity-search-failed" role="alert"><AlertTriangle aria-hidden="true" />{SEARCH_FAILED_MESSAGE}<Button size="sm" variant="outline" onClick={onRetry}><RotateCw />Retry</Button></p>;
  }
  const result = lookup.result;
  if (result.status === "invalid") return <p className="field-error" role="alert">{result.error}</p>;
  if (result.status === "insufficient") return <p className="field-help">{result.reason}. Paste another ORCID or profile link, or choose Can't tell.</p>;
  // After "Change" on an ORCID confirmation, the ORCID's profile is offered back as a card.
  const options = result.status === "confirmed" ? [{ ...result.profile, match: { score: 1, name: true, institution: true, manyWorks: result.profile.worksCount >= 20 } }] : result.options;
  if (!options.length) return <p className="field-help">OpenAlex returned no profiles for this name. Paste an ORCID or profile link, or choose Can't tell.</p>;
  return <div className="identity-profiles">{options.map(profile => <Button variant="outline" key={profile.id} className="identity-profile-card" disabled={disabledIds.includes(profile.id)} aria-label={`This is the person: ${profile.displayName}, ${profile.currentInstitutions[0] ?? "no current institution"}`} onClick={() => onPick(profile)}>
    <LiveProfileDetails profile={profile} />
    <span className="profile-match">Match {profile.match.score.toFixed(1)}: {[profile.match.name && "name", profile.match.institution && "institution", profile.match.manyWorks && "20+ works"].filter(Boolean).join(", ") || "weak"}</span>
    <span className="profile-pick">This is the person</span>
  </Button>)}</div>;
}

const chip: Record<string, { label: string; className: string }> = {
  needs_chair: { label: "Needs you", className: "identity-chip-needs-you" },
  orcid: { label: "Confirmed · ORCID", className: "identity-chip-orcid" },
  chair: { label: "Confirmed by you", className: "identity-chip-chair" },
  cant_tell: { label: "Can't tell", className: "identity-chip-cant-tell" },
};
function chipFor(identity: LiveIdentity) {
  if (identity.status === "confirmed") return identity.method === "orcid" ? chip["orcid"]! : chip["chair"]!;
  return identity.status === "cant_tell" ? { ...chip["cant_tell"]!, label: identity.reason === "Identity not confirmed" ? "Can't tell" : "Insufficient data" } : chip["needs_chair"]!;
}

type RowProps = {
  label: string; name: string; institution: string; orcid: string; identity: LiveIdentity; lookup: Lookup | undefined;
  profiles: Record<string, LiveProfile>; open: boolean; onToggle: () => void;
  onChoose: (choice: LiveIdentityChoice, profiles: LiveProfile[]) => Promise<void>; onRetry: () => void;
};
function IdentityRow({ label, name, institution, orcid, identity, lookup, profiles, open, onToggle, onChoose, onRetry }: RowProps) {
  const [merge, setMerge] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [resolved, setResolved] = useState<LiveProfile>();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const status = chipFor(identity);
  const confirmedProfiles = identity.profileIds.map(id => profiles[id]).filter((profile): profile is LiveProfile => Boolean(profile));
  const showChoices = open && (identity.status === "needs_chair" || merge);
  function reset() { setMerge(false); setPasteOpen(false); setPaste(""); setPasteError(""); setResolved(undefined); setSaveError(""); }
  async function save(choice: LiveIdentityChoice, chosen: LiveProfile[]) {
    setBusy(true); setSaveError("");
    try { await onChoose(choice, chosen); reset(); } catch { setSaveError("Couldn't save. Try again."); } finally { setBusy(false); }
  }
  function pick(profile: LiveProfile) {
    const ids = merge ? [...new Set([...identity.profileIds, profile.id])] : [profile.id];
    void save({ kind: "pick", profileIds: ids }, merge ? [...confirmedProfiles, profile] : [profile]);
  }
  async function lookUpPaste(event: React.FormEvent) {
    event.preventDefault();
    setResolved(undefined);
    const parsed = parseProfileLink(paste);
    if (!parsed.ok) { setPasteError(parsed.error); return; }
    setBusy(true); setPasteError("");
    try {
      const result = await resolveLiveLink(paste);
      if (result.ok) setResolved(result.profile); else setPasteError(result.error);
    } catch { setPasteError(SEARCH_FAILED_MESSAGE); } finally { setBusy(false); }
  }
  function usePasted() {
    if (!resolved) return;
    const ids = merge ? [...new Set([...identity.profileIds, resolved.id])] : [resolved.id];
    void save({ kind: "paste", profileIds: ids }, merge ? [...confirmedProfiles, resolved] : [resolved]);
  }
  return <section className={`identity-row ${open ? "identity-row-open" : ""}`} aria-label={`${label}: ${name}`}>
    <div className="identity-row-heading"><Button variant="ghost" className="identity-row-toggle" aria-expanded={open} onClick={() => { onToggle(); reset(); }}><span>{name}<span className="identity-typed-institution">{institution}{orcid ? ` · ${orcid}` : ""}</span></span><ChevronDown /></Button><span className={`identity-chip ${status.className}`}>{identity.status === "confirmed" && identity.method === "orcid" && <Check />}{status.label}</span></div>
    {identity.status !== "needs_chair" && <div className="identity-summary">
      <span>{identity.status === "cant_tell" ? identity.reason : confirmedProfiles.length ? confirmedProfiles.map(profile => `${profile.displayName}, ${profile.currentInstitutions[0] ?? "no current institution"} (${profile.id})`).join(" + ") : identity.profileIds.join(" + ")}</span>
      <Button variant="link" className="identity-change" onClick={() => void save({ kind: "reset" }, [])} disabled={busy}>Change</Button>
      {identity.status === "confirmed" && identity.method !== "orcid" && identity.profileIds.length === 1 && <Button variant="link" className="identity-change" onClick={() => { if (!open) onToggle(); setMerge(true); }}>Same person, second profile</Button>}
    </div>}
    {showChoices && <div className="identity-row-content">
      {merge && <p className="merge-notice">Add a second profile for {confirmedProfiles[0]?.displayName ?? name}.</p>}
      <IdentityOptions lookup={lookup} onPick={pick} onRetry={onRetry} disabledIds={merge ? identity.profileIds : []} />
      <div className="identity-secondary">
        <Button variant="outline" onClick={() => setPasteOpen(!pasteOpen)}>Paste ORCID or profile link</Button>
        {!merge && <Button variant="outline" disabled={busy} onClick={() => void save({ kind: "cant_tell" }, [])}>Can't tell</Button>}
        {merge && <Button variant="outline" onClick={() => setMerge(false)}>Cancel second profile</Button>}
      </div>
      {pasteOpen && <form className="identity-paste" noValidate onSubmit={lookUpPaste}>
        <label htmlFor={`paste-${label}-${name}`}>ORCID iD or openalex.org author link</label>
        <div><input id={`paste-${label}-${name}`} value={paste} maxLength={500} onChange={event => { setPaste(event.target.value); setPasteError(""); setResolved(undefined); }} aria-invalid={Boolean(pasteError)} /><Button type="submit" disabled={busy}>Look up</Button></div>
        {pasteError && <p className="field-error" role="alert">{pasteError}</p>}
        {resolved && <div className="identity-resolved" role="status"><p>Found: <strong>{resolved.displayName}</strong>, {resolved.currentInstitutions[0] ?? "no current institution"} · {resolved.worksCount} works · {resolved.id}</p><Button onClick={usePasted} disabled={busy}>Use this profile</Button></div>}
      </form>}
      {saveError && <p className="field-error" role="alert">{saveError}</p>}
    </div>}
  </section>;
}

/** B3: the candidate is confirmed first, then each reviewer. Live mode only. */
export function LiveIdentityStep({ caseRecord, reviewers, onCaseChange }: { caseRecord: LiveCase; reviewers: Reviewer[]; onCaseChange: (record: LiveCase) => void }) {
  const [screening, setScreening] = useState<LiveScreening>();
  const [loadError, setLoadError] = useState("");
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});
  const [profiles, setProfiles] = useState<Record<string, LiveProfile>>({});
  const [openKey, setOpenKey] = useState<string>();
  const started = useRef(new Set<string>());
  const candidateConfirmed = canStartLiveChecks(caseRecord);
  const remember = useCallback((list: LiveProfile[]) => setProfiles(previous => ({ ...previous, ...Object.fromEntries(list.map(profile => [profile.id, profile])) })), []);

  const runLookup = useCallback(async (key: string, input: { typedName: string; typedInstitution: string; typedOrcid?: string | null }, identity: LiveIdentity, apply: (choice: LiveIdentityChoice, chosen: LiveProfile[]) => Promise<void>) => {
    setLookups(previous => ({ ...previous, [key]: { state: "loading" } }));
    let result: IdentifyResult;
    try { result = await identifyLive(input); } catch { setLookups(previous => ({ ...previous, [key]: { state: "unreachable" } })); return; }
    setLookups(previous => ({ ...previous, [key]: { state: "done", result } }));
    if (result.status === "confirmed") remember([result.profile]);
    if (result.status === "needs_chair") remember(result.options);
    if (shouldAutoApply(identity)) {
      if (result.status === "confirmed") await apply({ kind: "orcid", profileId: result.profile.id }, [result.profile]).catch(() => undefined);
      if (result.status === "insufficient") await apply({ kind: "orcid_insufficient" }, []).catch(() => undefined);
    }
  }, [remember]);

  const saveCandidate = useCallback(async (choice: LiveIdentityChoice, chosen: LiveProfile[]) => {
    remember(chosen); onCaseChange(await saveLiveCandidateIdentity(caseRecord.id, choice));
  }, [caseRecord.id, onCaseChange, remember]);
  const saveReviewer = useCallback((nameId: string) => async (choice: LiveIdentityChoice, chosen: LiveProfile[]) => {
    remember(chosen);
    const updated = await saveLiveReviewerIdentity(nameId, choice);
    setScreening(previous => previous ? { ...previous, names: previous.names.map(row => row.id === nameId ? updated : row) } : previous);
  }, [remember]);

  // Candidate first.
  const candidateInput = { typedName: caseRecord.candidateName, typedInstitution: caseRecord.candidateInstitution, typedOrcid: caseRecord.candidateOrcid || null };
  useEffect(() => {
    if (started.current.has("candidate")) return;
    started.current.add("candidate");
    void runLookup("candidate", candidateInput, caseRecord.candidateIdentity, saveCandidate);
    if (caseRecord.candidateIdentity.status === "needs_chair" && caseRecord.candidateIdentity.confirmedAt) setOpenKey("candidate");
  }, [runLookup, saveCandidate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Then reviewers, once the candidate is confirmed.
  useEffect(() => {
    if (!candidateConfirmed) return;
    let active = true;
    getLiveScreening(caseRecord.id).then(next => { if (active) setScreening(next); }).catch(() => { if (active) setLoadError("Couldn't load the reviewer identity step. Reload to try again."); });
    return () => { active = false; };
  }, [candidateConfirmed, caseRecord.id, reviewers.length]);
  useEffect(() => {
    if (!screening) return;
    for (const row of screening.names) {
      if (started.current.has(row.id)) continue;
      const reviewer = reviewers.find(item => item.id === row.reviewerId);
      if (!reviewer) continue;
      started.current.add(row.id);
      void runLookup(row.id, { typedName: reviewer.name, typedInstitution: reviewer.institution, typedOrcid: reviewer.identity || null }, row.identity, saveReviewer(row.id));
    }
    // Profiles confirmed earlier (chair picks/pastes) are looked up for their summary line.
    for (const id of screening.names.flatMap(row => row.identity.profileIds)) {
      if (started.current.has(`profile:${id}`)) continue;
      started.current.add(`profile:${id}`);
      void resolveLiveLink(id).then(result => { if (result.ok) remember([result.profile]); }).catch(() => undefined);
    }
  }, [screening, reviewers, runLookup, saveReviewer, remember]);
  useEffect(() => {
    for (const id of caseRecord.candidateIdentity.profileIds) {
      if (started.current.has(`profile:${id}`)) continue;
      started.current.add(`profile:${id}`);
      void resolveLiveLink(id).then(result => { if (result.ok) remember([result.profile]); }).catch(() => undefined);
    }
  }, [caseRecord.candidateIdentity.profileIds, remember]);

  const retry = (key: string, input: Parameters<typeof runLookup>[1], identity: LiveIdentity, apply: Parameters<typeof runLookup>[3]) => () => void runLookup(key, input, identity, apply);
  const rows = (screening?.names ?? []).map(row => ({ row, reviewer: reviewers.find(item => item.id === row.reviewerId) })).filter((entry): entry is { row: typeof entry.row; reviewer: Reviewer } => Boolean(entry.reviewer));
  const needsYou = rows.filter(entry => entry.row.identity.status === "needs_chair").length;

  return <section className="live-identity" aria-labelledby="live-identity-title">
    <h2 id="live-identity-title">Step 1: Confirm who each person is</h2>
    <p className="identity-explainer">We check publications only for people you've confirmed. Someone with a valid ORCID is confirmed automatically; nobody else is.</p>
    <h3>Candidate</h3>
    <IdentityRow label="Candidate" name={caseRecord.candidateName} institution={caseRecord.candidateInstitution} orcid={caseRecord.candidateOrcid} identity={caseRecord.candidateIdentity} lookup={lookups["candidate"]} profiles={profiles} open={openKey === "candidate" || caseRecord.candidateIdentity.status === "needs_chair"} onToggle={() => setOpenKey(openKey === "candidate" ? undefined : "candidate")} onChoose={saveCandidate} onRetry={retry("candidate", candidateInput, caseRecord.candidateIdentity, saveCandidate)} />
    <h3>Reviewers</h3>
    {!candidateConfirmed ? <p className="field-help" role="status">Confirm the candidate first. No reviewer can be identified or checked until then.</p>
    : loadError ? <p className="field-error" role="alert">{loadError}</p>
    : !screening ? <p role="status">Loading reviewers…</p>
    : !rows.length ? <p className="field-help">Add reviewers above, then confirm who each one is here.</p>
    : <>
      <p className="identity-progress" role="status">{rows.length - needsYou} of {rows.length} handled{needsYou ? ` · ${needsYou} need you` : ""}</p>
      <div className="identity-list">{rows.map(({ row, reviewer }) => <IdentityRow key={row.id} label="Reviewer" name={reviewer.name} institution={reviewer.institution} orcid={reviewer.identity} identity={row.identity} lookup={lookups[row.id]} profiles={profiles} open={openKey === row.id || (row.identity.status === "needs_chair" && openKey === undefined)} onToggle={() => setOpenKey(openKey === row.id ? "" : row.id)} onChoose={saveReviewer(row.id)} onRetry={retry(row.id, { typedName: reviewer.name, typedInstitution: reviewer.institution, typedOrcid: reviewer.identity || null }, row.identity, saveReviewer(row.id))} />)}</div>
    </>}
  </section>;
}
