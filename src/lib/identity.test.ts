import { describe, expect, it } from "vitest";
import { institutionMatches, isValidOrcid, nameMatches, orcidCheckDigit, parseProfileLink, rankAuthors, scoreAuthor, stripTrailingInitials, toLiveProfile, type OpenAlexAuthor } from "./identity";

const author = (over: Partial<OpenAlexAuthor> = {}): OpenAlexAuthor => ({
  id: "https://openalex.org/A1", display_name: "Gavin J. Knott", works_count: 71,
  last_known_institutions: [{ display_name: "Monash University" }],
  affiliations: [{ institution: { display_name: "The University of Western Australia" }, years: [2014, 2022] }],
  topics: [{ display_name: "CRISPR" }], ...over,
});

describe("ORCID check digit (ISO 7064 mod 11-2)", () => {
  it("accepts the ORCID documentation example 0000-0002-1825-0097", () => {
    expect(orcidCheckDigit("000000021825009")).toBe("7");
    expect(isValidOrcid("0000-0002-1825-0097")).toBe(true);
  });
  it("rejects the same iD with one digit changed", () => {
    expect(isValidOrcid("0000-0002-1825-0098")).toBe(false);
    expect(isValidOrcid("0000-0002-1835-0097")).toBe(false);
  });
  it("handles an X check digit (Doudna)", () => { expect(isValidOrcid("0000-0001-9161-999X")).toBe(true); expect(isValidOrcid("0000-0001-9161-9990")).toBe(false); });
  it("rejects malformed input such as 1234", () => { expect(isValidOrcid("1234")).toBe(false); });
});

describe("pasted profile links", () => {
  it("reads bare and orcid.org ORCIDs, and openalex.org author URLs", () => {
    expect(parseProfileLink("0000-0002-1825-0097")).toEqual({ ok: true, link: { kind: "orcid", orcid: "0000-0002-1825-0097" } });
    expect(parseProfileLink("https://orcid.org/0000-0001-9161-999x")).toEqual({ ok: true, link: { kind: "orcid", orcid: "0000-0001-9161-999X" } });
    expect(parseProfileLink("https://openalex.org/A5007230579")).toEqual({ ok: true, link: { kind: "openalex", id: "A5007230579" } });
  });
  it("gives an inline error for 1234 and for a bad check digit", () => {
    expect(parseProfileLink("1234")).toMatchObject({ ok: false, error: expect.stringContaining("ORCID iD (0000-0000-0000-000X)") });
    expect(parseProfileLink("0000-0002-1825-0098")).toMatchObject({ ok: false, error: expect.stringContaining("check digit") });
  });
});

describe("name parts", () => {
  it("strips trailing single-letter name parts", () => {
    expect(stripTrailingInitials("Kyle E")).toBe("Kyle");
    expect(stripTrailingInitials("Gavin Knott J.")).toBe("Gavin Knott");
    expect(stripTrailingInitials("Jennifer A. Doudna")).toBe("Jennifer A. Doudna");
    expect(stripTrailingInitials("X")).toBe("X");
  });
  it("matches same surname with first name or initial agreeing, accent-insensitive", () => {
    expect(nameMatches("Gavin Knott", "Gavin J. Knott")).toBe(true);
    expect(nameMatches("G. Knott", "Gavin J. Knott")).toBe(true);
    expect(nameMatches("Gavin Knott", "Knott, Gavin")).toBe(true);
    expect(nameMatches("Jose Garcia", "José García")).toBe(true);
    expect(nameMatches("Gavin Knott", "Graham Knott")).toBe(false);
    expect(nameMatches("Gavin Knott", "Gavin Knotts")).toBe(false);
  });
  it("institution match is a case- and accent-insensitive contains match", () => {
    expect(institutionMatches("monash university", "Monash University")).toBe(true);
    expect(institutionMatches("Université de Montréal", "Universite de Montreal")).toBe(true);
    expect(institutionMatches("Berkeley", "University of California, Berkeley")).toBe(true);
    expect(institutionMatches("Monash University", "Deakin University")).toBe(false);
  });
});

describe("0.5 / 0.4 / 0.1 scoring", () => {
  it("adds 0.5 for the name, 0.4 for the institution, 0.1 for 20+ works", () => {
    expect(scoreAuthor("Gavin Knott", "Monash University", author()).score).toBe(1);
    expect(scoreAuthor("Gavin Knott", "Monash University", author({ works_count: 19 })).score).toBe(0.9);
    expect(scoreAuthor("Gavin Knott", "Deakin University", author()).score).toBe(0.6);
    expect(scoreAuthor("Gavin Knott", "Deakin University", author({ works_count: 3 })).score).toBe(0.5);
    expect(scoreAuthor("Graham Knott", "Monash University", author({ works_count: 3 })).score).toBe(0.4);
    expect(scoreAuthor("Graham Knott", "Deakin University", author()).score).toBe(0.1);
  });
  it("counts past affiliations, not just current ones", () => {
    expect(scoreAuthor("Gavin Knott", "University of Western Australia", author()).institution).toBe(true);
  });
  it("returns the top 3, highest score first, ties broken by works", () => {
    const list = [author({ id: "A1", works_count: 5, last_known_institutions: [] }), author({ id: "A2" }), author({ id: "A3", display_name: "Graham Knott", works_count: 3 }), author({ id: "A4", works_count: 30, last_known_institutions: [] })];
    expect(rankAuthors("Gavin Knott", "Monash University", list).map(entry => entry.author.id)).toEqual(["A2", "A4", "A1"]);
  });
});

describe("profile summary", () => {
  it("keeps current institutions, up to 5 past affiliations with years, 3 topics and 3 works", () => {
    const profile = toLiveProfile(author({ orcid: "https://orcid.org/0000-0002-9007-6273", affiliations: Array.from({ length: 7 }, (_, i) => ({ institution: { display_name: `Inst ${i}` }, years: [2000 + i, 2001 + i] })), topics: ["a", "b", "c", "d"].map(display_name => ({ display_name })) }), [1, 2, 3, 4].map(n => ({ title: `W${n}`, year: 2020 + n, doi: null })));
    expect(profile.id).toBe("A1");
    expect(profile.orcid).toBe("0000-0002-9007-6273");
    expect(profile.currentInstitutions).toEqual(["Monash University"]);
    expect(profile.pastAffiliations).toHaveLength(5);
    expect(profile.pastAffiliations[0]).toEqual({ institution: "Inst 6", fromYear: 2006, toYear: 2007 });
    expect(profile.topics).toEqual(["a", "b", "c"]);
    expect(profile.recentWorks).toHaveLength(3);
  });
});
