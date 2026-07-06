export const checklistPhaseSlugs = [
  "profile_academic_file",
  "university_application",
  "financial_sponsor_file",
  "admission_offer_stage",
  "visa_processing",
  "verification_attestation",
  "country_specific_requirements",
  "risk_explanation",
  "optional_profile_boosters",
  "pre_departure"
] as const;

export type ChecklistPhaseSlug = (typeof checklistPhaseSlugs)[number];

export type ChecklistPhase = {
  slug: ChecklistPhaseSlug;
  label: string;
  studentLabel: string;
  shortLabel: string;
  description: string;
  order: number;
  iconKey: string;
  accent: "orange" | "blue" | "green" | "amber" | "violet" | "slate";
};

export const CHECKLIST_PHASES: readonly ChecklistPhase[] = [
  {
    slug: "profile_academic_file",
    label: "Profile & Academic File",
    studentLabel: "Profile & Academic Documents",
    shortLabel: "Profile & Academic",
    description: "Identity, education history, language proof, and core application profile.",
    order: 1,
    iconKey: "user-round",
    accent: "orange"
  },
  {
    slug: "university_application",
    label: "University Application",
    studentLabel: "University Documents",
    shortLabel: "University",
    description: "Documents used to apply to universities before admission.",
    order: 2,
    iconKey: "graduation-cap",
    accent: "blue"
  },
  {
    slug: "financial_sponsor_file",
    label: "Financial & Sponsor File",
    studentLabel: "Financial Documents",
    shortLabel: "Financial",
    description: "Sponsor identity, funds, income source, and money trail evidence.",
    order: 3,
    iconKey: "wallet-cards",
    accent: "green"
  },
  {
    slug: "admission_offer_stage",
    label: "Admission / Offer Stage",
    studentLabel: "Admission Documents",
    shortLabel: "Admission",
    description: "Offer letters, tuition deposits, scholarship proof, and application references.",
    order: 4,
    iconKey: "badge-check",
    accent: "violet"
  },
  {
    slug: "visa_processing",
    label: "Visa Processing",
    studentLabel: "Visa Documents",
    shortLabel: "Visa",
    description: "Embassy forms, appointments, travel history, medicals, police, and visa documents.",
    order: 5,
    iconKey: "stamp",
    accent: "blue"
  },
  {
    slug: "verification_attestation",
    label: "Verification / Attestation",
    studentLabel: "Verification Documents",
    shortLabel: "Verification",
    description: "IBCC, HEC, MOFA, apostille, equivalence, translations, and institutional verification.",
    order: 6,
    iconKey: "shield-check",
    accent: "amber"
  },
  {
    slug: "country_specific_requirements",
    label: "Country-Specific Requirements",
    studentLabel: "Country-Specific Documents",
    shortLabel: "Country-Specific",
    description: "Requirements like CAS, CoE, SEVIS, GIC, APS, CIMEA, DoV, Universitaly, and blocked account.",
    order: 7,
    iconKey: "globe-2",
    accent: "violet"
  },
  {
    slug: "risk_explanation",
    label: "Risk & Explanation Documents",
    studentLabel: "Extra Required Documents",
    shortLabel: "Risk & Explanation",
    description: "Gap, refusal, low marks, backlog, source-of-funds, and profile explanation documents.",
    order: 8,
    iconKey: "message-square-warning",
    accent: "amber"
  },
  {
    slug: "optional_profile_boosters",
    label: "Optional Profile Boosters",
    studentLabel: "Optional Supporting Documents",
    shortLabel: "Optional",
    description: "Awards, extracurriculars, volunteering, courses, portfolio, and achievements.",
    order: 9,
    iconKey: "sparkles",
    accent: "green"
  },
  {
    slug: "pre_departure",
    label: "Pre-Departure",
    studentLabel: "Travel Readiness Documents",
    shortLabel: "Pre-Departure",
    description: "Final travel, accommodation, insurance, pickup, and arrival readiness documents.",
    order: 10,
    iconKey: "plane",
    accent: "slate"
  }
];

export const DEFAULT_CHECKLIST_PHASE = CHECKLIST_PHASES[0];

export function getChecklistPhase(slug?: string | null) {
  return (
    CHECKLIST_PHASES.find((phase) => phase.slug === slug) ??
    DEFAULT_CHECKLIST_PHASE
  );
}

export function getStudentPhaseLabel(slug?: string | null) {
  return getChecklistPhase(slug).studentLabel;
}
