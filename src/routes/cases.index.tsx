import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";

export const Route = createFileRoute("/cases/")({
  head: () => ({ meta: [
    { title: "Cases | Faculty Review" },
    { name: "description", content: "Browse faculty tenure and promotion cases, including Dr. Maya Ortiz's Chemistry tenure review." },
    { property: "og:title", content: "Cases | Faculty Review" },
    { property: "og:description", content: "Browse faculty tenure and promotion cases, including Dr. Maya Ortiz's Chemistry tenure review." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Cases,
});

function Cases() {
  return <><PageHeading title="Cases" /><article className="case-card"><h2><Link to="/cases/$caseId" params={{ caseId: "ortiz-2027" }}>Tenure review — Dr. Maya Ortiz, Chemistry</Link></h2></article></>;
}