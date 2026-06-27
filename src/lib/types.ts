export type ApplicationCountry =
  | "Australia"
  | "Canada"
  | "Germany"
  | "United Kingdom"
  | "United States"
  | "Other";

export type IntakeSeason = "spring" | "summer" | "fall" | "winter";

export type DocumentCategory =
  | "identity"
  | "academic"
  | "financial"
  | "language"
  | "work"
  | "visa"
  | "medical"
  | "other";

export type DocumentIssue = "missing" | "wrong" | "blurry" | "expired";

export type DocumentStatus =
  | "missing"
  | "uploaded"
  | "needs_review"
  | "wrong"
  | "blurry"
  | "expired"
  | "verified"
  | "rejected";

export type VerificationAuthority =
  | "NADRA"
  | "IBCC"
  | "HEC"
  | "University"
  | "Bank"
  | "Passport Office"
  | "Other";

export type VerificationStatus =
  | "not_started"
  | "queued"
  | "submitted"
  | "verified"
  | "rejected"
  | "needs_action";

export type MessageType =
  | "document_reminder"
  | "ai_follow_up"
  | "upload_link"
  | "missing_documents"
  | "reupload_required"
  | "verification_required"
  | "file_complete"
  | "verification_update"
  | "deadline_warning"
  | "general";

export interface StudentProfile {
  id: string;
  agencyId: string;
  fullName: string;
  phone?: string;
  email?: string;
  destinationCountry: ApplicationCountry;
  targetProgram?: string;
  targetInstitution?: string;
  intakeSeason?: IntakeSeason;
  intakeYear?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistTemplateItem {
  id: string;
  label: string;
  category: DocumentCategory;
  required: boolean;
  description?: string;
  validityMonths?: number;
  acceptedFormats: string[];
}

export interface StudentDocument {
  id: string;
  studentId: string;
  checklistItemId: string;
  label: string;
  category: DocumentCategory;
  status: DocumentStatus;
  issues: DocumentIssue[];
  fileUrl?: string;
  expiresAt?: string;
  reviewedAt?: string;
  reviewerNotes?: string;
}

export interface SmartChecklist {
  id: string;
  studentId: string;
  destinationCountry: ApplicationCountry;
  items: ChecklistTemplateItem[];
  generatedAt: string;
  generatedBy: "system" | "consultant" | "ai";
}

export interface VerificationStep {
  id: string;
  studentId: string;
  authority: VerificationAuthority;
  label: string;
  status: VerificationStatus;
  dueAt?: string;
  submittedAt?: string;
  verifiedAt?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface ApplicationPacket {
  id: string;
  studentId: string;
  checklistId: string;
  documentIds: string[];
  exportedAt: string;
  exportedBy: string;
  format: "zip" | "pdf";
}

export interface AiFollowUpRequest {
  studentName: string;
  consultantName?: string;
  agencyName?: string;
  destinationCountry?: ApplicationCountry;
  targetInstitution?: string;
  deadline?: string;
  missingDocuments?: string[];
  wrongDocuments?: string[];
  blurryDocuments?: string[];
  expiredDocuments?: string[];
  verificationSteps?: Pick<VerificationStep, "authority" | "label" | "status">[];
  tone?: "friendly" | "firm" | "urgent";
}

export interface AiFollowUpResult {
  provider: "deepseek";
  model: string;
  message: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface WhatsAppMessageInput {
  to: string;
  body: string;
  studentId?: string;
  messageType?: MessageType;
}

export interface WhatsAppMessageResult {
  provider: "twilio";
  messageId: string;
  status: string;
  to: string;
  from: string;
  studentId?: string;
  messageType?: MessageType;
  sentAt: string;
}
