/** Fictional research-session fixtures. DOIs and ORCIDs must never be queried as real identifiers. */
export type DemoStatus = "Conflict" | "Potential" | "Insufficient data" | "No conflict found";
export type DemoPaper = { title: string; year: number; doi: string; authorCount?: number; authorLabel?: string; authorIdMissing?: boolean };
export type DemoProfile = { id: string; displayName: string; currentInstitution: string; currentSince: number; currentUntil?: number; pastInstitutions: { institution: string; fromYear: number; toYear: number }[]; topics: [string, string, string]; worksCount: number; orcid: string | null; recentPapers: [DemoPaper, DemoPaper, DemoPaper] };
export type DemoResult = { status: DemoStatus; rule: "R1" | "R2" | "R3" | "R5" | null; explanation: string; sharedPapers: DemoPaper[]; wrongPerson: boolean; note?: { text: string; collapsed: boolean }; employment?: { source: "ORCID employment"; institution: string; endYear: null }; declaredRelationship?: "Former PhD advisor" };
export type DemoAnswer = { action: "select-profiles"; profileIds: string[] } | { action: "paste-orcid"; orcid: string } | { action: "cant-tell" };
export type DemoReviewer = { id: string; typedName: string; typedInstitution: string; typedOrcid: string | null; brief: string; autoConfirmed: boolean; options: DemoProfile[]; additionalProfiles: DemoProfile[]; correctAnswer: DemoAnswer; resultsByChoice: Record<string, DemoResult> };
export type DemoScenario = { caseId: string; fictional: true; candidate: DemoProfile & { confirmed: true; coauthoredPercent: number }; reviewers: DemoReviewer[] };

let paperNumber = 1;
function paper(title: string, year: number, extra: Partial<DemoPaper> = {}): DemoPaper { return { title, year, doi: `10.5555/demo.${String(paperNumber++).padStart(4, "0")}`, ...extra }; }
const topicSets = {
  glycan: ["chemical biology", "glycobiology", "glycan imaging probes"],
  civil: ["civil engineering", "structural mechanics", "concrete durability"],
  materials: ["materials chemistry", "polymer surfaces", "surface functionalization"],
  history: ["history", "urban history", "archival studies"],
  linguistics: ["linguistics", "syntax", "language acquisition"],
  organic: ["organic chemistry", "glycochemistry", "carbohydrate synthesis"],
  economics: ["economics", "labor markets", "economic policy"],
  neuroscience: ["neuroscience", "synaptic plasticity", "neural imaging"],
  physics: ["physics", "quantum materials", "optical spectroscopy"],
  biochemistry: ["biochemistry", "enzyme kinetics", "protein regulation"],
  health: ["public health", "epidemiology", "health systems"],
  analytical: ["analytical chemistry", "mass spectrometry", "glycan analysis"],
  inorganic: ["inorganic chemistry", "coordination chemistry", "metal catalysis"],
  structural: ["structural biology", "protein complexes", "cryo-electron microscopy"],
  nursing: ["nursing", "clinical care", "patient safety"],
} satisfies Record<string, [string, string, string]>;
function profile(id: string, displayName: string, currentInstitution: string, topic: keyof typeof topicSets, worksCount: number, orcid: string | null = null, currentSince = 2019, pastInstitutions: DemoProfile["pastInstitutions"] = []): DemoProfile {
  const topics = topicSets[topic];
  return { id, displayName, currentInstitution, currentSince, pastInstitutions, topics: [...topics], worksCount, orcid, recentPapers: [
    paper(`Quantitative approaches to ${topics[0]}: a comparative study`, 2025),
    paper(`Mapping mechanisms in ${topics[1]} with integrated experimental methods`, 2024),
    paper(`Advances in ${topics[2]}: measurement and validation`, 2023),
  ] };
}
function result(status: DemoStatus, explanation: string, rule: DemoResult["rule"] = null, sharedPapers: DemoPaper[] = [], extra: Partial<DemoResult> = {}): DemoResult { return { status, rule, explanation, sharedPapers, wrongPerson: false, ...extra }; }
const clear = () => result("No conflict found", "No conflict found in the demo publication and employment data.");
const unknown = () => result("Insufficient data", "Identity not confirmed");
const coauthor = (years: number[], status: "Conflict" | "Potential" = "Conflict") => result(status, `${years.length} co-authored paper${years.length === 1 ? "" : "s"}, ${years.join(" and ")}.`, status === "Conflict" ? "R1" : "R2", years.map(year => paper("Selective glycan probes for chemical mapping of cell-surface carbohydrates", year)));
export function demoChoiceKey(profileIds: string[]): string { return [...new Set(profileIds)].sort().join("+"); }
function reviewer(id: string, typedName: string, typedInstitution: string, typedOrcid: string | null, brief: string, options: DemoProfile[], correctAnswer: DemoAnswer, optionResults: DemoResult[], extras: Record<string, DemoResult> = {}, additionalProfiles: DemoProfile[] = []): DemoReviewer {
  const resultsByChoice: Record<string, DemoResult> = { "cant-tell": unknown(), "wrong-pick": { ...clear(), wrongPerson: true }, ...extras };
  // Enumerate every selectable profile combination; only explicitly defined merges can establish a combined identity.
  for (let mask = 1; mask < 2 ** options.length; mask++) {
    const selected = options.filter((_, index) => mask & (1 << index));
    const key = demoChoiceKey(selected.map(option => option.id));
    if (resultsByChoice[key]) continue;
    if (selected.length === 1) {
      const index = options.findIndex(option => option.id === selected[0]?.id);
      const optionResult = optionResults[index];
      if (!optionResult) throw new Error(`Missing outcome for ${id}`);
      const correct = correctAnswer.action === "select-profiles" && correctAnswer.profileIds.includes(selected[0]?.id ?? "");
      resultsByChoice[key] = { ...optionResult, wrongPerson: !correct };
    } else resultsByChoice[key] = result("Insufficient data", "The selected profiles do not establish a single confirmed identity.", null, [], { wrongPerson: true });
  }
  return { id, typedName, typedInstitution, typedOrcid, brief, options, additionalProfiles, correctAnswer, autoConfirmed: typedOrcid !== null, resultsByChoice };
}
const candidate = { ...profile("candidate-ortiz", "Dr. Maya Ortiz", "Northbridge University", "glycan", 118, "0000-0000-0000-0001"), confirmed: true as const, coauthoredPercent: 92 };
const single = (id: string, name: string, institution: string, orcid: string, outcome: DemoResult, topic: keyof typeof topicSets, works: number) => {
  const option = profile(`${id}-a`, name, institution, topic, works, orcid);
  return reviewer(id, name, institution, orcid, `${topicSets[topic][0]}; ORCID on CV: ${orcid}.`, [option], { action: "select-profiles", profileIds: [option.id] }, [outcome]);
};
const institutionConflict = () => result("Conflict", "Same current institution as the candidate (ORCID employment, no end date).", "R3", [], { employment: { source: "ORCID employment", institution: "Northbridge University", endYear: null } });

