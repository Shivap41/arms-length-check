import { z } from "zod";
import { demoScenario, demoChoiceKey, type DemoAnswer, type DemoProfile, type DemoResult, type DemoReviewer, type DemoScenario } from "./demoScenario";

const orcidPattern = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
export const identitySchema = z.string().trim().max(500, "Profile link is too long.").refine(value => {
  if (!value || orcidPattern.test(value)) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    if (url.hostname === "orcid.org" || url.hostname === "www.orcid.org") return orcidPattern.test(url.pathname.replace(/^\//, "").replace(/\/$/, ""));
    return (url.hostname === "openalex.org" || url.hostname === "www.openalex.org") && url.pathname.length > 1;
  } catch { return false; }
}, "Enter an ORCID iD (0000-0000-0000-000X) or an orcid.org or openalex.org profile URL.");

export const reviewerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(150, "Name must be 150 characters or fewer."),
  institution: z.string().trim().min(1, "Institution is required.").max(200, "Institution must be 200 characters or fewer."),
  identity: identitySchema.default(""),
});
export type ReviewerInput = z.input<typeof reviewerSchema>;
export type Reviewer = z.output<typeof reviewerSchema> & { id: string };
export type CaseRecord = { id: string; title: string; candidate: string; subtitle: string; candidateConfirmed: boolean; candidateProfile?: DemoScenario["candidate"]; declarations: { submitted: string; formerPhdAdvisor: string; postdoctoralMentor: string; personalOrFinancialTies: string } };
export type IdentityChoice = "confirmed" | "not-a-match" | "unsure" | "undo" | "undo-last" | DemoAnswer | { action: "paste-profile"; link: string };
export type ScreeningDecision = { decision: "approve" | "exclude"; reason: string; decidedBy: string; decidedAt: string };
export type Screening = { id: string; caseId: string; reviewers: Reviewer[]; identityChoices: Record<string, IdentityChoice>; identitySources: Record<string, "orcid" | "chair">; decisions: Record<string, ScreeningDecision>; results: Record<string, DemoResult>; resultsReady: boolean };
export type IdentityProfile = DemoProfile;
export type ResultStatus = DemoResult["status"];
export type ResultPaper = DemoResult["sharedPapers"][number];
export type ResultRow = { reviewer: Reviewer; result: DemoResult; source: "ORCID" | "You"; reason: string; profiles: IdentityProfile[]; candidateProfile: IdentityProfile; decoyPapers: ResultPaper[]; nameMatch: "confirmed" | "different" | undefined };
export const resultStatuses: ResultStatus[] = ["Conflict", "Potential", "Insufficient data", "No conflict found"];
export type IdentityReview = { reviewer: Reviewer; brief: string; options: IdentityProfile[]; matchedProfiles: IdentityProfile[]; status: "needs-you" | "orcid" | "chair" | "cant-tell"; selectedIds: string[] };
type IdentityHistory = { reviewerId: string; choice: IdentityChoice | undefined; source: "orcid" | "chair" | undefined; result: DemoResult | undefined };

