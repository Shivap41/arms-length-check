import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const identifySchema = z.object({
  typedName: z.string().trim().min(1).max(150),
  typedInstitution: z.string().trim().max(200),
  typedOrcid: z.string().trim().max(500).nullish(),
});

/** B3 identify: ORCID -> confirmed; otherwise top 3 cards for the chair. Server only. */
export const identifyPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => identifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { serverSources } = await import("@/lib/server-sources.server");
    const { identifyCore } = await import("@/lib/identify.server");
    return identifyCore(await serverSources(`identify:${context.userId}`), data);
  });

/** Resolve a pasted ORCID or openalex.org author link so the chair can see it before it is saved. */
export const resolveProfileLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ link: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { serverSources } = await import("@/lib/server-sources.server");
    const { resolveCore } = await import("@/lib/identify.server");
    return resolveCore(await serverSources(`identify:${context.userId}`), data.link);
  });
