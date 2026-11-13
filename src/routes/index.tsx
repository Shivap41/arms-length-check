import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";

const description = "A concept for screening proposed external reviewers for conflicts of interest, using public research data from OpenAlex and ORCID.";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Arm's Length Check" }, { name: "description", content: description },
    { property: "og:title", content: "Arm's Length Check" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
  ] }),
  component: Home,
});

function Home() {
  return <>
    <PageHeading title="Arm's Length Check" />
    <p className="showcase-intro">When a tenure case proposes external reviewers, someone has to check each one for conflicts of interest: co-authored papers, shared institutions, declared ties. This concept does the first pass on public data. It confirms who each person is first, then flags what it finds with the evidence. The tool flags; a person decides.</p>
    <div className="showcase-entries">
      <Link to="/cases/$caseId" params={{ caseId: "ortiz-2027" }} className="showcase-entry"><span className="showcase-tag">Fictional data</span><h2>Guided demo</h2><p>The full chair workflow on a fictional tenure case with 15 proposed reviewers: confirm identities, review results and evidence, record decisions.</p></Link>
      <Link to="/live-example" className="showcase-entry"><span className="showcase-tag">Real data</span><h2>Live example</h2><p>A real case, pre-set: candidate Jennifer Doudna and five proposed reviewers. Confirm who each one is, and each check runs live against OpenAlex and ORCID.</p></Link>
      <Link to="/live-full" className="showcase-entry"><span className="showcase-tag">Access code</span><h2>Full live mode</h2><p>Enter any candidate and reviewers and check them live. Needs an access code to protect the shared daily budget for live data.</p></Link>
    </div>
  </>;
}
