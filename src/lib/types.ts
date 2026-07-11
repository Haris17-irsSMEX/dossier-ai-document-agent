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

export const whatsappProviders = [
  "manual_handoff",
  "twilio",
  "360dialog_sandbox",
  "360dialog"
] as const;

export type WhatsAppProvider = (typeof whatsappProviders)[number];

export const emailProviders = ["none", "google"] as const;

export type EmailProvider = (typeof emailProviders)[number];

export const appRoles = ["platform_admin", "agency_admin", "counselor"] as const;

export type AppRole = (typeof appRoles)[number];

export const agencyStatuses = ["active", "suspended", "archived"] as const;

export type AgencyStatus = (typeof agencyStatuses)[number];

export const profileStatuses = [
  "active",
  "invited",
  "suspended",
  "archived"
] as const;

export type ProfileStatus = (typeof profileStatuses)[number];

export const emailConnectionStatuses = [
  "connected",
  "expired",
  "revoked",
  "error"
] as const;

export type EmailConnectionStatus = (typeof emailConnectionStatuses)[number];

export const whatsappHandoffStatuses = [
  "draft",
  "handoff_opened",
  "sent_manually",
  "cancelled",
  "failed"
] as const;

export type WhatsAppHandoffStatus = (typeof whatsappHandoffStatuses)[number];

export type FollowUpChannel = "whatsapp" | "email";

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
  uploadUrl?: string;
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

export interface CommunicationSettings {
  id: string;
  agency_id?: string | null;
  profile_id?: string | null;
  whatsapp_provider: WhatsAppProvider;
  consultant_whatsapp_number?: string | null;
  consultant_whatsapp_display_name?: string | null;
  email_provider: EmailProvider;
  default_followup_channel: FollowUpChannel;
  message_signature?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailConnection {
  id: string;
  agency_id?: string | null;
  profile_id?: string | null;
  provider: "google";
  email_address: string;
  google_user_id?: string | null;
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
  token_expires_at?: string | null;
  scopes?: string[] | null;
  status: EmailConnectionStatus;
  connected_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppHandoff {
  id: string;
  agency_id?: string | null;
  profile_id?: string | null;
  student_id?: string | null;
  from_display_number?: string | null;
  to_number: string;
  message_body: string;
  handoff_url: string;
  status: WhatsAppHandoffStatus;
  opened_at: string;
  marked_sent_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}
