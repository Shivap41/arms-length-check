import { afterEach, describe, expect, it, vi } from "vitest";
import { createSources, CACHE_TTL_MS, type SourceCache } from "./sources.server";

const author = { id: "https://openalex.org/A1", display_name: "Test Author" };
function setup(fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(author))) {
  let time = Date.parse("2026-11-13T03:00:00Z");
  const rows = new Map<string, { body: unknown; fetchedAt: string }>();
  const cache: SourceCache = {
    read: vi.fn(async key => rows.get(key) ?? null),
    write: vi.fn(async (key, body, fetchedAt) => { rows.set(key, { body, fetchedAt }); }),
  };
  const sleep = vi.fn(async () => {});
  const options = { apiKey: "test-only-credential", cache, screeningId: "test-screening", fetch: fetcher, now: () => time, sleep };
  return { sources: createSources(options), options, fetcher, cache, rows, sleep, advance: (ms: number) => { time += ms; } };
}
afterEach(() => { vi.useRealTimers(); });
describe("source request rules", () => {
  it("serves identical requests from api_cache for 24 hours", async () => {
    const s = setup();
    expect((await s.sources.getAuthor("A1")).fromCache).toBe(false);
    s.advance(CACHE_TTL_MS - 1);
    expect((await s.sources.getAuthor("A1")).fromCache).toBe(true);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    s.advance(1);
    expect((await s.sources.getAuthor("A1")).fromCache).toBe(false);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });
  it("passes the key as api_key but excludes it from cache keys", async () => {
    const s = setup(); await s.sources.getAuthorByOrcid("0000-0001-9161-999X");
    const url = new URL(String(s.fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/authors/orcid:0000-0001-9161-999X");
    expect(url.searchParams.get("api_key")).toBe("test-only-credential");
    expect([...s.rows.keys()][0]).not.toContain("api_key");
    expect([...s.rows.keys()][0]).not.toContain("test-only-credential");
  });
  it("strips trailing single-letter name parts and requests 10 authors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [author] }));
    const s = setup(fetcher); await s.sources.searchAuthors("Wei Zhang J. K");
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("search")).toBe("Wei Zhang");
    expect(url.searchParams.get("per-page")).toBe("10");
  });
  it("uses ORCID v3 JSON without a key and maps employment years", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ "affiliation-group": [{ summaries: [{ "employment-summary": {
      organization: { name: "Example University" }, "start-date": { year: { value: "2020" } }, "end-date": null,
    } }] }] }));
    const s = setup(fetcher);
    expect((await s.sources.getOrcidEmployments("0000-0001-9161-999X")).data).toEqual([{ org: "Example University", start_year: 2020, end_year: null }]);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://pub.orcid.org/v3.0/0000-0001-9161-999X/employments");
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Accept")).toBe("application/json");
    expect((await s.sources.getOrcidEmployments("0000-0001-9161-999X")).fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([[429, "RateLimited"], [500, "Upstream"], [503, "Upstream"]])("retries %s at most twice with backoff, then throws %s", async (status, type) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: Number(status) }));
    const s = setup(fetcher);
    await expect(s.sources.getAuthor("A1")).rejects.toMatchObject({ type });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(s.sleep.mock.calls).toEqual([[500], [1000]]);
    expect(s.cache.write).not.toHaveBeenCalled();
  });
  it.each([[401, "BudgetOrAuth"], [402, "BudgetOrAuth"], [403, "BudgetOrAuth"], [404, "NotFound"]])("throws %s as %s without retry or empty results", async (status, type) => {
    const s = setup(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: Number(status) })));
    await expect(s.sources.getAuthor("A1")).rejects.toMatchObject({ type });
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    expect(s.cache.write).not.toHaveBeenCalled();
  });
  it("aborts a request at exactly 10 seconds as Timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const s = setup(fetcher);
    const assertion = expect(s.sources.getAuthor("A1")).rejects.toMatchObject({ type: "Timeout" });
    await vi.advanceTimersByTimeAsync(9_999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await assertion;
  });
  it("limits concurrent source calls to four across clients in one screening", async () => {
    let active = 0, max = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      active++; max = Math.max(max, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      return Response.json(author);
    });
    const s = setup(fetcher), second = createSources(s.options);
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? second : s.sources).getAuthor(`A${i + 1}`)));
    expect(max).toBe(4);
  });
  it("deduplicates simultaneous identical requests", async () => {
    const s = setup();
    await Promise.all([s.sources.getAuthor("A1"), s.sources.getAuthor("A1")]);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it("follows work cursors but stops at five pages, caching each page", async () => {
    let count = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ results: [], meta: { next_cursor: `cursor${++count}` } }));
    const s = setup(fetcher);
    await s.sources.getWorksByAuthor("A1", { fromDate: "2020-01-01" });
    expect(fetcher).toHaveBeenCalledTimes(5);
    const first = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(first.searchParams.get("cursor")).toBe("*");
    expect(first.searchParams.get("filter")).toBe("authorships.author.id:A1,from_publication_date:2020-01-01");
    expect(first.searchParams.get("per-page")).toBe("200");
    expect(first.searchParams.get("select")).toBe("id,doi,title,publication_year,type,authorships");
    expect((await s.sources.getWorksByAuthor("A1", { fromDate: "2020-01-01" })).fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("uses two AND author filters with OR ids for shared works", async () => {
    const s = setup(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [], meta: {} })));
    await s.sources.getSharedWorks(["A1", "A2"], ["A3", "A4"]);
    const url = new URL(String(s.fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("filter")).toBe("authorships.author.id:A1|A2,authorships.author.id:A3|A4");
  });
  it("pages through every shared work instead of stopping at the first 200", async () => {
    const work = (n: number) => ({ id: `W${n}`, doi: null, title: `Paper ${n}`, publication_year: 2024, type: "article", authorships: [] });
    const pages = [
      { results: Array.from({ length: 200 }, (_, i) => work(i)), meta: { next_cursor: "c1" } },
      { results: Array.from({ length: 200 }, (_, i) => work(200 + i)), meta: { next_cursor: "c2" } },
      { results: [work(400)], meta: { next_cursor: "c3" } },
      { results: [], meta: { next_cursor: null } },
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(pages.shift()));
    const s = setup(fetcher);
    const result = await s.sources.getSharedWorks(["A1"], ["A2"]);
    expect(result.data).toHaveLength(401);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get("cursor")).toBe("*");
    expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.get("cursor")).toBe("c1");
  });
  it("fails instead of returning a partial list when shared works exceed the page cap", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ results: [{ id: "W1", doi: null, title: "x", publication_year: 2024, type: "article", authorships: [] }], meta: { next_cursor: "more" } }));
    const s = setup(fetcher);
    await expect(s.sources.getSharedWorks(["A1"], ["A2"])).rejects.toMatchObject({ type: "Upstream" });
  });
  it("returns institution type", async () => {
    const s = setup(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "I1", display_name: "Example", type: "education" })));
    expect((await s.sources.getInstitution("I1")).data.type).toBe("education");
  });
  it("throws malformed payloads and cache failures instead of returning empty results", async () => {
    const s = setup(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "bad" })));
    await expect(s.sources.getAuthor("A1")).rejects.toMatchObject({ type: "Upstream" });
    expect(s.cache.write).not.toHaveBeenCalled();
    vi.mocked(s.cache.read).mockRejectedValueOnce(new Error("database error"));
    await expect(s.sources.getAuthor("A2")).rejects.toMatchObject({ type: "Upstream" });
  });
});