import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getIdentityReviews, getScreening, type IdentityProfile } from "@/data/screeningService";
export const Route = createFileRoute("/cases/$caseId_/screening_/profile/$profileId")({
  validateSearch: z.object({ screeningId: z.string().max(150).optional() }),
  head: () => ({ meta: [
    { title: "Reviewer profile | Faculty Review" }, { name: "description", content: "Fictional reviewer identity profile and recent publications." },
    { property: "og:title", content: "Reviewer profile | Faculty Review" }, { property: "og:description", content: "Fictional reviewer identity profile and recent publications." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Profile,
});
function Profile() {
  const { caseId, profileId } = Route.useParams(); const { screeningId } = Route.useSearch();
  const [profile, setProfile] = useState<IdentityProfile>();
  useEffect(() => { if (!screeningId || getScreening(screeningId)?.caseId !== caseId) return; setProfile(getIdentityReviews(screeningId).flatMap(row => [...row.options, ...row.matchedProfiles]).find(item => item.id === profileId)); }, [caseId, profileId, screeningId]);
  return <><header className="case-header"><h1>{profile?.displayName ?? "Reviewer profile"}</h1><p>{profile?.currentInstitution ?? "Profile unavailable"}</p></header>{profile && <section className="identity-profile-detail"><p>{profile.currentSince}–{profile.currentUntil ?? "present"}</p>{profile.pastInstitutions.map(past => <p key={past.institution}>{past.institution} · {past.fromYear}–{past.toYear}</p>)}<div className="profile-topics">{profile.topics.map(topic => <span key={topic}>{topic}</span>)}</div><p>{profile.worksCount} works · {profile.orcid ?? "No ORCID"}</p><h2>Recent publications</h2><ul>{profile.recentPapers.map(paper => <li key={paper.doi}>{paper.year} · {paper.title}</li>)}</ul></section>}<Link to="/cases/$caseId/screening" params={{ caseId }} search={{ screeningId }} className="back-link">Back to confirm reviewers</Link></>;
}