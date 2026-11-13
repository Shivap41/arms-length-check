import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { demoLatencies, getDemoSettings, loadDemoReviewers, resetDemoCase, setDemoSettings, type DemoLatency } from "@/data/screeningService";
import { endResearchSession, getActiveSession, startResearchSession, type ActiveSession } from "@/lib/research-session";

const description = "Start a moderated research session for the Faculty Review conflict-screening prototype.";
export const Route = createFileRoute("/session/")({
  head: () => ({ meta: [
    { title: "Start research session | Faculty Review" }, { name: "description", content: description }, { name: "robots", content: "noindex" },
    { property: "og:title", content: "Start research session | Faculty Review" }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SessionStart,
});

export const sessionStartSchema = z.object({
  participantCode: z.string().trim().regex(/^[A-Za-z]{1,3}\d{1,4}$/, "Use a short code like P07 — no names."),
  facilitator: z.string().trim().min(1, "Enter the session facilitator.").max(80, "Use up to 80 characters."),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required to start." }) }),
});

function SessionStart() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ participantCode: "", facilitator: "", consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [active, setActive] = useState<ActiveSession>();
  const [settings, setSettings] = useState<{ latency: DemoLatency; simulateFailure: boolean }>({ latency: "realistic", simulateFailure: false });
  useEffect(() => { setActive(getActiveSession()); setSettings(getDemoSettings()); }, []);
  function updateSettings(next: typeof settings) { setSettings(next); setDemoSettings(next); }
  async function start(event: React.FormEvent) {
    event.preventDefault();
    const parsed = sessionStartSchema.safeParse(form);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]))); return; }
    setDemoSettings(settings);
    resetDemoCase("ortiz-2027");
    loadDemoReviewers("ortiz-2027");
    startResearchSession(parsed.data.participantCode.toUpperCase(), parsed.data.facilitator);
    await navigate({ to: "/cases/$caseId", params: { caseId: "ortiz-2027" } });
  }
  return <div className="session-page">
    <header className="case-header"><h1>Research session</h1><p>Set up a moderated session. Only the participant code, facilitator, clicks, and timings are recorded.</p></header>
    {active && <div className="session-active" role="status"><p>Session {active.participantCode} is running.</p><Button variant="outline" onClick={() => { endResearchSession(); setActive(undefined); }}>End session</Button></div>}
    <form className="session-form" onSubmit={start} noValidate>
      <div className="reviewer-field"><label htmlFor="participant-code">Participant code <span aria-hidden="true">*</span></label><input id="participant-code" placeholder="P07" maxLength={7} autoComplete="off" value={form.participantCode} aria-invalid={Boolean(errors["participantCode"])} aria-describedby="participant-help" onChange={event => setForm({ ...form, participantCode: event.target.value })} /><p id="participant-help" className={errors["participantCode"] ? "field-error" : "field-help"}>{errors["participantCode"] ?? "e.g. P07 — no names."}</p></div>
      <div className="reviewer-field"><label htmlFor="facilitator">Session facilitator <span aria-hidden="true">*</span></label><input id="facilitator" maxLength={80} value={form.facilitator} aria-invalid={Boolean(errors["facilitator"])} onChange={event => setForm({ ...form, facilitator: event.target.value })} />{errors["facilitator"] && <p className="field-error">{errors["facilitator"]}</p>}</div>
      <div className="candidate-confirmation"><Checkbox id="session-consent" checked={form.consent} onCheckedChange={value => setForm({ ...form, consent: value === true })} /><label htmlFor="session-consent">I agree to my clicks and timings being recorded for product research. No personal data is collected.</label></div>
      <fieldset className="session-settings"><legend>Demo latency</legend><RadioGroup value={settings.latency} onValueChange={value => updateSettings({ ...settings, latency: value as DemoLatency })}>{demoLatencies.map(value => <div key={value} className="session-radio"><RadioGroupItem id={`latency-${value}`} value={value} /><label htmlFor={`latency-${value}`}>{({ off: "Off — instant", realistic: "Realistic — 1.5–4 s per reviewer", slow: "Slow — 6–12 s per reviewer" } as const)[value]}</label></div>)}</RadioGroup></fieldset>
      <div className="session-switch"><Switch id="simulate-failure" checked={settings.simulateFailure} onCheckedChange={value => updateSettings({ ...settings, simulateFailure: value })} /><label htmlFor="simulate-failure">Simulate a data-source failure<span className="field-help">Laura Becker's check fails until the chair retries it.</span></label></div>
      {errors["consent"] && <p className="field-error" role="alert">{errors["consent"]}</p>}
      <div className="session-actions"><Button type="submit" disabled={!form.consent}>Start session</Button><Link to="/session/brief" className="back-link">Print reviewer notes</Link></div>
    </form>
  </div>;
}
