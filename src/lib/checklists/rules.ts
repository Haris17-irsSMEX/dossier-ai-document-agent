import { z } from "zod";

import {
  getDocumentTemplate,
  type DocumentTemplate,
  type RequirementLevel
} from "@/lib/checklists/document-templates";
import { getChecklistPhase, type ChecklistPhaseSlug } from "@/lib/checklists/phases";
import type { CaseStage } from "@/lib/checklists/request-logic";

export const acceptedFormatSchema = z.enum(["pdf", "jpg", "png", "docx"]);
export const uploadTypeSchema = z.enum(["single", "multiple", "multi_part"]);
export const requirementLevelSchema = z.enum(["required", "conditional", "optional"]);

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
export type RequiredPart = { part_name: string; is_required: boolean };

export type ChecklistRuleInput = {
  targetCountry?: string | null;
  programLevel?: string | null;
  educationBackground?: string | null;
  sponsorType?: string | null;
  intake?: string | null;
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
  phase_slug: ChecklistPhaseSlug;
  phase_label: string;
  phase_order: number;
  category_slug: string;
  category_label: string;
  category_order: number;
  item_order: number;
  requirement_level: RequirementLevel;
  condition_note: string | null;
  is_custom: boolean;
  visible_to_student: boolean;
  is_archived: boolean;
  is_requested: boolean;
  counts_toward_completion: boolean;
  source_template_key: string;
  applies_from_stage: CaseStage;
};

