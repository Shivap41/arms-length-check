import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [
    { title: "Reports | Faculty Review" },
    { name: "description", content: "Faculty Review reports workspace." },
    { property: "og:title", content: "Reports | Faculty Review" },
    { property: "og:description", content: "Faculty Review reports workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <PageHeading title="Reports" />,
});
