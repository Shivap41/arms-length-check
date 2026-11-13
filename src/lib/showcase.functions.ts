import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { QUOTA_MESSAGE, VISITOR_LIMIT_MESSAGE } from "@/lib/showcase";

// D59 public showcase server functions. No sign-in and no writes to case tables: screenings live in
// the visitor's browser. Without a valid access code only the preset live example is accepted.
// Fresh OpenAlex calls draw on a global daily cap; every call counts against a per-visitor limit.

const code = z.string().max(200).nullish();
const orcid = z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);
const profileId = z.string().regex(/^A\d{4,12}$/);
const sessionId = z.string().uuid();
type Gate = { ok: true; full: boolean } | { ok: false; error: string };

async function gate(accessCode: string | null | undefined, allowedWithoutCode: boolean): Promise<Gate> {
  const { validShowcaseCode, visitorAllowed } = await import("@/lib/showcase.server");
  const full = validShowcaseCode(accessCode);
  if (accessCode && !full) return { ok: false, error: "Incorrect access code." };
  if (!full && !allowedWithoutCode) return { ok: false, error: "This needs the access code (full live mode)." };
  if (!(await visitorAllowed(getRequest().headers))) return { ok: false, error: VISITOR_LIMIT_MESSAGE };
  return { ok: true, full };
}
async function sources(session: string, counter?: { fresh: number; cached: number }) {
  const { serverSources } = await import("@/lib/server-sources.server");
  const { takeFreshCall } = await import("@/lib/showcase.server");
  // Cloudflare Workers forbid resolving a promise from another request's context, so the limiter and
  // in-flight map are scoped to this request (a fresh id per call). The 24-hour cache is still shared.
  return serverSources(`showcase:${session}:${crypto.randomUUID()}`, counter ? fromCache => { if (fromCache) counter.cached++; else counter.fresh++; } : undefined, takeFreshCall);
}

/** Checks an access code (server-side). */
export const showcaseVerifyCode = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ code: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { validShowcaseCode, visitorAllowed } = await import("@/lib/showcase.server");
    if (!(await visitorAllowed(getRequest().headers))) return { ok: false as const, error: VISITOR_LIMIT_MESSAGE };
    return validShowcaseCode(data.code) ? { ok: true as const } : { ok: false as const, error: "Incorrect access code." };
  });

export const showcaseIdentify = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ session: sessionId, code, typedName: z.string().trim().min(1).max(150), typedInstitution: z.string().trim().max(200), typedOrcid: z.string().trim().max(500).nullish() }).parse(input))
  .handler(async ({ data }) => {
    const { exampleAllowsIdentify } = await import("@/lib/showcase");
    const allowed = await gate(data.code, exampleAllowsIdentify(data));
    if (!allowed.ok) return { status: "error" as const, error: allowed.error };
    const { identifyCore } = await import("@/lib/identify.server");
    const result = await identifyCore(await sources(data.session), data);
    return result.status === "error" && result.error.includes("QuotaReached") ? { status: "error" as const, error: QUOTA_MESSAGE } : result;
  });

export const showcaseResolve = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ session: sessionId, code, link: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const { exampleAllowsResolve } = await import("@/lib/showcase");
    const allowed = await gate(data.code, exampleAllowsResolve(data.link));
    if (!allowed.ok) return { ok: false as const, error: allowed.error };
    const { resolveCore } = await import("@/lib/identify.server");
    const result = await resolveCore(await sources(data.session), data.link);
    return !result.ok && result.error.includes("QuotaReached") ? { ok: false as const, error: QUOTA_MESSAGE } : result;
  });

/** D58 in the showcase: warm the candidate's works as soon as they're confirmed. Best effort. */
export const showcasePrefetch = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ session: sessionId, code, profileIds: z.array(profileId).min(1).max(5), orcid: orcid.nullish() }).parse(input))
  .handler(async ({ data }) => {
    const { exampleAllowsPrefetch } = await import("@/lib/showcase");
    const allowed = await gate(data.code, exampleAllowsPrefetch(data.profileIds));
    if (!allowed.ok) return { ok: false as const, error: allowed.error, durationMs: 0 };
    const { prefetchCandidateCore } = await import("@/lib/prefetch.server");
    return prefetchCandidateCore(await sources(data.session), { profileIds: data.profileIds, orcid: data.orcid ?? null });
  });

/** One reviewer check, held in memory: nothing is written to the case tables. */
export const showcaseCheck = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    session: sessionId, code,
    candidate: z.object({ profileIds: z.array(profileId).min(1).max(5), orcid: orcid.nullish() }),
    reviewer: z.object({ profileIds: z.array(profileId).min(1).max(5), typedName: z.string().trim().min(1).max(150) }),
  }).parse(input))
  .handler(async ({ data }) => {
    const { exampleAllowsCheck } = await import("@/lib/showcase");
    const allowed = await gate(data.code, exampleAllowsCheck({ candidateProfileIds: data.candidate.profileIds, reviewerProfileIds: data.reviewer.profileIds, reviewerName: data.reviewer.typedName }));
    if (!allowed.ok) return { status: "failed" as const, error: `Couldn't check: ${allowed.error}`, quota: false, notes: null };
    const { runReviewerCheck } = await import("@/lib/check-reviewer.server");
    const counter = { fresh: 0, cached: 0 };
    let outcome: { findings: { rule: string; severity: string; evidence: Record<string, unknown> }[]; result: string; reason: string; notes: { durationMs: number; calls: { fresh: number; cached: number }; nameScan?: { covered: number; total: number } } } | undefined;
    let failure: { error: string; notes: { durationMs: number; calls: { fresh: number; cached: number } } } | undefined;
    const run = await runReviewerCheck(await sources(data.session, counter), {
      async stage() {},
      async complete(result) { outcome = result; },
      async fail(error, notes) { failure = { error, notes }; },
    }, { today: new Date().toISOString().slice(0, 10), candidate: { profileIds: data.candidate.profileIds, orcid: data.candidate.orcid ?? null }, reviewer: data.reviewer, declarations: [] }, { calls: () => ({ ...counter }) });
    // Findings travel as JSON text: their evidence is plain data, but its shape varies by rule.
    if (run.status === "done" && outcome) return { status: "done" as const, result: outcome.result, reason: outcome.reason, findingsJson: JSON.stringify(outcome.findings), notes: outcome.notes };
    const quota = run.status === "failed" && run.errorType === "QuotaReached";
    return { status: "failed" as const, error: run.status === "failed" ? run.error : "Couldn't check", quota, notes: failure?.notes ?? null };
  });