export const demoScenario: DemoScenario = { caseId: "ortiz-2027", fictional: true, candidate, reviewers: [
  single("R1", "Daniel Okafor", "Crestfield University", "0000-0000-0000-0011", coauthor([2023, 2025]), "glycan", 86),
  single("R2", "Hannah Lindqvist", "University of Eastmoor", "0000-0000-0000-0012", clear(), "biochemistry", 73),
  single("R3", "Samuel Achterberg", "Kingsbridge University", "0000-0000-0000-0013", coauthor([2017], "Potential"), "organic", 91),
  single("R4", "Ishani Varma", "Ashdown University", "0000-0000-0000-0014", clear(), "analytical", 68),
  single("R5", "Tomás Ferreira", "Northbridge University", "0000-0000-0000-0015", institutionConflict(), "glycan", 102),
  reviewer("R6", "Wei Zhang", "Pinecrest University", null, "Chemistry dept; works on glycan imaging probes.", [
    profile("R6-a", "Wei Zhang", "Pinecrest University", "glycan", 64),
    profile("R6-b", "Wei Zhang", "Pinecrest University", "civil", 140),
    profile("R6-c", "Wei Zhang", "Lakemont College", "glycan", 52),
  ], { action: "select-profiles", profileIds: ["R6-a"] }, [clear(), clear(), coauthor([2024])]),
  reviewer("R7", "John Miller", "Ravensworth University", null, "Materials chemistry; polymer surfaces.", [
    profile("R7-a", "John Miller", "Ravensworth University", "materials", 77),
    profile("R7-b", "John A. Miller", "Harborview Institute of Technology", "glycan", 95),
    profile("R7-c", "John Miller", "Ravensworth University", "history", 30),
  ], { action: "select-profiles", profileIds: ["R7-a"] }, [result("No conflict found", "No conflict found for the selected materials chemist.", null, [], { note: { text: "Different person with the same name: John A. Miller (Harborview Institute of Technology) co-wrote 3 papers with the candidate", collapsed: true } }), coauthor([2021, 2023, 2025]), clear()]),
  reviewer("R8", "Elena Rossi", "Marlow Institute", null, "Marlow Institute since 2019; earlier at Lakemont College.", [
    profile("R8-a", "Elena Rossi", "Marlow Institute", "glycan", 41, null, 2019, [{ institution: "Lakemont College", fromYear: 2012, toYear: 2018 }]),
    { ...profile("R8-b", "E. Rossi", "Lakemont College", "glycan", 26, null, 2012), currentUntil: 2018, pastInstitutions: [{ institution: "Lakemont College", fromYear: 2012, toYear: 2018 }] },
    profile("R8-c", "Elena Rossi", "University of Eastmoor", "linguistics", 58),
  ], { action: "select-profiles", profileIds: ["R8-a", "R8-b"] }, [clear(), coauthor([2016], "Potential"), clear()], { "R8-a+R8-b": result("Potential", "Merged profiles reveal a 2016 paper with Ortiz at Lakemont.", "R2", [paper("Glycan labeling strategies for imaging membrane-associated carbohydrates", 2016)]) }),
  reviewer("R9", "Michael Brandt", "Harborview Institute of Technology", null, "Organic chemistry. ORCID on CV: 0000-0000-0000-0019.", [
    profile("R9-a", "Michael Brandt", "University of Eastmoor", "economics", 65),
    profile("R9-b", "Michael Brandt", "Crestfield University", "neuroscience", 89),
    profile("R9-c", "Michael Brandt", "Pinecrest University", "physics", 72),
  ], { action: "paste-orcid", orcid: "0000-0000-0000-0019" }, [clear(), clear(), clear()], { "orcid:0000-0000-0000-0019": coauthor([2018], "Potential") }, [profile("R9-cv", "Michael Brandt", "Harborview Institute of Technology", "organic", 83, "0000-0000-0000-0019")]),
  reviewer("R10", "Aisha Rahman", "St. Aldric University", null, "Biochemistry.", [
    profile("R10-a", "Aisha Rahman", "St. Aldric University", "biochemistry", 61),
    profile("R10-b", "Aisha Rahman", "Kingsbridge University", "health", 96),
  ], { action: "select-profiles", profileIds: ["R10-a"] }, [clear(), clear()]),
  reviewer("R11", "Robert Chen", "Kingsbridge University", null, "Chemistry; mass spectrometry.", [
    profile("R11-a", "Robert Chen", "Kingsbridge University", "analytical", 88),
    profile("R11-b", "Robert Chen", "Kingsbridge University", "economics", 54),
    profile("R11-c", "Robert C. Chen", "Northbridge University", "organic", 79),
  ], { action: "select-profiles", profileIds: ["R11-a"] }, [result("Potential", "Same name on a shared paper; check it's this person", null, [paper("Mass-spectrometric profiling of cell-surface glycan diversity", 2022, { authorLabel: "R. Chen", authorIdMissing: true })]), clear(), institutionConflict()]),
  reviewer("R12", "Laura Becker", "Ashdown University", null, "Inorganic chemistry.", [profile("R12-a", "Laura Becker", "Ashdown University", "inorganic", 57)], { action: "select-profiles", profileIds: ["R12-a"] }, [clear()]),
  reviewer("R13", "Kenji Watanabe", "Lakemont College", null, "Joined Lakemont this year from industry; no ORCID on CV.", [
    profile("R13-a", "Kenji Watanabe", "University of Eastmoor", "economics", 44),
    profile("R13-b", "Kenji Watanabe", "Pinecrest University", "civil", 70),
    profile("R13-c", "Kenji Watanabe", "Crestfield University", "neuroscience", 63),
  ], { action: "cant-tell" }, [clear(), clear(), clear()]),
  reviewer("R14", "Grace O'Neill", "Crestfield University", null, "Structural biology.", [
    profile("R14-a", "Grace O'Neill", "Crestfield University", "structural", 76),
    profile("R14-b", "Grace O'Neill", "Ashdown University", "nursing", 39),
  ], { action: "select-profiles", profileIds: ["R14-a"] }, [result("Potential", "Large team paper", null, [paper("Consortium atlas of glycan recognition across protein assemblies", 2024, { authorCount: 120 })]), clear()]),
  reviewer("R15", "Marco Bianchi", "University of Eastmoor", null, "Glycochemistry.", [
    profile("R15-a", "Marco Bianchi", "University of Eastmoor", "organic", 112),
    profile("R15-b", "Marco Bianchi", "Marlow Institute", "physics", 67),
  ], { action: "select-profiles", profileIds: ["R15-a"] }, [result("Conflict", "The candidate declared him as her former PhD advisor.", "R5", [], { declaredRelationship: "Former PhD advisor" }), clear()]),
] };