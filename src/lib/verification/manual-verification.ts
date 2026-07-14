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
  "BISE Rawalpindi",
  "BISE Multan",
  "BISE Gujranwala",
  "BISE Sargodha",
  "BISE Bahawalpur",
  "BISE DG Khan",
  "FBISE",
  "BISE Karachi / BSEK",
  "BIEK Karachi",
  "BISE Peshawar",
  "BISE Quetta",
  "Other"
] as const;

export const providerDetails: Record<
  VerificationProvider,
  { label: string; description: string }
> = {
  nadra: {
    label: "NADRA",
    description:
      "Use this to track CNIC, FRC, B-form, or identity verification done outside Dossier."
  },
  board: {
    label: "Board Verification",
    description:
      "Track school or college board verification for Matric, O-Level equivalence, Intermediate, or A-Level equivalence."
  },
  ibcc: {
    label: "IBCC",
    description:
      "Track IBCC attestation, equivalence, or QR/manual verification."
  },
  hec: {
    label: "HEC",
    description:
      "Track university degree or transcript verification through the HEC manual or e-services process."
  },
  mofa: {
    label: "MOFA",
    description:
      "Track final attestation, legalization, or apostille proof when required."
  },
  other: {
    label: "Other manual verification",
    description:
      "Track another manual verification step for this student."
  }
};

export const statusLabels: Record<VerificationWorkflowStatus, string> = {
  not_started: "Not started",
  portal_opened: "Portal opened",
  submitted: "Submitted",
  in_progress: "In progress",
  verified: "Verified",
  issue_found: "Issue found",
  not_required: "Not required"
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
