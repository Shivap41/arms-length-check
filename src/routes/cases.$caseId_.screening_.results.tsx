import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getScreening, type Screening } from "@/data/screeningService";
import { ReviewResults } from "@/components/review-results";
export const Route = createFileRoute("/cases/$caseId_/screening_/results")({
  validateSearch: z.object({ screeningId: z.string().max(150).optional() }),
  head: () => ({ meta: [
    { title: "Review results | Faculty Review" },
    { name: "description", content: "Review results after confirming external reviewer identities." },
    { property: "og:title", content: "Review results | Faculty Review" },
    { property: "og:description", content: "Review results after confirming external reviewer identities." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Results,
});
function Results() {
  const { caseId } = Route.useParams(); const { screeningId } = Route.useSearch();
  const [screening, setScreening] = useState<Screening>();
  useEffect(() => { setScreening(screeningId ? getScreening(screeningId) : undefined); }, [screeningId]);
  return <><header className="case-header"><h1>Check for conflicts</h1></header><ol className="case-steps" aria-label="Screening progress"><li className="step-done"><span className="step-symbol">1</span>Confirm reviewers →</li><li className="step-current" aria-current="step"><span className="step-symbol">2</span>Review results</li></ol><h2 className="identity-section-title results-page-title">Review results</h2>{screening?.caseId === caseId && screening.resultsReady ? <ReviewResults key={screening.id} initialScreening={screening} /> : <p className="prototype-unavailable">Confirm every reviewer before reviewing results.</p>}<Link to="/cases/$caseId/screening" params={{ caseId }} search={{ screeningId }} className="back-link">Back to confirm reviewers</Link></>;
}