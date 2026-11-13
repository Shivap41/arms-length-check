import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeSessionMetrics, computeTotals, type EventRow, type SessionRow } from "@/lib/session-metrics";

function sameSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export const getSessionResults = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ passcode: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const expected = process.env["RESEARCH_PASSCODE"];
    if (!expected) return { ok: false as const, error: "The results passcode has not been set up yet." };
    if (!sameSecret(data.passcode, expected)) return { ok: false as const, error: "Incorrect passcode." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sessions = await supabaseAdmin.from("research_sessions").select("id, participant_code, facilitator, started_at").order("started_at", { ascending: false }).limit(500);
    if (sessions.error) throw new Error("Could not load sessions.");
    const ids = (sessions.data ?? []).map(row => row.id);
    const events: EventRow[] = [];
    for (let from = 0; ids.length; from += 1000) {
      const page = await supabaseAdmin.from("identity_events").select("session_id, reviewer_id, event, option_position, profile_id, selection, ms_since_row_opened, ms_since_session_start, created_at").in("session_id", ids).order("id").range(from, from + 999);
      if (page.error) throw new Error("Could not load events.");
      events.push(...page.data);
      if (page.data.length < 1000) break;
    }
    const rows = (sessions.data as SessionRow[]).map(session => computeSessionMetrics(session, events));
    return { ok: true as const, sessions: rows, totals: computeTotals(rows) };
  });
