import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";
import { Button } from "@/components/ui/button";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Home | Faculty Review" },
    { name: "description", content: "Your faculty review overview: open cases, external reviews, and committee tasks." },
    { property: "og:title", content: "Home | Faculty Review" },
    { property: "og:description", content: "Your faculty review overview: open cases, external reviews, and committee tasks." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <>
      <PageHeading title="Home" />
      <section className="summary-band" aria-label="Review summary">
        <article className="summary-card"><h2><Link to="/cases">Open cases</Link></h2><p><span className="summary-number">4</span><span className="summary-label">in review</span></p></article>
        <article className="summary-card"><h2><Link to="/cases">External reviews</Link></h2><p><span className="summary-number">1</span><span className="summary-label">to screen</span></p></article>
        <article className="summary-card"><h2><Link to="/committees">Committee tasks</Link></h2><p><span className="summary-number">2</span><span className="summary-label">due</span></p></article>
      </section>
      <p className="quick-start">Not sure where to begin? See the <Button variant="link" className="inline-link">Faculty Review quick start guide</Button></p>
    </>
  );
}
