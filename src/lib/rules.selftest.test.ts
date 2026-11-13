import { describe, expect, it } from "vitest";
import { runSelftest, selftestCases } from "./rules.selftest";

describe("B5 self-test table", () => {
  it("has the 14 cases and all pass", () => {
    const { rows, passed, total } = runSelftest();
    expect(total).toBe(14);
    expect(rows.filter(row => !row.pass)).toEqual([]);
    expect(passed).toBe(14);
  });
  it("reports a failure when the expectation is wrong", () => {
    const original = selftestCases[0]!.expected;
    selftestCases[0]!.expected = "no_conflict";
    try { expect(runSelftest().rows[0]?.pass).toBe(false); } finally { selftestCases[0]!.expected = original; }
  });
});
