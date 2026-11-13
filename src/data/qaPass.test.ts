import { beforeEach, describe, expect, it } from "vitest";
import { confirmIdentity, countResults, getDemoScenario, getResultRows, getScreening, loadDemoReviewers, startScreening, type IdentityChoice } from "./screeningService";

const caseId = "ortiz-2027";
function run(overrides: Record<string, IdentityChoice> = {}) {
  const id = startScreening(caseId);
  for (const row of getDemoScenario(caseId).reviewers) if (!row.autoConfirmed || overrides[row.id]) confirmIdentity(id, row.id, overrides[row.id] ?? row.correctAnswer);
  const screening = getScreening(id)!;
  return { screening, rows: getResultRows(screening) };
}
const status = (rows: ReturnType<typeof run>["rows"], id: string) => rows.find(row => row.reviewer.id === id)?.result.status;

describe("QA pass", () => {
  beforeEach(() => loadDemoReviewers(caseId));
  it("all correct answers give 3 / 5 / 1 / 6", () => { expect(countResults(run().rows)).toEqual({ Conflict: 3, Potential: 5, "Insufficient data": 1, "No conflict found": 6 }); });
  it("Wei Zhang option (c) becomes Conflict", () => { expect(status(run({ R6: { action: "select-profiles", profileIds: ["R6-c"] } }).rows, "R6")).toBe("Conflict"); });
  it("John Miller option (b) becomes Conflict", () => { expect(status(run({ R7: { action: "select-profiles", profileIds: ["R7-b"] } }).rows, "R7")).toBe("Conflict"); });
  it("skipping Elena Rossi's second profile gives No conflict found", () => { expect(status(run({ R8: { action: "select-profiles", profileIds: ["R8-a"] } }).rows, "R8")).toBe("No conflict found"); });
  it.each(getDemoScenario(caseId).reviewers.map(row => row.id))("Can't tell on %s gives Insufficient data", id => { expect(status(run({ [id]: { action: "cant-tell" } }).rows, id)).toBe("Insufficient data"); });
  it("no Conflict appears for an unconfirmed reviewer", () => {
    const id = startScreening(caseId);
    const rows = getResultRows(getScreening(id)!);
    expect(rows.map(row => row.reviewer.id)).toEqual(expect.arrayContaining(["R1", "R5"]));
    expect(rows.every(row => getScreening(id)!.identitySources[row.reviewer.id] === "orcid")).toBe(true);
    const finished = run({ R6: { action: "cant-tell" }, R7: { action: "cant-tell" } });
    for (const row of finished.rows.filter(r => r.result.status === "Conflict")) expect(finished.screening.identityChoices[row.reviewer.id]).not.toBe("cant-tell");
  });
});
