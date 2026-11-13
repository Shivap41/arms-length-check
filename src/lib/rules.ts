import { fold, nameMatches } from "./identity";
import { rulesConfig, type RulesConfig } from "./rules.config";

// The rules engine (B4). PURE: inputs are already-fetched data plus "today"; no network, no clock.

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "LARGE_TEAM" | "NAME_ONLY" | "SAME_NAME_OTHER_PERSON";
export type Severity = "conflict" | "potential" | "info";
export type ResultValue = "conflict" | "potential" | "insufficient" | "no_conflict";

export type RuleAuthor = { id: string | null; name: string; rawName?: string | null };
export type RuleWork = { id: string; doi: string | null; title: string | null; year: number | null; type: string; venue: string | null; authors: RuleAuthor[] };
/** One institution record for one person. id is the OpenAlex institution id when known. */
export type InstitutionRecord = { id: string | null; name: string; type: string | null; years: number[]; source: string };
export type PersonFacts = {
  profileIds: string[];
  /** Total works on the person's confirmed profiles (OpenAlex works_count). */
  worksCount: number;
  /** ORCID employments with no end year, plus byline institutions from recent works. Never "last known" alone. */
  current: InstitutionRecord[];
  /** Affiliation history with years. */
  history: InstitutionRecord[];
};
export type Declaration = { name: string; relationship: "advisor" | "mentor" | "student" | "co_supervisor" | "personal" | "financial"; note: string | null };
export type RulesInput = {
  /** ISO date, e.g. "2026-11-13". The only notion of time the rules have. */
  today: string;
  candidate: PersonFacts & {
    /** Candidate works fetched for the name scan and co-authorship share. */
    works: RuleWork[];
    /** How many works the candidate has in total for that scan (may exceed works.length). */
    worksTotal: number;
  };
  reviewer: PersonFacts & { typedName: string; profileNames: string[] };
  sharedWorks: RuleWork[];
  /** Institution types looked up by id (education, funder, facility, ...). */
  institutionTypes: Record<string, string | null>;
  declarations: Declaration[];
};

export type WorkEvidence = { title: string; year: number | null; doi: string | null; venue: string | null; author_count: number; profile_id: string | null };
export type Finding = { rule: RuleId; severity: Severity; evidence: Record<string, unknown> };
export type RulesOutput = { findings: Finding[]; result: ResultValue; reason: string; nameScan: { covered: number; total: number } };

const normaliseTitle = (title: string | null) => fold(title ?? "").replace(/[^a-z0-9]/g, "");
const yearOf = (today: string) => Number(today.slice(0, 4));

function workEvidence(work: RuleWork, profileIds: string[]): WorkEvidence {
  return { title: work.title ?? "Untitled", year: work.year, doi: work.doi, venue: work.venue, author_count: work.authors.length, profile_id: work.authors.find(author => author.id && profileIds.includes(author.id))?.id ?? null };
}

/** Counted types only; a preprint is dropped when a non-preprint shared work has the same normalised title. */
export function countedSharedWorks(works: RuleWork[], config: RulesConfig = rulesConfig): RuleWork[] {
  const unique = [...new Map(works.map(work => [work.id, work])).values()].filter(work => (config.countedWorkTypes as readonly string[]).includes(work.type));
  const published = new Set(unique.filter(work => work.type !== "preprint").map(work => normaliseTitle(work.title)));
  return unique.filter(work => work.type !== "preprint" || !published.has(normaliseTitle(work.title)));
}

