import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/cases")({
  head: () => ({ meta: [
    { title: "Cases | Arm's Length Check" },
    { name: "description", content: "Browse faculty tenure and promotion cases." },
    { property: "og:title", content: "Cases | Arm's Length Check" },
    { property: "og:description", content: "Browse faculty tenure and promotion cases." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <Outlet />,
});