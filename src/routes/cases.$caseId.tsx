import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";
import { useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalEvaluations } from "@/components/external-evaluations";
import { getCase, type CaseRecord } from "@/data/screeningService";

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
  const [caseRecord, setCaseRecord] = useState<CaseRecord>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setCaseRecord(getCase(caseId)); setLoaded(true); }, [caseId]);
  useEffect(() => { if (caseRecord && window.location.hash === "#candidate-declarations") document.getElementById("candidate-declarations")?.scrollIntoView(); }, [caseRecord]);
  if (!loaded) return <p role="status">Loading case…</p>;
  if (!caseRecord) return <><PageHeading title="Case unavailable" /><Link to="/cases" className="text-primary">Back to cases</Link></>;
  return <><header className="case-header"><h1>{caseRecord.title}</h1><p>{caseRecord.subtitle}</p></header>
    <ol className="case-steps" aria-label="Review progress">{["Packet submitted", "External evaluations", "Department vote", "College review", "Decision"].map((step, index) => <li key={step} className={index === 0 ? "step-done" : index === 1 ? "step-current" : ""} aria-current={index === 1 ? "step" : undefined}><span className="step-symbol">{index === 0 ? <Check /> : index + 1}</span><span>{step}</span>{index < 4 && <ChevronRight className="step-arrow" />}</li>)}</ol>
    <Tabs defaultValue="External evaluations"><TabsList className="case-tabs">{["Overview", "Packet", "External evaluations", "Committee", "Decision"].map(tab => <TabsTrigger className="case-tab" value={tab} key={tab}>{tab}</TabsTrigger>)}</TabsList><TabsContent value="External evaluations"><ExternalEvaluations key={caseRecord.id} caseRecord={caseRecord} /></TabsContent>{["Overview", "Packet", "Committee", "Decision"].map(tab => <TabsContent value={tab} key={tab}><p className="prototype-unavailable">Not part of this prototype</p></TabsContent>)}</Tabs>
  </>;
}