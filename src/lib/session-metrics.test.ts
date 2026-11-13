import { describe, expect, it } from "vitest";
import { computeSessionMetrics, computeTotals, metricsToCsv, type EventRow } from "@/lib/session-metrics";

const session = { id: "s1", participant_code: "P07", facilitator: "Sam", started_at: "2026-11-13T00:00:00Z" };
let t = 0;
const ev = (event: string, reviewer_id: string | null, selection: string | null = null, ms: number | null = null): EventRow => ({ session_id: "s1", reviewer_id, event, option_position: null, profile_id: null, selection, ms_since_row_opened: ms, ms_since_session_start: (t += 1000), created_at: "" });
const correct: [string, string][] = [["R6", "R6-a"], ["R7", "R7-a"], ["R8", "R8-a+R8-b"], ["R9", "R9-cv"], ["R10", "R10-a"], ["R11", "R11-a"], ["R12", "R12-a"], ["R13", "cant-tell"], ["R14", "R14-a"], ["R15", "R15-a"]];

describe("session metrics", () => {
  it("scores a perfect run at 100% over the 10 Needs-you rows", () => {
    const events = [ev("screening_started", null), ...correct.map(([id, sel]) => ev(sel === "cant-tell" ? "cant_tell" : "card_picked", id, sel, 2000)), ev("session_finished", null)];
    const m = computeSessionMetrics(session, events);
    expect(m.needsYou).toBe(10);
    expect(m.errors).toEqual([]);
    expect(m.accuracy).toBe(1);
    expect(m.cantTellCorrect).toBe(true);
  });
  it("lists the R7 decoy, a missed Rossi split, and wrong Can't tell", () => {
    const events = correct.map(([id, sel]) => ev("card_picked", id, id === "R7" ? "R7-b" : id === "R8" ? "R8-a" : id === "R10" ? "cant-tell" : sel));
    const m = computeSessionMetrics(session, events);
    expect(m.errors).toContain("R7: picked the same-name decoy (John A. Miller, Harborview Institute of Technology)");
    expect(m.errors).toContain("R8: missed the second profile for Elena Rossi");
    expect(m.splitProfileAdded).toBe(false);
    expect(m.cantTellCorrect).toBe(true);
    expect(m.cantTellWrong).toEqual(["R10: Aisha Rahman"]);
  });
  it("uses the last identity event, times confirmations, and counts later changes", () => {
    t = 0;
    const events = [ev("screening_started", null), ev("card_picked", "R7", "R7-b", 3000), ev("undo", "R7", ""), ev("card_picked", "R7", "R7-a", 1000), ev("session_finished", null), ev("changed_later", "R7", "R7-a")];
    const m = computeSessionMetrics(session, events);
    expect(m.errors.some(e => e.startsWith("R7"))).toBe(false);
    expect(m.medianConfirmationMs).toBe(2000);
    expect(m.longestConfirmationMs).toBe(3000);
    expect(m.totalMs).toBe(4000);
    expect(m.underFiveMinutes).toBe(true);
    expect(m.changedLater).toBe(1);
    expect(metricsToCsv([m], computeTotals([m])).split("\r\n")).toHaveLength(3);
  });
});
