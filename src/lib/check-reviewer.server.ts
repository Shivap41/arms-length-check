import { z } from "zod";
import { fold, institutionMatches, shortId } from "./identity";
import { runRules, type Declaration, type Finding, type InstitutionRecord, type ResultValue, type RuleWork } from "./rules";
import { rulesConfig } from "./rules.config";
import { SourceError, type Employment } from "./sources.server";

// check-reviewer orchestration (B4): fetch through sources, run the pure rules, report stages.
// Any source error ends the check as "failed" with result null: never no_conflict or insufficient.

export type CheckStage = "publications" | "institutions" | "declarations";
export type CheckNotes = { durationMs: number; calls: { fresh: number; cached: number }; nameScan?: { covered: number; total: number }; sharedWorks?: number; failedAt?: CheckStage };
export type CheckStore = {
  stage(stage: CheckStage): Promise<void>;
  complete(outcome: { findings: Finding[]; result: ResultValue; reason: string; notes: CheckNotes }): Promise<void>;
  fail(error: string, notes: CheckNotes): Promise<void>;
};
type Page<T> = Promise<{ data: T }>;
export type CheckSources = {
  getAuthor(id: string): Page<unknown>;
  getSharedWorks(idsA: string[], idsB: string[]): Page<unknown[]>;
  getWorksByAuthor(id: string, options?: { fromDate?: string }): Promise<{ data: unknown[]; total: number }>;
  getOrcidEmployments(orcid: string): Page<Employment[]>;
  getInstitution(id: string): Page<unknown>;
};
export type CheckInput = {
  today: string;
  candidate: { profileIds: string[]; orcid: string | null };
  reviewer: { profileIds: string[]; typedName: string };
  declarations: Declaration[];
};

const institutionSchema = z.object({ id: z.string().nullish(), display_name: z.string().nullish(), type: z.string().nullish(), associated_institutions: z.array(z.object({ id: z.string().nullish(), type: z.string().nullish(), relationship: z.string().nullish() }).passthrough()).nullish() }).passthrough();
const authorSchema = z.object({
  id: z.string(), display_name: z.string(), orcid: z.string().nullish(), works_count: z.number().nullish(),
  affiliations: z.array(z.object({ institution: institutionSchema, years: z.array(z.number()).nullish() }).passthrough()).nullish(),
}).passthrough();
const workSchema = z.object({
  id: z.string(), doi: z.string().nullish(), title: z.string().nullish(), publication_year: z.number().nullish(), type: z.string().nullish(),
  primary_location: z.object({ source: z.object({ display_name: z.string().nullish() }).passthrough().nullish() }).passthrough().nullish(),
  authorships: z.array(z.object({
    author: z.object({ id: z.string().nullish(), display_name: z.string().nullish() }).passthrough(),
    raw_author_name: z.string().nullish(),
    institutions: z.array(institutionSchema).nullish(),
  }).passthrough()).nullish(),
}).passthrough();
type ParsedWork = z.infer<typeof workSchema>;

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new SourceError("Upstream");
  return parsed.data;
}
const instId = (id: string | null | undefined) => (id ? shortId(id) : null);
export function toRuleWork(work: ParsedWork): RuleWork {
  return {
    id: shortId(work.id), doi: work.doi ?? null, title: work.title ?? null, year: work.publication_year ?? null, type: work.type ?? "other",
    venue: work.primary_location?.source?.display_name ?? null,
    authors: (work.authorships ?? []).map(entry => ({ id: instId(entry.author.id), name: entry.author.display_name ?? entry.raw_author_name ?? "", rawName: entry.raw_author_name ?? null })),
  };
}

export const failureMessages: Record<SourceError["type"], string> = {
  Timeout: "Couldn't check: the data source took too long to respond",
  RateLimited: "Couldn't check: the data source is busy (rate limit)",
  BudgetOrAuth: "Couldn't check: the data source refused the request (API key or daily budget)",
  NotFound: "Couldn't check: a confirmed profile could not be found",
  Upstream: "Couldn't check: the data source didn't respond as expected",
  QuotaReached: "Live quota reached for today - showing cached results",
};

