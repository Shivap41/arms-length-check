import { beforeEach, describe, expect, it } from "vitest";
import { canReviewResults, confirmIdentity, getIdentityReviews, getScreening, hasIdentityUndo, loadDemoReviewers, startScreening, undoLastIdentity } from "./screeningService";

describe("Identity confirmation step", () => {
  let id: string;
  beforeEach(() => { loadDemoReviewers("ortiz-2027"); id = startScreening("ortiz-2027"); });
  it("starts with five ORCID-confirmed reviewers and ten needs-you rows", () => {
    const rows = getIdentityReviews(id);
    expect(rows.filter(row => row.status === "orcid")).toHaveLength(5);
    expect(rows.filter(row => row.status === "needs-you")).toHaveLength(10);
    expect(canReviewResults(id)).toBe(false);
  });
  it("makes every row view identity-only with no conflict fields", () => {
    expect(getIdentityReviews(id).every(row => !("results" in row) && !("resultsByChoice" in row) && !("correctAnswer" in row))).toBe(true);
  });
  it("undoes automatic ORCID confirmation", () => {
    confirmIdentity(id, "R1", "undo");
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R1")?.status).toBe("needs-you");
    expect(getScreening(id)?.results["R1"]).toBeUndefined();
  });
  it("records selected profile identity and restores it after undoing a change", () => {
    confirmIdentity(id, "R6", { action: "select-profiles", profileIds: ["R6-a"] });
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R6")).toMatchObject({ status: "chair", selectedIds: ["R6-a"] });
    confirmIdentity(id, "R6", { action: "select-profiles", profileIds: ["R6-b"] });
    expect(undoLastIdentity(id)).toBe("R6");
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R6")?.selectedIds).toEqual(["R6-a"]);
    undoLastIdentity(id);
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R6")?.status).toBe("needs-you");
    expect(hasIdentityUndo(id)).toBe(false);
  });
  it("supports adding the second profile without losing the first", () => {
    confirmIdentity(id, "R8", { action: "select-profiles", profileIds: ["R8-a", "R8-b"] });
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R8")?.matchedProfiles.map(profile => profile.id)).toEqual(["R8-a", "R8-b"]);
    expect(getScreening(id)?.results["R8"]?.status).toBe("Potential");
  });
  it.each(["0000-0000-0000-0019", "https://orcid.org/0000-0000-0000-0019", "https://openalex.org/R9-cv"])("resolves the CV identity from %s", link => {
    confirmIdentity(id, "R9", { action: "paste-profile", link });
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R9")?.matchedProfiles[0]).toMatchObject({ displayName: "Michael Brandt", currentInstitution: "Harborview Institute of Technology", orcid: "0000-0000-0000-0019" });
  });
  it("rejects unknown or unsafe links without making a choice", () => {
    for (const link of ["https://orcid.org/0000-0000-0000-0099", "https://evil.com/profile", "javascript:alert(1)"]) expect(() => confirmIdentity(id, "R9", { action: "paste-profile", link })).toThrow();
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R9")?.status).toBe("needs-you");
    expect(hasIdentityUndo(id)).toBe(false);
  });
  it("can't tell handles a row with the identity-not-confirmed reason", () => {
    confirmIdentity(id, "R13", { action: "cant-tell" });
    expect(getIdentityReviews(id).find(row => row.reviewer.id === "R13")?.status).toBe("cant-tell");
    expect(getScreening(id)?.results["R13"]).toMatchObject({ status: "Insufficient data", explanation: "Identity not confirmed" });
  });
  it("gates results and retains all choices when startScreening finalizes", () => {
    expect(() => startScreening("ortiz-2027", id)).toThrow("Handle every reviewer");
    for (const row of getIdentityReviews(id).filter(row => row.status === "needs-you")) confirmIdentity(id, row.reviewer.id, { action: "cant-tell" });
    expect(canReviewResults(id)).toBe(true);
    expect(startScreening("ortiz-2027", id)).toBe(id);
    expect(getScreening(id)?.resultsReady).toBe(true);
    expect(Object.keys(getScreening(id)?.results ?? {})).toHaveLength(15);
    undoLastIdentity(id);
    expect(getScreening(id)?.resultsReady).toBe(false);
  });
});