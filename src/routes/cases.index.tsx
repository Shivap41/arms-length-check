import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeading } from "@/components/faculty-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getDataMode, listLiveCases, setDataMode, subscribeDataMode, type DataMode, type LiveCase } from "@/data/screeningService";

export const Route = createFileRoute("/cases/")({
  head: () => ({ meta: [
    { title: "Cases | Faculty Review" },
    { name: "description", content: "Browse faculty tenure and promotion cases, including Dr. Maya Ortiz's Chemistry tenure review." },
    { property: "og:title", content: "Cases | Faculty Review" },
    { property: "og:description", content: "Browse faculty tenure and promotion cases, including Dr. Maya Ortiz's Chemistry tenure review." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Cases,
});

function Cases() {
  const [mode, setMode] = useState<DataMode>(() => getDataMode());
  const [liveCases, setLiveCases] = useState<LiveCase[]>();
  const [signedIn, setSignedIn] = useState<boolean>();
  useEffect(() => subscribeDataMode(() => setMode(getDataMode())), []);
  useEffect(() => {
    if (mode !== "live") return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.user));
      if (data.user) listLiveCases().then(cases => { if (active) setLiveCases(cases); }).catch(() => { if (active) setLiveCases([]); });
    });
    return () => { active = false; };
  }, [mode]);
  return <><PageHeading title="Cases" />
    <div className="mode-toggle" role="group" aria-label="Data mode">
      {(["demo", "live"] as const).map(option => <button key={option} type="button" className={mode === option ? "mode-option mode-option-active" : "mode-option"} aria-pressed={mode === option} onClick={() => setDataMode(option)}>{option === "demo" ? "Demo" : "Live"}</button>)}
    </div>
    {mode === "demo" ? <article className="case-card"><h2><Link to="/cases/$caseId" params={{ caseId: "ortiz-2027" }}>Tenure review — Dr. Maya Ortiz, Chemistry</Link></h2></article>
    : signedIn === false ? <article className="case-card"><h2>Sign in for live cases</h2><p className="live-note">Live cases are saved to your account and checked against real publication data.</p><Link to="/auth" search={{ redirect: "/cases" }} className="text-primary">Sign in</Link></article>
    : <>
      <div className="live-actions"><Link to="/live/new"><Button variant="outline"><Plus />New live case</Button></Link></div>
      {liveCases === undefined ? <p role="status">Loading live cases…</p>
      : liveCases.length === 0 ? <p className="live-note">No live cases yet. Create one to work with real reviewer data.</p>
      : liveCases.map(record => <article className="case-card" key={record.id}><h2><Link to="/live/$caseId" params={{ caseId: record.id }}>{record.title}</Link> <span className="live-badge">Live data</span></h2><p className="live-note">{record.candidateName} · {record.candidateInstitution}</p></article>)}
    </>}
  </>;
}
