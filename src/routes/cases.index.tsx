import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";

export const Route = createFileRoute("/cases/")({
  head: () => ({ meta: [{ title: "Guided demo | Arm's Length Check" }, { name: "description", content: "A fictional tenure case for the guided demo." }] }),
  component: Cases,
});
function Cases() {
  return <><PageHeading title="Guided demo" />
    <article className="case-card"><h2><Link to="/cases/$caseId" params={{ caseId: "ortiz-2027" }}>Tenure review — Dr. Maya Ortiz, Chemistry (fictional)</Link></h2></article>
  </>;
}
