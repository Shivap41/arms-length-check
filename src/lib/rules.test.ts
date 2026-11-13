import { describe, expect, it, vi } from "vitest";
import { runRules, type RuleWork, type RulesInput } from "./rules";

// The 14 B5 self-test cases, run directly against the pure rules engine.
const today = "2026-11-13";
const authors = (n: number, extra: RuleWork["authors"] = []) => [{ id: "AC", name: "Cara Candidate" }, { id: "AR", name: "Rita Reviewer" }, ...extra, ...Array.from({ length: Math.max(0, n - 2 - extra.length) }, (_, i) => ({ id: `AX${i}`, name: `Other Author${i}` }))];
const work = (over: Partial<RuleWork> = {}): RuleWork => ({ id: `W${Math.random()}`, doi: "https://doi.org/10.1/x", title: "Shared paper", year: 2025, type: "article", venue: "Journal", authors: authors(6), ...over });
const ownWork = (i: number, coauthored = true): RuleWork => ({ id: `C${i}`, doi: null, title: `Own ${i}`, year: 2020, type: "article", venue: null, authors: coauthored ? [{ id: "AC", name: "Cara Candidate" }, { id: `AY${i}`, name: `Colleague Number${i}` }] : [{ id: "AC", name: "Cara Candidate" }] });
function input(over: { candidate?: Partial<RulesInput["candidate"]>; reviewer?: Partial<RulesInput["reviewer"]> } & Partial<Omit<RulesInput, "candidate" | "reviewer">> = {}): RulesInput {
  const { candidate, reviewer, ...rest } = over;
  return {
    today, sharedWorks: [], institutionTypes: {}, declarations: [],
    candidate: { profileIds: ["AC"], worksCount: 50, current: [], history: [], works: Array.from({ length: 10 }, (_, i) => ownWork(i)), worksTotal: 10, ...candidate },
    reviewer: { profileIds: ["AR"], typedName: "Rita Reviewer", profileNames: ["Rita Reviewer"], worksCount: 40, current: [], history: [], ...reviewer },
    ...rest,
  };
}
const rules = (out: ReturnType<typeof runRules>) => out.findings.map(finding => finding.rule);

