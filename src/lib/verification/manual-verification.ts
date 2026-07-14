import {
  parseEducationCompleted,
  type EducationCompletedValue
} from "@/lib/students/education-background";

export const verificationProviders = [
  "nadra",
  "board",
  "ibcc",
  "hec",
  "mofa",
  "other"
] as const;

export type VerificationProvider = (typeof verificationProviders)[number];

export const verificationWorkflowStatuses = [
  "not_started",
  "portal_opened",
  "submitted",
  "in_progress",
  "verified",
  "issue_found",
  "not_required"
] as const;

export type VerificationWorkflowStatus =
  (typeof verificationWorkflowStatuses)[number];

export const counselorVerificationStatuses = [
  "not_started",
  "in_progress",
  "verified",
  "issue_found",
  "not_required"
] as const satisfies readonly VerificationWorkflowStatus[];

export type VerificationWorkflow = {
  id: string;
  agency_id: string;
  student_id: string;
  provider: VerificationProvider;
  provider_label: string;
  related_document_request_ids?: string[] | null;
  related_documents: Array<{ id: string; document_name: string }>;
  status: VerificationWorkflowStatus;
  reference_number?: string | null;
  selected_board?: string | null;
  official_url?: string | null;
  evidence_url?: string | null;
  evidence_file_name?: string | null;
  notes?: string | null;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
};

export const boardOptions = [
  "BISE Lahore",
  "BISE Faisalabad",
  "BISE Gujranwala",
  "BISE Rawalpindi",
  "BISE Multan",
  "BISE Sahiwal",
  "BISE Sargodha",
  "BISE Bahawalpur",
  "FBISE",
  "BISE Karachi",
  "BIEK Karachi",
  "BISE Hyderabad",
  "BISE Sukkur",
  "BISE Peshawar",
  "BISE Abbottabad",
  "BISE Mardan",
  "BISE Quetta",
  "AJK Board",
  "Other / manual"
] as const;

export const providerDetails: Record<
  VerificationProvider,
  { label: string; description: string; portalButtonLabel: string }
> = {
  nadra: {
    label: "NADRA",
    description:
      "Track identity verification completed through NADRA/manual identity checks.",
    portalButtonLabel: "Open NADRA services"
  },
  board: {
    label: "Board Verification",
    description:
      "Track school or college board verification for matric/intermediate/equivalence documents.",
    portalButtonLabel: "Open board portal"
  },
  ibcc: {
    label: "IBCC",
    description:
      "Track IBCC attestation, equivalence, QR, or manual verification.",
    portalButtonLabel: "Open IBCC verification"
  },
  hec: {
    label: "HEC",
    description:
      "Track degree or transcript verification through HEC manual/e-services process.",
    portalButtonLabel: "Open HEC e-services"
  },
  mofa: {
    label: "MOFA",
    description:
      "Track MOFA attestation, apostille, or legalization verification.",
    portalButtonLabel: "Open MOFA verification"
  },
  other: {
    label: "Other manual verification",
    description:
      "Track another manual verification step for this student.",
    portalButtonLabel: "Open portal"
  }
};

export const statusLabels: Record<VerificationWorkflowStatus, string> = {
  not_started: "Not started",
  portal_opened: "In progress",
  submitted: "In progress",
  in_progress: "In progress",
  verified: "Verified",
  issue_found: "Issue found",
  not_required: "Not required"
};

export const defaultProviderPortalUrls: Partial<
  Record<VerificationProvider, string>
> = {
  nadra: "https://www.nadra.gov.pk/",
  ibcc: "https://attest.ibcc.edu.pk/",
  hec: "https://eservices.hec.gov.pk/",
  mofa: "https://mofa.gov.pk/"
};

type RequestedDocument = { id: string; document_name: string };

const identityPattern =
  /\b(cnic|national id|national identity|b-form|b form|frc|family registration|sponsor cnic|guardian cnic)\b/i;
const boardPattern =
  /\b(matric|ssc|secondary school|o[- ]?level|intermediate|hssc|higher secondary|a[- ]?level|school board|college board|statement of result|equivalence)\b/i;
const ibccPattern =
  /\b(ibcc|matric|ssc|o[- ]?level|intermediate|hssc|a[- ]?level|equivalence)\b/i;
const hecPattern =
  /\b(hec|bachelor|master|m\.?phil|\bms\b|phd|degree|university transcript|academic transcript)\b/i;
const mofaPattern =
  /\b(mofa|apostille|legalization|legalisation|embassy legalization|embassy legalisation|final attestation)\b/i;
const genericAcademicPattern =
  /\b(academic|education|qualification|certificate|degree|transcript|statement of result)\b/i;

function matchesEducationLevel(
  provider: VerificationProvider,
  educationBackground?: string | null
) {
  const completed = new Set(parseEducationCompleted(educationBackground));

  if (provider === "board" || provider === "ibcc") {
    const schoolLevels: EducationCompletedValue[] = [
      "matric_ssc",
      "o_level",
      "intermediate_hssc",
      "a_level"
    ];
    return schoolLevels.some((value) => completed.has(value));
  }

  if (provider === "hec") {
    const universityLevels: EducationCompletedValue[] = [
      "bachelor",
      "master",
      "mphil_ms",
      "phd"
    ];
    return universityLevels.some((value) => completed.has(value));
  }

  return false;
}

function relatedDocumentsForProvider(
  provider: VerificationProvider,
  documents: RequestedDocument[],
  educationBackground?: string | null
) {
  const directPattern = {
    nadra: identityPattern,
    board: boardPattern,
    ibcc: ibccPattern,
    hec: hecPattern,
    mofa: mofaPattern,
    other: /$^/
  }[provider];

  return documents.filter((document) => {
    if (directPattern.test(document.document_name)) {
      return true;
    }

    return (
      genericAcademicPattern.test(document.document_name) &&
      matchesEducationLevel(provider, educationBackground)
    );
  });
}

export function suggestVerificationWorkflows(
  documents: RequestedDocument[],
  educationBackground?: string | null
) {
  return verificationProviders
    .filter((provider) => provider !== "other")
    .map((provider) => ({
      provider,
      providerLabel: providerDetails[provider].label,
      relatedDocuments: relatedDocumentsForProvider(
        provider,
        documents,
        educationBackground
      )
    }))
    .filter((suggestion) => suggestion.relatedDocuments.length > 0);
}

export function safeExternalUrl(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const candidate = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(candidate);

    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