// Browser-session memory only; no storage, network calls, or server mutations.
const caseRecord: CaseRecord = { id: "ortiz-2027", title: "Tenure review — Dr. Maya Ortiz", candidate: "Dr. Maya Ortiz", subtitle: "Associate Professor of Chemistry → Professor with tenure · Northbridge University · Cycle 2026–27", candidateConfirmed: false, declarations: { submitted: "2 Oct 2026", formerPhdAdvisor: "Marco Bianchi, University of Eastmoor", postdoctoralMentor: "none declared", personalOrFinancialTies: "none declared" } };
let reviewers: Reviewer[] = [];
const screenings = new Map<string, Screening>();
const identityHistory = new Map<string, IdentityHistory[]>();
const nameMatches = new Map<string, Record<string, "confirmed" | "different">>();
let sequence = 0;
const identifier = z.string().trim().min(1).max(150);
function requireCase(caseId: string) {
  identifier.parse(caseId);
  if (caseId !== caseRecord.id) throw new Error("Case not found.");
}
function browserOnly() { if (typeof window === "undefined") throw new Error("Prototype changes are available only in the browser."); }
export function getCase(caseId: string): CaseRecord | undefined { return caseId === caseRecord.id ? structuredClone(caseRecord) : undefined; }
export function listReviewers(caseId: string): Reviewer[] { requireCase(caseId); return reviewers.map(row => ({ ...row })); }
export function addReviewers(caseId: string, rows: ReviewerInput[]): Reviewer[] {
  browserOnly(); requireCase(caseId);
  const parsed = z.array(reviewerSchema).min(1).max(100).parse(rows);
  reviewers = [...reviewers, ...parsed.map(row => ({ ...row, id: `reviewer-${++sequence}` }))];
  return listReviewers(caseId);
}
export function removeReviewer(caseId: string, id: string): void { browserOnly(); requireCase(caseId); identifier.parse(id); reviewers = reviewers.filter(row => row.id !== id); }
export function setCandidateConfirmed(caseId: string, confirmed: boolean): void { browserOnly(); requireCase(caseId); caseRecord.candidateConfirmed = z.boolean().parse(confirmed); }
export function canStartScreening(count: number, candidateConfirmed: boolean): boolean { return count > 0 && candidateConfirmed; }
export function startScreening(caseId: string, existingScreeningId?: string): string {
  browserOnly(); requireCase(caseId);
  if (!canStartScreening(reviewers.length, caseRecord.candidateConfirmed)) throw new Error("Add a reviewer and confirm the candidate before checking for conflicts.");
  if (existingScreeningId) {
    identifier.parse(existingScreeningId);
    const current = screenings.get(existingScreeningId);
    if (!current || current.caseId !== caseId) throw new Error("Screening not found.");
    if (!canReviewResults(existingScreeningId)) throw new Error("Handle every reviewer identity before seeing results.");
    current.resultsReady = true;
    return current.id;
  }
  const id = `screening-${++sequence}`;
  const selectedReviewers = listReviewers(caseId);
  const identityChoices: Record<string, IdentityChoice> = {};
  const results: Record<string, DemoResult> = {};
  for (const row of selectedReviewers) {
    const demo = findDemoReviewer(row);
    if (demo?.autoConfirmed) {
      identityChoices[row.id] = structuredClone(demo.correctAnswer);
      results[row.id] = resolveDemoResult(demo, demo.correctAnswer);
    }
  }
  const identitySources: Screening["identitySources"] = {};
  for (const reviewerId of Object.keys(identityChoices)) identitySources[reviewerId] = "orcid";
  screenings.set(id, { id, caseId, reviewers: selectedReviewers, identityChoices, identitySources, decisions: {}, results, resultsReady: false });
  identityHistory.set(id, []);
  return id;
}
export function getScreening(screeningId: string): Screening | undefined {
  identifier.parse(screeningId);
  const screening = screenings.get(screeningId);
  return screening ? structuredClone(screening) : undefined;
}
function requireScreening(screeningId: string, nameId: string) {
  browserOnly(); identifier.parse(screeningId); identifier.parse(nameId);
  const screening = screenings.get(screeningId);
  if (!screening || !screening.reviewers.some(row => row.id === nameId)) throw new Error("Reviewer not found in this screening.");
  return screening;
}
const demoAnswerSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select-profiles"), profileIds: z.array(identifier).min(1).max(3) }),
  z.object({ action: z.literal("paste-orcid"), orcid: identitySchema.refine(value => orcidPattern.test(value), "Enter a formatted ORCID iD.") }),
  z.object({ action: z.literal("cant-tell") }),
  z.object({ action: z.literal("paste-profile"), link: identitySchema.refine(value => value.length > 0, "Enter an ORCID or profile link.") }),
]);
function findDemoReviewer(row: Reviewer): DemoReviewer | undefined {
  return demoScenario.reviewers.find(demo => demo.id === row.id && demo.typedName === row.name && demo.typedInstitution === row.institution);
}
function resolveDemoResult(demo: DemoReviewer, answer: DemoAnswer): DemoResult {
  const orcidMatch = answer.action === "paste-orcid" ? demo.options.find(profile => profile.orcid === answer.orcid) : undefined;
  const key = answer.action === "select-profiles" ? demoChoiceKey(answer.profileIds) : answer.action === "paste-orcid" ? orcidMatch?.id ?? `orcid:${answer.orcid}` : "cant-tell";
  const result = demo.resultsByChoice[key] ?? (answer.action === "paste-orcid" ? demo.resultsByChoice["cant-tell"] : demo.resultsByChoice["wrong-pick"]);
  if (!result) throw new Error("Demo outcome unavailable.");
  return structuredClone(result);
}
export function confirmIdentity(screeningId: string, nameId: string, choice: IdentityChoice): void {
  const screening = requireScreening(screeningId, nameId);
  const parsed = z.union([z.enum(["confirmed", "not-a-match", "unsure", "undo", "undo-last"]), demoAnswerSchema]).parse(choice);
  const history = identityHistory.get(screeningId) ?? [];
  if (parsed === "undo-last") {
    const last = history.pop();
    if (!last) return;
    delete screening.decisions[last.reviewerId];
    if (last.choice) screening.identityChoices[last.reviewerId] = structuredClone(last.choice); else delete screening.identityChoices[last.reviewerId];
    if (last.source) screening.identitySources[last.reviewerId] = last.source; else delete screening.identitySources[last.reviewerId];
    if (last.result) screening.results[last.reviewerId] = structuredClone(last.result); else delete screening.results[last.reviewerId];
    screening.resultsReady = false;
    return;
  }
  const row = screening.reviewers.find(reviewer => reviewer.id === nameId);
  const demo = row ? findDemoReviewer(row) : undefined;
  let normalized: IdentityChoice = parsed;
  let resolved: DemoResult | undefined;
  if (demo) {
    let answer: DemoAnswer;
    if (typeof parsed === "object" && parsed.action === "paste-profile") {
      const profile = matchProfileLink(demo, parsed.link);
      if (!profile) throw new Error("No matching profile in this fictional demo. Check the CV or choose Can't tell.");
      answer = profile.orcid ? { action: "paste-orcid", orcid: profile.orcid } : { action: "select-profiles", profileIds: [profile.id] };
      normalized = answer;
    } else answer = typeof parsed === "string" ? parsed === "confirmed" && demo.autoConfirmed ? demo.correctAnswer : { action: "cant-tell" as const } : parsed;
    if (answer.action === "select-profiles" && answer.profileIds.some(id => !demo.options.some(profile => profile.id === id))) throw new Error("Choose a profile offered for this reviewer.");
    resolved = resolveDemoResult(demo, answer);
  } else if (typeof parsed === "object" && parsed.action !== "cant-tell") {
    throw new Error("No matching profile in this fictional demo. Choose Can't tell.");
  } else resolved = { status: "Insufficient data", rule: null, explanation: "Identity not confirmed", sharedPapers: [], wrongPerson: false };
  history.push({ reviewerId: nameId, choice: screening.identityChoices[nameId], source: screening.identitySources[nameId], result: screening.results[nameId] });
  identityHistory.set(screeningId, history);
  delete screening.decisions[nameId];
  const matches = nameMatches.get(screeningId);
  if (matches) delete matches[nameId];
  screening.resultsReady = false;
  if (parsed === "undo") {
    delete screening.identityChoices[nameId]; delete screening.identitySources[nameId]; delete screening.results[nameId];
    return;
  }
  if (resolved) screening.results[nameId] = resolved;
  screening.identityChoices[nameId] = structuredClone(normalized);
  screening.identitySources[nameId] = "chair";
}
function matchProfileLink(demo: DemoReviewer, value: string): DemoProfile | undefined {
  const profiles = [...demo.options, ...demo.additionalProfiles];
  const input = value.trim();
  if (orcidPattern.test(input)) return profiles.find(profile => profile.orcid === input);
  try {
    const url = new URL(input);
    const profileId = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    return url.hostname.endsWith("orcid.org") ? profiles.find(profile => profile.orcid === profileId) : profiles.find(profile => profile.id === profileId);
  } catch { return undefined; }
}
export function getIdentityReviews(screeningId: string): IdentityReview[] {
  const screening = getScreening(screeningId);
  if (!screening) return [];
  return screening.reviewers.map(reviewer => {
    const demo = findDemoReviewer(reviewer);
    const choice = screening.identityChoices[reviewer.id];
    const profiles = demo ? [...demo.options, ...demo.additionalProfiles] : [];
    const selectedIds = typeof choice === "object" ? choice.action === "select-profiles" ? choice.profileIds : choice.action === "paste-orcid" ? profiles.filter(profile => profile.orcid === choice.orcid).map(profile => profile.id) : [] : [];
    const cantTell = choice === "unsure" || choice === "not-a-match" || (typeof choice === "object" && choice.action === "cant-tell");
    const status: IdentityReview["status"] = !choice ? "needs-you" : cantTell ? "cant-tell" : screening.identitySources[reviewer.id] === "orcid" ? "orcid" : selectedIds.length ? "chair" : "cant-tell";
    return { reviewer, brief: demo?.brief ?? "No profile data available in this fictional prototype.", options: demo?.options ?? [], matchedProfiles: profiles.filter(profile => selectedIds.includes(profile.id)), selectedIds, status };
  });
}
export function canReviewResults(screeningId: string): boolean { const rows = getIdentityReviews(screeningId); return rows.length > 0 && rows.every(row => row.status !== "needs-you"); }
export function undoLastIdentity(screeningId: string): string | undefined {
  const last = identityHistory.get(screeningId)?.at(-1);
  if (!last) return undefined;
  confirmIdentity(screeningId, last.reviewerId, "undo-last");
  return last.reviewerId;
}
export function hasIdentityUndo(screeningId: string): boolean { return Boolean(identityHistory.get(screeningId)?.length); }
export function confirmNameMatch(screeningId: string, reviewerId: string, choice: "confirmed" | "different"): void {
  const screening = requireScreening(screeningId, reviewerId);
  const parsed = z.enum(["confirmed", "different"]).parse(choice);
  const current = screening.results[reviewerId];
  if (!screening.resultsReady || !current?.sharedPapers.some(paper => paper.authorIdMissing)) throw new Error("No name-only paper match to review.");
  const matches = nameMatches.get(screeningId) ?? {};
  delete screening.decisions[reviewerId];
  matches[reviewerId] = parsed; nameMatches.set(screeningId, matches);
  screening.results[reviewerId] = { ...current, status: parsed === "confirmed" ? "Conflict" : "No conflict found", rule: parsed === "confirmed" ? "R1" : null, explanation: parsed === "confirmed" ? "Co-wrote 1 paper with the candidate (2022)" : "The name-only paper belongs to a different person." };
}
export function getResultRows(screening: Screening): ResultRow[] {
  const identities = getIdentityReviews(screening.id);
  return screening.reviewers.flatMap(reviewer => {
    const result = screening.results[reviewer.id];
    if (!result) return [];
    const identity = identities.find(row => row.reviewer.id === reviewer.id);
    const demo = findDemoReviewer(reviewer);
    let reason = result.explanation;
    if (result.employment) reason = `Same current institution: ${result.employment.institution}`;
    else if (result.declaredRelationship) reason = "Declared by the candidate: former PhD advisor";
    else if (result.sharedPapers.some(paper => paper.authorIdMissing) && result.status === "Potential") reason = "Same name on a shared paper — check it's this person";
    else if (result.sharedPapers.some(paper => paper.authorCount === 120)) reason = "Large team paper (120 authors, 2024)";
    else if (result.sharedPapers.length && result.status !== "No conflict found") reason = `Co-wrote ${result.sharedPapers.length} paper${result.sharedPapers.length === 1 ? "" : "s"} with the candidate (${result.sharedPapers.map(paper => paper.year).join(", ")})`;
    return [{ reviewer, result, source: screening.identitySources[reviewer.id] === "orcid" ? "ORCID" as const : "You" as const, reason, profiles: identity?.matchedProfiles ?? [], candidateProfile: structuredClone(demoScenario.candidate), decoyPapers: result.note && demo ? structuredClone(demo.resultsByChoice["R7-b"]?.sharedPapers ?? []) : [], nameMatch: nameMatches.get(screening.id)?.[reviewer.id] }];
  }).sort((a, b) => resultStatuses.indexOf(a.result.status) - resultStatuses.indexOf(b.result.status));
}
export function countResults(rows: ResultRow[]): Record<ResultStatus, number> {
  const counts: Record<ResultStatus, number> = { Conflict: 0, Potential: 0, "Insufficient data": 0, "No conflict found": 0 };
  for (const row of rows) counts[row.result.status]++;
  return counts;
}
export function recordDecision(screeningId: string, nameId: string, decision: ScreeningDecision["decision"], reason = ""): void {
  const screening = requireScreening(screeningId, nameId);
  const result = screening.results[nameId];
  if (!screening.resultsReady || !result) throw new Error("Review results before recording a decision.");
  const parsed = z.enum(["approve", "exclude"]).parse(decision);
  const trimmed = z.string().trim().max(2000).parse(reason);
  if (parsed === "approve" && (result.status === "Conflict" || result.status === "Potential") && trimmed.length < 10) throw new Error("Enter a reason of at least 10 characters.");
  screening.decisions[nameId] = { decision: parsed, reason: parsed === "approve" ? trimmed : "", decidedBy: "Dr. Lena Hoffmann", decidedAt: new Date().toISOString() };
}
export function countDecisions(screening: Screening): number { return screening.reviewers.filter(row => Boolean(screening.decisions[row.id])).length; }
export function canDownloadAudit(screening: Screening): boolean { return screening.resultsReady && screening.reviewers.length > 0 && countDecisions(screening) === screening.reviewers.length; }
export type AuditRecord = { case: string; candidate: string; date: string; reviewers: { name: string; institution: string; identityMethod: string; result: ResultStatus; reason: string; evidence: { label: string; url?: string | undefined }[]; decision: ScreeningDecision }[] };
export function getAuditRecord(screeningId: string): AuditRecord {
  const screening = getScreening(screeningId);
  if (!screening || !canDownloadAudit(screening)) throw new Error("Decide every reviewer before downloading the audit record.");
  return { case: caseRecord.title, candidate: caseRecord.candidate, date: new Date().toISOString(), reviewers: getResultRows(screening).map(row => {
    const decision = screening.decisions[row.reviewer.id];
    if (!decision) throw new Error("Missing reviewer decision.");
    const choice = screening.identityChoices[row.reviewer.id];
    const identityMethod = row.source === "ORCID" ? "ORCID auto-confirmed" : typeof choice === "object" && choice.action === "paste-orcid" ? "Chair — pasted ORCID" : typeof choice === "object" && choice.action === "select-profiles" ? `Chair — ${choice.profileIds.length > 1 ? "merged profiles" : "profile selection"}` : "Chair — can't tell";
    const evidence: AuditRecord["reviewers"][number]["evidence"] = row.result.sharedPapers.map(paper => ({ label: `${paper.title} (${paper.year}) · ${paper.venue} · ${paper.authorCount} authors${row.nameMatch === "different" ? " · Not counted" : ""}`, url: `https://doi.org/${encodeURIComponent(paper.doi).replace(/%2F/g, "/")}` }));
    if (row.result.employment) evidence.push({ label: `ORCID current employment: ${row.result.employment.institution}`, url: row.profiles[0]?.orcid ? `https://orcid.org/${row.profiles[0].orcid}` : undefined });
    if (row.result.declaredRelationship) evidence.push({ label: `Candidate declaration submitted ${caseRecord.declarations.submitted}: former PhD advisor ${caseRecord.declarations.formerPhdAdvisor}`, url: `${window.location.origin}/cases/${screening.caseId}#candidate-declarations` });
    for (const paper of row.decoyPapers) evidence.push({ label: `${paper.title} (${paper.year}) · Different person · Not counted`, url: `https://doi.org/${paper.doi}` });
    return { name: row.reviewer.name, institution: row.reviewer.institution, identityMethod, result: row.result.status, reason: row.reason, evidence, decision };
  }) };
}
export function loadDemoReviewers(caseId: string): { loaded: boolean; message: string } {
  browserOnly(); requireCase(caseId);
  reviewers = demoScenario.reviewers.map(demo => ({ ...reviewerSchema.parse({ name: demo.typedName, institution: demo.typedInstitution, identity: demo.typedOrcid ?? "" }), id: demo.id }));
  caseRecord.candidateConfirmed = demoScenario.candidate.confirmed;
  caseRecord.candidateProfile = structuredClone(demoScenario.candidate);
  return { loaded: true, message: "15 fictional demo reviewers loaded. Candidate identity confirmed." };
}
export function getDemoScenario(caseId: string): DemoScenario { requireCase(caseId); return structuredClone(demoScenario); }
export function getReviewerScenario(caseId: string, reviewerId: string): DemoReviewer | undefined {
  requireCase(caseId); identifier.parse(reviewerId);
  const row = reviewers.find(reviewer => reviewer.id === reviewerId);
  const demo = row ? findDemoReviewer(row) : undefined;
  return demo ? structuredClone(demo) : undefined;
}
export function parseReviewerList(text: string): { rows: ReviewerInput[]; errors: { line: number; text: string; message: string }[] } {
  z.string().max(30000, "Paste up to 30,000 characters.").parse(text);
  const rows: ReviewerInput[] = [], errors: { line: number; text: string; message: string }[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const fields = line.split(",").map(field => field.trim());
    const result = reviewerSchema.safeParse({ name: fields[0], institution: fields[1], identity: fields[2] ?? "" });
    if (fields.length < 2 || fields.length > 3) errors.push({ line: index + 1, text: line, message: "Use Name, Institution, ORCID (optional)." });
    else if (!result.success) errors.push({ line: index + 1, text: line, message: result.error.issues[0]?.message ?? "Invalid reviewer." });
    else if (rows.length >= 100) errors.push({ line: index + 1, text: line, message: "Add up to 100 reviewers at a time." });
    else rows.push(result.data);
  });
  return { rows, errors };
}