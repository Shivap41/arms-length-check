// D59 public showcase build: research-session mode is not part of this build. The same exports are
// kept as no-ops so the guided demo's components work unchanged; nothing is logged or stored.
import type { ResearchEventName } from "@/lib/session-metrics";

export const SESSION_CHANGE_EVENT = "fr-research-session-change";
export type ActiveSession = { id: string; participantCode: string; facilitator: string; startedAt: number; resultsSeen: boolean; finished: boolean };
type Details = { reviewerId?: string | undefined; optionPosition?: number | undefined; profileId?: string | undefined; selection?: string | undefined };
export function getActiveSession(): ActiveSession | undefined { return undefined; }
export function startResearchSession(): never { throw new Error("Research sessions are not available in the public showcase."); }
export function endResearchSession(): void {}
export function logResearchEvent(_event: ResearchEventName, _details: Details = {}): void {}
export function markRowOpened(_reviewerId: string): void {}
export function logIdentityDecision(..._args: unknown[]): void {}
export function markResultsSeen(): void {}
export function finishResearchSession(): void {}