describe("B5 rules self-test (14 cases)", () => {
  it("1. shared article from last year, 6 authors -> conflict (R1)", () => {
    const out = runRules(input({ sharedWorks: [work({ year: 2025 })] }));
    expect(out.result).toBe("conflict"); expect(rules(out)).toEqual(["R1"]);
  });
  it("2. only shared article is 8 years old -> potential (R2)", () => {
    const out = runRules(input({ sharedWorks: [work({ year: 2018 })] }));
    expect(out.result).toBe("potential"); expect(rules(out)).toEqual(["R2"]);
  });
  it("3. only shared article has 120 authors -> potential (LARGE_TEAM)", () => {
    const out = runRules(input({ sharedWorks: [work({ authors: authors(120) })] }));
    expect(out.result).toBe("potential"); expect(rules(out)).toEqual(["LARGE_TEAM"]);
  });
  it("4. shared preprint and the published article with the same title -> counted once", () => {
    const out = runRules(input({ sharedWorks: [work({ id: "W1", type: "preprint", title: "Cas9: a study" }), work({ id: "W2", type: "article", title: "CAS9 - a study." })] }));
    expect(out.result).toBe("conflict");
    expect((out.findings[0]?.evidence["works"] as unknown[]).length).toBe(1);
  });
  it("5. shared work of type dataset only -> ignored -> no_conflict", () => {
    const out = runRules(input({ sharedWorks: [work({ type: "dataset" })] }));
    expect(out.result).toBe("no_conflict"); expect(out.findings).toEqual([]);
  });
  it("6. candidate byline with the reviewer's name but a different author id -> SAME_NAME_OTHER_PERSON (info), not conflict", () => {
    const works = [...Array.from({ length: 9 }, (_, i) => ownWork(i)), { ...ownWork(99), authors: [{ id: "AC", name: "Cara Candidate" }, { id: "A999", name: "Rita Reviewer" }] }];
    const out = runRules(input({ candidate: { works } }));
    expect(rules(out)).toEqual(["SAME_NAME_OTHER_PERSON"]);
    expect(out.findings[0]?.severity).toBe("info");
    expect(out.result).toBe("no_conflict");
  });
  it("7. candidate byline with the reviewer's name and no author id -> potential (NAME_ONLY)", () => {
    const works = [...Array.from({ length: 9 }, (_, i) => ownWork(i)), { ...ownWork(99), authors: [{ id: "AC", name: "Cara Candidate" }, { id: null, name: "R. Reviewer", rawName: "R. Reviewer" }] }];
    const out = runRules(input({ candidate: { works } }));
    expect(out.result).toBe("potential"); expect(rules(out)).toEqual(["NAME_ONLY"]);
  });
  it("8. both have current ORCID employment (no end year) at the same education institution -> conflict (R3)", () => {
    const record = { id: "I1", name: "University of Example", type: null, years: [2026], source: "ORCID employment, current" };
    const out = runRules(input({ institutionTypes: { I1: "education" }, candidate: { current: [record] }, reviewer: { current: [record] } }));
    expect(out.result).toBe("conflict"); expect(rules(out)).toEqual(["R3"]);
  });
  it("9. same institution only from an old record, overlapping 6 years ago -> potential (R4), not conflict", () => {
    const out = runRules(input({ institutionTypes: { I1: "education" }, candidate: { history: [{ id: "I1", name: "University of Example", type: "education", years: [2018, 2019, 2020], source: "affiliation history" }] }, reviewer: { history: [{ id: "I1", name: "University of Example", type: "education", years: [2020, 2021], source: "affiliation history" }] } }));
    expect(out.result).toBe("potential"); expect(rules(out)).toEqual(["R4"]);
  });
  it("10. shared institution of type funder -> no institution finding", () => {
    const record = { id: "I2", name: "Example Medical Research Institute", type: "funder", years: [2026], source: "byline 2026" };
    const out = runRules(input({ institutionTypes: { I2: "funder" }, candidate: { current: [record], history: [record] }, reviewer: { current: [record], history: [record] } }));
    expect(out.findings).toEqual([]); expect(out.result).toBe("no_conflict");
  });
  it("11. declaration 'advisor' matching the reviewer's name -> conflict (R5)", () => {
    const out = runRules(input({ declarations: [{ name: "Rita Reviewer", relationship: "advisor", note: null }] }));
    expect(out.result).toBe("conflict"); expect(rules(out)).toEqual(["R5"]);
  });
  it("12. no findings, candidate 7% co-authored -> insufficient", () => {
    const works = Array.from({ length: 100 }, (_, i) => ownWork(i, i < 7));
    const out = runRules(input({ candidate: { works, worksTotal: 100 } }));
    expect(out.result).toBe("insufficient"); expect(out.reason).toBe("Publication data says little for this candidate");
  });
  it("13. no findings, reviewer has 3 works -> insufficient", () => {
    const out = runRules(input({ reviewer: { worksCount: 3 } }));
    expect(out.result).toBe("insufficient"); expect(out.reason).toBe("Not enough publication data");
  });
  it("14. no findings, enough data -> no_conflict", () => {
    const out = runRules(input());
    expect(out.result).toBe("no_conflict"); expect(out.findings).toEqual([]);
  });
});

