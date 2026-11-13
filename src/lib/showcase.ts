import { parseProfileLink } from "./identity";

// D59 public showcase. Pure configuration and allowlists, shared by the server and the browser.
// Without the access code, the server only accepts the preset live example below.

export const SHOWCASE_LIMITS = {
  /** Global cap on fresh (uncached) OpenAlex calls per UTC day. */
  dailyFreshCalls: 300,
  /** Per-visitor rate limit on showcase server calls. */
  visitorCalls: 120,
  visitorWindowSeconds: 3600,
} as const;

export const QUOTA_MESSAGE = "Live quota reached for today - showing cached results";
export const VISITOR_LIMIT_MESSAGE = "Too many requests from this visitor. Try again in a few minutes.";
export const DISCLAIMER = "Independent concept on public research data; not affiliated with Interfolio or Elsevier.";
export const ABOUT_URL = "https://shivaprasadpidishetti.com/arms-length-check";

export type ShowcasePerson = { name: string; institution: string; orcid: string };
export const EXAMPLE_CANDIDATE: ShowcasePerson & { profileId: string } = { name: "Jennifer Doudna", institution: "University of California, Berkeley", orcid: "0000-0001-9161-999X", profileId: "A5067184382" };
/** The preset reviewers, typed without ORCIDs as a chair would. Watters is confirmed by pasting his ORCID. */
export const EXAMPLE_REVIEWERS: (ShowcasePerson & { hint: string })[] = [
  { name: "Gavin Knott", institution: "Monash University", orcid: "", hint: "Pick the Monash card." },
  { name: "Jill Banfield", institution: "University of California, Berkeley", orcid: "", hint: "Pick the Berkeley card." },
  { name: "Kyle Watters", institution: "Arbor Biotechnologies", orcid: "", hint: "No card shows Arbor: paste his ORCID 0000-0001-6858-6632." },
  { name: "Nicola Osborne", institution: "University of Edinburgh", orcid: "", hint: "Pick the Edinburgh card." },
  { name: "Jennifer Hamilton", institution: "University of Canterbury", orcid: "", hint: "Pick the Canterbury card (a namesake of a Doudna co-author)." },
];
export const WATTERS_ORCID = "0000-0001-6858-6632";
/** OpenAlex profiles the preset reviewers' cards (and Watters's ORCID) can resolve to. */
export const EXAMPLE_REVIEWER_PROFILES: Record<string, string[]> = {
  "Gavin Knott": ["A5007230579"],
  "Jill Banfield": ["A5045720453"],
  "Kyle Watters": ["A5031409953", "A5111534515", "A5046470590"],
  "Nicola Osborne": ["A5039109109", "A5040653017", "A5085747789"],
  "Jennifer Hamilton": ["A5054714351", "A5032531829", "A5057498745"],
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Identify without a code: only the example candidate (by ORCID) or a preset reviewer (no ORCID). */
export function exampleAllowsIdentify(input: { typedName: string; typedInstitution: string; typedOrcid?: string | null | undefined }): boolean {
  const orcid = input.typedOrcid?.trim() ?? "";
  if (same(input.typedName, EXAMPLE_CANDIDATE.name) && same(input.typedInstitution, EXAMPLE_CANDIDATE.institution)) return orcid === EXAMPLE_CANDIDATE.orcid;
  return !orcid && EXAMPLE_REVIEWERS.some(reviewer => same(reviewer.name, input.typedName) && same(reviewer.institution, input.typedInstitution));
}
/** Resolve a pasted link without a code: Watters's ORCID or one of the example profiles. */
export function exampleAllowsResolve(link: string): boolean {
  const parsed = parseProfileLink(link);
  if (!parsed.ok) return true; // malformed input never reaches OpenAlex; the inline error is the answer
  const target = parsed.link;
  if (target.kind === "orcid") return target.orcid === WATTERS_ORCID;
  return Object.values(EXAMPLE_REVIEWER_PROFILES).some(ids => ids.includes(target.id));
}
/** Prefetch without a code: the example candidate only. */
export function exampleAllowsPrefetch(profileIds: string[]): boolean {
  return profileIds.length === 1 && profileIds[0] === EXAMPLE_CANDIDATE.profileId;
}
/** Check without a code: the example candidate and a preset reviewer confirmed as one of their example profiles. */
export function exampleAllowsCheck(input: { candidateProfileIds: string[]; reviewerProfileIds: string[]; reviewerName: string }): boolean {
  if (!exampleAllowsPrefetch(input.candidateProfileIds)) return false;
  const allowed = Object.entries(EXAMPLE_REVIEWER_PROFILES).find(([name]) => same(name, input.reviewerName))?.[1];
  return Boolean(allowed && input.reviewerProfileIds.length >= 1 && input.reviewerProfileIds.length <= 2 && input.reviewerProfileIds.every(id => allowed.includes(id)));
}
