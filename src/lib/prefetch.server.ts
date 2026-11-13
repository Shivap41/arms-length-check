import { SourceError } from "./sources.server";

// D58: warm the cache with everything a reviewer check needs about the candidate, as soon as the
// candidate is confirmed. Uses the same source calls (same cache keys) as check-reviewer, and the
// same screening id, so a reviewer check that starts mid-prefetch joins the in-flight requests
// instead of repeating them. Best effort: a failure here never marks anything; each reviewer check
// still fetches (and reports errors) on its own.

export type PrefetchSources = {
  getAuthor(id: string): Promise<unknown>;
  getWorksByAuthor(id: string): Promise<{ data: unknown[]; total: number }>;
  getOrcidEmployments(orcid: string): Promise<unknown>;
};
export type PrefetchResult = { ok: true; works: number; total: number; durationMs: number } | { ok: false; error: string; durationMs: number };

export async function prefetchCandidateCore(sources: PrefetchSources, candidate: { profileIds: string[]; orcid: string | null }, now: () => number = Date.now): Promise<PrefetchResult> {
  const started = now();
  try {
    const [, pages] = await Promise.all([
      Promise.all(candidate.profileIds.map(id => sources.getAuthor(id))),
      Promise.all(candidate.profileIds.map(id => sources.getWorksByAuthor(id))),
      candidate.orcid ? sources.getOrcidEmployments(candidate.orcid.replace(/^https:\/\/orcid\.org\//, "")).catch(error => { if (error instanceof SourceError && error.type === "NotFound") return null; throw error; }) : Promise.resolve(null),
    ]);
    return { ok: true, works: pages.reduce((sum, page) => sum + page.data.length, 0), total: pages.reduce((sum, page) => sum + page.total, 0), durationMs: now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof SourceError ? error.type : "Other", durationMs: now() - started };
  }
}
