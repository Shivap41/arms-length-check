import { demoChoiceKey, demoScenario, type DemoReviewer } from "@/data/demoScenario";

export const researchEvents = ["row_opened", "card_picked", "second_profile_added", "orcid_pasted", "cant_tell", "undo", "changed_later", "screening_started", "session_finished", "check_started", "check_finished", "check_failed", "results_wait_started", "results_wait_finished"] as const;
export type ResearchEventName = (typeof researchEvents)[number];
export type SessionRow = { id: string; participant_code: string; facilitator: string; started_at: string };
export type EventRow = { session_id: string; reviewer_id: string | null; event: string; option_position: number | null; profile_id: string | null; selection: string | null; ms_since_row_opened: number | null; ms_since_session_start: number | null; created_at: string };
export type SessionMetrics = {
  sessionId: string; participantCode: string; facilitator: string; startedAt: string;
  correct: number; needsYou: number; accuracy: number; errors: string[];
  splitProfileAdded: boolean; cantTellCount: number; cantTellRate: number; cantTellCorrect: boolean; cantTellWrong: string[];
  confirmationTimes: number[]; medianConfirmationMs: number | null; longestConfirmationMs: number | null;
  totalMs: number | null; waitMs: number; chairMs: number | null; underFiveMinutes: boolean | null; changedLater: number;
};
export type TotalMetrics = { sessions: number; correct: number; needsYou: number; accuracy: number; splitProfileAdded: number; cantTellCount: number; cantTellRate: number; cantTellCorrect: number; cantTellWrong: number; medianConfirmationMs: number | null; longestConfirmationMs: number | null; medianTotalMs: number | null; medianWaitMs: number | null; medianChairMs: number | null; changedLater: number };

const identityEvents = new Set(["card_picked", "second_profile_added", "orcid_pasted", "cant_tell", "undo"]);
const decisionEvents = new Set(["card_picked", "second_profile_added", "orcid_pasted", "cant_tell"]);
export const ACCURACY_TARGET = 0.95;
export const TOTAL_TIME_TARGET_MS = 5 * 60 * 1000;

export function needsYouReviewers(): DemoReviewer[] { return demoScenario.reviewers.filter(row => !row.autoConfirmed); }
export function expectedSelection(demo: DemoReviewer): string {
  const answer = demo.correctAnswer;
  if (answer.action === "cant-tell") return "cant-tell";
  if (answer.action === "select-profiles") return demoChoiceKey(answer.profileIds);
  return demoChoiceKey([...demo.options, ...demo.additionalProfiles].filter(profile => profile.orcid === answer.orcid).map(profile => profile.id));
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}
function describeError(demo: DemoReviewer, selection: string): string {
  const expected = expectedSelection(demo);
  const name = demo.typedName;
  if (!selection) return `${demo.id}: ${name} was not confirmed`;
  if (selection === "cant-tell") return `${demo.id}: chose Can't tell for ${name}`;
  if (expected === "cant-tell") return `${demo.id}: picked a profile for ${name}; the CV can't confirm one`;
  const picked = selection.split("+"), wanted = expected.split("+");
  if (wanted.length > 1 && picked.every(id => wanted.includes(id))) return `${demo.id}: missed the second profile for ${name}`;
  const profiles = [...demo.options, ...demo.additionalProfiles];
  const wrong = profiles.find(profile => picked.includes(profile.id) && !wanted.includes(profile.id));
  return wrong ? `${demo.id}: picked the same-name decoy (${wrong.displayName}, ${wrong.currentInstitution})` : `${demo.id}: wrong profile for ${name}`;
}

