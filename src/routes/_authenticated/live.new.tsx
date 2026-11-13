import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeading } from "@/components/faculty-shell";
import { Button } from "@/components/ui/button";
import { createLiveCase, liveCaseSchema } from "@/data/screeningService";

export const Route = createFileRoute("/_authenticated/live/new")({
  head: () => ({ meta: [
    { title: "New live case | Faculty Review" },
    { name: "description", content: "Create a live external review case saved to your account." },
    { property: "og:title", content: "New live case | Faculty Review" },
    { property: "og:description", content: "Create a live external review case saved to your account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: NewLiveCase,
});

function NewLiveCase() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState({ candidateName: "", institution: "", orcid: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = liveCaseSchema.safeParse(draft);
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message]))); return; }
    setErrors({}); setBusy(true);
    try {
      const created = await createLiveCase(result.data);
      await navigate({ to: "/live/$caseId", params: { caseId: created.id } });
    } catch {
      setErrors({ ["form"]: "Couldn't create the case. Try again." });
      setBusy(false);
    }
  }
  return <><PageHeading title="New live case" />
    <form className="reviewer-form live-case-form" onSubmit={submit} noValidate>
      <div className="reviewer-fields">
        <div className="reviewer-field">
          <label htmlFor="case-candidate">Candidate name<span aria-hidden="true"> *</span></label>
          <input id="case-candidate" value={draft.candidateName} required maxLength={150} aria-invalid={Boolean(errors["candidateName"])} onChange={event => setDraft({ ...draft, candidateName: event.target.value })} />
          {errors["candidateName"] && <p className="field-error">{errors["candidateName"]}</p>}
        </div>
        <div className="reviewer-field">
          <label htmlFor="case-institution">Institution<span aria-hidden="true"> *</span></label>
          <input id="case-institution" value={draft.institution} required maxLength={200} aria-invalid={Boolean(errors["institution"])} onChange={event => setDraft({ ...draft, institution: event.target.value })} />
          {errors["institution"] && <p className="field-error">{errors["institution"]}</p>}
        </div>
        <div className="reviewer-field">
          <label htmlFor="case-orcid">Candidate ORCID iD<span className="optional-label"> (optional)</span></label>
          <input id="case-orcid" value={draft.orcid} maxLength={500} aria-invalid={Boolean(errors["orcid"])} aria-describedby="case-orcid-help" onChange={event => setDraft({ ...draft, orcid: event.target.value })} />
          <p id="case-orcid-help" className="field-help">Speeds up the conflict check when live checking is connected.</p>
          {errors["orcid"] && <p className="field-error">{errors["orcid"]}</p>}
        </div>
      </div>
      {errors["form"] && <p className="field-error" role="alert">{errors["form"]}</p>}
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create case"}</Button>
    </form>
  </>;
}
