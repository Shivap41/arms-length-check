import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getScreening, type Screening } from "@/data/screeningService";

export const Route = createFileRoute("/cases/$caseId_/screening")({
  validateSearch: z.object({ screeningId: z.string().max(150).optional() }),
  head: () => ({ meta: [
    { title: "Conflict screening | Faculty Review" },
    { name: "description", content: "External reviewer conflict screening for the faculty tenure review case." },
    { property: "og:title", content: "Conflict screening | Faculty Review" },
    { property: "og:description", content: "External reviewer conflict screening for the faculty tenure review case." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ScreeningPage,
});
function ScreeningPage() {
  const { caseId } = Route.useParams();
  const { screeningId } = Route.useSearch();
  const [screening, setScreening] = useState<Screening>();
  useEffect(() => { setScreening(screeningId ? getScreening(screeningId) : undefined); }, [screeningId]);
  return <><header className="case-header"><h1>Conflict screening</h1><p>Tenure review — Dr. Maya Ortiz</p></header><Link to="/cases/$caseId" params={{ caseId }} className="back-link">Back to external evaluations</Link>{screening?.caseId === caseId ? <section className="screening-placeholder"><h2>Reviewers submitted</h2><ul>{screening.reviewers.map(row => <li key={row.id}>{row.name} · {row.institution}</li>)}</ul><p>Conflict results are not part of this prototype yet.</p></section> : <p>No screening available. Add reviewers and check for conflicts from the case page.</p>}</>;
}