import { describe, expect, it } from "vitest";
import { buildReport, kindOf, normaliseDoi, parseFixtures, reportToCsv, stopsRun, type PairOutcome } from "./regression";

const fixture = (over: Record<string, unknown>) => ({ candidate: "Jennifer Doudna", candidate_orcid: "0000-0001-9161-999X", chair_input: { name: "Gavin Knott" }, reviewer_orcid: "0000-0002-9007-6273", type: "recent co-author", expected: "Conflict", confirming_works: [{ doi: "10.1038/S41551-026-01642-6" }], ...over });
const file = JSON.stringify({ fixtures: [
  fixture({}),
  fixture({ chair_input: { name: "Nicola Osborne" }, reviewer_orcid: "0000-0003-2666-6321", type: "unrelated (cross-field)", expected: "No conflict found", confirming_works: [] }),
  fixture({ chair_input: { name: "Jennifer Hamilton" }, reviewer_orcid: "0000-0002-1825-0097", type: "same-name decoy", expected: "No conflict found", confirming_works: [] }),
] });
const done = (result: "conflict" | "potential" | "insufficient" | "no_conflict", dois: string[] = [], fresh = 2, cached = 3): PairOutcome => ({ status: "done", result, reason: "", rules: [], dois, calls: { fresh, cached }, durationMs: 1000 });

describe("regression fixtures", () => {
  it("reads the run 4 format: reviewer typed name, kinds, normalised confirming DOIs", () => {
    const { pairs, format } = parseFixtures(file);
    expect(format).toBe("run4");
    expect(pairs.map(pair => pair.kind)).toEqual(["coauthor", "unrelated", "decoy"]);
    expect(pairs[0]).toMatchObject({ id: 1, reviewer: "Gavin Knott", reviewerOrcid: "0000-0002-9007-6273", confirmingDois: ["10.1038/s41551-026-01642-6"] });
  });
  it("reads a slim file and rejects junk", () => {
    expect(parseFixtures(JSON.stringify({ pairs: [{ candidate: "A", candidateOrcid: "0000-0001-9161-999X", reviewer: "B", reviewerOrcid: "0000-0002-9007-6273", type: "older co-author", expected: "Potential" }] })).pairs[0]?.kind).toBe("coauthor");
    expect(() => parseFixtures("{}")).toThrow();
    expect(() => parseFixtures(JSON.stringify({ fixtures: [{ candidate: "x" }] }))).toThrow();
  });
  it("classifies types and normalises DOIs", () => {
    expect(kindOf("recent co-author (relabelled from older)")).toBe("coauthor");
    expect(kindOf("unrelated (same-field)")).toBe("unrelated");
    expect(normaliseDoi("https://doi.org/10.1/ABC")).toBe("10.1/abc");
  });
});

describe("regression report", () => {
  const { pairs } = parseFixtures(file);
  it("recall counts co-author pairs with a confirming DOI in the findings", () => {
    const report = buildReport(pairs, { 1: done("conflict", ["https://doi.org/10.1038/s41551-026-01642-6"]), 2: done("no_conflict"), 3: done("no_conflict") });
    expect(report.recall).toMatchObject({ found: 1, scored: 1, value: 1, pass: true });
    expect(report.negativeConflicts).toMatchObject({ count: 0, pass: true });
    expect(report.matches).toEqual({ count: 3, scored: 3 });
    expect(report.calls).toEqual({ fresh: 6, cached: 9, total: 15 });
  });
  it("lists a Conflict on a decoy and a co-author pair without its DOI as misses", () => {
    const report = buildReport(pairs, { 1: done("conflict", ["10.9/other"]), 2: done("no_conflict"), 3: done("conflict") });
    expect(report.recall).toMatchObject({ found: 0, pass: false });
    expect(report.negativeConflicts).toMatchObject({ count: 1, pass: false });
    expect(report.misses.map(row => row.pair.id)).toEqual([1, 3]);
  });
  it("doesn't score failed or unrun pairs, and gives no pass/fail on an incomplete run", () => {
    const report = buildReport(pairs, { 1: { status: "failed", error: "Couldn't check", errorType: "Timeout", calls: { fresh: 1, cached: 0 }, durationMs: 10 } });
    expect(report).toMatchObject({ scored: 0, failed: 1, notRun: 2 });
    expect(report.recall.pass).toBeNull();
    expect(report.negativeConflicts.pass).toBeNull();
  });
  it("stops the run only on rate-limit or auth/budget errors", () => {
    const failed = (errorType: string): PairOutcome => ({ status: "failed", error: "", errorType, calls: { fresh: 0, cached: 0 }, durationMs: 0 });
    expect(stopsRun(failed("RateLimited"))).toBe(true);
    expect(stopsRun(failed("BudgetOrAuth"))).toBe(true);
    expect(stopsRun(failed("Timeout"))).toBe(false);
    expect(stopsRun(done("no_conflict"))).toBe(false);
  });
  it("exports every pair plus the summary as CSV", () => {
    const csv = reportToCsv(buildReport(pairs, { 1: done("conflict", ["10.1038/s41551-026-01642-6"]) }));
    expect(csv.split("\n")[0]).toContain("pair,candidate,reviewer");
    expect(csv).toContain("Gavin Knott");
    expect(csv).toContain("# recall,1/1");
  });
});
