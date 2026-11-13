import { describe, expect, it, vi } from "vitest";
import { prefetchCandidateCore, type PrefetchSources } from "./prefetch.server";
import { SourceError } from "./sources.server";

const sources = (over: Partial<PrefetchSources> = {}): PrefetchSources => ({
  getAuthor: vi.fn(async () => ({ data: {} })),
  getWorksByAuthor: vi.fn(async () => ({ data: Array.from({ length: 200 }, () => ({})), total: 927 })),
  getOrcidEmployments: vi.fn(async () => ({ data: [] })),
  ...over,
});

describe("D58 candidate prefetch", () => {
  it("fetches the candidate's profile, works and ORCID employments with the same calls a check makes", async () => {
    const s = sources();
    const result = await prefetchCandidateCore(s, { profileIds: ["A1"], orcid: "https://orcid.org/0000-0003-4482-2754" });
    expect(result).toMatchObject({ ok: true, works: 200, total: 927 });
    expect(s.getAuthor).toHaveBeenCalledWith("A1");
    expect(s.getWorksByAuthor).toHaveBeenCalledWith("A1");
    expect(s.getOrcidEmployments).toHaveBeenCalledWith("0000-0003-4482-2754");
  });
  it("skips ORCID employments without an ORCID and treats a missing ORCID record as fine", async () => {
    const s = sources({ getOrcidEmployments: vi.fn(async () => { throw new SourceError("NotFound", 404); }) });
    expect((await prefetchCandidateCore(s, { profileIds: ["A1"], orcid: null })).ok).toBe(true);
    expect(s.getOrcidEmployments).not.toHaveBeenCalled();
    expect((await prefetchCandidateCore(s, { profileIds: ["A1"], orcid: "0000-0003-4482-2754" })).ok).toBe(true);
  });
  it("is best effort: a source error is returned, never thrown", async () => {
    const result = await prefetchCandidateCore(sources({ getWorksByAuthor: vi.fn(async () => { throw new SourceError("RateLimited", 429); }) }), { profileIds: ["A1"], orcid: null });
    expect(result).toMatchObject({ ok: false, error: "RateLimited" });
  });
});