/** Stage 1: shared works (R1, R2, LARGE_TEAM) and the name scan (NAME_ONLY, SAME_NAME_OTHER_PERSON). */
export function publicationFindings(input: RulesInput, config: RulesConfig = rulesConfig): Finding[] {
  const thisYear = yearOf(input.today);
  const reviewerIds = input.reviewer.profileIds;
  const shared = countedSharedWorks(input.sharedWorks, config);
  const largeTeam = shared.filter(work => work.authors.length > config.largeTeamAuthors);
  const small = shared.filter(work => work.authors.length <= config.largeTeamAuthors);
  const recent = small.filter(work => work.year !== null && work.year >= thisYear - config.recentYears);
  const older = small.filter(work => !recent.includes(work));
  const byYear = (a: RuleWork, b: RuleWork) => (b.year ?? 0) - (a.year ?? 0);
  const findings: Finding[] = [];
  if (recent.length) findings.push({ rule: "R1", severity: "conflict", evidence: { works: recent.sort(byYear).map(work => workEvidence(work, reviewerIds)), since: thisYear - config.recentYears } });
  if (older.length) findings.push({ rule: "R2", severity: "potential", evidence: { works: older.sort(byYear).map(work => workEvidence(work, reviewerIds)), before: thisYear - config.recentYears } });
  if (largeTeam.length) findings.push({ rule: "LARGE_TEAM", severity: "potential", evidence: { works: largeTeam.sort(byYear).map(work => workEvidence(work, reviewerIds)), more_than_authors: config.largeTeamAuthors } });

  // Name scan over the candidate's works: the reviewer's name on a byline that is not one of their profiles.
  const sharedIds = new Set(input.sharedWorks.map(work => work.id));
  const names = [input.reviewer.typedName, ...input.reviewer.profileNames];
  const otherPerson: { work: RuleWork; authorId: string; name: string }[] = [];
  const nameOnly: { work: RuleWork; name: string }[] = [];
  for (const work of input.candidate.works) {
    if (sharedIds.has(work.id) || !(config.countedWorkTypes as readonly string[]).includes(work.type)) continue;
    for (const author of work.authors) {
      if (author.id && (input.candidate.profileIds.includes(author.id) || reviewerIds.includes(author.id))) continue;
      const bylineNames = [author.name, author.rawName ?? ""].filter(Boolean);
      if (!bylineNames.some(byline => names.some(name => nameMatches(name, byline)))) continue;
      if (author.id) otherPerson.push({ work, authorId: author.id, name: author.name });
      else nameOnly.push({ work, name: author.rawName || author.name });
      break;
    }
  }
  const nameScan = { covered: input.candidate.works.length, total: Math.max(input.candidate.worksTotal, input.candidate.works.length) };
  if (nameOnly.length) findings.push({ rule: "NAME_ONLY", severity: "potential", evidence: { works: nameOnly.map(entry => ({ ...workEvidence(entry.work, []), byline: entry.name })), name_scan: nameScan, note: "Same name on a shared paper; check it's this person" } });
  if (otherPerson.length) findings.push({ rule: "SAME_NAME_OTHER_PERSON", severity: "info", evidence: { works: otherPerson.slice(0, config.sameNameListed).map(entry => ({ ...workEvidence(entry.work, []), byline: entry.name, other_author_id: entry.authorId })), total: otherPerson.length, name_scan: nameScan } });
  return findings;
}

function sameInstitution(a: InstitutionRecord, b: InstitutionRecord): boolean {
  if (a.id && b.id) return a.id === b.id;
  return Boolean(fold(a.name)) && fold(a.name) === fold(b.name);
}
function institutionType(a: InstitutionRecord, b: InstitutionRecord, types: Record<string, string | null>): string | null {
  return (a.id ? types[a.id] ?? a.type : a.type) ?? (b.id ? types[b.id] ?? b.type : b.type) ?? null;
}
function institutionKey(a: InstitutionRecord, b: InstitutionRecord): string { return a.id ?? b.id ?? `name:${fold(a.name)}`; }

/** Stage 2: education institutions only. R3 needs current evidence on both sides; else R4 for overlapping history within the window. */
export function institutionFindings(input: RulesInput, config: RulesConfig = rulesConfig): Finding[] {
  const thisYear = yearOf(input.today);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const c of input.candidate.current) for (const r of input.reviewer.current) {
    if (!sameInstitution(c, r) || institutionType(c, r, input.institutionTypes) !== "education") continue;
    const key = institutionKey(c, r);
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ rule: "R3", severity: "conflict", evidence: { institution: { name: c.name || r.name, candidate_years: c.years, reviewer_years: r.years, candidate_source: c.source, reviewer_source: r.source } } });
  }
  for (const c of input.candidate.history) for (const r of input.reviewer.history) {
    if (!sameInstitution(c, r) || institutionType(c, r, input.institutionTypes) !== "education") continue;
    const key = institutionKey(c, r);
    if (seen.has(key)) continue;
    const overlap = c.years.filter(year => r.years.includes(year));
    if (!overlap.length || Math.max(...overlap) < thisYear - config.pastInstitutionYears) continue;
    seen.add(key);
    findings.push({ rule: "R4", severity: "potential", evidence: { institution: { name: c.name || r.name, candidate_years: c.years, reviewer_years: r.years, overlap: [Math.min(...overlap), Math.max(...overlap)], candidate_source: c.source, reviewer_source: r.source } } });
  }
  return findings;
}

