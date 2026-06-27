import { z } from "zod";

export const acceptedFormatSchema = z.enum(["pdf", "jpg", "png", "docx"]);

export const uploadTypeSchema = z.enum(["single", "multiple", "multi_part"]);

export const checklistStatusSchema = z.enum([
  "missing",
  "uploaded",
  "wrong_format",
  "wrong_document",
  "blurry",
  "expired",
  "name_mismatch",
  "needs_review",
  "suspicious",
  "accepted",
  "rejected",
  "official_verification_required",
  "officially_verified"
]);

export type AcceptedFormat = z.infer<typeof acceptedFormatSchema>;
export type UploadType = z.infer<typeof uploadTypeSchema>;
export type ChecklistStatus = z.infer<typeof checklistStatusSchema>;

export type RequiredPart = {
  part_name: string;
  is_required: boolean;
};

export type ChecklistRuleInput = {
  targetCountry?: string | null;
  programLevel?: string | null;
  educationBackground?: string | null;
  sponsorType?: string | null;
  deadlineDate?: string | null;
};

export type ChecklistRuleItem = {
  category: "personal" | "educational" | "visa" | "financial" | "sponsor" | "custom";
  document_name: string;
  is_required: boolean;
  instructions: string;
  accepted_formats: AcceptedFormat[];
  upload_type: UploadType;
  required_parts: RequiredPart[];
  ai_validation_enabled: boolean;
  expiry_validation_enabled: boolean;
  submission_deadline?: string | null;
};

const passportParts = [
  { part_name: "Bio Data Page", is_required: true },
  { part_name: "Additional Visa Pages", is_required: false }
];

const cnicParts = [
  { part_name: "Front Side", is_required: true },
  { part_name: "Back Side", is_required: true }
];

function baseItem(
  item: Omit<ChecklistRuleItem, "submission_deadline">
): ChecklistRuleItem {
  return item;
}

function hasValue(value: string | null | undefined, candidates: string[]) {
  const normalized = value?.toLowerCase() || "";
  return candidates.some((candidate) => normalized.includes(candidate));
}

