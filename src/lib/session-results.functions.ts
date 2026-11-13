import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeSessionMetrics, computeTotals, type EventRow, type SessionRow } from "@/lib/session-metrics";


export const getSessionResults = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ passcode: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { passcodeError } = await import("@/lib/passcode.server");
    const denied = passcodeError(data.passcode);
    if (denied) return { ok: false as const, error: denied === "Incorrect passcode." ? denied : "The results passcode has not been set up yet." };
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
