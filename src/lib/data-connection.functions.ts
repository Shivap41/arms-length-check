import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkDataConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createSources, SourceError } = await import("@/lib/sources.server");
    const sources = createSources({
      apiKey: process.env["OPENALEX_API_KEY"],
      screeningId: `health:${context.userId}`,
      cache: {
        async read(key) {
          const { data, error } = await supabaseAdmin.from("api_cache").select("body,fetched_at").eq("key", key).maybeSingle();
          if (error) throw new SourceError("Upstream");
          return data ? { body: data.body, fetchedAt: data.fetched_at } : null;
        },
        async write(key, body, fetchedAt) {
          const { error } = await supabaseAdmin.from("api_cache").upsert({ key, body: body as import("@/integrations/supabase/types").Json, fetched_at: fetchedAt });
          if (error) throw new SourceError("Upstream");
        },
      },
    });
    try {
      const result = await sources.getAuthorByOrcid("0000-0001-9161-999X");
      return { ok: true as const, displayName: result.data.display_name, fromCache: result.fromCache };
    } catch (error) {
      return { ok: false as const, error: error instanceof SourceError ? error.type : "Upstream" };
    }
  });