import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDemoScenario } from "@/data/screeningService";

const description = "Printable reviewer notes summarising what a chair would know from each external reviewer's CV.";
export const Route = createFileRoute("/session/brief")({
  head: () => ({ meta: [
    { title: "Your reviewer notes | Faculty Review" }, { name: "description", content: description }, { name: "robots", content: "noindex" },
    { property: "og:title", content: "Your reviewer notes | Faculty Review" }, { property: "og:description", content: description },
    { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Brief,
});

function Brief() {
  const scenario = getDemoScenario("ortiz-2027");
  return <article className="session-brief">
    <header className="case-header"><h1>Your reviewer notes</h1><p>What you would know from each reviewer's CV. Fictional people for a research session.</p></header>
    <Button variant="outline" className="no-print" onClick={() => window.print()}><Printer />Print</Button>
    <ol className="brief-list">{scenario.reviewers.map(row => <li key={row.id}><h2>{row.typedName}</h2><p className="brief-institution">{row.typedInstitution}</p><p>{row.brief}</p>{row.typedOrcid && <p className="brief-orcid">ORCID: {row.typedOrcid}</p>}</li>)}</ol>
  </article>;
}
