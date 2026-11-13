import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/faculty-shell";

export const Route = createFileRoute("/templates")({
  head: () => ({ meta: [
    { title: "Templates | Faculty Review" },
    { name: "description", content: "Faculty Review templates workspace." },
    { property: "og:title", content: "Templates | Faculty Review" },
    { property: "og:description", content: "Faculty Review templates workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <PageHeading title="Templates" />,
});
