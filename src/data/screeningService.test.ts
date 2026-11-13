import { describe, it, expect, beforeEach } from "vitest";
import { addReviewers, canStartScreening, confirmIdentity, getScreening, listReviewers, parseReviewerList, recordDecision, removeReviewer, reviewerSchema, setCandidateConfirmed, startScreening } from "./screeningService";

describe("Reviewer validation", () => {
  it("requires Name", () => { expect(reviewerSchema.safeParse({ name: " ", institution: "University" }).success).toBe(false); });
  it("requires Institution", () => { expect(reviewerSchema.safeParse({ name: "Reviewer", institution: " " }).success).toBe(false); });
  it("accepts optional identity", () => { expect(reviewerSchema.parse({ name: " Reviewer ", institution: " University " })).toEqual({ name: "Reviewer", institution: "University", identity: "" }); });
  it("validates the specified ORCID format including terminal X", () => {
    const base = { name: "Reviewer", institution: "University" };
    expect(reviewerSchema.safeParse({ ...base, identity: "0000-0000-0000-000X" }).success).toBe(true);
    expect(reviewerSchema.safeParse({ ...base, identity: "0000-0000-0000-0000" }).success).toBe(true);
    expect(reviewerSchema.safeParse({ ...base, identity: "0000-0000-0000-00XX" }).success).toBe(false);
  });
  it("accepts only supported safe profile URLs", () => {
    const base = { name: "Reviewer", institution: "University" };
    for (const identity of ["https://orcid.org/0000-0000-0000-000X", "https://openalex.org/A123456"]) expect(reviewerSchema.safeParse({ ...base, identity }).success).toBe(true);
    for (const identity of ["https://orcid.org.evil.com/0000-0000-0000-000X", "javascript:alert(1)", "https://orcid.org/invalid", "https://user:pass@openalex.org/A123"]) expect(reviewerSchema.safeParse({ ...base, identity }).success).toBe(false);
  });
  it("parses rows and reports unreadable line numbers", () => {
    const parsed = parseReviewerList("Ada, University, 0000-0000-0000-000X\nUnreadable\nBen, College\nCara, , invalid");
    expect(parsed.rows.map(row => row.name)).toEqual(["Ada", "Ben"]);
    expect(parsed.errors.map(error => error.line)).toEqual([2, 4]);
  });
});
describe("Prototype screening", () => {
  beforeEach(() => { for (const row of listReviewers("ortiz-2027")) removeReviewer("ortiz-2027", row.id); setCandidateConfirmed("ortiz-2027", false); });
  it("requires at least one reviewer", () => { expect(canStartScreening(0, true)).toBe(false); expect(canStartScreening(1, true)).toBe(true); });
  it("requires candidate confirmation", () => { expect(canStartScreening(1, false)).toBe(false); expect(canStartScreening(1, true)).toBe(true); });
  it("guards screening in the data service as well as the UI", () => {
    expect(() => startScreening("ortiz-2027")).toThrow();
    addReviewers("ortiz-2027", [{ name: "Ada", institution: "University" }]);
    expect(() => startScreening("ortiz-2027")).toThrow();
    setCandidateConfirmed("ortiz-2027", true);
    expect(getScreening(startScreening("ortiz-2027"))?.reviewers[0]?.name).toBe("Ada");
  });
  it("supports removal and keeps screening snapshots separate", () => {
    const rows = addReviewers("ortiz-2027", [{ name: "Ada", institution: "University" }]);
    const row = rows[0]; if (!row) throw new Error("Missing row");
    setCandidateConfirmed("ortiz-2027", true); const id = startScreening("ortiz-2027");
    confirmIdentity(id, row.id, "confirmed"); recordDecision(id, row.id, "needs-review"); removeReviewer("ortiz-2027", row.id);
    expect(listReviewers("ortiz-2027")).toEqual([]);
    expect(getScreening(id)?.identityChoices[row.id]).toBe("confirmed");
    expect(getScreening(id)?.decisions[row.id]).toBe("needs-review");
    expect(getScreening(id)?.reviewers.length).toBe(1);
  });
});