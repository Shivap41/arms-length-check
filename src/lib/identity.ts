import { z } from "zod";

// Pure identity helpers (B3). Shared by server functions and the browser; no network calls.

const ORCID_SHAPE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/** ISO 7064 mod 11-2 check digit for the first 15 digits of an ORCID iD. */
export function orcidCheckDigit(first15: string): string {
  let total = 0;
  for (const char of first15) total = (total + Number(char)) * 2;
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? "X" : String(result);
}

/** True when the ORCID iD has the 0000-0000-0000-000X shape and a correct check digit. */
export function isValidOrcid(orcid: string): boolean {
  if (!ORCID_SHAPE.test(orcid)) return false;
  const digits = orcid.replace(/-/g, "");
  return orcidCheckDigit(digits.slice(0, 15)) === digits[15];
}

export type ProfileLink = { kind: "orcid"; orcid: string } | { kind: "openalex"; id: string };
export type ProfileLinkResult = { ok: true; link: ProfileLink } | { ok: false; error: string };
export const PROFILE_LINK_HELP = "Enter an ORCID iD (0000-0000-0000-000X) or an openalex.org author link.";
export const ORCID_CHECK_DIGIT_ERROR = "That ORCID iD's check digit is wrong. Check it for a typo.";

/** Reads an ORCID iD (bare or orcid.org URL) or an OpenAlex author id / URL. */
export function parseProfileLink(input: string): ProfileLinkResult {
  const value = input.trim();
  if (!value || value.length > 500) return { ok: false, error: PROFILE_LINK_HELP };
  const orcidMatch = /^(?:https?:\/\/(?:www\.)?orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])\/?$/.exec(value);
  if (orcidMatch?.[1]) {
    const orcid = orcidMatch[1].toUpperCase();
    return isValidOrcid(orcid) ? { ok: true, link: { kind: "orcid", orcid } } : { ok: false, error: ORCID_CHECK_DIGIT_ERROR };
  }
  const openAlexMatch = /^(?:https?:\/\/(?:www\.|api\.)?openalex\.org\/(?:authors\/|people\/)?)?(A\d{4,12})\/?$/i.exec(value);
  if (openAlexMatch?.[1]) return { ok: true, link: { kind: "openalex", id: openAlexMatch[1].toUpperCase() } };
  return { ok: false, error: PROFILE_LINK_HELP };
}

/** Drops trailing single-letter name parts ("Kyle E" -> "Kyle", "Smith J." -> "Smith"). */
export function stripTrailingInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  while (parts.length > 1 && /^\p{L}\.?$/u.test(parts.at(-1) ?? "")) parts.pop();
  return z.string().min(1).max(200).parse(parts.join(" "));
}

/** Lower-case, accent-free, punctuation-light text for comparisons. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[.,'’]/g, " ").replace(/\s+/g, " ").trim();
}

function nameTokens(name: string): string[] {
  const value = name.includes(",") ? name.split(",").reverse().join(" ") : name; // "Knott, Gavin"
  return fold(value).split(" ").filter(Boolean);
}
function firstAgrees(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  return false;
}
/** Same surname exactly, and the first name or its initial agrees. */
export function nameMatches(typed: string, candidate: string): boolean {
  const a = nameTokens(stripTrailingInitials(typed));
  const b = nameTokens(candidate);
  if (a.length < 2 || b.length < 2) return false;
  return a.at(-1) === b.at(-1) && firstAgrees(a[0] ?? "", b[0] ?? "");
}

/** Case- and accent-insensitive contains match, either way round. */
export function institutionMatches(typed: string, institution: string): boolean {
  const a = fold(typed), b = fold(institution);
  return Boolean(a && b) && (a.includes(b) || b.includes(a));
}

const institutionSchema = z.object({ id: z.string().nullish(), display_name: z.string().nullish() }).passthrough();
export const openAlexAuthorSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  display_name_alternatives: z.array(z.string()).nullish(),
  orcid: z.string().nullish(),
  works_count: z.number().nullish(),
  last_known_institutions: z.array(institutionSchema).nullish(),
  affiliations: z.array(z.object({ institution: institutionSchema, years: z.array(z.number()).nullish() }).passthrough()).nullish(),
  topics: z.array(z.object({ display_name: z.string() }).passthrough()).nullish(),
}).passthrough();
export type OpenAlexAuthor = z.infer<typeof openAlexAuthorSchema>;

