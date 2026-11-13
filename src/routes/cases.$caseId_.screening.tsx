import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getScreening, type Screening } from "@/data/screeningService";
import { ConfirmReviewers } from "@/components/confirm-reviewers";

export const Route = createFileRoute("/cases/$caseId_/screening")({
  validateSearch: z.object({ screeningId: z.string().max(150).optional(), reviewerId: z.string().max(150).optional() }),
  head: () => ({ meta: [
    { title: "Conflict screening | Arm's Length Check" },
    { name: "description", content: "External reviewer conflict screening for the faculty tenure review case." },
    { property: "og:title", content: "Conflict screening | Arm's Length Check" },
    { property: "og:description", content: "External reviewer conflict screening for the faculty tenure review case." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ScreeningPage,
});
function ScreeningPage() {
  const { caseId } = Route.useParams();
  const { screeningId, reviewerId } = Route.useSearch();
  const [screening, setScreening] = useState<Screening>();
  useEffect(() => { setScreening(screeningId ? getScreening(screeningId) : undefined); }, [screeningId]);
  if (screening?.caseId === caseId) return <ConfirmReviewers key={`${screening.id}-${reviewerId ?? ""}`} screeningId={screening.id} caseId={caseId} reviewerId={reviewerId} />;
  return <><header className="case-header"><h1>Check for conflicts</h1></header><p>No screening available. Add reviewers and check for conflicts from the case page.</p><Link to="/cases/$caseId" params={{ caseId }} className="back-link">Back to external evaluations</Link></>;
}