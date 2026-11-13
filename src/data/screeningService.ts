import { z } from "zod";
import { demoScenario, demoChoiceKey, type DemoAnswer, type DemoResult, type DemoReviewer, type DemoScenario } from "./demoScenario";

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
export type CaseRecord = { id: string; title: string; candidate: string; subtitle: string; candidateConfirmed: boolean; candidateProfile?: DemoScenario["candidate"] };
export type IdentityChoice = "confirmed" | "not-a-match" | "unsure" | DemoAnswer;
export type ScreeningDecision = "invite" | "exclude" | "needs-review";
export type Screening = { id: string; caseId: string; reviewers: Reviewer[]; identityChoices: Record<string, IdentityChoice>; decisions: Record<string, ScreeningDecision>; results: Record<string, DemoResult> };

// Browser-session memory only; no storage, network calls, or server mutations.
const caseRecord: CaseRecord = { id: "ortiz-2027", title: "Tenure review — Dr. Maya Ortiz", candidate: "Dr. Maya Ortiz", subtitle: "Associate Professor of Chemistry → Professor with tenure · Northbridge University · Cycle 2026–27", candidateConfirmed: false };
let reviewers: Reviewer[] = [];
const screenings = new Map<string, Screening>();
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
export function startScreening(caseId: string): string {
  browserOnly(); requireCase(caseId);
  if (!canStartScreening(reviewers.length, caseRecord.candidateConfirmed)) throw new Error("Add a reviewer and confirm the candidate before checking for conflicts.");
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
  screenings.set(id, { id, caseId, reviewers: selectedReviewers, identityChoices, decisions: {}, results });
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
]);
function findDemoReviewer(row: Reviewer): DemoReviewer | undefined {
  return demoScenario.reviewers.find(demo => demo.id === row.id && demo.typedName === row.name && demo.typedInstitution === row.institution);
}
function resolveDemoResult(demo: DemoReviewer, answer: DemoAnswer): DemoResult {
  const key = answer.action === "select-profiles" ? demoChoiceKey(answer.profileIds) : answer.action === "paste-orcid" ? `orcid:${answer.orcid}` : "cant-tell";
  const result = demo.resultsByChoice[key] ?? (answer.action === "paste-orcid" ? demo.resultsByChoice["cant-tell"] : demo.resultsByChoice["wrong-pick"]);
  if (!result) throw new Error("Demo outcome unavailable.");
  return structuredClone(result);
}
export function confirmIdentity(screeningId: string, nameId: string, choice: IdentityChoice): void {
  const screening = requireScreening(screeningId, nameId);
  const parsed = z.union([z.enum(["confirmed", "not-a-match", "unsure"]), demoAnswerSchema]).parse(choice);
  const row = screening.reviewers.find(reviewer => reviewer.id === nameId);
  const demo = row ? findDemoReviewer(row) : undefined;
  if (demo) {
    const answer = typeof parsed === "string" ? parsed === "confirmed" && demo.autoConfirmed ? demo.correctAnswer : { action: "cant-tell" as const } : parsed;
    if (answer.action === "select-profiles" && answer.profileIds.some(id => !demo.options.some(profile => profile.id === id))) throw new Error("Choose a profile offered for this reviewer.");
    screening.results[nameId] = resolveDemoResult(demo, answer);
  }
  screening.identityChoices[nameId] = structuredClone(parsed);
}
export function recordDecision(screeningId: string, nameId: string, decision: ScreeningDecision): void { const screening = requireScreening(screeningId, nameId); screening.decisions[nameId] = z.enum(["invite", "exclude", "needs-review"]).parse(decision); }
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