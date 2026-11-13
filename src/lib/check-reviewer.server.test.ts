import { describe, expect, it, vi } from "vitest";
import { runReviewerCheck, type CheckSources, type CheckStore } from "./check-reviewer.server";
import { SourceError } from "./sources.server";

const author = (id: string, name: string, works = 40) => ({ id: `https://openalex.org/${id}`, display_name: name, works_count: works, affiliations: [] });
const sharedWork = { id: "https://openalex.org/W1", doi: "https://doi.org/10.1/x", title: "Shared", publication_year: 2025, type: "article", authorships: [{ author: { id: "https://openalex.org/AC", display_name: "Cara Candidate" } }, { author: { id: "https://openalex.org/AR", display_name: "Rita Reviewer" } }] };
const ownWorks = Array.from({ length: 10 }, (_, i) => ({ id: `https://openalex.org/C${i}`, doi: null, title: `Own ${i}`, publication_year: 2020, type: "article", authorships: [{ author: { id: "https://openalex.org/AC", display_name: "Cara Candidate" } }, { author: { id: `https://openalex.org/AY${i}`, display_name: `Colleague ${i}` } }] }));
function sources(over: Partial<CheckSources> = {}): CheckSources {
  return {
    getAuthor: vi.fn(async (id: string) => ({ data: id === "AC" ? author("AC", "Cara Candidate") : author("AR", "Rita Reviewer") })),
    getSharedWorks: vi.fn(async () => ({ data: [sharedWork] })),
    getWorksByAuthor: vi.fn(async () => ({ data: ownWorks, total: 10 })),
    getOrcidEmployments: vi.fn(async () => ({ data: [] })),
    getInstitution: vi.fn(async () => ({ data: { id: "I1", display_name: "U", type: "education" } })),
    ...over,
  };
}
/** An in-memory screening_names row, written only through the store. */
function memoryStore() {
  const row = { check_status: "running" as string, check_stage: null as string | null, result: null as string | null, error: null as string | null, findings: 0 };
  const stages: string[] = [];
  const store: CheckStore = {
    stage: vi.fn(async stage => { stages.push(stage); row.check_stage = stage; }),
    complete: vi.fn(async outcome => { row.check_status = "done"; row.check_stage = "done"; row.result = outcome.result; row.findings = outcome.findings.length; }),
    fail: vi.fn(async error => { row.check_status = "failed"; row.result = null; row.error = error; }),
  };
  return { row, store, stages };
}
const input = { today: "2026-11-13", candidate: { profileIds: ["AC"], orcid: "0000-0001-9161-999X" }, reviewer: { profileIds: ["AR"], typedName: "Rita Reviewer" }, declarations: [] };
const metrics = { calls: () => ({ fresh: 3, cached: 2 }) };

describe("check-reviewer", () => {
  it("runs publications -> institutions -> declarations and stores the result", async () => {
    const { row, store, stages } = memoryStore();
    const outcome = await runReviewerCheck(sources(), store, input, metrics);
    expect(outcome).toEqual({ status: "done", result: "conflict" });
    expect(stages).toEqual(["publications", "institutions", "declarations"]);
    expect(row).toMatchObject({ check_status: "done", result: "conflict", findings: 1 });
    expect(vi.mocked(store.complete).mock.calls[0]?.[0].notes.calls).toEqual({ fresh: 3, cached: 2 });
  });
  for (const type of ["Timeout", "RateLimited", "BudgetOrAuth"] as const) {
    it(`a ${type} source error leaves result = null and check_status = failed`, async () => {
      const { row, store } = memoryStore();
      const outcome = await runReviewerCheck(sources({ getSharedWorks: vi.fn(async () => { throw new SourceError(type); }) }), store, input, metrics);
      expect(outcome.status).toBe("failed");
      expect(row.check_status).toBe("failed");
      expect(row.result).toBeNull();
      expect(row.error).toMatch(/^Couldn't check/);
      expect(store.complete).not.toHaveBeenCalled();
    });
  }
  it("an error in a later stage also fails, never no_conflict or insufficient", async () => {
    const { row, store } = memoryStore();
    await runReviewerCheck(sources({ getOrcidEmployments: vi.fn(async () => { throw new SourceError("Timeout"); }) }), store, input, metrics);
    expect(row).toMatchObject({ check_status: "failed", result: null });
    expect(vi.mocked(store.fail).mock.calls[0]?.[1].failedAt).toBe("institutions");
  });
  it("a malformed response fails the check instead of being read as empty", async () => {
    const { row, store } = memoryStore();
    await runReviewerCheck(sources({ getSharedWorks: vi.fn(async () => ({ data: [{ nonsense: true }] })) }), store, input, metrics);
    expect(row).toMatchObject({ check_status: "failed", result: null });
  });
  it("an ORCID record that doesn't exist is no employments, not a failure", async () => {
    const { row, store } = memoryStore();
    await runReviewerCheck(sources({ getOrcidEmployments: vi.fn(async () => { throw new SourceError("NotFound", 404); }) }), store, input, metrics);
    expect(row.check_status).toBe("done");
  });
  it("refuses to run on an unconfirmed identity", async () => {
    const { row, store } = memoryStore();
    const s = sources();
    await runReviewerCheck(s, store, { ...input, reviewer: { profileIds: [], typedName: "Rita Reviewer" } }, metrics);
    expect(row).toMatchObject({ check_status: "failed", result: null });
    expect(s.getSharedWorks).not.toHaveBeenCalled();
  });
  it("records name-scan coverage when the candidate has more works than were fetched", async () => {
    const { store } = memoryStore();
    await runReviewerCheck(sources({ getSharedWorks: vi.fn(async () => ({ data: [] })), getWorksByAuthor: vi.fn(async () => ({ data: ownWorks, total: 1500 })) }), store, input, metrics);
    const outcome = vi.mocked(store.complete).mock.calls[0]?.[0];
    expect(outcome?.notes.nameScan).toEqual({ covered: 10, total: 1500 });
    expect(outcome?.reason).toContain("name scan covered 10 of 1500 works");
  });
});