export function computeSessionMetrics(session: SessionRow, events: EventRow[]): SessionMetrics {
  const own = events.filter(event => event.session_id === session.id);
  const finalSelection = new Map<string, string>();
  for (const event of own) if (event.reviewer_id && identityEvents.has(event.event)) finalSelection.set(event.reviewer_id, event.selection ?? "");
  const reviewers = needsYouReviewers();
  const errors: string[] = [];
  let correct = 0;
  for (const demo of reviewers) {
    const selection = finalSelection.get(demo.id) ?? "";
    if (selection === expectedSelection(demo)) correct++; else errors.push(describeError(demo, selection));
  }
  const split = reviewers.find(demo => demo.correctAnswer.action === "select-profiles" && demo.correctAnswer.profileIds.length > 1);
  const splitProfileAdded = split ? finalSelection.get(split.id) === expectedSelection(split) || own.some(event => event.event === "second_profile_added" && event.reviewer_id === split.id) : false;
  const cantTellIds = reviewers.filter(demo => finalSelection.get(demo.id) === "cant-tell").map(demo => demo.id);
  const cantTellExpected = reviewers.filter(demo => demo.correctAnswer.action === "cant-tell").map(demo => demo.id);
  const confirmationTimes = own.filter(event => decisionEvents.has(event.event) && event.ms_since_row_opened !== null).map(event => event.ms_since_row_opened!);
  const started = own.find(event => event.event === "screening_started")?.ms_since_session_start;
  const finished = own.find(event => event.event === "session_finished")?.ms_since_session_start;
  // Time spent waiting on simulated checks is system time, reported separately from the chair's own time.
  let waitMs = 0, waitStart: number | null = null, lastWaitEnd: number | null = null;
  for (const event of own) {
    if (event.event === "results_wait_started" && event.ms_since_session_start != null) waitStart = event.ms_since_session_start;
    else if (event.event === "results_wait_finished" && waitStart !== null && event.ms_since_session_start != null) { waitMs += Math.max(0, event.ms_since_session_start - waitStart); lastWaitEnd = event.ms_since_session_start; waitStart = null; }
  }
  const end = finished != null ? Math.max(finished, lastWaitEnd ?? finished) : null;
  const totalMs = started != null && end != null && end >= started ? end - started : null;
  const chairMs = totalMs === null ? null : Math.max(0, totalMs - waitMs);
  return {
    sessionId: session.id, participantCode: session.participant_code, facilitator: session.facilitator, startedAt: session.started_at,
    correct, needsYou: reviewers.length, accuracy: reviewers.length ? correct / reviewers.length : 0, errors,
    splitProfileAdded, cantTellCount: cantTellIds.length, cantTellRate: reviewers.length ? cantTellIds.length / reviewers.length : 0,
    cantTellCorrect: cantTellExpected.length > 0 && cantTellExpected.every(id => cantTellIds.includes(id)),
    cantTellWrong: cantTellIds.filter(id => !cantTellExpected.includes(id)).map(id => `${id}: ${reviewers.find(demo => demo.id === id)?.typedName ?? id}`),
    confirmationTimes, medianConfirmationMs: median(confirmationTimes), longestConfirmationMs: confirmationTimes.length ? Math.max(...confirmationTimes) : null,
    totalMs, waitMs, chairMs, underFiveMinutes: chairMs === null ? null : chairMs < TOTAL_TIME_TARGET_MS,
    changedLater: own.filter(event => event.event === "changed_later").length,
  };
}

export function computeTotals(rows: SessionMetrics[]): TotalMetrics {
  const all = rows.flatMap(row => row.confirmationTimes);
  const correct = rows.reduce((sum, row) => sum + row.correct, 0), needsYou = rows.reduce((sum, row) => sum + row.needsYou, 0);
  const cantTellCount = rows.reduce((sum, row) => sum + row.cantTellCount, 0);
  return { sessions: rows.length, correct, needsYou, accuracy: needsYou ? correct / needsYou : 0, splitProfileAdded: rows.filter(row => row.splitProfileAdded).length, cantTellCount, cantTellRate: needsYou ? cantTellCount / needsYou : 0, cantTellCorrect: rows.filter(row => row.cantTellCorrect).length, cantTellWrong: rows.reduce((sum, row) => sum + row.cantTellWrong.length, 0), medianConfirmationMs: median(all), longestConfirmationMs: all.length ? Math.max(...all) : null, medianTotalMs: median(rows.flatMap(row => row.totalMs === null ? [] : [row.totalMs])), medianWaitMs: median(rows.map(row => row.waitMs)), medianChairMs: median(rows.flatMap(row => row.chairMs === null ? [] : [row.chairMs])), changedLater: rows.reduce((sum, row) => sum + row.changedLater, 0) };
}

function seconds(ms: number | null): string { return ms === null ? "" : (ms / 1000).toFixed(1); }
function csvCell(value: string | number | boolean): string { const text = String(value); return /[",\n\r]/.test(text) || /^[=+\-@]/.test(text) ? `"${text.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : text; }
export function metricsToCsv(rows: SessionMetrics[], totals: TotalMetrics): string {
  const header = ["session_id", "participant_code", "facilitator", "started_at", "identity_accuracy_pct", "correct", "needs_you_rows", "errors", "split_profile_added", "cant_tell_count", "cant_tell_rate_pct", "cant_tell_used_correctly", "cant_tell_wrong", "median_confirmation_s", "longest_confirmation_s", "total_time_s", "chair_time_s", "check_wait_s", "chair_under_5_minutes", "changed_after_results"];
  const lines = rows.map(row => [row.sessionId, row.participantCode, row.facilitator, row.startedAt, (row.accuracy * 100).toFixed(1), row.correct, row.needsYou, row.errors.join("; "), row.splitProfileAdded, row.cantTellCount, (row.cantTellRate * 100).toFixed(1), row.cantTellCorrect, row.cantTellWrong.join("; "), seconds(row.medianConfirmationMs), seconds(row.longestConfirmationMs), seconds(row.totalMs), seconds(row.chairMs), seconds(row.waitMs), row.underFiveMinutes ?? "", row.changedLater]);
  lines.push(["TOTAL", `${totals.sessions} sessions`, "", "", (totals.accuracy * 100).toFixed(1), totals.correct, totals.needsYou, "", `${totals.splitProfileAdded} of ${totals.sessions}`, totals.cantTellCount, (totals.cantTellRate * 100).toFixed(1), `${totals.cantTellCorrect} of ${totals.sessions}`, totals.cantTellWrong, seconds(totals.medianConfirmationMs), seconds(totals.longestConfirmationMs), seconds(totals.medianTotalMs), seconds(totals.medianChairMs), seconds(totals.medianWaitMs), "", totals.changedLater]);
  return [header, ...lines].map(line => line.map(csvCell).join(",")).join("\r\n");
}
