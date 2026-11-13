import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";

export const Route = createFileRoute("/committees")({
  head: () => ({ meta: [
    { title: "Committees | Faculty Review" },
    { name: "description", content: "Faculty Review committees workspace." },
    { property: "og:title", content: "Committees | Faculty Review" },
    { property: "og:description", content: "Faculty Review committees workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <PageHeading title="Committees" />,
});