export type MatchScore = { score: number; name: boolean; institution: boolean; manyWorks: boolean };
/** B3 scoring: 0.5 name, 0.4 typed institution in any current or past affiliation, 0.1 for 20+ works. */
export function scoreAuthor(typedName: string, typedInstitution: string, author: OpenAlexAuthor): MatchScore {
  const names = [author.display_name, ...(author.display_name_alternatives ?? [])];
  const name = names.some(candidate => nameMatches(typedName, candidate));
  const institutions = [...(author.last_known_institutions ?? []), ...(author.affiliations ?? []).map(entry => entry.institution)]
    .map(entry => entry.display_name ?? "").filter(Boolean);
  const institution = institutions.some(entry => institutionMatches(typedInstitution, entry));
  const manyWorks = (author.works_count ?? 0) >= 20;
  const score = Math.round(((name ? 0.5 : 0) + (institution ? 0.4 : 0) + (manyWorks ? 0.1 : 0)) * 10) / 10;
  return { score, name, institution, manyWorks };
}

/** Highest score first; ties go to the profile with more works. */
export function rankAuthors(typedName: string, typedInstitution: string, authors: OpenAlexAuthor[], limit = 3) {
  return authors
    .map(author => ({ author, match: scoreAuthor(typedName, typedInstitution, author) }))
    .sort((a, b) => b.match.score - a.match.score || (b.author.works_count ?? 0) - (a.author.works_count ?? 0))
    .slice(0, limit);
}

export type RecentWork = { title: string; year: number | null; doi: string | null };
export type LiveProfile = {
  id: string; displayName: string; orcid: string | null;
  currentInstitutions: string[];
  pastAffiliations: { institution: string; fromYear: number; toYear: number }[];
  topics: string[]; worksCount: number; recentWorks: RecentWork[];
};
export type LiveProfileOption = LiveProfile & { match: MatchScore };

export function shortId(id: string): string { return id.replace(/^https:\/\/openalex\.org\//, ""); }
export function shortOrcid(orcid: string | null | undefined): string | null { return orcid ? orcid.replace(/^https:\/\/orcid\.org\//, "") : null; }

/** Card summary: id, name, ORCID, current institutions, up to 5 past affiliations, top 3 topics, works, 3 recent works. */
export function toLiveProfile(author: OpenAlexAuthor, recentWorks: RecentWork[]): LiveProfile {
  const current = (author.last_known_institutions ?? []).map(entry => entry.display_name ?? "").filter(Boolean);
  const past = (author.affiliations ?? [])
    .map(entry => ({ institution: entry.institution.display_name ?? "", years: entry.years ?? [] }))
    .filter(entry => entry.institution && entry.years.length && !current.includes(entry.institution))
    .map(entry => ({ institution: entry.institution, fromYear: Math.min(...entry.years), toYear: Math.max(...entry.years) }))
    .sort((a, b) => b.toYear - a.toYear || b.fromYear - a.fromYear)
    .slice(0, 5);
  return {
    id: shortId(author.id), displayName: author.display_name, orcid: shortOrcid(author.orcid),
    currentInstitutions: current, pastAffiliations: past,
    topics: (author.topics ?? []).slice(0, 3).map(topic => topic.display_name),
    worksCount: author.works_count ?? 0, recentWorks: recentWorks.slice(0, 3),
  };
}

// Results the identify server function returns. "error" is never an empty list.
export type IdentifyResult =
  | { status: "confirmed"; method: "orcid"; profile: LiveProfile }
  | { status: "insufficient"; reason: string }
  | { status: "invalid"; error: string }
  | { status: "needs_chair"; options: LiveProfileOption[] }
  | { status: "error"; error: string };
export type ResolveResult = { ok: true; profile: LiveProfile } | { ok: false; error: string };
export const SEARCH_FAILED_MESSAGE = "Couldn't search: try again";
export const NO_INDEXED_WORKS = "No indexed works for this ORCID";
