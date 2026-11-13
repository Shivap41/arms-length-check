import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ABOUT_URL, DISCLAIMER } from "@/lib/showcase";

// D59 public showcase shell: neutral look, app name "Arm's Length Check", disclaimer on every page.
const navigation = [
  { title: "Home", to: "/" },
  { title: "Guided demo", to: "/cases" },
  { title: "Live example", to: "/live-example" },
  { title: "Full live mode", to: "/live-full" },
] as const;

export function ShowcaseShell({ children }: { children: ReactNode }) {
  return <div className="alc-app">
    <header className="alc-header">
      <Link to="/" className="alc-brand"><span className="alc-mark" aria-hidden="true">AL</span><span>Arm's Length Check</span></Link>
      <nav aria-label="Main navigation" className="alc-nav">{navigation.map(item => <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} activeProps={{ className: "alc-nav-link alc-nav-active" }} inactiveProps={{ className: "alc-nav-link" }}>{item.title}</Link>)}</nav>
    </header>
    <p className="alc-banner" role="note">{DISCLAIMER} <a href={ABOUT_URL} target="_blank" rel="noreferrer">About this concept</a></p>
    <main className="alc-main">{children}</main>
    <footer className="alc-footer">Public data from <a href="https://openalex.org" target="_blank" rel="noreferrer">OpenAlex</a> and <a href="https://orcid.org" target="_blank" rel="noreferrer">ORCID</a>. The tool flags; a person decides.</footer>
  </div>;
}

export function PageHeading({ title }: { title: string }) {
  return <div className="page-heading"><h1>{title}</h1></div>;
}
