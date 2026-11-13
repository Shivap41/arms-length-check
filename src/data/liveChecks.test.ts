import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allChecksSettled, checkDurationMs, confirmIdentity, countResults, getCheckStates, getResultRows, getScreening, loadDemoReviewers, profileSearchDelayMs, recordDecision, resetDemoCase, retryCheck, setDemoSettings, startScreening } from "./screeningService";

const caseId = "ortiz-2027";
describe("simulated live checks", () => {
  beforeEach(() => { vi.useFakeTimers(); resetDemoCase(caseId); loadDemoReviewers(caseId); setDemoSettings({ latency: "realistic", simulateFailure: false }); });
  afterEach(() => { vi.useRealTimers(); setDemoSettings({ latency: "realistic", simulateFailure: false }); });
  it("realistic timings are 1.5–4 s and seeded per reviewer", () => { for (const id of ["R1", "R6", "R15"]) { const ms = checkDurationMs(id); expect(ms).toBeGreaterThanOrEqual(1500); expect(ms).toBeLessThanOrEqual(4000); expect(checkDurationMs(id)).toBe(ms); } });
  it("slow timings are 6–12 s; off is instant", () => { const ms = checkDurationMs("R6", "slow"); expect(ms).toBeGreaterThanOrEqual(6000); expect(ms).toBeLessThanOrEqual(12000); expect(checkDurationMs("R6", "off")).toBe(0); });
  it("profile search waits 0.5–1 s", () => { const ms = profileSearchDelayMs("R7"); expect(ms).toBeGreaterThanOrEqual(500); expect(ms).toBeLessThanOrEqual(1000); });
  it("starts the 5 ORCID checks when step 1 opens and each other on confirmation", () => {
    const id = startScreening(caseId);
    expect(Object.keys(getCheckStates(id))).toEqual(["R1", "R2", "R3", "R4", "R5"]);
    confirmIdentity(id, "R6", { action: "select-profiles", profileIds: ["R6-a"] });
    expect(getCheckStates(id)["R6"]?.status).toBe("running");
    vi.advanceTimersByTime(4001);
    expect(allChecksSettled(id)).toBe(true);
    expect(getCheckStates(id)["R6"]?.stage).toBe("Done");
  });
  it("changing an identity restarts that check; undo cancels it", () => {
    const id = startScreening(caseId);
    confirmIdentity(id, "R6", { action: "select-profiles", profileIds: ["R6-a"] });
    vi.advanceTimersByTime(4001);
    confirmIdentity(id, "R6", { action: "select-profiles", profileIds: ["R6-c"] });
    expect(getCheckStates(id)["R6"]?.status).toBe("running");
    confirmIdentity(id, "R6", "undo");
    expect(getCheckStates(id)["R6"]).toBeUndefined();
  });
  it("Laura Becker's simulated failure never counts as No conflict found, and Retry re-runs only her", () => {
    setDemoSettings({ latency: "off", simulateFailure: true });
    const id = startScreening(caseId);
    for (const r of ["R6", "R7", "R10", "R11", "R12", "R14", "R15"]) confirmIdentity(id, r, { action: "select-profiles", profileIds: [`${r}-a`] });
    confirmIdentity(id, "R8", { action: "select-profiles", profileIds: ["R8-a", "R8-b"] });
    confirmIdentity(id, "R9", { action: "paste-orcid", orcid: "0000-0000-0000-0019" });
    confirmIdentity(id, "R13", { action: "cant-tell" });
    startScreening(caseId, id);
    expect(getCheckStates(id)["R12"]?.status).toBe("failed");
    const screening = getScreening(id)!;
    expect(getResultRows(screening).find(row => row.reviewer.id === "R12")?.checkFailed).toBe(true);
    expect(countResults(getResultRows(screening))["No conflict found"]).toBe(5);
    expect(() => recordDecision(id, "R12", "approve")).toThrow("Retry");
    retryCheck(id, "R12");
    expect(getCheckStates(id)["R12"]?.status).toBe("done");
    expect(countResults(getResultRows(getScreening(id)!))).toEqual({ Conflict: 3, Potential: 5, "Insufficient data": 1, "No conflict found": 6 });
  });
});
