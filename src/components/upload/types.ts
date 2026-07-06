export type UploadedDocument = {
  id: string;
  checklist_item_id: string;
  document_part_id?: string | null;
  original_filename: string;
  status?: string | null;
  scan_status?: string | null;
  scan_error_message?: string | null;
  created_at?: string | null;
};

export type DocumentPart = {
  id: string;
  part_name: string;
  is_required: boolean;
  status?: string | null;
  sort_order?: number | null;
};

export type ChecklistItem = {
  id: string;
  document_name: string;
  is_required?: boolean | null;
  requirement_level?: string | null;
  phase_slug?: string | null;
  phase_label?: string | null;
  phase_order?: number | null;
  item_order?: number | null;
  visible_to_student?: boolean | null;
  is_archived?: boolean | null;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  applies_from_stage?: string | null;
  instructions?: string | null;
  accepted_formats: string[];
  upload_type: string;
  document_parts?: DocumentPart[];
};

export type UploadStep = {
  id: string;
  label: string;
  isRequired: boolean;
  part?: DocumentPart;
};

export type WizardState =
  | "idle"
  | "opening_camera"
  | "ready"
  | "selecting_file"
  | "preview"
  | "captured"
  | "checking_quality"
  | "uploading"
  | "uploaded"
  | "scanning"
  | "accepted"
  | "needs_review"
  | "retake_required"
  | "scan_complete"
  | "needs_retake"
  | "step_complete"
  | "document_complete";

export type UploadResponse =
  | {
      ok: true;
      documentId: string;
      storagePath: string;
      message: string;
      documentStatus?: string;
      scanStatus?: string;
      scanMessage?: string;
    }
  | {
      ok: false;
      error: string;
    };
