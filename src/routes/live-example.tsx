import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";
import { ShowcaseCase } from "@/components/showcase-case";
import { EXAMPLE_CANDIDATE, EXAMPLE_REVIEWERS } from "@/lib/showcase";

const description = "Live example on real public data: Jennifer Doudna and five proposed reviewers, checked live against OpenAlex and ORCID.";
export const Route = createFileRoute("/live-example")({
  ssr: false,
  head: () => ({ meta: [{ title: "Live example | Arm's Length Check" }, { name: "description", content: description }] }),
  component: LiveExample,
});

function LiveExample() {
  return <>
    <PageHeading title="Live example (real data)" />
    <p className="showcase-intro">Candidate: <strong>{EXAMPLE_CANDIDATE.name}</strong>, {EXAMPLE_CANDIDATE.institution} (ORCID {EXAMPLE_CANDIDATE.orcid}). The five reviewers were typed as a chair would, without ORCIDs. Confirm who each one is from the cards; each check then runs live. Nothing is saved: this screening lives only in your browser tab.</p>
    <ShowcaseCase code={null} candidate={EXAMPLE_CANDIDATE} reviewers={EXAMPLE_REVIEWERS} />
  </>;
}
