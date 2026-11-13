import { z } from "zod";

// B6 regression against the spike fixtures. Pure: parsing, scoring and CSV. No network.

export const FROZEN_RUN4_SHA256 = "1a95b60614b2a0f1c05d94bf1ef961898d4a83ec8c20682b24dba2175bceb919";
/** Known frozen fixture files: v2 is the run 4 freeze; v3 relabels Duflo x Dillon as recent (D57). */
export const KNOWN_FIXTURES: Record<string, string> = {
  [FROZEN_RUN4_SHA256]: "frozen run 4 fixtures (v2)",
  "89c49717fefcba462f1302b0b431295c9a2a4f3f523bfded2dae0c7b56132223": "run 4 fixtures v3 (D57: Duflo x Dillon relabelled recent)",
};
export const RECALL_TARGET = 0.85;
export type Expected = "Conflict" | "Potential" | "No conflict found" | "Insufficient data";
export type PairKind = "coauthor" | "unrelated" | "decoy";
export type RegressionPair = { id: number; candidate: string; candidateOrcid: string; reviewer: string; reviewerOrcid: string; kind: PairKind; type: string; expected: Expected; confirmingDois: string[] };

const orcid = z.string().regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);
const expected = z.enum(["Conflict", "Potential", "No conflict found", "Insufficient data"]);
const fullFixture = z.object({
  candidate: z.string(), candidate_orcid: orcid, type: z.string(), expected,
  chair_input: z.object({ name: z.string() }).passthrough(),
  reviewer_orcid: orcid,
  confirming_works: z.array(z.object({ doi: z.string().nullish() }).passthrough()).nullish(),
}).passthrough();
const slimPair = z.object({ candidate: z.string(), candidateOrcid: orcid, reviewer: z.string(), reviewerOrcid: orcid, type: z.string(), expected, confirmingDois: z.array(z.string()).default([]) });

export function normaliseDoi(doi: string): string { return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:/, ""); }
export function kindOf(type: string): PairKind {
  const value = type.toLowerCase();
  if (value.includes("decoy")) return "decoy";
  if (value.includes("unrelated")) return "unrelated";
  if (value.includes("co-author") || value.includes("coauthor")) return "coauthor";
  throw new Error(`Unknown pair type: ${type}`);
}

/** Reads the frozen run 4 file ({ fixtures: [...] }) or a slim one ({ pairs: [...] }). */
export function parseFixtures(text: string): { pairs: RegressionPair[]; format: "run4" | "slim" } {
  const json: unknown = JSON.parse(text);
  const asObject = z.object({ fixtures: z.array(z.unknown()).optional(), pairs: z.array(z.unknown()).optional() }).passthrough().parse(json);
  if (asObject.fixtures) {
    const pairs = asObject.fixtures.map((raw, index) => {
      const row = fullFixture.parse(raw);
      return { id: index + 1, candidate: row.candidate, candidateOrcid: row.candidate_orcid, reviewer: row.chair_input.name, reviewerOrcid: row.reviewer_orcid, kind: kindOf(row.type), type: row.type, expected: row.expected, confirmingDois: (row.confirming_works ?? []).map(work => work.doi).filter((doi): doi is string => Boolean(doi)).map(normaliseDoi) };
    });
    return { pairs, format: "run4" };
  }
  if (asObject.pairs) {
    return { pairs: asObject.pairs.map((raw, index) => { const row = slimPair.parse(raw); return { id: index + 1, ...row, kind: kindOf(row.type), confirmingDois: row.confirmingDois.map(normaliseDoi) }; }), format: "slim" };
  }
  throw new Error("Expected a fixtures file with a 'fixtures' or 'pairs' list.");
}

export type PairOutcome =
  | { status: "done"; result: "conflict" | "potential" | "insufficient" | "no_conflict"; reason: string; rules: string[]; dois: string[]; calls: { fresh: number; cached: number }; durationMs: number }
  | { status: "failed"; error: string; errorType: string; calls: { fresh: number; cached: number }; durationMs: number }
  | { status: "not_run" };
const labels = { conflict: "Conflict", potential: "Potential", insufficient: "Insufficient data", no_conflict: "No conflict found" } as const;
export const actualLabel = (outcome: PairOutcome) => outcome.status === "done" ? labels[outcome.result] : outcome.status === "failed" ? "Couldn't check" : "Not run";
/** Rate-limit and auth/budget errors stop the whole run; the pair is not scored. */
export const stopsRun = (outcome: PairOutcome) => outcome.status === "failed" && (outcome.errorType === "RateLimited" || outcome.errorType === "BudgetOrAuth");

