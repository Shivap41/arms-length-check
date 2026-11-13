import { Link } from "@tanstack/react-router";
import { ChevronDown, Mail, Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getActiveSession, logResearchEvent, SESSION_CHANGE_EVENT, type ActiveSession } from "@/lib/research-session";
import { onCheckEvent } from "@/data/screeningService";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const navigation = [
  { title: "Home", to: "/" },
  { title: "Cases", to: "/cases" },
  { title: "Committees", to: "/committees" },
  { title: "Templates", to: "/templates" },
  { title: "Reports", to: "/reports" },
] as const;

function Mark() {
  return <span className="fr-mark" aria-hidden="true">FR</span>;
}

export function FacultyShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [session, setSession] = useState<ActiveSession>();
  useEffect(() => {
    const sync = () => setSession(getActiveSession());
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);
  useEffect(() => onCheckEvent(event => logResearchEvent(event.type, { reviewerId: event.reviewerId })), []);
  return (
    <div className="faculty-app">
      <header className="faculty-header">
        <Button variant="header" size="icon" className="shell-close" aria-label={sidebarOpen ? "Collapse navigation" : "Expand navigation"} title={sidebarOpen ? "Collapse navigation" : "Expand navigation"} onClick={() => setSidebarOpen(!sidebarOpen)}><X /></Button>
        <Link to="/" className="faculty-brand"><Mark /><span>Faculty Review</span></Link>
        {session && <span className="session-badge" title={`Research session ${session.participantCode}`}>Session mode · {session.participantCode}</span>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="header" className="user-menu">Dr. Lena Hoffmann<ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem>Profile</DropdownMenuItem><DropdownMenuItem>Sign out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className={`faculty-layout ${sidebarOpen ? "" : "navigation-collapsed"}`}>
        {sidebarOpen && <aside className="faculty-sidebar">
          <nav aria-label="Main navigation">{navigation.map(item => <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} activeProps={{ className: "sidebar-link sidebar-link-active" }} inactiveProps={{ className: "sidebar-link" }}>{item.title}</Link>)}</nav>
          <footer className="sidebar-footer"><Mark /><p>Prototype for research sessions</p><Button variant="link" className="policies-link">Program policies</Button></footer>
        </aside>}
        <main className="faculty-main">{children}</main>
      </div>
      <Button variant="contact" className="contact-button"><Mail />Contact us</Button>
    </div>
  );
}

export function PageHeading({ title }: { title: string }) {
  return <div className="page-heading"><h1>{title}</h1><form className="page-search" role="search" onSubmit={event => event.preventDefault()}><input aria-label="Search Faculty Review" type="search" /><Button type="submit" size="icon" className="search-button" aria-label="Search" title="Search"><Search /></Button></form></div>;
}