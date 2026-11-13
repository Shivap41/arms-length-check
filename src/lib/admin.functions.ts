import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const passcodeSchema = z.object({ passcode: z.string().min(1).max(200) });

/** B5: run the 14 rules self-test cases. Pure, no network calls. Behind the research passcode. */
export const rulesSelftest = createServerFn({ method: "POST" })
  .validator((input: unknown) => passcodeSchema.parse(input))
  .handler(async ({ data }) => {
    const { passcodeError } = await import("@/lib/passcode.server");
    const denied = passcodeError(data.passcode);
    if (denied) return { ok: false as const, error: denied };
    const { runSelftest } = await import("@/lib/rules.selftest");
    return { ok: true as const, ...runSelftest() };
  });

const orcid = z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);
/**
 * B6: one regression pair. Both people are confirmed by ORCID (standing in for a correct chair
 * pick), then the same check-reviewer engine runs with an in-memory store: nothing is written
 * to the case tables. Behind the research passcode.
 */
export const regressionPair = createServerFn({ method: "POST" })
  .validator((input: unknown) => passcodeSchema.extend({ candidateOrcid: orcid, reviewerOrcid: orcid, reviewerName: z.string().trim().min(1).max(150) }).parse(input))
  .handler(async ({ data }) => {
    const { passcodeError } = await import("@/lib/passcode.server");
    const denied = passcodeError(data.passcode);
    if (denied) return { ok: false as const, error: denied };
    const { serverSources } = await import("@/lib/server-sources.server");
    const { runRegressionPairCore } = await import("@/lib/regression.server");
    return { ok: true as const, outcome: await runRegressionPairCore(serverSources, { candidateOrcid: data.candidateOrcid, reviewerOrcid: data.reviewerOrcid, reviewerName: data.reviewerName }) };
  });
