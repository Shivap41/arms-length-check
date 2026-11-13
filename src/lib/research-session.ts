import { supabase } from "@/integrations/supabase/client";
import type { ResearchEventName } from "@/lib/session-metrics";

const KEY = "fr-research-session";
export const SESSION_CHANGE_EVENT = "fr-research-session-change";
export type ActiveSession = { id: string; participantCode: string; facilitator: string; startedAt: number; resultsSeen: boolean; finished: boolean };
let queue: Promise<unknown> = Promise.resolve();
let rowOpened: { reviewerId: string; at: number } | undefined;

function save(session: ActiveSession | undefined) {
  if (session) window.sessionStorage.setItem(KEY, JSON.stringify(session)); else window.sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}
export function getActiveSession(): ActiveSession | undefined {
  if (typeof window === "undefined") return undefined;
  try { const raw = window.sessionStorage.getItem(KEY); return raw ? JSON.parse(raw) as ActiveSession : undefined; } catch { return undefined; }
}
// Every write is queued in the background so logging never blocks or breaks the UI.
function enqueue(task: () => PromiseLike<unknown>) { queue = queue.then(task).catch(() => undefined); }
export function startResearchSession(participantCode: string, facilitator: string): ActiveSession {
  const session: ActiveSession = { id: crypto.randomUUID(), participantCode, facilitator, startedAt: Date.now(), resultsSeen: false, finished: false };
  rowOpened = undefined;
  save(session);
  enqueue(() => supabase.from("research_sessions").insert({ id: session.id, participant_code: participantCode, facilitator, consented: true }));
  return session;
}
export function endResearchSession() { rowOpened = undefined; save(undefined); }
type Details = { reviewerId?: string | undefined; optionPosition?: number | undefined; profileId?: string | undefined; selection?: string | undefined };
export function logResearchEvent(event: ResearchEventName, details: Details = {}) {
  const session = getActiveSession();
  if (!session) return;
  const now = Date.now();
  const sinceRow = rowOpened && details.reviewerId === rowOpened.reviewerId ? now - rowOpened.at : null;
  const row = { session_id: session.id, participant_code: session.participantCode, event, reviewer_id: details.reviewerId ?? null, option_position: details.optionPosition ?? null, profile_id: details.profileId ?? null, selection: details.selection ?? null, ms_since_row_opened: event === "row_opened" ? 0 : sinceRow, ms_since_session_start: Math.max(0, now - session.startedAt) };
  enqueue(() => supabase.from("identity_events").insert(row));
}
export function markRowOpened(reviewerId: string) {
  if (!getActiveSession() || rowOpened?.reviewerId === reviewerId) return;
  rowOpened = { reviewerId, at: Date.now() };
  logResearchEvent("row_opened", { reviewerId });
}
/** Identity decisions; also flags changes made after the participant has seen results. */
export function logIdentityDecision(event: "card_picked" | "second_profile_added" | "orcid_pasted" | "cant_tell" | "undo", details: Details) {
  logResearchEvent(event, details);
  if (getActiveSession()?.resultsSeen && event !== "undo") logResearchEvent("changed_later", details);
}
export function markResultsSeen() {
  const session = getActiveSession();
  if (!session || session.resultsSeen) return;
  logResearchEvent("session_finished");
  save({ ...session, resultsSeen: true, finished: true });
}
