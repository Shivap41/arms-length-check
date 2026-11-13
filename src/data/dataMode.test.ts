import { beforeEach, describe, expect, it } from "vitest";
import { getDataMode, setDataMode, subscribeDataMode } from "./screeningService";
import { endResearchSession, startResearchSession } from "@/lib/research-session";

describe("data mode", () => {
  beforeEach(() => {
    endResearchSession();
    setDataMode("demo");
  });

  it("starts in demo mode", () => {
    expect(getDataMode()).toBe("demo");
  });

  it("switches to live mode and notifies listeners", () => {
    let seen = 0;
    const unsubscribe = subscribeDataMode(() => { seen++; });
    setDataMode("live");
    expect(getDataMode()).toBe("live");
    expect(seen).toBe(1);
    unsubscribe();
  });

  it("stays in demo mode while a research session is running", () => {
    startResearchSession("P07", "Sam K");
    setDataMode("live");
    expect(getDataMode()).toBe("demo");
  });

  it("allows live mode again after the session ends", () => {
    startResearchSession("P07", "Sam K");
    endResearchSession();
    setDataMode("live");
    expect(getDataMode()).toBe("live");
  });
});
