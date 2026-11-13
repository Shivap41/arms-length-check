import { beforeEach, describe, expect, it } from "vitest";
import { confirmIdentity, confirmNameMatch, countResults, getDemoScenario, getResultRows, getScreening, loadDemoReviewers, startScreening } from "./screeningService";

describe("Results evidence and updates", () => {
  let id: string;
  beforeEach(() => {
    loadDemoReviewers("ortiz-2027"); id = startScreening("ortiz-2027");
    for (const reviewer of getDemoScenario("ortiz-2027").reviewers) confirmIdentity(id, reviewer.id, reviewer.correctAnswer);
    startScreening("ortiz-2027", id);
  });
  function rows() { const screening = getScreening(id); if (!screening) throw new Error("Missing screening"); return getResultRows(screening); }
  it("sorts Conflict then Potential then Insufficient data then No conflict found", () => {
    expect(rows().map(row => row.result.status)).toEqual([...Array(3).fill("Conflict"), ...Array(5).fill("Potential"), "Insufficient data", ...Array(6).fill("No conflict found")]);
    expect(countResults(rows())).toEqual({ Conflict: 3, Potential: 5, "Insufficient data": 1, "No conflict found": 6 });
  });
  it("includes complete paper evidence and the 120-author large team", () => {
    const papers = rows().flatMap(row => row.result.sharedPapers);
    expect(papers.every(paper => paper.venue.length > 0 && paper.authorCount > 0 && /^10\.5555\/demo\.\d{4}$/.test(paper.doi))).toBe(true);
    expect(rows().find(row => row.reviewer.id === "R14")?.result.sharedPapers[0]).toMatchObject({ year: 2024, authorCount: 120 });
  });
  it("provides both current institution profiles and the declaration", () => {
    const sameInstitution = rows().find(row => row.reviewer.id === "R5");
    expect(sameInstitution?.candidateProfile.currentInstitution).toBe("Northbridge University");
    expect(sameInstitution?.profiles[0]?.currentInstitution).toBe("Northbridge University");
    expect(rows().find(row => row.reviewer.id === "R15")?.result.declaredRelationship).toBe("Former PhD advisor");
  });
  it("keeps John Miller's three decoy papers out of his clear result", () => {
    const john = rows().find(row => row.reviewer.id === "R7");
    expect(john?.result.status).toBe("No conflict found"); expect(john?.result.sharedPapers).toHaveLength(0); expect(john?.decoyPapers).toHaveLength(3);
  });
  it("different-person byline decision removes the potential without discarding evidence", () => {
    confirmNameMatch(id, "R11", "different");
    const row = rows().find(row => row.reviewer.id === "R11");
    expect(row?.result.status).toBe("No conflict found"); expect(row?.nameMatch).toBe("different"); expect(row?.result.sharedPapers[0]?.authorLabel).toBe("R. Chen");
    expect(countResults(rows())).toMatchObject({ Potential: 4, "No conflict found": 7 });
  });
  it("confirmed 2022 byline becomes a recent-coauthor conflict", () => {
    confirmNameMatch(id, "R11", "confirmed");
    expect(rows().find(row => row.reviewer.id === "R11")?.result).toMatchObject({ status: "Conflict", rule: "R1" });
    expect(countResults(rows())).toMatchObject({ Conflict: 4, Potential: 4 });
  });
  it("changing identity recomputes the result and resets byline decisions", () => {
    confirmNameMatch(id, "R11", "confirmed");
    confirmIdentity(id, "R11", { action: "select-profiles", profileIds: ["R11-b"] });
    startScreening("ortiz-2027", id);
    expect(rows().find(row => row.reviewer.id === "R11")).toMatchObject({ result: { status: "No conflict found" }, nameMatch: undefined });
  });
  it("keeps a wrong identity pick's actual coauthorship result", () => {
    confirmIdentity(id, "R6", { action: "select-profiles", profileIds: ["R6-c"] }); startScreening("ortiz-2027", id);
    expect(rows().find(row => row.reviewer.id === "R6")?.result).toMatchObject({ status: "Conflict", wrongPerson: true, sharedPapers: [{ year: 2024 }] });
  });
});