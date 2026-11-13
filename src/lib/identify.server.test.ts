import { describe, expect, it, vi } from "vitest";
import { identifyCore, resolveCore, type IdentitySources } from "./identify.server";
import { SourceError } from "./sources.server";
import { NO_INDEXED_WORKS, SEARCH_FAILED_MESSAGE } from "./identity";

const knott = { id: "https://openalex.org/A5007230579", display_name: "Gavin J. Knott", works_count: 71, last_known_institutions: [{ display_name: "Monash University" }], affiliations: [], topics: [] };
function sources(over: Partial<IdentitySources> = {}): IdentitySources {
  return {
    getAuthorByOrcid: vi.fn(async () => ({ data: { ...knott, orcid: "https://orcid.org/0000-0002-9007-6273" } })),
    getAuthor: vi.fn(async () => ({ data: knott })),
    searchAuthors: vi.fn(async () => ({ data: [knott] })),
    getRecentWorks: vi.fn(async () => ({ data: [{ title: "Paper", year: 2025, doi: null }] })),
    ...over,
  };
}
const input = { typedName: "Gavin Knott", typedInstitution: "Monash University" };

describe("identify", () => {
  it("confirms by a valid ORCID", async () => {
    const result = await identifyCore(sources(), { ...input, typedOrcid: "0000-0002-9007-6273" });
    expect(result).toMatchObject({ status: "confirmed", method: "orcid", profile: { id: "A5007230579", displayName: "Gavin J. Knott" } });
  });
  it("returns insufficient when OpenAlex has no profile for the ORCID", async () => {
    const result = await identifyCore(sources({ getAuthorByOrcid: vi.fn(async () => { throw new SourceError("NotFound", 404); }) }), { ...input, typedOrcid: "0000-0002-1825-0097" });
    expect(result).toEqual({ status: "insufficient", reason: NO_INDEXED_WORKS });
  });
  it("returns an inline error for 1234 or a bad check digit, without calling OpenAlex", async () => {
    const s = sources();
    expect(await identifyCore(s, { ...input, typedOrcid: "1234" })).toMatchObject({ status: "invalid" });
    expect(await identifyCore(s, { ...input, typedOrcid: "0000-0002-1825-0098" })).toMatchObject({ status: "invalid", error: expect.stringContaining("check digit") });
    expect(s.getAuthorByOrcid).not.toHaveBeenCalled();
  });
  it("never confirms without an ORCID, even on a perfect 1.0 match", async () => {
    const result = await identifyCore(sources(), input);
    expect(result.status).toBe("needs_chair");
    if (result.status === "needs_chair") { expect(result.options).toHaveLength(1); expect(result.options[0]?.match.score).toBe(1); }
  });
  it("offers a typed OpenAlex link as a card, not a confirmation", async () => {
    expect((await identifyCore(sources(), { ...input, typedOrcid: "https://openalex.org/A5007230579" })).status).toBe("needs_chair");
  });
  it("returns at most 3 cards", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...knott, id: `https://openalex.org/A${100 + i}` }));
    const result = await identifyCore(sources({ searchAuthors: vi.fn(async () => ({ data: many })) }), input);
    expect(result.status === "needs_chair" && result.options.length).toBe(3);
  });
  it("turns a failed search into 'Couldn't search: try again', never an empty list", async () => {
    for (const type of ["Timeout", "RateLimited", "BudgetOrAuth", "Upstream"] as const) {
      const result = await identifyCore(sources({ searchAuthors: vi.fn(async () => { throw new SourceError(type); }) }), input);
      expect(result.status).toBe("error");
      expect(result).toMatchObject({ error: expect.stringContaining(SEARCH_FAILED_MESSAGE) });
    }
    const recentFails = await identifyCore(sources({ getRecentWorks: vi.fn(async () => { throw new SourceError("Timeout"); }) }), input);
    expect(recentFails.status).toBe("error");
  });
  it("resolves a pasted link and reports a bad one", async () => {
    expect(await resolveCore(sources(), "https://orcid.org/0000-0002-9007-6273")).toMatchObject({ ok: true, profile: { id: "A5007230579" } });
    expect(await resolveCore(sources(), "1234")).toMatchObject({ ok: false });
  });
});
