import { sameSecret } from "./passcode.server";
import { SHOWCASE_LIMITS } from "./showcase";
import { SourceError } from "./sources.server";

// D59 showcase guards: access code, per-visitor rate limit, global daily cap on fresh OpenAlex calls.
// All counters live server-side (Supabase, service role). Visitors are salted SHA-256 hashes.

/** True only when SHOWCASE_CODE is set and the code matches (constant time). */
export function validShowcaseCode(code: string | null | undefined): boolean {
  const expected = process.env["SHOWCASE_CODE"];
  return Boolean(expected && code && sameSecret(code, expected));
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function visitorKey(headers: Headers): Promise<string> {
  const ip = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return sha256(`${process.env["SHOWCASE_CODE"] ?? "showcase"}:${ip}`);
}

/** Counts this request against the visitor's window. Fails closed if the counter can't be reached. */
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
async function rpc(): Promise<Rpc> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return ((fn, args) => (supabaseAdmin.rpc as unknown as Rpc).call(supabaseAdmin, fn, args)) as Rpc;
}
export async function visitorAllowed(headers: Headers): Promise<boolean> {
  const { data, error } = await (await rpc())("showcase_visitor_hit", { p_visitor: await visitorKey(headers), p_limit: SHOWCASE_LIMITS.visitorCalls, p_window_seconds: SHOWCASE_LIMITS.visitorWindowSeconds });
  return !error && data === true;
}

/** Before each fresh OpenAlex call: take one from today's budget, or refuse with QuotaReached. */
export async function takeFreshCall(): Promise<void> {
  const { data, error } = await (await rpc())("showcase_take_fresh_call", { p_limit: SHOWCASE_LIMITS.dailyFreshCalls });
  if (error || data !== true) throw new SourceError("QuotaReached");
}