export type ReportRow = { pair: RegressionPair; outcome: PairOutcome; actual: string; match: boolean | null; doiFound: boolean | null };
export type Report = {
  rows: ReportRow[];
  recall: { found: number; scored: number; total: number; value: number | null; pass: boolean | null };
  negativeConflicts: { count: number; scored: number; pairs: ReportRow[]; pass: boolean | null };
  matches: { count: number; scored: number };
  misses: ReportRow[];
  calls: { fresh: number; cached: number; total: number };
  scored: number; failed: number; notRun: number;
};
export function buildReport(pairs: RegressionPair[], outcomes: Record<number, PairOutcome>): Report {
  const rows: ReportRow[] = pairs.map(pair => {
    const outcome = outcomes[pair.id] ?? { status: "not_run" as const };
    if (outcome.status !== "done") return { pair, outcome, actual: actualLabel(outcome), match: null, doiFound: null };
    const found = new Set(outcome.dois.map(normaliseDoi));
    return { pair, outcome, actual: actualLabel(outcome), match: actualLabel(outcome) === pair.expected, doiFound: pair.kind === "coauthor" ? pair.confirmingDois.some(doi => found.has(doi)) : null };
  });
  const scored = rows.filter(row => row.outcome.status === "done");
  const coauthors = rows.filter(row => row.pair.kind === "coauthor");
  const coScored = coauthors.filter(row => row.outcome.status === "done");
  const found = coScored.filter(row => row.doiFound).length;
  const negatives = rows.filter(row => row.pair.kind !== "coauthor" && row.outcome.status === "done");
  const negativeConflicts = negatives.filter(row => row.outcome.status === "done" && row.outcome.result === "conflict");
  const complete = scored.length === rows.length;
  const calls = rows.reduce((sum, row) => row.outcome.status === "not_run" ? sum : { fresh: sum.fresh + row.outcome.calls.fresh, cached: sum.cached + row.outcome.calls.cached }, { fresh: 0, cached: 0 });
  const recallValue = coScored.length ? found / coScored.length : null;
  return {
    rows,
    recall: { found, scored: coScored.length, total: coauthors.length, value: recallValue, pass: complete && recallValue !== null ? recallValue >= RECALL_TARGET : null },
    negativeConflicts: { count: negativeConflicts.length, scored: negatives.length, pairs: negativeConflicts, pass: complete ? negativeConflicts.length === 0 : null },
    matches: { count: scored.filter(row => row.match).length, scored: scored.length },
    misses: rows.filter(row => row.match === false || (row.pair.kind === "coauthor" && row.doiFound === false)),
    calls: { ...calls, total: calls.fresh + calls.cached },
    scored: scored.length, failed: rows.filter(row => row.outcome.status === "failed").length, notRun: rows.filter(row => row.outcome.status === "not_run").length,
  };
}

const csvCell = (value: unknown) => { const text = value === null || value === undefined ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
export function reportToCsv(report: Report): string {
  const header = ["pair", "candidate", "reviewer", "type", "kind", "expected", "actual", "match", "confirming_doi_found", "rules", "reason_or_error", "fresh_calls", "cached_calls", "duration_ms"];
  const lines = report.rows.map(({ pair, outcome, actual, match, doiFound }) => [
    pair.id, pair.candidate, pair.reviewer, pair.type, pair.kind, pair.expected, actual, match, doiFound,
    outcome.status === "done" ? outcome.rules.join(" ") : "", outcome.status === "done" ? outcome.reason : outcome.status === "failed" ? outcome.error : "",
    outcome.status === "not_run" ? "" : outcome.calls.fresh, outcome.status === "not_run" ? "" : outcome.calls.cached, outcome.status === "not_run" ? "" : outcome.durationMs,
  ].map(csvCell).join(","));
  const summary = [
    "", `# recall,${report.recall.found}/${report.recall.scored} scored co-author pairs (${report.recall.total} total),target >= ${RECALL_TARGET * 100}%`,
    `# conflicts on unrelated or decoy pairs,${report.negativeConflicts.count} of ${report.negativeConflicts.scored},target 0`,
    `# result matches expected,${report.matches.count}/${report.matches.scored}`,
    `# API calls,${report.calls.total} (${report.calls.fresh} fresh; ${report.calls.cached} from cache)`,
  ];
  return [header.join(","), ...lines, ...summary].join("\n");
}