describe("rules extras", () => {
  it("is pure: no network, same output for the same input", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const value = input({ sharedWorks: [work({ id: "W1", year: 2025 })] });
    expect(runRules(value)).toEqual(runRules(value));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("'today' decides recent vs older, not the clock", () => {
    const shared = [work({ id: "W1", year: 2021 })];
    expect(rules(runRules(input({ sharedWorks: shared })))).toEqual(["R1"]);
    expect(rules(runRules(input({ today: "2027-01-01", sharedWorks: shared })))).toEqual(["R2"]);
  });
  it("says when the name scan covered only part of the candidate's works", () => {
    const out = runRules(input({ candidate: { works: Array.from({ length: 1000 }, (_, i) => ownWork(i)), worksTotal: 1500 } }));
    expect(out.nameScan).toEqual({ covered: 1000, total: 1500 });
    expect(out.reason).toContain("name scan covered 1000 of 1500 works");
  });
  it("R3 beats R4 for the same institution, and R4 needs overlap within 10 years", () => {
    const old = { id: "I1", name: "U", type: "education", years: [2005, 2006], source: "affiliation history" };
    expect(runRules(input({ candidate: { history: [old] }, reviewer: { history: [old] } })).findings).toEqual([]);
  });
  it("evidence carries title, year, DOI, venue, author count and profile id", () => {
    const out = runRules(input({ sharedWorks: [work({ id: "W1" })] }));
    expect((out.findings[0]?.evidence["works"] as unknown[])[0]).toEqual({ title: "Shared paper", year: 2025, doi: "https://doi.org/10.1/x", venue: "Journal", author_count: 6, profile_id: "AR" });
  });
});

describe("result reason", () => {
  it("groups findings by rule and names the institutions", () => {
    const rec = (id: string, name: string) => ({ id, name, type: "education", years: [2026], source: "byline 2026" });
    const out = runRules(input({ sharedWorks: [work({ id: "W1" }), work({ id: "W2", title: "Another", doi: "https://doi.org/10.1/y" })], candidate: { current: [rec("I1", "Uni A"), rec("I2", "Uni B")] }, reviewer: { current: [rec("I1", "Uni A"), rec("I2", "Uni B")] } }));
    expect(out.reason).toBe("recent co-authored work (2, R1); same current institution: Uni A, Uni B (R3)");
  });
});

describe("D57 umbrella institutions", () => {
  const ucSystem = (years: number[]) => ({ id: "I2803209242", name: "University of California System", type: "education", years, source: "affiliation history" });
  const berkeley = { id: "I95457486", name: "University of California, Berkeley", type: "education", years: [2015, 2016, 2017, 2018], source: "affiliation history" };
  const davis = { id: "I84218800", name: "University of California, Davis", type: "education", years: [2016, 2017, 2018], source: "affiliation history" };
  it("UC Berkeley vs UC Davis people do NOT get R4 via the UC System", () => {
    const out = runRules(input({ umbrellaInstitutionIds: ["I2803209242"], candidate: { history: [berkeley, ucSystem([2015, 2016, 2017, 2018])] }, reviewer: { history: [davis, ucSystem([2016, 2017, 2018])] } }));
    expect(out.findings).toEqual([]);
    expect(out.result).toBe("no_conflict");
  });
  it("…and not R3 either when both have current UC System bylines", () => {
    const current = { ...ucSystem([2026]), source: "byline 2026" };
    expect(runRules(input({ umbrellaInstitutionIds: ["I2803209242"], candidate: { current: [current] }, reviewer: { current: [current] } })).findings).toEqual([]);
  });
  it("a name-only 'System' record is ignored too; the specific campus still counts", () => {
    const nameOnly = { id: null, name: "University of California System", type: "education", years: [2026], source: "ORCID employment, current" };
    expect(runRules(input({ candidate: { current: [nameOnly] }, reviewer: { current: [nameOnly] } })).findings).toEqual([]);
    const both = { ...berkeley, years: [2020, 2021] };
    expect(runRules(input({ umbrellaInstitutionIds: ["I2803209242"], candidate: { history: [both] }, reviewer: { history: [both] } })).findings.map(f => f.rule)).toEqual(["R4"]);
  });
});

describe("D57 preprint versions", () => {
  it("counts _v1 and _v2 of one preprint DOI once, keeping the latest", () => {
    const v1 = work({ id: "W1", type: "preprint", year: 2025, title: "Cognitive Science at Scale", doi: "https://doi.org/10.31234/osf.io/mnkwd_v1" });
    const v2 = work({ id: "W2", type: "preprint", year: 2026, title: "Scaling cognitive science with classroom games", doi: "https://doi.org/10.31234/osf.io/mnkwd_v2" });
    const out = runRules(input({ sharedWorks: [v1, v2] }));
    const works = out.findings[0]?.evidence["works"] as { year: number; doi: string }[];
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({ year: 2026, doi: "https://doi.org/10.31234/osf.io/mnkwd_v2" });
  });
  it("keeps genuinely different DOIs, and treats .v2 the same as _v2", () => {
    expect(runRules(input({ sharedWorks: [work({ id: "A", doi: "10.1/a.v1" }), work({ id: "B", doi: "10.1/a.v2" }), work({ id: "C", doi: "10.1/b", title: "Other" })] })).findings[0]?.evidence["works"]).toHaveLength(2);
  });
});
