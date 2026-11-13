import { z } from "zod";
import { stripTrailingInitials } from "./identity";

export type SourceErrorType = "Timeout" | "RateLimited" | "BudgetOrAuth" | "NotFound" | "Upstream" | "QuotaReached";
export class SourceError extends Error {
  constructor(public readonly type: SourceErrorType, public readonly status?: number) {
    super(`Couldn't check: ${type}`); this.name = type;
  }
}
export type CachedResponse<T> = { data: T; fromCache: boolean };
export interface SourceCache {
  read(key: string): Promise<{ body: unknown; fetchedAt: string } | null>;
  write(key: string, body: unknown, fetchedAt: string): Promise<void>;
}
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const TIMEOUT_MS = 10_000;
export const MAX_RETRIES = 2;
export const MAX_IN_FLIGHT = 4;
/** Shared works are paged to the end; 50 pages = 10,000 works, far above any real pair. */
export const MAX_SHARED_PAGES = 50;
const authorSchema = z.object({ id: z.string(), display_name: z.string() }).passthrough();
const institutionSchema = z.object({ id: z.string(), display_name: z.string(), type: z.string().nullable() }).passthrough();
const workSchema = z.object({
  id: z.string(), doi: z.string().nullable(), title: z.string().nullable(),
  publication_year: z.number().nullable(), type: z.string(),
  authorships: z.array(z.object({ author: z.object({ id: z.string().nullable(), display_name: z.string().nullable() }).passthrough() }).passthrough()),
}).passthrough();
export type Author = z.infer<typeof authorSchema>;
export type Work = z.infer<typeof workSchema>;
export type Employment = { org: string; start_year: number | null; end_year: number | null };
const yearSchema = z.object({ value: z.string().regex(/^\d{4}$/) });
const dateSchema = z.object({ year: yearSchema.nullable().optional() }).passthrough().nullable().optional();
const employmentSchema = z.object({ "affiliation-group": z.array(z.object({
  summaries: z.array(z.object({ "employment-summary": z.object({
    organization: z.object({ name: z.string() }).passthrough(),
    "start-date": dateSchema, "end-date": dateSchema,
  }).passthrough() }).passthrough()),
}).passthrough()).nullable().transform(groups => groups ?? []) }).passthrough();
const worksPageSchema = z.object({ results: z.array(workSchema), meta: z.object({ next_cursor: z.string().nullable().optional(), count: z.number().optional() }).passthrough() });
const recentWorksSchema = z.object({ results: z.array(z.object({ id: z.string(), doi: z.string().nullable(), title: z.string().nullable(), publication_year: z.number().nullable() }).passthrough()) }).passthrough();
const authorSearchSchema = z.object({ results: z.array(authorSchema) }).passthrough();
// Ephemeral scheduling only; durable responses always live in api_cache.
const gates = new Map<string, { active: number; queue: (() => void)[] }>();
const pending = new Map<string, Promise<CachedResponse<unknown>>>();
async function limited<T>(screeningId: string, work: () => Promise<T>): Promise<T> {
  let gate = gates.get(screeningId);
  if (!gate) { gate = { active: 0, queue: [] }; gates.set(screeningId, gate); }
  if (gate.active >= MAX_IN_FLIGHT) await new Promise<void>(resolve => gate.queue.push(resolve));
  else gate.active++;
  try { return await work(); }
  finally {
    const next = gate.queue.shift();
    if (next) next(); // transfer the reserved slot
    else gate.active--;
    if (!gate.active) gates.delete(screeningId);
  }
}
export { stripTrailingInitials };
function entityId(value: string, prefix: "A" | "I"): string {
  return z.string().regex(new RegExp(`^${prefix}\\d+$`)).parse(value.replace(/^https:\/\/openalex\.org\//, ""));
}
function orcidId(value: string): string { return z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/).parse(value); }
function statusError(status: number): SourceError {
  return new SourceError(status === 429 ? "RateLimited" : status === 401 || status === 403 || status === 402 ? "BudgetOrAuth" : status === 404 ? "NotFound" : "Upstream", status);
}

/** Inject the API key inside a server handler. Reuse a screeningId for all tasks. */
export function createSources(options: {
  apiKey: string | undefined; cache: SourceCache; screeningId: string;
  fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>;
  /** Called once per request with whether it was served from api_cache (for call counts). */
  onResult?: (fromCache: boolean) => void;
  /** Called before every fresh (uncached) OpenAlex call; throw SourceError("QuotaReached") to refuse it (D59). */
  beforeFresh?: () => Promise<void>;
}) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  async function request<T>(source: "openalex" | "orcid", path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<CachedResponse<T>> {
    const url = new URL(path, source === "openalex" ? "https://api.openalex.org" : "https://pub.orcid.org/v3.0/");
    for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) url.searchParams.set(key, value);
    const key = url.toString(); // Deliberately excludes api_key, even after rotation.
    const pendingKey = `${options.screeningId}:${key}`;
    const existing = pending.get(pendingKey);
    if (existing) return existing as Promise<CachedResponse<T>>;
    const promise = limited(options.screeningId, async (): Promise<CachedResponse<T>> => {
      let cached;
      try { cached = await options.cache.read(key); } catch { throw new SourceError("Upstream"); }
      if (cached) {
        const age = now() - Date.parse(cached.fetchedAt);
        if (age >= 0 && age < CACHE_TTL_MS) {
          const parsed = schema.safeParse(cached.body);
          if (!parsed.success) throw new SourceError("Upstream");
          options.onResult?.(true);
          return { data: parsed.data, fromCache: true };
        }
      }
      if (source === "openalex") {
        await options.beforeFresh?.();
        if (!options.apiKey) throw new SourceError("BudgetOrAuth");
        url.searchParams.set("api_key", options.apiKey);
      }
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let retryAfter = 0;
        try {
          const response = await fetcher(url, { signal: controller.signal, headers: { Accept: "application/json" } });
          if (!response.ok) {
            if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
              const header = response.headers.get("Retry-After");
              retryAfter = header ? Math.max(0, Number(header) * 1000 || Date.parse(header) - now()) : 0;
              await response.body?.cancel();
            } else throw statusError(response.status);
          } else {
            const body: unknown = await response.json();
            const parsed = schema.safeParse(body);
            if (!parsed.success) throw new SourceError("Upstream");
            await options.cache.write(key, body, new Date(now()).toISOString());
            options.onResult?.(false);
            return { data: parsed.data, fromCache: false };
          }
        } catch (error) {
          if (controller.signal.aborted) throw new SourceError("Timeout");
          if (error instanceof SourceError) throw error;
          throw new SourceError("Upstream"); // Never reveal fetch URLs or credentials.
        } finally { clearTimeout(timer); }
        await sleep(Math.max(500 * 2 ** attempt, Math.min(retryAfter, 10_000)));
      }
      throw new SourceError("Upstream");
    });
    pending.set(pendingKey, promise);
    try { return await promise; } finally { pending.delete(pendingKey); }
  }
  const worksParams = { "per-page": "200", select: "id,doi,title,publication_year,type,authorships,primary_location" };
  return {
    getAuthorByOrcid: (orcid: string) => request("openalex", `/authors/orcid:${orcidId(orcid)}`, {}, authorSchema),
    searchAuthors: async (name: string) => {
      const result = await request("openalex", "/authors", { search: stripTrailingInitials(name), "per-page": "10" }, authorSearchSchema);
      return { ...result, data: result.data.results };
    },
    getAuthor: (id: string) => request("openalex", `/authors/${entityId(id, "A")}`, {}, authorSchema),
    getInstitution: (id: string) => request("openalex", `/institutions/${entityId(id, "I")}`, {}, institutionSchema),
    getOrcidEmployments: async (orcid: string): Promise<CachedResponse<Employment[]>> => {
      const result = await request("orcid", `${orcidId(orcid)}/employments`, {}, employmentSchema);
      const data = (result.data["affiliation-group"] ?? []).flatMap(group => group.summaries.map(item => {
        const entry = item["employment-summary"];
        return { org: entry.organization.name, start_year: entry["start-date"]?.year ? Number(entry["start-date"].year.value) : null, end_year: entry["end-date"]?.year ? Number(entry["end-date"].year.value) : null };
      }));
      return { data, fromCache: result.fromCache };
    },
    getWorksByAuthor: async (id: string, { fromDate }: { fromDate?: string } = {}): Promise<CachedResponse<Work[]> & { total: number }> => {
      let filter = `authorships.author.id:${entityId(id, "A")}`;
      if (fromDate) filter += `,from_publication_date:${z.string().date().parse(fromDate)}`;
      let cursor: string | null = "*";
      const data: Work[] = [];
      let fromCache = true;
      let total = 0;
      for (let page = 0; page < 5 && cursor; page++) {
        const result: CachedResponse<z.infer<typeof worksPageSchema>> = await request("openalex", "/works", { ...worksParams, filter, cursor }, worksPageSchema);
        data.push(...result.data.results); fromCache &&= result.fromCache;
        if (page === 0) total = result.data.meta.count ?? 0;
        cursor = result.data.meta.next_cursor ?? null;
      }
      return { data, fromCache, total: Math.max(total, data.length) };
    },
    /** The n most recent works for a profile card (title, year, DOI). */
    getRecentWorks: async (id: string, n = 3): Promise<CachedResponse<{ title: string; year: number | null; doi: string | null }[]>> => {
      const result = await request("openalex", "/works", { filter: `authorships.author.id:${entityId(id, "A")}`, sort: "publication_date:desc", "per-page": String(z.number().int().min(1).max(10).parse(n)), select: "id,doi,title,publication_year" }, recentWorksSchema);
      return { data: result.data.results.map(work => ({ title: work.title ?? "Untitled", year: work.publication_year, doi: work.doi })), fromCache: result.fromCache };
    },
    getSharedWorks: async (idsA: string[], idsB: string[]): Promise<CachedResponse<Work[]>> => {
      const ids = (values: string[]) => z.array(z.string()).min(1).max(100).parse(values).map(id => entityId(id, "A")).sort().join("|");
      // Page through every shared work: a truncated list would hide co-authorships.
      const filter = `authorships.author.id:${ids(idsA)},authorships.author.id:${ids(idsB)}`;
      let cursor: string | null = "*";
      const data: Work[] = [];
      let fromCache = true;
      for (let page = 0; cursor; page++) {
        if (page >= MAX_SHARED_PAGES) throw new SourceError("Upstream"); // never return a silently partial list
        const result: CachedResponse<z.infer<typeof worksPageSchema>> = await request("openalex", "/works", { ...worksParams, filter, cursor }, worksPageSchema);
        data.push(...result.data.results); fromCache &&= result.fromCache;
        cursor = result.data.results.length ? result.data.meta.next_cursor ?? null : null;
      }
      return { data, fromCache };
    },
  };
}