function normalized(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function hasValue(value: string | null | undefined, candidates: string[]) {
  const source = normalized(value);
  return candidates.some((candidate) => source.includes(candidate));
}

function templateToRule(
  template: DocumentTemplate,
  deadlineDate: string | null | undefined,
  itemOrder: number,
  overrides?: Partial<Pick<DocumentTemplate, "requirement_level" | "condition_note" | "instructions">>
): ChecklistRuleItem {
  const selected = { ...template, ...overrides };
  const phase = getChecklistPhase(selected.phase_slug);
  const uploadType = selected.upload_type === "structured_field" ? "single" : selected.upload_type;
  const isFuturePhase = [
    "university_application",
    "admission_offer_stage",
    "visa_processing",
    "verification_attestation",
    "country_specific_requirements",
    "pre_departure"
  ].includes(phase.slug);
  const effectiveRequirement =
    isFuturePhase && selected.requirement_level !== "optional"
      ? "conditional"
      : selected.requirement_level;
  const defaultRequested =
    selected.default_requested ??
    (effectiveRequirement === "required" &&
      ["profile_academic_file", "financial_sponsor_file"].includes(phase.slug));
  const appliesFromStage: CaseStage =
    selected.applies_from_stage ??
    ({
      profile_academic_file: "profile_collection",
      university_application: "university_application",
      financial_sponsor_file: "profile_collection",
      admission_offer_stage: "offer_received",
      visa_processing: "visa_processing",
      verification_attestation: "verification_attestation",
      country_specific_requirements: "offer_received",
      risk_explanation: "profile_collection",
      optional_profile_boosters: "profile_collection",
      pre_departure: "pre_departure"
    }[phase.slug] as CaseStage);

  return {
    category: selected.category,
    document_name: selected.name,
    is_required: effectiveRequirement === "required",
    instructions: selected.instructions,
    accepted_formats: [...selected.accepted_formats],
    upload_type: uploadType,
    required_parts: selected.parts ? [...selected.parts] : [],
    ai_validation_enabled: selected.ai_validation,
    expiry_validation_enabled: selected.expiry_validation,
    submission_deadline: deadlineDate || null,
    phase_slug: phase.slug,
    phase_label: phase.label,
    phase_order: phase.order,
    category_slug: selected.category,
    category_label: selected.category_label || phase.label,
    category_order: 1,
    item_order: itemOrder,
    requirement_level: effectiveRequirement,
    condition_note: selected.condition_note || null,
    is_custom: false,
    visible_to_student: defaultRequested && selected.visible_to_student,
    is_archived: false,
    is_requested: defaultRequested,
    counts_toward_completion:
      selected.counts_toward_completion ?? defaultRequested,
    source_template_key: selected.key,
    applies_from_stage: appliesFromStage
  };
}

function addTemplate(
  items: ChecklistRuleItem[],
  key: string,
  input: ChecklistRuleInput,
  overrides?: Partial<Pick<DocumentTemplate, "requirement_level" | "condition_note" | "instructions">>
) {
  if (items.some((item) => item.document_name === getDocumentTemplate(key).name)) {
    return;
  }

  items.push(templateToRule(getDocumentTemplate(key), input.deadlineDate, items.length + 1, overrides));
}

export function buildSmartChecklistRules(input: ChecklistRuleInput): ChecklistRuleItem[] {
  const items: ChecklistRuleItem[] = [];
  const country = normalized(input.targetCountry);
  const level = normalized(input.programLevel);
  const education = normalized(input.educationBackground);
  const sponsor = normalized(input.sponsorType);
  const isBachelor = hasValue(level, ["bachelor", "undergraduate"]);
  const isMaster = hasValue(level, ["master", "postgraduate", "mba"]);
  const isPhd = hasValue(level, ["phd", "doctor", "research"]);
  const isEuropean = hasValue(country, ["germany", "italy", "france", "netherlands", "sweden", "finland", "austria", "spain"]);

  ["passport", "cnic", "photo", "cv", "sop"].forEach((key) =>
    addTemplate(items, key, input)
  );

  if (isBachelor) {
    if (hasValue(education, ["o-level", "olevel", "cambridge"])) {
      addTemplate(items, "olevel_records", input);
      addTemplate(items, "oa_equivalence", input);
    } else {
      addTemplate(items, "matric_records", input);
    }

    if (hasValue(education, ["a-level", "alevel", "cambridge"])) {
      addTemplate(items, "alevel_records", input);
      addTemplate(items, "oa_equivalence", input);
    } else {
      addTemplate(items, "intermediate_records", input);
    }

    addTemplate(items, "language_proof", input);
    addTemplate(items, "recommendations", input);
  }

  if (isMaster || isPhd) {
    addTemplate(items, "matric_records", input);
    addTemplate(items, "intermediate_records", input);
    addTemplate(items, "bachelor_degree", input);
    addTemplate(items, "bachelor_transcript", input);
    addTemplate(items, "language_proof", input);
    addTemplate(items, "recommendations", input, {
      requirement_level: "required",
      condition_note: isPhd ? "Provide three academic recommendation letters." : "Provide two recommendation letters."
    });

    if (isEuropean) {
      addTemplate(items, "course_descriptions", input);
    }
  }

  if (isPhd) {
    addTemplate(items, "master_degree", input);
    addTemplate(items, "master_transcript", input);
    addTemplate(items, "research_proposal", input);
    addTemplate(items, "supervisor_acceptance", input);
    addTemplate(items, "thesis_abstract", input);
    addTemplate(items, "publications", input);
  }

  addTemplate(items, "university_application_form", input);
  addTemplate(items, "application_fee_receipt", input);

  if (hasValue(level, ["design", "architecture", "art", "creative"])) {
    addTemplate(items, "portfolio", input);
  }

  if (sponsor) {
    addTemplate(items, "sponsor_id", input);
    addTemplate(items, "sponsor_relationship", input);
    addTemplate(items, "sponsorship_affidavit", input);
    addTemplate(items, "bank_statement", input);
    addTemplate(items, "bank_maintenance", input);
    addTemplate(items, "tax_returns", input);
  }

  if (hasValue(sponsor, ["business", "company", "entrepreneur"])) {
    addTemplate(items, "business_documents", input);
    addTemplate(items, "business_bank_statement", input);
    addTemplate(items, "business_tax_returns", input);
  }

  if (hasValue(sponsor, ["salary", "employment", "employed", "job"])) {
    addTemplate(items, "employment_letter", input);
    addTemplate(items, "salary_slips", input);
    addTemplate(items, "salary_bank_statement", input);
  }

  if (hasValue(sponsor, ["property", "agriculture", "land", "sale"])) {
    addTemplate(items, "property_source", input);
  }

  if (hasValue(sponsor, ["gold", "provident", "gratuity", "fund"])) {
    addTemplate(items, "special_funds", input);
  }

  ["offer_letter", "tuition_receipt", "scholarship_letter"].forEach((key) =>
    addTemplate(items, key, input)
  );

  if (input.intake) {
    addTemplate(items, "deferral_letter", input, {
      condition_note: `Only if arrival or enrollment timing changes for ${input.intake}.`
    });
  }

  addTemplate(items, "ibcc_attestation", input);
  if (isMaster || isPhd) {
    addTemplate(items, "hec_attestation", input);
  }
  addTemplate(items, "mofa_apostille", input);
  addTemplate(items, "certified_translation", input);

  [
    "visa_form",
    "visa_appointments",
    "visa_fee",
    "travel_history",
    "police_certificate",
    "medical_tb",
    "health_insurance",
    "accommodation",
    "visa_sop"
  ].forEach((key) => addTemplate(items, key, input));

  if (hasValue(country, ["united kingdom", "uk"])) {
    ["uk_cas", "uk_ihs", "uk_atas"].forEach((key) => addTemplate(items, key, input));
  } else if (hasValue(country, ["united states", "usa", "us"])) {
    ["us_i20", "us_sevis", "us_ds160"].forEach((key) => addTemplate(items, key, input));
  } else if (hasValue(country, ["canada"])) {
    ["canada_loa", "canada_gic", "canada_attestation"].forEach((key) =>
      addTemplate(items, key, input)
    );
  } else if (hasValue(country, ["australia"])) {
    ["australia_coe", "australia_oshc", "australia_gs"].forEach((key) =>
      addTemplate(items, key, input)
    );
  } else if (hasValue(country, ["italy"])) {
    ["italy_universitaly", "italy_cimea_dov"].forEach((key) =>
      addTemplate(items, key, input)
    );
  } else if (hasValue(country, ["germany"])) {
    ["germany_admission", "germany_blocked_account", "germany_aps"].forEach((key) =>
      addTemplate(items, key, input)
    );
  }

  if (hasValue(education, ["gap"])) {
    addTemplate(items, "gap_explanation", input);
  }
  if (hasValue(education, ["refusal", "refused"])) {
    addTemplate(items, "refusal_explanation", input);
  }
  if (hasValue(education, ["low marks", "backlog"])) {
    addTemplate(items, "academic_risk_explanation", input);
  }

  ["awards", "activities", "courses_certifications"].forEach((key) =>
    addTemplate(items, key, input)
  );

  return items.map((item, index) => ({ ...item, item_order: index + 1 }));
}

export const checklistStatuses = checklistStatusSchema.options;
export const acceptedFormats = acceptedFormatSchema.options;
export const uploadTypes = uploadTypeSchema.options;
export const requirementLevels = requirementLevelSchema.options;
