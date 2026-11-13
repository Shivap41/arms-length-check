import { describe, expect, it, vi } from "vitest";
import { EXAMPLE_CANDIDATE, EXAMPLE_REVIEWERS, exampleAllowsCheck, exampleAllowsIdentify, exampleAllowsPrefetch, exampleAllowsResolve, QUOTA_MESSAGE } from "./showcase";
import { createSources, SourceError, type SourceCache } from "./sources.server";
import { failureMessages, runReviewerCheck } from "./check-reviewer.server";

describe("D59 live example allowlist (no access code)", () => {
  it("allows the preset candidate by ORCID and the five preset reviewers without ORCIDs", () => {
    expect(exampleAllowsIdentify({ typedName: EXAMPLE_CANDIDATE.name, typedInstitution: EXAMPLE_CANDIDATE.institution, typedOrcid: EXAMPLE_CANDIDATE.orcid })).toBe(true);
    for (const reviewer of EXAMPLE_REVIEWERS) expect(exampleAllowsIdentify({ typedName: reviewer.name, typedInstitution: reviewer.institution })).toBe(true);
  });
  it("refuses anyone else, or a preset name with a different institution or an ORCID", () => {
    expect(exampleAllowsIdentify({ typedName: "Carolyn Bertozzi", typedInstitution: "Stanford University", typedOrcid: "0000-0003-4482-2754" })).toBe(false);
    expect(exampleAllowsIdentify({ typedName: "Gavin Knott", typedInstitution: "Harvard University" })).toBe(false);
    expect(exampleAllowsIdentify({ typedName: "Gavin Knott", typedInstitution: "Monash University", typedOrcid: "0000-0002-9007-6273" })).toBe(false);
    expect(exampleAllowsIdentify({ typedName: EXAMPLE_CANDIDATE.name, typedInstitution: EXAMPLE_CANDIDATE.institution })).toBe(false);
  });
  it("resolves only Watters's ORCID or an example profile; malformed input never reaches OpenAlex anyway", () => {
    expect(exampleAllowsResolve("0000-0001-6858-6632")).toBe(true);
    expect(exampleAllowsResolve("https://openalex.org/A5007230579")).toBe(true);
    expect(exampleAllowsResolve("0000-0002-1825-0097")).toBe(false);
    expect(exampleAllowsResolve("https://openalex.org/A123456789")).toBe(false);
  });
  it("prefetches and checks only the Doudna example with each reviewer's own example profiles", () => {
    expect(exampleAllowsPrefetch(["A5067184382"])).toBe(true);
    expect(exampleAllowsPrefetch(["A5088409133"])).toBe(false);
    expect(exampleAllowsCheck({ candidateProfileIds: ["A5067184382"], reviewerProfileIds: ["A5007230579"], reviewerName: "Gavin Knott" })).toBe(true);
    expect(exampleAllowsCheck({ candidateProfileIds: ["A5067184382"], reviewerProfileIds: ["A5031409953"], reviewerName: "Kyle Watters" })).toBe(true);
    expect(exampleAllowsCheck({ candidateProfileIds: ["A5067184382"], reviewerProfileIds: ["A5045720453"], reviewerName: "Gavin Knott" })).toBe(false);
    expect(exampleAllowsCheck({ candidateProfileIds: ["A5088409133"], reviewerProfileIds: ["A5007230579"], reviewerName: "Gavin Knott" })).toBe(false);
  });
});

describe("D59 daily quota on fresh OpenAlex calls", () => {
  function cache(): SourceCache { const rows = new Map<string, { body: unknown; fetchedAt: string }>(); return { read: async key => rows.get(key) ?? null, write: async (key, body, fetchedAt) => { rows.set(key, { body, fetchedAt }); } }; }
  it("refuses a fresh call with QuotaReached but still serves cached results", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: "https://openalex.org/A1", display_name: "Test" }));
    const shared = cache();
    let allow = true;
    const sources = createSources({ apiKey: "test-only", cache: shared, screeningId: "quota", fetch: fetcher, beforeFresh: async () => { if (!allow) throw new SourceError("QuotaReached"); } });
    await sources.getAuthor("A1");
    allow = false;
    await expect(sources.getAuthor("A2")).rejects.toMatchObject({ type: "QuotaReached" });
    await expect(sources.getAuthor("A1")).resolves.toMatchObject({ fromCache: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("a check that hits the quota fails with the quota message, never a result", async () => {
    expect(failureMessages.QuotaReached).toBe(QUOTA_MESSAGE);
    let status = "running", result: string | null = null;
    const outcome = await runReviewerCheck({
      getAuthor: async () => { throw new SourceError("QuotaReached"); }, getSharedWorks: async () => ({ data: [] }), getWorksByAuthor: async () => ({ data: [], total: 0 }), getOrcidEmployments: async () => ({ data: [] }), getInstitution: async () => ({ data: {} }),
    }, { stage: async () => {}, complete: async out => { status = "done"; result = out.result; }, fail: async () => { status = "failed"; } },
    { today: "2026-11-13", candidate: { profileIds: ["A1"], orcid: null }, reviewer: { profileIds: ["A2"], typedName: "Rita Reviewer" }, declarations: [] }, { calls: () => ({ fresh: 0, cached: 0 }) });
    expect(outcome).toMatchObject({ status: "failed", errorType: "QuotaReached", error: QUOTA_MESSAGE });
    expect(status).toBe("failed"); expect(result).toBeNull();
  });
});
