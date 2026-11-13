import { runRules, type InstitutionRecord, type ResultValue, type RuleId, type RuleWork, type RulesInput } from "./rules";

// B5 self-test: the 14 synthetic cases, run against the pure rules engine. No network calls.
// Used by the rules-selftest server function (/admin/selftest) and by the unit tests.

export const SELFTEST_TODAY = "2026-11-13";
const authors = (n: number): RuleWork["authors"] => [{ id: "AC", name: "Cara Candidate" }, { id: "AR", name: "Rita Reviewer" }, ...Array.from({ length: Math.max(0, n - 2) }, (_, i) => ({ id: `AX${i}`, name: `Other Author${i}` }))];
let serial = 0;
const shared = (over: Partial<RuleWork> = {}): RuleWork => ({ id: `W${++serial}`, doi: "https://doi.org/10.0000/selftest", title: "Shared paper", year: 2025, type: "article", venue: "Journal", authors: authors(6), ...over });
const own = (i: number, coauthored = true): RuleWork => ({ id: `C${i}`, doi: null, title: `Own ${i}`, year: 2020, type: "article", venue: null, authors: coauthored ? [{ id: "AC", name: "Cara Candidate" }, { id: `AY${i}`, name: `Colleague Number${i}` }] : [{ id: "AC", name: "Cara Candidate" }] });
const institution = (id: string, name: string, type: string | null, years: number[], source: string): InstitutionRecord => ({ id, name, type, years, source });

type Overrides = { candidate?: Partial<RulesInput["candidate"]>; reviewer?: Partial<RulesInput["reviewer"]> } & Partial<Omit<RulesInput, "candidate" | "reviewer">>;
export function selftestInput(over: Overrides = {}): RulesInput {
  const { candidate, reviewer, ...rest } = over;
  return {
    today: SELFTEST_TODAY, sharedWorks: [], institutionTypes: {}, declarations: [],
    candidate: { profileIds: ["AC"], worksCount: 50, current: [], history: [], works: Array.from({ length: 10 }, (_, i) => own(i)), worksTotal: 10, ...candidate },
    reviewer: { profileIds: ["AR"], typedName: "Rita Reviewer", profileNames: ["Rita Reviewer"], worksCount: 40, current: [], history: [], ...reviewer },
    ...rest,
  };
}

export type SelftestCase = { id: number; name: string; expected: ResultValue; expectedRules: RuleId[]; input: () => RulesInput; extra?: (out: ReturnType<typeof runRules>) => string | null };
export const selftestCases: SelftestCase[] = [
  { id: 1, name: "Shared article from last year, 6 authors", expected: "conflict", expectedRules: ["R1"], input: () => selftestInput({ sharedWorks: [shared({ year: 2025 })] }) },
  { id: 2, name: "Only shared article is 8 years old", expected: "potential", expectedRules: ["R2"], input: () => selftestInput({ sharedWorks: [shared({ year: 2018 })] }) },
  { id: 3, name: "Only shared article has 120 authors", expected: "potential", expectedRules: ["LARGE_TEAM"], input: () => selftestInput({ sharedWorks: [shared({ authors: authors(120) })] }) },
  { id: 4, name: "Shared preprint and published article with the same title are counted once", expected: "conflict", expectedRules: ["R1"],
    input: () => selftestInput({ sharedWorks: [shared({ type: "preprint", title: "Cas9: a study" }), shared({ type: "article", title: "CAS9 - a study." })] }),
    extra: out => ((out.findings[0]?.evidence["works"] as unknown[] | undefined)?.length === 1 ? null : "counted more than once") },
  { id: 5, name: "Shared work of type dataset only is ignored", expected: "no_conflict", expectedRules: [], input: () => selftestInput({ sharedWorks: [shared({ type: "dataset" })] }) },
  { id: 6, name: "Candidate byline with the reviewer's name but a different author id", expected: "no_conflict", expectedRules: ["SAME_NAME_OTHER_PERSON"],
    input: () => selftestInput({ candidate: { works: [...Array.from({ length: 9 }, (_, i) => own(i)), { ...own(99), authors: [{ id: "AC", name: "Cara Candidate" }, { id: "A999", name: "Rita Reviewer" }] }] } }),
    extra: out => (out.findings[0]?.severity === "info" ? null : "not info") },
  { id: 7, name: "Candidate byline with the reviewer's name and no author id", expected: "potential", expectedRules: ["NAME_ONLY"],
    input: () => selftestInput({ candidate: { works: [...Array.from({ length: 9 }, (_, i) => own(i)), { ...own(99), authors: [{ id: "AC", name: "Cara Candidate" }, { id: null, name: "R. Reviewer", rawName: "R. Reviewer" }] }] } }) },
  { id: 8, name: "Both have current ORCID employment at the same education institution", expected: "conflict", expectedRules: ["R3"],
    input: () => { const record = institution("I1", "University of Example", null, [2026], "ORCID employment, current"); return selftestInput({ institutionTypes: { I1: "education" }, candidate: { current: [record] }, reviewer: { current: [record] } }); } },
  { id: 9, name: "Same institution only from an old record, overlapping 6 years ago", expected: "potential", expectedRules: ["R4"],
    input: () => selftestInput({ institutionTypes: { I1: "education" }, candidate: { history: [institution("I1", "University of Example", "education", [2018, 2019, 2020], "affiliation history")] }, reviewer: { history: [institution("I1", "University of Example", "education", [2020, 2021], "affiliation history")] } }) },
  { id: 10, name: "Shared institution of type funder", expected: "no_conflict", expectedRules: [],
    input: () => { const record = institution("I2", "Example Medical Research Institute", "funder", [2026], "byline 2026"); return selftestInput({ institutionTypes: { I2: "funder" }, candidate: { current: [record], history: [record] }, reviewer: { current: [record], history: [record] } }); } },
  { id: 11, name: "Declaration 'advisor' matching the reviewer's name", expected: "conflict", expectedRules: ["R5"], input: () => selftestInput({ declarations: [{ name: "Rita Reviewer", relationship: "advisor", note: null }] }) },
  { id: 12, name: "No findings, candidate 7% co-authored", expected: "insufficient", expectedRules: [], input: () => selftestInput({ candidate: { works: Array.from({ length: 100 }, (_, i) => own(i, i < 7)), worksTotal: 100 } }) },
  { id: 13, name: "No findings, reviewer has 3 works", expected: "insufficient", expectedRules: [], input: () => selftestInput({ reviewer: { worksCount: 3 } }) },
  { id: 14, name: "No findings, enough data", expected: "no_conflict", expectedRules: [], input: () => selftestInput() },
];

export type SelftestRow = { id: number; name: string; expected: string; actual: string; pass: boolean };
export function runSelftest(): { rows: SelftestRow[]; passed: number; total: number } {
  const rows = selftestCases.map(test => {
    const out = runRules(test.input());
    const rules = out.findings.map(finding => finding.rule);
    const rulesOk = rules.length === test.expectedRules.length && test.expectedRules.every(rule => rules.includes(rule));
    const extra = test.extra?.(out) ?? null;
    const describe = (result: string, list: string[]) => `${result}${list.length ? ` (${list.join(", ")})` : ""}`;
    return { id: test.id, name: test.name, expected: describe(test.expected, test.expectedRules), actual: describe(out.result, rules) + (extra ? ` — ${extra}` : ""), pass: out.result === test.expected && rulesOk && !extra };
  });
  return { rows, passed: rows.filter(row => row.pass).length, total: rows.length };
}
