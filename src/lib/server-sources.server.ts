import { createSources, SourceError, type SourceCache } from "@/lib/sources.server";
import type { Json } from "@/integrations/supabase/types";

/** api_cache adapter over the service-role client. Server only. */
async function apiCache(): Promise<SourceCache> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    async read(key) {
      const { data, error } = await supabaseAdmin.from("api_cache").select("body,fetched_at").eq("key", key).maybeSingle();
      if (error) throw new SourceError("Upstream");
      return data ? { body: data.body, fetchedAt: data.fetched_at } : null;
    },
    async write(key, body, fetchedAt) {
      const { error } = await supabaseAdmin.from("api_cache").upsert({ key, body: body as Json, fetched_at: fetchedAt });
      if (error) throw new SourceError("Upstream");
    },
  };
}

/** One sources client per screening (or per user task); the key is injected here and never leaves the server. */
export async function serverSources(screeningId: string) {
  return createSources({ apiKey: process.env["OPENALEX_API_KEY"], screeningId, cache: await apiCache() });
}
