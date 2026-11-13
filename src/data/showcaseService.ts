import { showcaseCheck, showcaseIdentify, showcasePrefetch, showcaseResolve, showcaseVerifyCode } from "@/lib/showcase.functions";
import type { IdentifyResult, ResolveResult } from "@/lib/identity";

// D59 showcase data access. Components reach the showcase server functions only through here.
// A screening lives in this browser tab's memory only; nothing is saved to case tables.

export type ShowcaseFinding = { rule: string; severity: "conflict" | "potential" | "info"; evidence: Record<string, unknown> };
export type ShowcaseNotes = { durationMs: number; calls: { fresh: number; cached: number }; nameScan?: { covered: number; total: number } };
export type ShowcaseCheckResult =
  | { status: "done"; result: "conflict" | "potential" | "insufficient" | "no_conflict"; reason: string; findings: ShowcaseFinding[]; notes: ShowcaseNotes }
  | { status: "failed"; error: string; quota: boolean; notes: ShowcaseNotes | null };

/** One id per page visit, so a visit's checks share cache entries and in-flight requests. */
export function newShowcaseSession(): string { return crypto.randomUUID(); }

export async function verifyShowcaseCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try { return await showcaseVerifyCode({ data: { code } }); } catch { return { ok: false, error: "Couldn't reach the server. Try again." }; }
}
export async function showcaseIdentifyPerson(session: string, code: string | null, input: { typedName: string; typedInstitution: string; typedOrcid?: string | null }): Promise<IdentifyResult> {
  return showcaseIdentify({ data: { session, code, ...input } }) as Promise<IdentifyResult>;
}
export async function showcaseResolveLink(session: string, code: string | null, link: string): Promise<ResolveResult> {
  return showcaseResolve({ data: { session, code, link } });
}
export async function showcasePrefetchCandidate(session: string, code: string | null, profileIds: string[], orcid: string | null): Promise<void> {
  try { await showcasePrefetch({ data: { session, code, profileIds, orcid } }); } catch { /* best effort */ }
}
export async function showcaseRunCheck(session: string, code: string | null, candidate: { profileIds: string[]; orcid: string | null }, reviewer: { profileIds: string[]; typedName: string }): Promise<ShowcaseCheckResult> {
  try {
    const result = await showcaseCheck({ data: { session, code, candidate, reviewer } });
    if (result.status === "done") return { status: "done", result: result.result as "conflict", reason: result.reason, findings: JSON.parse(result.findingsJson) as ShowcaseFinding[], notes: result.notes };
    return { status: "failed", error: result.error, quota: result.quota, notes: result.notes };
  } catch { return { status: "failed", error: "Couldn't check: the server didn't respond", quota: false, notes: null }; }
}
export const showcaseResultLabels = { conflict: "Conflict", potential: "Potential", insufficient: "Insufficient data", no_conflict: "No conflict found" } as const;
