import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

/**
 * B4 check-reviewer(screening_name_id). Runs under the signed-in user's client, so row-level
 * security limits it to their own cases. Stages are written to the row as the check goes.
 */
export const checkReviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ screeningNameId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { serverSources } = await import("@/lib/server-sources.server");
    const { runReviewerCheck } = await import("@/lib/check-reviewer.server");

    const name = await db.from("screening_names").select("*").eq("id", data.screeningNameId).maybeSingle();
    if (name.error || !name.data) return { status: "failed" as const, error: "Couldn't check: this reviewer was not found" };
    const row = name.data;
    if (row.identity_status !== "confirmed" || !row.profile_ids.length) return { status: "failed" as const, error: "Couldn't check: identity not confirmed" };
    const screening = await db.from("screenings").select("case_id").eq("id", row.screening_id).single();
    const reviewer = await db.from("proposed_reviewers").select("typed_name").eq("id", row.reviewer_id).single();
    if (screening.error || reviewer.error) return { status: "failed" as const, error: "Couldn't check: this case could not be loaded" };
    const [caseRow, declarations] = await Promise.all([
      db.from("cases").select("candidate_orcid, candidate_profile_ids, candidate_identity_status, candidate_identity_method").eq("id", screening.data.case_id).single(),
      db.from("declarations").select("declared_name, relationship, note").eq("case_id", screening.data.case_id),
    ]);
    if (caseRow.error || declarations.error) return { status: "failed" as const, error: "Couldn't check: this case could not be loaded" };
    // No check runs on an unconfirmed identity: the candidate first, then the reviewer.
    if (caseRow.data.candidate_identity_status !== "confirmed" || !caseRow.data.candidate_profile_ids.length) {
      await db.from("screening_names").update({ check_status: "failed", error: "Couldn't check: confirm the candidate first", result: null }).eq("id", row.id);
      return { status: "failed" as const, error: "Couldn't check: confirm the candidate first" };
    }

    const confirmedAt = row.confirmed_at;
    const startedAt = new Date().toISOString();
    const started = await db.from("screening_names").update({ check_status: "running", check_stage: "publications", result: null, reason: null, error: null, check_started_at: startedAt, check_finished_at: null }).eq("id", row.id).select("id").single();
    if (started.error) return { status: "failed" as const, error: "Couldn't check: the check could not start" };
    await db.from("findings").delete().eq("screening_name_id", row.id);

    let fresh = 0, cached = 0;
    const sources = await serverSources(row.screening_id, fromCache => { if (fromCache) cached++; else fresh++; });
    // Writes only land if the identity is still the one this check started from.
    const guard = <T extends { eq: (column: string, value: string) => T }>(query: T) => confirmedAt ? query.eq("check_started_at", startedAt).eq("confirmed_at", confirmedAt) : query.eq("check_started_at", startedAt);
    const store = {
      async stage(stage: "publications" | "institutions" | "declarations") {
        await guard(db.from("screening_names").update({ check_stage: stage }).eq("id", row.id));
      },
      async complete(outcome: { findings: { rule: string; severity: string; evidence: Record<string, unknown> }[]; result: string; reason: string; notes: object }) {
        const updated = await guard(db.from("screening_names").update({ check_status: "done", check_stage: "done", result: outcome.result, reason: outcome.reason, error: null, check_finished_at: new Date().toISOString(), check_notes: outcome.notes as Json }).eq("id", row.id)).select("id");
        if (updated.error) throw new Error("save failed");
        if (!updated.data.length) return; // identity changed mid-check: discard
        if (outcome.findings.length) {
          const inserted = await db.from("findings").insert(outcome.findings.map(finding => ({ screening_name_id: row.id, rule: finding.rule, severity: finding.severity, evidence: finding.evidence as Json })));
          if (inserted.error) {
            await db.from("screening_names").update({ check_status: "failed", result: null, reason: null, error: "Couldn't check: the findings could not be saved" }).eq("id", row.id);
            throw new Error("save failed");
          }
        }
      },
      async fail(error: string, notes: object) {
        await guard(db.from("screening_names").update({ check_status: "failed", result: null, reason: null, error, check_finished_at: new Date().toISOString(), check_notes: notes as Json }).eq("id", row.id));
      },
    };
    return runReviewerCheck(sources, store, {
      today: new Date().toISOString().slice(0, 10),
      candidate: { profileIds: caseRow.data.candidate_profile_ids, orcid: caseRow.data.candidate_identity_method === "orcid" ? caseRow.data.candidate_orcid : null },
      reviewer: { profileIds: row.profile_ids, typedName: reviewer.data.typed_name },
      declarations: declarations.data.map(entry => ({ name: entry.declared_name, relationship: entry.relationship as "advisor", note: entry.note })),
    }, { calls: () => ({ fresh, cached }) });
  });
