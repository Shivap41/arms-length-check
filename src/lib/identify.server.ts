import { isValidOrcid, NO_INDEXED_WORKS, openAlexAuthorSchema, parseProfileLink, rankAuthors, SEARCH_FAILED_MESSAGE, toLiveProfile, ORCID_CHECK_DIGIT_ERROR, type IdentifyResult, type LiveProfile, type OpenAlexAuthor, type ResolveResult } from "./identity";
import { SourceError } from "./sources.server";

/** The subset of the sources client identify needs (injectable for tests). */
export type IdentitySources = {
  getAuthorByOrcid(orcid: string): Promise<{ data: unknown }>;
  getAuthor(id: string): Promise<{ data: unknown }>;
  searchAuthors(name: string): Promise<{ data: unknown[] }>;
  getRecentWorks(id: string, n?: number): Promise<{ data: { title: string; year: number | null; doi: string | null }[] }>;
};
export type IdentifyInput = { typedName: string; typedInstitution: string; typedOrcid?: string | null | undefined };

function parseAuthor(data: unknown): OpenAlexAuthor {
  const parsed = openAlexAuthorSchema.safeParse(data);
  if (!parsed.success) throw new SourceError("Upstream");
  return parsed.data;
}
async function summarise(sources: IdentitySources, author: OpenAlexAuthor): Promise<LiveProfile> {
  const recent = await sources.getRecentWorks(author.id.replace(/^https:\/\/openalex\.org\//, ""), 3);
  return toLiveProfile(author, recent.data);
}
function failure(error: unknown): { status: "error"; error: string } {
  const type = error instanceof SourceError ? error.type : "Upstream";
  return { status: "error", error: `${SEARCH_FAILED_MESSAGE} (${type})` };
}

/**
 * B3 identify. With a valid ORCID: confirmed by ORCID, or insufficient if OpenAlex has no profile.
 * Without one: the top 3 scored name-search results for the chair. Nothing without an ORCID is
 * ever confirmed here (v1). A source error is returned as "error", never as an empty list.
 */
export async function identifyCore(sources: IdentitySources, input: IdentifyInput): Promise<IdentifyResult> {
  const typedOrcid = input.typedOrcid?.trim();
  if (typedOrcid) {
    const link = parseProfileLink(typedOrcid);
    if (!link.ok) return { status: "invalid", error: link.error };
    if (link.link.kind === "orcid") {
      if (!isValidOrcid(link.link.orcid)) return { status: "invalid", error: ORCID_CHECK_DIGIT_ERROR };
      try {
        const author = parseAuthor((await sources.getAuthorByOrcid(link.link.orcid)).data);
        return { status: "confirmed", method: "orcid", profile: await summarise(sources, author) };
      } catch (error) {
        if (error instanceof SourceError && error.type === "NotFound") return { status: "insufficient", reason: NO_INDEXED_WORKS };
        return failure(error);
      }
    }
    // An OpenAlex link typed with the reviewer is offered as a card, not confirmed automatically.
    try {
      const author = parseAuthor((await sources.getAuthor(link.link.id)).data);
      const profile = await summarise(sources, author);
      const match = rankAuthors(input.typedName, input.typedInstitution, [author])[0]?.match ?? { score: 0, name: false, institution: false, manyWorks: false };
      return { status: "needs_chair", options: [{ ...profile, match }] };
    } catch (error) { return failure(error); }
  }
  try {
    const results = (await sources.searchAuthors(input.typedName)).data.map(parseAuthor);
    const top = rankAuthors(input.typedName, input.typedInstitution, results, 3);
    const options = await Promise.all(top.map(async ({ author, match }) => ({ ...(await summarise(sources, author)), match })));
    return { status: "needs_chair", options };
  } catch (error) { return failure(error); }
}

/** Resolve a pasted ORCID or OpenAlex author link to a profile summary, for the chair to see before saving. */
export async function resolveCore(sources: IdentitySources, input: string): Promise<ResolveResult> {
  const link = parseProfileLink(input);
  if (!link.ok) return { ok: false, error: link.error };
  try {
    const data = link.link.kind === "orcid" ? (await sources.getAuthorByOrcid(link.link.orcid)).data : (await sources.getAuthor(link.link.id)).data;
    return { ok: true, profile: await summarise(sources, parseAuthor(data)) };
  } catch (error) {
    if (error instanceof SourceError && error.type === "NotFound") return { ok: false, error: link.link.kind === "orcid" ? `${NO_INDEXED_WORKS}.` : "No OpenAlex author with that id." };
    return { ok: false, error: `${SEARCH_FAILED_MESSAGE} (${error instanceof SourceError ? error.type : "Upstream"})` };
  }
}
