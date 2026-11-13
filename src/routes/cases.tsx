import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/cases")({
  head: () => ({ meta: [
    { title: "Cases | Faculty Review" },
    { name: "description", content: "Browse faculty tenure and promotion cases." },
    { property: "og:title", content: "Cases | Faculty Review" },
    { property: "og:description", content: "Browse faculty tenure and promotion cases." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <Outlet />,
});