/** Byline institutions on the person's own authorships in works from the last N years. */
function bylineCurrent(works: ParsedWork[], profileIds: string[], fromYear: number): InstitutionRecord[] {
  const records = new Map<string, InstitutionRecord>();
  for (const work of works) {
    const year = work.publication_year ?? 0;
    if (year < fromYear) continue;
    for (const entry of work.authorships ?? []) {
      if (!entry.author.id || !profileIds.includes(shortId(entry.author.id))) continue;
      for (const inst of entry.institutions ?? []) {
        const key = instId(inst.id) ?? `name:${fold(inst.display_name ?? "")}`;
        const existing = records.get(key);
        if (existing) { if (!existing.years.includes(year)) existing.years.push(year); existing.source = `byline ${Math.max(...existing.years)}`; continue; }
        records.set(key, { id: instId(inst.id), name: inst.display_name ?? "", type: inst.type ?? null, years: [year], source: `byline ${year}` });
      }
    }
  }
  return [...records.values()];
}
function history(authors: z.infer<typeof authorSchema>[]): InstitutionRecord[] {
  return authors.flatMap(author => (author.affiliations ?? []).filter(entry => entry.years?.length).map(entry => ({
    id: instId(entry.institution.id), name: entry.institution.display_name ?? "", type: entry.institution.type ?? null, years: [...(entry.years ?? [])], source: "affiliation history",
  })));
}
/** Current ORCID employments, matched to an OpenAlex institution id by name where the person's own records allow. */
function orcidCurrent(employments: Employment[], known: InstitutionRecord[], thisYear: number): InstitutionRecord[] {
  return employments.filter(job => job.end_year === null).map(job => {
    const match = known.find(record => record.id && (fold(record.name) === fold(job.org) || institutionMatches(job.org, record.name)));
    return { id: match?.id ?? null, name: job.org, type: match?.type ?? null, years: [thisYear], source: "ORCID employment, current" };
  });
}

