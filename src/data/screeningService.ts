import { z } from "zod";

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
export type CaseRecord = { id: string; title: string; candidate: string; subtitle: string; candidateConfirmed: boolean };
export type IdentityChoice = "confirmed" | "not-a-match" | "unsure";
export type ScreeningDecision = "invite" | "exclude" | "needs-review";
export type Screening = { id: string; caseId: string; reviewers: Reviewer[]; identityChoices: Record<string, IdentityChoice>; decisions: Record<string, ScreeningDecision> };

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
export function getCase(caseId: string): CaseRecord | undefined { return caseId === caseRecord.id ? { ...caseRecord } : undefined; }
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
  screenings.set(id, { id, caseId, reviewers: listReviewers(caseId), identityChoices: {}, decisions: {} });
  return id;
}
export function getScreening(screeningId: string): Screening | undefined {
  identifier.parse(screeningId);
  const screening = screenings.get(screeningId);
  return screening ? { ...screening, reviewers: screening.reviewers.map(row => ({ ...row })), identityChoices: { ...screening.identityChoices }, decisions: { ...screening.decisions } } : undefined;
}
function requireScreening(screeningId: string, nameId: string) {
  browserOnly(); identifier.parse(screeningId); identifier.parse(nameId);
  const screening = screenings.get(screeningId);
  if (!screening || !screening.reviewers.some(row => row.id === nameId)) throw new Error("Reviewer not found in this screening.");
  return screening;
}
export function confirmIdentity(screeningId: string, nameId: string, choice: IdentityChoice): void { const screening = requireScreening(screeningId, nameId); screening.identityChoices[nameId] = z.enum(["confirmed", "not-a-match", "unsure"]).parse(choice); }
export function recordDecision(screeningId: string, nameId: string, decision: ScreeningDecision): void { const screening = requireScreening(screeningId, nameId); screening.decisions[nameId] = z.enum(["invite", "exclude", "needs-review"]).parse(decision); }
export function loadDemoReviewers(caseId: string): { loaded: boolean; message: string } { requireCase(caseId); return { loaded: false, message: "Demo list is not available yet. Demo data will be supplied in the next prompt." }; }
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