function sameFullName(a: string, b: string): boolean {
  const x = fold(a).split(" ").filter(Boolean), y = fold(b).split(" ").filter(Boolean);
  return x.length >= 2 && y.length >= 2 && x[0] === y[0] && x.at(-1) === y.at(-1);
}
/** Stage 3: a declaration naming the reviewer (same first name and surname, accent-insensitive). */
export function declarationFindings(input: RulesInput): Finding[] {
  const names = [input.reviewer.typedName, ...input.reviewer.profileNames];
  return input.declarations.filter(declaration => names.some(name => sameFullName(declaration.name, name))).map(declaration => ({
    rule: ["advisor", "mentor", "student", "co_supervisor"].includes(declaration.relationship) ? "R5" as const : "R6" as const,
    severity: "conflict" as const,
    evidence: { declaration: { name: declaration.name, relationship: declaration.relationship, note: declaration.note } },
  }));
}

const ruleLabels: Record<RuleId, string> = {
  R1: "recent co-authored work", R2: "older co-authored work", R3: "same current institution", R4: "same past institution",
  R5: "declared academic relationship", R6: "declared personal or financial tie", LARGE_TEAM: "large-team paper",
  NAME_ONLY: "same name on a candidate paper", SAME_NAME_OTHER_PERSON: "same name, different person",
};
/** One phrase per rule: work counts for publication rules, institution or declared names otherwise. */
function describe(findings: Finding[]): string {
  const rules = [...new Set(findings.map(finding => finding.rule))];
  return rules.map(rule => {
    const group = findings.filter(finding => finding.rule === rule);
    const works = group.reduce((sum, finding) => sum + ((finding.evidence["works"] as unknown[] | undefined)?.length ?? 0), 0);
    const names = group.map(finding => (finding.evidence["institution"] as { name?: string } | undefined)?.name ?? (finding.evidence["declaration"] as { name?: string } | undefined)?.name).filter(Boolean);
    return works ? `${ruleLabels[rule]} (${works}, ${rule})` : names.length ? `${ruleLabels[rule]}: ${names.join(", ")} (${rule})` : `${ruleLabels[rule]} (${rule})`;
  }).join("; ");
}

/** Result from findings, then the data-sufficiency checks. */
export function decideResult(input: RulesInput, findings: Finding[], config: RulesConfig = rulesConfig): { result: ResultValue; reason: string } {
  const conflicts = findings.filter(finding => finding.severity === "conflict");
  if (conflicts.length) return { result: "conflict", reason: describe(conflicts) };
  const potentials = findings.filter(finding => finding.severity === "potential");
  if (potentials.length) return { result: "potential", reason: describe(potentials) };
  if (input.candidate.worksCount < config.minWorks || input.reviewer.worksCount < config.minWorks) return { result: "insufficient", reason: "Not enough publication data" };
  const multiAuthor = input.candidate.works.filter(work => work.authors.length > 1).length;
  const share = input.candidate.works.length ? multiAuthor / input.candidate.works.length : 0;
  if (share < config.minCoauthoredShare) return { result: "insufficient", reason: "Publication data says little for this candidate" };
  return { result: "no_conflict", reason: "No shared works, shared institutions or declarations found" };
}

/** All three stages and the result. */
export function runRules(input: RulesInput, config: RulesConfig = rulesConfig): RulesOutput {
  const findings = [...publicationFindings(input, config), ...institutionFindings(input, config), ...declarationFindings(input)];
  const nameScan = { covered: input.candidate.works.length, total: Math.max(input.candidate.worksTotal, input.candidate.works.length) };
  const decided = decideResult(input, findings, config);
  // Never scan part of the candidate's works silently.
  const reason = nameScan.covered < nameScan.total ? `${decided.reason} (name scan covered ${nameScan.covered} of ${nameScan.total} works)` : decided.reason;
  return { findings, result: decided.result, reason, nameScan };
}
