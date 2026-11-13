import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkDataConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { serverSources } = await import("@/lib/server-sources.server");
    const { SourceError } = await import("@/lib/sources.server");
    const sources = await serverSources(`health:${context.userId}`);
    try {
      const result = await sources.getAuthorByOrcid("0000-0001-9161-999X");
      return { ok: true as const, displayName: result.data.display_name, fromCache: result.fromCache };
    } catch (error) {
      return { ok: false as const, error: error instanceof SourceError ? error.type : "Upstream" };
    }
  });
