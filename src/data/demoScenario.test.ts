import { beforeEach, describe, expect, it } from "vitest";
import { confirmIdentity, getCase, getDemoScenario, getReviewerScenario, getScreening, listReviewers, loadDemoReviewers, reviewerSchema, startScreening } from "./screeningService";

const caseId = "ortiz-2027";
function pick(id: string, profileIds: string[]) {
  const screeningId = startScreening(caseId);
  confirmIdentity(screeningId, id, { action: "select-profiles", profileIds });
  return getScreening(screeningId)?.results[id];
}
describe("Fictional demo scenario", () => {
  beforeEach(() => loadDemoReviewers(caseId));
  it("loads exactly 15 reviewers without duplicating repeat loads", () => { loadDemoReviewers(caseId); expect(listReviewers(caseId)).toHaveLength(15); expect(listReviewers(caseId)[0]).toMatchObject({ id: "R1", name: "Daniel Okafor", institution: "Crestfield University", identity: "0000-0000-0000-0011" }); });
  it("confirms the specified candidate profile", () => { expect(getCase(caseId)?.candidateProfile).toMatchObject({ displayName: "Dr. Maya Ortiz", currentInstitution: "Northbridge University", worksCount: 118, coauthoredPercent: 92, orcid: "0000-0000-0000-0001", confirmed: true }); expect(getCase(caseId)?.candidateConfirmed).toBe(true); });
  it("accepts every fictional demo ORCID without a check-digit test", () => { for (const row of listReviewers(caseId)) expect(reviewerSchema.safeParse(row).success).toBe(true); });
  it("gives every profile three recent topic-based papers and fictional unique DOIs", () => {
    const scenario = getDemoScenario(caseId);
    const profiles = [scenario.candidate, ...scenario.reviewers.flatMap(row => [...row.options, ...row.additionalProfiles])];
    const papers = profiles.flatMap(profile => profile.recentPapers);
    for (const profile of profiles) {
      expect(profile.topics).toHaveLength(3);
      expect(profile.recentPapers).toHaveLength(3);
      expect(profile.recentPapers.map(paper => paper.year)).toEqual([2025, 2024, 2023]);
      expect(profile.recentPapers.every(paper => profile.topics.some(topic => paper.title.includes(topic)))).toBe(true);
    }
    expect(papers.every(paper => /^10\.5555\/demo\.\d{4}$/.test(paper.doi))).toBe(true);
    expect(new Set(papers.map(paper => paper.doi)).size).toBe(papers.length);
  });
  it("auto-confirms R1–R5 only", () => { const screening = getScreening(startScreening(caseId)); expect(Object.keys(screening?.results ?? {})).toEqual(["R1", "R2", "R3", "R4", "R5"]); });
  it("R1 has recent coauthorship conflict in 2023 and 2025", () => { const result = pick("R1", ["R1-a"]); expect(result).toMatchObject({ status: "Conflict", rule: "R1" }); expect(result?.sharedPapers.map(paper => paper.year)).toEqual([2023, 2025]); });
  it.each(["R2", "R4", "R6", "R7", "R10", "R12"])("%s correct identity has no conflict", id => { expect(pick(id, [`${id}-a`])?.status).toBe("No conflict found"); });
  it("R3 flags 2017 coauthorship as Potential R2", () => { expect(pick("R3", ["R3-a"])).toMatchObject({ status: "Potential", rule: "R2", sharedPapers: [{ year: 2017 }] }); });
  it("R5 conflicts because ORCID employment has no end date", () => { expect(pick("R5", ["R5-a"])).toMatchObject({ status: "Conflict", rule: "R3", employment: { institution: "Northbridge University", source: "ORCID employment", endYear: null } }); });
  it("R6 wrong picks follow the selected person, including the 2024 coauthor", () => { expect(pick("R6", ["R6-b"])).toMatchObject({ status: "No conflict found", wrongPerson: true }); expect(pick("R6", ["R6-c"])).toMatchObject({ status: "Conflict", rule: "R1", wrongPerson: true, sharedPapers: [{ year: 2024 }] }); });
  it("R7 stores the collapsed same-name note and real coauthor decoy", () => { expect(pick("R7", ["R7-a"])?.note).toMatchObject({ collapsed: true }); const result = pick("R7", ["R7-b"]); expect(result).toMatchObject({ status: "Conflict", rule: "R1", wrongPerson: true }); expect(result?.sharedPapers).toHaveLength(3); });
  it("R8 requires merging a+b to reveal the 2016 Potential", () => { expect(pick("R8", ["R8-a"])?.status).toBe("No conflict found"); expect(pick("R8", ["R8-b", "R8-a"])).toMatchObject({ status: "Potential", rule: "R2", wrongPerson: false, sharedPapers: [{ year: 2016 }] }); });
  it("R9 has no correct option and the CV ORCID reveals 2018 coauthorship", () => { const scenario = getReviewerScenario(caseId, "R9"); expect(scenario?.options.every(profile => profile.currentInstitution !== "Harborview Institute of Technology")).toBe(true); const id = startScreening(caseId); confirmIdentity(id, "R9", { action: "paste-orcid", orcid: "0000-0000-0000-0019" }); expect(getScreening(id)?.results["R9"]).toMatchObject({ status: "Potential", rule: "R2", sharedPapers: [{ year: 2018 }] }); });
  it("R11 keeps missing author ID ambiguity and the Northbridge decoy", () => { expect(pick("R11", ["R11-a"])).toMatchObject({ status: "Potential", explanation: "Same name on a shared paper; check it's this person", sharedPapers: [{ year: 2022, authorLabel: "R. Chen", authorIdMissing: true }] }); expect(pick("R11", ["R11-c"])).toMatchObject({ status: "Conflict", rule: "R3", wrongPerson: true }); });
  it("R13 can't tell produces Insufficient data", () => { const id = startScreening(caseId); confirmIdentity(id, "R13", { action: "cant-tell" }); expect(getScreening(id)?.results["R13"]).toMatchObject({ status: "Insufficient data", explanation: "Identity not confirmed" }); });
  it("does not infer the correct identity from a generic confirmation", () => { const id = startScreening(caseId); confirmIdentity(id, "R8", "confirmed"); expect(getScreening(id)?.results["R8"]?.status).toBe("Insufficient data"); });
  it("R14 flags the 2024 large team paper with 120 authors", () => { expect(pick("R14", ["R14-a"])).toMatchObject({ status: "Potential", explanation: "Large team paper", sharedPapers: [{ year: 2024, authorCount: 120 }] }); });
  it("R15 conflicts as the declared former PhD advisor", () => { expect(pick("R15", ["R15-a"])).toMatchObject({ status: "Conflict", rule: "R5", declaredRelationship: "Former PhD advisor" }); });
  it("stores outcomes for every option and can't tell on every reviewer", () => {
    for (const row of getDemoScenario(caseId).reviewers) {
      expect(row.resultsByChoice["cant-tell"]).toMatchObject({ status: "Insufficient data", explanation: "Identity not confirmed" });
      for (const option of row.options) expect(row.resultsByChoice[option.id]?.status).toBeDefined();
      expect(row.resultsByChoice["wrong-pick"]?.wrongPerson).toBe(true);
    }
  });
  it("produces exactly the expected totals with all correct picks", () => {
    const id = startScreening(caseId);
    for (const row of getDemoScenario(caseId).reviewers) confirmIdentity(id, row.id, row.correctAnswer);
    const totals: Record<string, number> = {};
    for (const result of Object.values(getScreening(id)?.results ?? {})) totals[result.status] = (totals[result.status] ?? 0) + 1;
    expect(totals).toEqual({ Conflict: 3, Potential: 5, "Insufficient data": 1, "No conflict found": 6 });
  });
  it("rejects a profile from another reviewer", () => { const id = startScreening(caseId); expect(() => confirmIdentity(id, "R6", { action: "select-profiles", profileIds: ["R7-a"] })).toThrow("Choose a profile offered"); });
});