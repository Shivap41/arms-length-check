import { beforeEach, describe, expect, it } from "vitest";
import { canDownloadAudit, confirmIdentity, confirmNameMatch, countDecisions, getAuditRecord, getCase, getDemoScenario, getScreening, loadDemoReviewers, recordDecision, startScreening } from "./screeningService";
import { auditHtml } from "@/lib/audit-download";

describe("Chair decisions and audit", () => {
  let id: string;
  beforeEach(() => {
    loadDemoReviewers("ortiz-2027"); id = startScreening("ortiz-2027");
    for (const row of getDemoScenario("ortiz-2027").reviewers) if (!row.autoConfirmed) confirmIdentity(id, row.id, row.correctAnswer);
    startScreening("ortiz-2027", id);
  });
  function snapshot() { const value = getScreening(id); if (!value) throw new Error("Missing screening"); return value; }
  it("provides the submitted candidate declarations", () => {
    expect(getCase("ortiz-2027")?.declarations).toEqual({ submitted: "2 Oct 2026", formerPhdAdvisor: "Marco Bianchi, University of Eastmoor", postdoctoralMentor: "none declared", personalOrFinancialTies: "none declared" });
  });
  it.each(["R1", "R3"])("requires 10 trimmed characters when approving a flagged row %s", reviewerId => {
    expect(() => recordDecision(id, reviewerId, "approve", "123456789 ")).toThrow();
    recordDecision(id, reviewerId, "approve", "1234567890");
    expect(snapshot().decisions[reviewerId]?.reason).toBe("1234567890");
  });
  it("allows exclusion without a reason", () => {
    recordDecision(id, "R1", "exclude");
    expect(snapshot().decisions["R1"]).toMatchObject({ decision: "exclude", reason: "", decidedBy: "Dr. Lena Hoffmann" });
    expect(Number.isNaN(Date.parse(snapshot().decisions["R1"]?.decidedAt ?? ""))).toBe(false);
  });
  it.each(["R7", "R13"])("allows unflagged approval without a reason %s", reviewerId => {
    recordDecision(id, reviewerId, "approve"); expect(snapshot().decisions[reviewerId]?.decision).toBe("approve");
  });
  it("counts 12 of 15 and gates the audit until all 15 are decided", () => {
    for (const row of snapshot().reviewers.slice(0, 12)) recordDecision(id, row.id, "exclude");
    expect(countDecisions(snapshot())).toBe(12); expect(canDownloadAudit(snapshot())).toBe(false);
    expect(() => getAuditRecord(id)).toThrow();
    for (const row of snapshot().reviewers.slice(12)) recordDecision(id, row.id, "exclude");
    expect(canDownloadAudit(snapshot())).toBe(true); expect(getAuditRecord(id).reviewers).toHaveLength(15);
  });
  it("invalidates affected decisions after identity or evidence changes", () => {
    recordDecision(id, "R11", "exclude"); recordDecision(id, "R1", "exclude");
    confirmNameMatch(id, "R11", "confirmed"); expect(snapshot().decisions["R11"]).toBeUndefined();
    confirmIdentity(id, "R1", "undo"); expect(snapshot().decisions["R1"]).toBeUndefined();
  });
  it("exports decision attribution, current results, and evidence links", () => {
    for (const row of snapshot().reviewers) recordDecision(id, row.id, "exclude");
    recordDecision(id, "R1", "approve", "Independence verified by the chair.");
    const audit = getAuditRecord(id);
    expect(audit).toMatchObject({ case: "Tenure review — Dr. Maya Ortiz", candidate: "Dr. Maya Ortiz" });
    expect(audit.reviewers.find(row => row.name === "Daniel Okafor")).toMatchObject({ identityMethod: "ORCID auto-confirmed", result: "Conflict", decision: { decision: "approve", reason: "Independence verified by the chair.", decidedBy: "Dr. Lena Hoffmann" } });
    expect(audit.reviewers.flatMap(row => row.evidence).some(item => item.url?.includes("#candidate-declarations"))).toBe(true);
    expect(audit.reviewers.flatMap(row => row.evidence).some(item => item.url?.startsWith("https://doi.org/10.5555/"))).toBe(true);
  });
  it("escapes user-entered decision reasons in downloaded HTML", () => {
    for (const row of snapshot().reviewers) recordDecision(id, row.id, "exclude");
    recordDecision(id, "R1", "approve", "<script>bad()</script>");
    const html = auditHtml(getAuditRecord(id));
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
  });
});