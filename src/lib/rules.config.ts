/** Every number the rules use (B4). Change them here, nowhere else. */
export const rulesConfig = {
  /** Shared work published within this many years of today -> R1 (conflict); older -> R2 (potential). */
  recentYears: 5,
  /** Same education institution with overlapping years within this many years -> R4 (potential). */
  pastInstitutionYears: 10,
  /** Byline affiliations from works this recent count as current evidence for R3. */
  currentEvidenceYears: 2,
  /** A shared work with more authors than this -> LARGE_TEAM (potential) instead of R1/R2. */
  largeTeamAuthors: 50,
  /** Either person with fewer works than this -> Insufficient data (when nothing else was found). */
  minWorks: 5,
  /** Candidate with less than this share of multi-author works -> Insufficient data. */
  minCoauthoredShare: 0.3,
  /** Shared-work types that count. */
  countedWorkTypes: ["article", "review", "book", "book-chapter", "preprint"],
  /** Same-name-other-person works listed at most. */
  sameNameListed: 5,
} as const;
export type RulesConfig = typeof rulesConfig;
