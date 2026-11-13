import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";

export const Route = createFileRoute("/cases/$caseId")({
  head: ({ params }) => ({ meta: [
    { title: params.caseId === "ortiz-2027" ? "Dr. Maya Ortiz — Tenure review | Faculty Review" : "Case unavailable | Faculty Review" },
    { name: "description", content: "Faculty tenure review case for Dr. Maya Ortiz, Chemistry." },
    { property: "og:title", content: "Tenure review | Faculty Review" },
    { property: "og:description", content: "Faculty tenure review case for Dr. Maya Ortiz, Chemistry." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  if (caseId !== "ortiz-2027") return <><PageHeading title="Case unavailable" /><Link to="/cases" className="text-primary">Back to cases</Link></>;
  return <><PageHeading title="Tenure review" /><Link to="/cases" className="back-link">Back to cases</Link><section className="case-overview"><h2>Dr. Maya Ortiz</h2><p>Chemistry</p><dl><div><dt>Case</dt><dd>ortiz-2027</dd></div><div><dt>Review type</dt><dd>Tenure review</dd></div></dl></section></>;
}