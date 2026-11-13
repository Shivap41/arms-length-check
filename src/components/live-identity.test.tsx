import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IdentityOptions } from "./live-identity";
import { identityColumns, shouldAutoApply, canStartLiveChecks, type LiveCase } from "@/data/screeningService";

describe("identity options display", () => {
  it("shows 'Couldn't search: try again' with Retry when identify fails, never 'no matches'", () => {
    render(<IdentityOptions lookup={{ state: "done", result: { status: "error", error: "Couldn't search: try again (Timeout)" } }} onPick={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't search: try again");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/no profiles|no match/i)).toBeNull();
  });
  it("shows the same when the server can't be reached", () => {
    render(<IdentityOptions lookup={{ state: "unreachable" }} onPick={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't search: try again");
    expect(screen.queryByText(/no profiles|no match/i)).toBeNull();
  });
  it("shows skeletons while searching and an inline error for an invalid ORCID", () => {
    const { rerender } = render(<IdentityOptions lookup={{ state: "loading" }} onPick={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("status", { name: /searching/i })).toBeInTheDocument();
    rerender(<IdentityOptions lookup={{ state: "done", result: { status: "invalid", error: "That ORCID iD's check digit is wrong." } }} onPick={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("check digit");
  });
  it("says so only when OpenAlex genuinely returned nothing", () => {
    render(<IdentityOptions lookup={{ state: "done", result: { status: "needs_chair", options: [] } }} onPick={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText(/returned no profiles/)).toBeInTheDocument();
  });
});

describe("identity choices", () => {
  it("only an ORCID gives method 'orcid'; chair choices never do", () => {
    expect(identityColumns({ kind: "orcid", profileId: "A1" })).toMatchObject({ status: "confirmed", method: "orcid" });
    expect(identityColumns({ kind: "pick", profileIds: ["A1"] })).toMatchObject({ status: "confirmed", method: "chair_pick" });
    expect(identityColumns({ kind: "paste", profileIds: ["A1", "A2"] })).toMatchObject({ method: "chair_paste", profileIds: ["A1", "A2"] });
    expect(identityColumns({ kind: "cant_tell" })).toMatchObject({ status: "cant_tell", result: "insufficient", reason: "Identity not confirmed" });
    expect(identityColumns({ kind: "orcid_insufficient" })).toMatchObject({ status: "cant_tell", result: "insufficient", reason: "No indexed works for this ORCID" });
  });
  it("auto-applies an ORCID only to an untouched row", () => {
    const identity = { status: "needs_chair" as const, method: null, profileIds: [], confirmedBy: "", reason: "" };
    expect(shouldAutoApply({ ...identity, confirmedAt: null })).toBe(true);
    expect(shouldAutoApply({ ...identity, confirmedAt: "2026-11-13T00:00:00Z" })).toBe(false);
  });
  it("no reviewer check can start until the candidate is confirmed", () => {
    const base = { id: "c", title: "t", candidateName: "n", candidateInstitution: "i", candidateOrcid: "", createdAt: "" };
    const identity = { method: null, profileIds: [], confirmedBy: "", confirmedAt: null, reason: "" };
    expect(canStartLiveChecks({ ...base, candidateIdentity: { ...identity, status: "needs_chair" } } as LiveCase)).toBe(false);
    expect(canStartLiveChecks({ ...base, candidateIdentity: { ...identity, status: "cant_tell" } } as LiveCase)).toBe(false);
    expect(canStartLiveChecks({ ...base, candidateIdentity: { ...identity, status: "confirmed", method: "orcid" } } as LiveCase)).toBe(true);
  });
});