export function buildSmartChecklistRules(
  input: ChecklistRuleInput
): ChecklistRuleItem[] {
  const items: ChecklistRuleItem[] = [
    baseItem({
      category: "personal",
      document_name: "Passport",
      is_required: true,
      instructions: "Upload a clear passport bio page. Add previous visa pages if available.",
      accepted_formats: ["pdf", "jpg", "png"],
      upload_type: "multi_part",
      required_parts: passportParts,
      ai_validation_enabled: true,
      expiry_validation_enabled: true
    }),
    baseItem({
      category: "personal",
      document_name: "CNIC",
      is_required: true,
      instructions: "Upload clear front and back scans of your CNIC.",
      accepted_formats: ["pdf", "jpg", "png"],
      upload_type: "multi_part",
      required_parts: cnicParts,
      ai_validation_enabled: true,
      expiry_validation_enabled: true
    }),
    baseItem({
      category: "financial",
      document_name: "Bank Statements",
      is_required: true,
      instructions: "Upload recent bank statements as separate PDF files.",
      accepted_formats: ["pdf"],
      upload_type: "multiple",
      required_parts: [],
      ai_validation_enabled: true,
      expiry_validation_enabled: true
    }),
    baseItem({
      category: "visa",
      document_name: "SOP",
      is_required: true,
      instructions: "Upload the latest statement of purpose.",
      accepted_formats: ["pdf", "docx"],
      upload_type: "single",
      required_parts: [],
      ai_validation_enabled: false,
      expiry_validation_enabled: false
    }),
    baseItem({
      category: "custom",
      document_name: "CV",
      is_required: true,
      instructions: "Upload your latest CV.",
      accepted_formats: ["pdf", "docx"],
      upload_type: "single",
      required_parts: [],
      ai_validation_enabled: false,
      expiry_validation_enabled: false
    })
  ];

  if (hasValue(input.educationBackground, ["matric", "secondary", "school"])) {
    items.push(
      baseItem({
        category: "educational",
        document_name: "Matric Certificate",
        is_required: true,
        instructions: "Upload the matric certificate.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "educational",
        document_name: "Matric Result Card / Transcript",
        is_required: true,
        instructions: "Upload the matric result card or transcript.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      })
    );
  }

  if (hasValue(input.educationBackground, ["intermediate", "fsc", "fa", "college"])) {
    items.push(
      baseItem({
        category: "educational",
        document_name: "Intermediate Certificate",
        is_required: true,
        instructions: "Upload the intermediate certificate.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "educational",
        document_name: "Intermediate Result Card / Transcript",
        is_required: true,
        instructions: "Upload the intermediate result card or transcript.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      })
    );
  }

  if (hasValue(input.educationBackground, ["o-level", "olevel", "cambridge"])) {
    items.push(
      baseItem({
        category: "educational",
        document_name: "O-Level Certificates",
        is_required: true,
        instructions: "Upload all O-Level certificates.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "multiple",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "educational",
        document_name: "IBCC Equivalence Certificate",
        is_required: true,
        instructions: "Upload IBCC equivalence if available or mark as pending.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      })
    );
  }

  if (hasValue(input.programLevel, ["bachelor", "undergraduate"])) {
    items.push(
      baseItem({
        category: "educational",
        document_name: "IELTS Certificate",
        is_required: hasValue(input.targetCountry, ["canada", "australia", "united kingdom", "uk"]),
        instructions: "Upload IELTS or equivalent English test evidence if required.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: true
      })
    );
  }

  if (hasValue(input.programLevel, ["master", "postgraduate", "phd", "doctor"])) {
    items.push(
      baseItem({
        category: "educational",
        document_name: "Bachelor Degree",
        is_required: true,
        instructions: "Upload the bachelor degree certificate.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "educational",
        document_name: "Bachelor Transcript",
        is_required: true,
        instructions: "Upload the complete bachelor transcript.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "educational",
        document_name: "Recommendation Letters",
        is_required: true,
        instructions: "Upload each recommendation letter separately.",
        accepted_formats: ["pdf", "docx"],
        upload_type: "multiple",
        required_parts: [],
        ai_validation_enabled: false,
        expiry_validation_enabled: false
      })
    );
  }

  if (!hasValue(input.sponsorType, ["self", "none"])) {
    items.push(
      baseItem({
        category: "sponsor",
        document_name: "Sponsor CNIC",
        is_required: true,
        instructions: "Upload sponsor CNIC front and back.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "multi_part",
        required_parts: cnicParts,
        ai_validation_enabled: true,
        expiry_validation_enabled: true
      }),
      baseItem({
        category: "sponsor",
        document_name: "Sponsorship Affidavit",
        is_required: true,
        instructions: "Upload the signed sponsorship affidavit.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      })
    );
  }

  if (hasValue(input.sponsorType, ["business", "property", "parent", "family"])) {
    items.push(
      baseItem({
        category: "financial",
        document_name: "Tax Returns",
        is_required: false,
        instructions: "Upload tax returns if they support the financial profile.",
        accepted_formats: ["pdf"],
        upload_type: "multiple",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "financial",
        document_name: "Property Documents",
        is_required: false,
        instructions: "Upload property documents if being used as financial evidence.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "multiple",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      })
    );
  }

  if (hasValue(input.targetCountry, ["canada", "australia", "united states", "usa", "united kingdom", "uk"])) {
    items.push(
      baseItem({
        category: "visa",
        document_name: "Visa Application Form",
        is_required: true,
        instructions: "Upload the completed visa application form.",
        accepted_formats: ["pdf"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: false,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "visa",
        document_name: "Offer Letter",
        is_required: true,
        instructions: "Upload the latest offer letter.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: false
      }),
      baseItem({
        category: "visa",
        document_name: "Previous Visa Copies",
        is_required: false,
        instructions: "Upload previous visas if available.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "multiple",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: true
      })
    );
  }

  if (hasValue(input.targetCountry, ["germany", "australia"])) {
    items.push(
      baseItem({
        category: "visa",
        document_name: "Health Insurance",
        is_required: true,
        instructions: "Upload health insurance evidence if already arranged.",
        accepted_formats: ["pdf", "jpg", "png"],
        upload_type: "single",
        required_parts: [],
        ai_validation_enabled: true,
        expiry_validation_enabled: true
      })
    );
  }

  return items.map((item) => ({
    ...item,
    submission_deadline: input.deadlineDate || null
  }));
}

export const checklistStatuses = checklistStatusSchema.options;
export const acceptedFormats = acceptedFormatSchema.options;
export const uploadTypes = uploadTypeSchema.options;
