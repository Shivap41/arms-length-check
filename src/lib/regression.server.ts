import { runReviewerCheck } from "./check-reviewer.server";
import { shortId } from "./identity";
import type { PairOutcome } from "./regression";
import { SourceError, type createSources } from "./sources.server";

type SourcesFactory = (screeningId: string, onResult?: (fromCache: boolean) => void) => Promise<ReturnType<typeof createSources>>;
export type RegressionPairInput = { candidateOrcid: string; reviewerOrcid: string; reviewerName: string; today?: string };

/**
 * One B6 pair: confirm both people by ORCID (standing in for a correct chair pick), then run the
 * same check-reviewer engine with an in-memory store. Nothing is written to the case tables.
 */
export async function runRegressionPairCore(serverSources: SourcesFactory, input: RegressionPairInput): Promise<PairOutcome> {
  let fresh = 0, cached = 0;
  const started = Date.now();
  const calls = () => ({ fresh, cached });
  const sources = await serverSources("regression", fromCache => { if (fromCache) cached++; else fresh++; });
  let candidateId: string, reviewerId: string;
  try {
    const [candidate, reviewer] = await Promise.all([sources.getAuthorByOrcid(input.candidateOrcid), sources.getAuthorByOrcid(input.reviewerOrcid)]);
    candidateId = shortId(candidate.data.id); reviewerId = shortId(reviewer.data.id);
  } catch (error) {
    const type = error instanceof SourceError ? error.type : "Other";
    return { status: "failed", error: type === "NotFound" ? "No indexed works for this ORCID" : `Couldn't confirm by ORCID (${type})`, errorType: type, calls: calls(), durationMs: Date.now() - started };
  }
  let stored: { result: "conflict" | "potential" | "insufficient" | "no_conflict"; reason: string; rules: string[]; dois: string[] } | undefined;
  const outcome = await runReviewerCheck(sources, {
    async stage() {},
    async complete(result) {
      const counted = result.findings.filter(finding => finding.severity !== "info");
      const dois = counted.flatMap(finding => ((finding.evidence["works"] as { doi: string | null }[] | undefined) ?? []).map(work => work.doi).filter((doi): doi is string => Boolean(doi)));
      stored = { result: result.result, reason: result.reason, rules: result.findings.map(finding => finding.rule), dois };
    },
    async fail() {},
  }, { today: input.today ?? new Date().toISOString().slice(0, 10), candidate: { profileIds: [candidateId], orcid: input.candidateOrcid }, reviewer: { profileIds: [reviewerId], typedName: input.reviewerName }, declarations: [] }, { calls });
  if (outcome.status === "failed" || !stored) {
    return { status: "failed", error: outcome.status === "failed" ? outcome.error : "Couldn't check", errorType: outcome.status === "failed" ? outcome.errorType : "Other", calls: calls(), durationMs: Date.now() - started };
  }
  return { status: "done", ...stored, calls: calls(), durationMs: Date.now() - started };
}
