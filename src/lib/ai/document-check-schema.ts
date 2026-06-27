import { z } from "zod";

export const documentCheckIssueTypeSchema = z.enum([
  "wrong_document",
  "wrong_format",
  "blurry",
  "cropped",
  "missing_page",
  "expired",
  "name_mismatch",
  "low_confidence",
  "attestation_missing",
  "needs_manual_review",
  "suspicious"
]);

export const databaseDocumentIssueTypeSchema = z.enum([
  "missing",
  "wrong_format",
  "wrong_document",
  "blurry",
  "expired",
  "name_mismatch",
  "suspicious",
  "other",
  "cropped",
  "missing_page",
  "low_confidence",
  "attestation_missing",
  "needs_manual_review"
]);

export const documentCheckSeveritySchema = z.enum(["low", "medium", "high"]);

export const documentCheckRecommendedStatusSchema = z.enum([
  "accepted",
  "needs_review",
  "suspicious",
  "official_verification_required"
]);

export const documentCheckExtractedFieldsSchema = z.object({
  full_name: z.string().nullable(),
  father_name: z.string().nullable(),
  date_of_birth: z.string().nullable(),
  document_number: z.string().nullable(),
  issue_date: z.string().nullable(),
  expiry_date: z.string().nullable(),
  institution_name: z.string().nullable(),
  board_or_university: z.string().nullable(),
  marks_or_grade: z.string().nullable(),
  account_holder: z.string().nullable(),
  statement_date: z.string().nullable()
});

export const documentCheckIssueSchema = z.object({
  type: documentCheckIssueTypeSchema,
  severity: documentCheckSeveritySchema,
  message: z.string().trim().min(1),
  evidence: z.string().trim().min(1),
  recommended_action: z.string().trim().min(1)
});

export const documentCheckResultSchema = z.object({
  detected_document_type: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  extracted_fields: documentCheckExtractedFieldsSchema,
  issues: z.array(documentCheckIssueSchema),
  needs_human_review: z.boolean(),
  recommended_status: documentCheckRecommendedStatusSchema
});

export type DocumentCheckIssueType = z.infer<
  typeof documentCheckIssueTypeSchema
>;
export type DatabaseDocumentIssueType = z.infer<
  typeof databaseDocumentIssueTypeSchema
>;
export type DocumentCheckSeverity = z.infer<
  typeof documentCheckSeveritySchema
>;
export type DocumentCheckRecommendedStatus = z.infer<
  typeof documentCheckRecommendedStatusSchema
>;
export type DocumentCheckIssue = z.infer<typeof documentCheckIssueSchema>;
export type DocumentCheckResult = z.infer<typeof documentCheckResultSchema>;

export function normalizeDocumentIssueType(
  issueType: string
): DatabaseDocumentIssueType {
  const parsed = databaseDocumentIssueTypeSchema.safeParse(issueType);

  if (parsed.success) {
    return parsed.data;
  }

  switch (issueType) {
    case "needs_review":
    case "needs_manual_review":
    case "low_confidence":
    case "attestation_missing":
    case "cropped":
    case "missing_page":
      return "other";
    default:
      return "other";
  }
}
