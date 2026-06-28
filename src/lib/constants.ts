import type {
  ChecklistTemplateItem,
  DocumentIssue,
  DocumentStatus,
  MessageType,
  VerificationStatus,
  VerificationStep
} from "@/lib/types";

export const APP_NAME = "Dossier";
export const APP_TAGLINE = "AI Document Agent";
export const PRIMARY_BRAND_COLOR = "#E85031";
export const STUDENT_DOCUMENTS_BUCKET = "students-documents";

export const SUPPORTED_AI_PROVIDER = "deepseek";
export const SUPPORTED_WHATSAPP_PROVIDER = "twilio";

export const DOCUMENT_ISSUES: DocumentIssue[] = [
  "missing",
  "wrong",
  "blurry",
  "expired"
];

export const DOCUMENT_STATUSES: DocumentStatus[] = [
  "missing",
  "uploaded",
  "needs_review",
  "wrong",
  "blurry",
  "expired",
  "verified",
  "rejected"
];

export const MESSAGE_TYPES: MessageType[] = [
  "document_reminder",
  "ai_follow_up",
  "verification_update",
  "deadline_warning",
  "general"
];

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  "not_started",
  "queued",
  "submitted",
  "verified",
  "rejected",
  "needs_action"
];

export const DEFAULT_DOCUMENT_CHECKLIST: ChecklistTemplateItem[] = [
  {
    id: "passport",
    label: "Passport",
    category: "identity",
    required: true,
    description: "Clear bio page scan with enough validity for the target route.",
    validityMonths: 6,
    acceptedFormats: ["pdf", "jpg", "jpeg", "png"]
  },
  {
    id: "cnic-or-national-id",
    label: "National ID",
    category: "identity",
    required: true,
    description: "Front and back scans where applicable.",
    acceptedFormats: ["pdf", "jpg", "jpeg", "png"]
  },
  {
    id: "academic-transcripts",
    label: "Academic transcripts",
    category: "academic",
    required: true,
    description: "Latest transcripts or consolidated mark sheets.",
    acceptedFormats: ["pdf"]
  },
  {
    id: "degree-certificates",
    label: "Degree certificates",
    category: "academic",
    required: true,
    description: "Certificates for completed qualifications.",
    acceptedFormats: ["pdf"]
  },
  {
    id: "english-test",
    label: "English language test",
    category: "language",
    required: false,
    description: "IELTS, TOEFL, PTE, Duolingo, or waiver evidence.",
    validityMonths: 24,
    acceptedFormats: ["pdf", "jpg", "jpeg", "png"]
  },
  {
    id: "bank-statement",
    label: "Bank statement",
    category: "financial",
    required: true,
    description: "Statement matching destination and institution requirements.",
    validityMonths: 3,
    acceptedFormats: ["pdf"]
  },
  {
    id: "sponsor-affidavit",
    label: "Sponsor affidavit",
    category: "financial",
    required: false,
    description: "Required when funds are sponsored by family or a third party.",
    acceptedFormats: ["pdf"]
  },
  {
    id: "cv",
    label: "CV or resume",
    category: "work",
    required: false,
    description: "Current education and work history.",
    acceptedFormats: ["pdf", "doc", "docx"]
  },
  {
    id: "statement-of-purpose",
    label: "Statement of purpose",
    category: "visa",
    required: true,
    description: "Program-specific SOP or GTE-style statement.",
    acceptedFormats: ["pdf", "doc", "docx"]
  }
];

export const OFFICIAL_VERIFICATION_WORKFLOW: Array<
  Omit<VerificationStep, "studentId" | "status">
> = [
  {
    id: "identity-verification",
    authority: "NADRA",
    label: "Identity verification"
  },
  {
    id: "secondary-education-verification",
    authority: "IBCC",
    label: "Secondary education attestation"
  },
  {
    id: "higher-education-verification",
    authority: "HEC",
    label: "Higher education attestation"
  },
  {
    id: "institution-verification",
    authority: "University",
    label: "Institution or awarding body confirmation"
  }
];

export function getStorageBucketMissingMessage(bucketName = STUDENT_DOCUMENTS_BUCKET) {
  return `Storage bucket ${bucketName} is missing. Create it in Supabase Storage.`;
}

export function mapStorageBucketErrorMessage(
  message?: string | null,
  bucketName = STUDENT_DOCUMENTS_BUCKET
) {
  const normalized = message?.toLowerCase() || "";

  if (
    (normalized.includes("bucket") && normalized.includes("not found")) ||
    normalized.includes("bucket not found") ||
    normalized.includes("does not exist")
  ) {
    return getStorageBucketMissingMessage(bucketName);
  }

  return message || "Supabase Storage request failed.";
}