/** Runs one reviewer check. Never throws: every outcome is reported through the store. */
export async function runReviewerCheck(sources: CheckSources, store: CheckStore, input: CheckInput, metrics: { calls: () => { fresh: number; cached: number }; now?: () => number } ): Promise<{ status: "done"; result: ResultValue } | { status: "failed"; error: string; errorType: string }> {
  const now = metrics.now ?? Date.now;
  const started = now();
  let stage: CheckStage = "publications";
  const notes = (extra: Partial<CheckNotes> = {}): CheckNotes => ({ durationMs: now() - started, calls: metrics.calls(), ...extra });
  const thisYear = Number(input.today.slice(0, 4));
  try {
    if (!input.candidate.profileIds.length || !input.reviewer.profileIds.length) throw new Error("Identity not confirmed");
    // Stage 1: publications.
    await store.stage("publications");
    const [candidateAuthors, reviewerAuthors] = await Promise.all([
      Promise.all(input.candidate.profileIds.map(async id => parse(authorSchema, (await sources.getAuthor(id)).data))),
      Promise.all(input.reviewer.profileIds.map(async id => parse(authorSchema, (await sources.getAuthor(id)).data))),
    ]);
    const shared = (await sources.getSharedWorks(input.candidate.profileIds, input.reviewer.profileIds)).data.map(work => parse(workSchema, work));
    const candidatePages = await Promise.all(input.candidate.profileIds.map(id => sources.getWorksByAuthor(id)));
    const candidateWorks = [...new Map(candidatePages.flatMap(page => page.data.map(work => parse(workSchema, work))).map(work => [work.id, work])).values()];
    const candidateTotal = candidatePages.reduce((sum, page) => sum + page.total, 0);

    // Stage 2: institutions.
    stage = "institutions"; await store.stage("institutions");
    const fromYear = thisYear - rulesConfig.currentEvidenceYears;
    const reviewerRecent = (await Promise.all(input.reviewer.profileIds.map(id => sources.getWorksByAuthor(id, { fromDate: `${fromYear}-01-01` })))).flatMap(page => page.data.map(work => parse(workSchema, work)));
    const employments = async (orcid: string | null | undefined) => {
      if (!orcid) return [];
      try { return (await sources.getOrcidEmployments(orcid.replace(/^https:\/\/orcid\.org\//, ""))).data; }
      catch (error) { if (error instanceof SourceError && error.type === "NotFound") return []; throw error; }
    };
    const candidateHistory = history(candidateAuthors), reviewerHistory = history(reviewerAuthors);
    const candidateByline = bylineCurrent(candidateWorks, input.candidate.profileIds, fromYear);
    const reviewerByline = bylineCurrent(reviewerRecent, input.reviewer.profileIds, fromYear);
    const [candidateJobs, reviewerJobs] = await Promise.all([employments(input.candidate.orcid ?? candidateAuthors[0]?.orcid), employments(reviewerAuthors.find(author => author.orcid)?.orcid)]);
    const candidateCurrent = [...orcidCurrent(candidateJobs, [...candidateHistory, ...candidateByline], thisYear), ...candidateByline];
    const reviewerCurrent = [...orcidCurrent(reviewerJobs, [...reviewerHistory, ...reviewerByline], thisYear), ...reviewerByline];
    // Look up every institution both people share: its type, and whether it is an umbrella (D57).
    // A shared parent record (e.g. "University of California System") is an umbrella when BOTH people
    // also have records at its education-type children: then only those specific campuses or
    // institutes are compared. A campus that merely contains institutes (UC Berkeley containing the
    // Innovative Genomics Institute) still counts when only one side has the institute.
    const idsOf = (records: InstitutionRecord[]) => new Set(records.map(record => record.id).filter((id): id is string => Boolean(id)));
    const candidateRecordIds = idsOf([...candidateCurrent, ...candidateHistory]);
    const reviewerRecordIds = idsOf([...reviewerCurrent, ...reviewerHistory]);
    const candidateIds = new Set([...candidateCurrent, ...candidateHistory].map(record => record.id).filter(Boolean));
    const both = [...new Set([...reviewerCurrent, ...reviewerHistory].filter(record => record.id && candidateIds.has(record.id)).map(record => record.id as string))];
    const institutionTypes: Record<string, string | null> = {};
    const umbrellaInstitutionIds: string[] = [];
    for (const id of both) {
      const institution = parse(institutionSchema, (await sources.getInstitution(id)).data);
      institutionTypes[id] = institution.type ?? null;
      const educationChildren = (institution.associated_institutions ?? []).filter(entry => entry.relationship === "child" && entry.type === "education" && entry.id).map(entry => shortId(entry.id as string));
      if (educationChildren.some(child => candidateRecordIds.has(child)) && educationChildren.some(child => reviewerRecordIds.has(child))) umbrellaInstitutionIds.push(id);
    }

    // Stage 3: declarations, then the rules.
    stage = "declarations"; await store.stage("declarations");
    const output = runRules({
      today: input.today,
      candidate: { profileIds: input.candidate.profileIds, worksCount: candidateAuthors.reduce((sum, author) => sum + (author.works_count ?? 0), 0), current: candidateCurrent, history: candidateHistory, works: candidateWorks.map(toRuleWork), worksTotal: candidateTotal },
      reviewer: { profileIds: input.reviewer.profileIds, typedName: input.reviewer.typedName, profileNames: reviewerAuthors.map(author => author.display_name), worksCount: reviewerAuthors.reduce((sum, author) => sum + (author.works_count ?? 0), 0), current: reviewerCurrent, history: reviewerHistory },
      sharedWorks: shared.map(toRuleWork),
      institutionTypes,
      umbrellaInstitutionIds,
      declarations: input.declarations,
    });
    await store.complete({ findings: output.findings, result: output.result, reason: output.reason, notes: notes({ nameScan: output.nameScan, sharedWorks: shared.length }) });
    return { status: "done", result: output.result };
  } catch (error) {
    const message = error instanceof SourceError ? failureMessages[error.type] : error instanceof Error && error.message === "Identity not confirmed" ? "Couldn't check: identity not confirmed" : "Couldn't check: something went wrong";
    try { await store.fail(message, notes({ failedAt: stage })); } catch { /* the row stays "running"; the page offers Retry */ }
    return { status: "failed", error: message, errorType: error instanceof SourceError ? error.type : "Other" };
  }
}
