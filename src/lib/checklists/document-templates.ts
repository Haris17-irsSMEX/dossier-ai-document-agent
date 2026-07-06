import type { AcceptedFormat, RequiredPart, UploadType } from "@/lib/checklists/rules";
import type { ChecklistPhaseSlug } from "@/lib/checklists/phases";
import type { CaseStage } from "@/lib/checklists/request-logic";

export type RequirementLevel = "required" | "conditional" | "optional";
export type TemplateUploadType = UploadType | "structured_field";

export type DocumentTemplate = {
  key: string;
  name: string;
  phase_slug: ChecklistPhaseSlug;
  category: "personal" | "educational" | "visa" | "financial" | "sponsor" | "custom";
  category_label?: string;
  requirement_level: RequirementLevel;
  condition_note?: string;
  default_requested?: boolean;
  counts_toward_completion?: boolean;
  applies_from_stage?: CaseStage;
  upload_type: TemplateUploadType;
  accepted_formats: AcceptedFormat[];
  ai_validation: boolean;
  expiry_validation: boolean;
  visible_to_student: boolean;
  instructions: string;
  parts?: RequiredPart[];
  country_tags?: string[];
  level_tags?: string[];
  sponsor_tags?: string[];
  education_tags?: string[];
};

const frontBack: RequiredPart[] = [
  { part_name: "Front Side", is_required: true },
  { part_name: "Back Side", is_required: true }
];

const passportParts: RequiredPart[] = [
  { part_name: "Bio Data Page", is_required: true },
  { part_name: "Additional Visa Pages", is_required: false }
];

function template(
  input: Omit<
    DocumentTemplate,
    "accepted_formats" | "ai_validation" | "expiry_validation" | "visible_to_student"
  > &
    Partial<
      Pick<
        DocumentTemplate,
        "accepted_formats" | "ai_validation" | "expiry_validation" | "visible_to_student"
      >
    >
): DocumentTemplate {
  return {
    accepted_formats: ["pdf", "jpg", "png"],
    ai_validation: true,
    expiry_validation: false,
    visible_to_student: true,
    ...input
  };
}

export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[] = [
  template({
    key: "passport",
    name: "Current Valid Passport",
    phase_slug: "profile_academic_file",
    category: "personal",
    category_label: "Identity",
    requirement_level: "required",
    upload_type: "multi_part",
    expiry_validation: true,
    instructions: "Upload a clear passport bio data page. Additional visa pages are optional.",
    parts: passportParts
  }),
  template({
    key: "cnic",
    name: "CNIC / National ID",
    phase_slug: "profile_academic_file",
    category: "personal",
    category_label: "Identity",
    requirement_level: "required",
    upload_type: "multi_part",
    expiry_validation: true,
    instructions: "Upload clear front and back images of the current identity card.",
    parts: frontBack
  }),
  template({
    key: "photo",
    name: "Passport-Size Photograph",
    phase_slug: "profile_academic_file",
    category: "personal",
    category_label: "Identity",
    requirement_level: "required",
    upload_type: "single",
    accepted_formats: ["jpg", "png"],
    instructions: "Upload a recent, clear photograph with a plain background."
  }),
  template({
    key: "cv",
    name: "CV / Resume",
    phase_slug: "profile_academic_file",
    category: "custom",
    category_label: "Application Profile",
    requirement_level: "required",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    instructions: "Upload the latest academic and professional CV."
  }),
  template({
    key: "sop",
    name: "SOP / Personal Statement",
    phase_slug: "profile_academic_file",
    category: "custom",
    category_label: "Application Profile",
    requirement_level: "required",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    instructions: "Upload the latest statement of purpose or personal statement."
  }),
  template({
    key: "matric_records",
    name: "Matric / Secondary Certificate and Transcript",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "multiple",
    instructions: "Upload the certificate and complete result card or transcript."
  }),
  template({
    key: "intermediate_records",
    name: "Intermediate / Higher Secondary Certificate and Transcript",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "multiple",
    instructions: "Upload the certificate and complete result card or transcript."
  }),
  template({
    key: "olevel_records",
    name: "O-Level Certificates and Statement of Results",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "multiple",
    education_tags: ["o-level", "olevel", "cambridge"],
    instructions: "Upload all O-Level certificates and statements of results."
  }),
  template({
    key: "alevel_records",
    name: "A-Level Certificates and Statement of Results",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "multiple",
    education_tags: ["a-level", "alevel", "cambridge"],
    instructions: "Upload all A-Level certificates and statements of results."
  }),
  template({
    key: "oa_equivalence",
    name: "O/A-Level Equivalence Certificate",
    phase_slug: "verification_attestation",
    category: "educational",
    category_label: "Equivalence",
    requirement_level: "conditional",
    condition_note: "Needed when Cambridge qualifications require local equivalence.",
    upload_type: "single",
    instructions: "Upload the IBCC equivalence certificate if it applies to this case."
  }),
  template({
    key: "bachelor_degree",
    name: "Bachelor Degree Certificate",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "single",
    instructions: "Upload the final bachelor degree certificate."
  }),
  template({
    key: "bachelor_transcript",
    name: "Bachelor Transcript",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "single",
    instructions: "Upload the complete bachelor transcript with all semesters."
  }),
  template({
    key: "master_degree",
    name: "Master Degree Certificate",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "single",
    instructions: "Upload the final master degree certificate."
  }),
  template({
    key: "master_transcript",
    name: "Master Transcript",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Academic Records",
    requirement_level: "required",
    upload_type: "single",
    instructions: "Upload the complete master transcript."
  }),
  template({
    key: "language_proof",
    name: "English Language Proof",
    phase_slug: "profile_academic_file",
    category: "educational",
    category_label: "Language",
    requirement_level: "conditional",
    condition_note: "Provide only when the institution requires English evidence.",
    upload_type: "single",
    expiry_validation: true,
    instructions: "Upload IELTS, TOEFL, PTE, Duolingo, MOI, or any English proof accepted by the institution."
  }),
  template({
    key: "recommendations",
    name: "Recommendation Letters",
    phase_slug: "university_application",
    category: "educational",
    category_label: "Application Evidence",
    requirement_level: "conditional",
    condition_note: "Required by some universities and programs.",
    upload_type: "multiple",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    instructions: "Upload each signed recommendation letter as a separate file."
  }),
  template({
    key: "course_descriptions",
    name: "Course Descriptions / Syllabus",
    phase_slug: "university_application",
    category: "educational",
    category_label: "Application Evidence",
    requirement_level: "conditional",
    condition_note: "Often requested for European credit or subject matching.",
    upload_type: "multiple",
    instructions: "Upload official course descriptions or syllabus documents when requested."
  }),
  template({
    key: "research_proposal",
    name: "Research Proposal",
    phase_slug: "university_application",
    category: "educational",
    category_label: "Research",
    requirement_level: "required",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    level_tags: ["phd", "doctor", "research"],
    instructions: "Upload the current research proposal tailored to the program."
  }),
  template({
    key: "supervisor_acceptance",
    name: "Supervisor Acceptance Letter",
    phase_slug: "university_application",
    category: "educational",
    category_label: "Research",
    requirement_level: "conditional",
    condition_note: "Needed where prior supervisor consent is part of admission.",
    upload_type: "single",
    level_tags: ["phd", "doctor", "research"],
    instructions: "Upload the supervisor acceptance or correspondence requested by the institution."
  }),
  template({
    key: "publications",
    name: "Research Publications",
    phase_slug: "optional_profile_boosters",
    category: "custom",
    category_label: "Research",
    requirement_level: "optional",
    upload_type: "multiple",
    level_tags: ["phd", "doctor", "research"],
    instructions: "Upload published papers or accepted manuscripts that strengthen the profile."
  }),
  template({
    key: "thesis_abstract",
    name: "Thesis Abstract",
    phase_slug: "university_application",
    category: "educational",
    category_label: "Research",
    requirement_level: "conditional",
    condition_note: "Provide when the program asks for prior research details.",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    instructions: "Upload a concise abstract of the previous thesis or research project."
  }),
  template({
    key: "university_application_form",
    name: "University Application Form",
    phase_slug: "university_application",
    category: "custom",
    category_label: "Application",
    requirement_level: "conditional",
    condition_note: "Add once the target university form is available.",
    upload_type: "single",
    accepted_formats: ["pdf"],
    ai_validation: false,
    instructions: "Upload the completed university application form."
  }),
  template({
    key: "application_fee_receipt",
    name: "Application Fee Receipt",
    phase_slug: "university_application",
    category: "financial",
    category_label: "Application",
    requirement_level: "conditional",
    condition_note: "Needed only when an application fee is paid.",
    upload_type: "single",
    instructions: "Upload the university application fee payment receipt."
  }),
  template({
    key: "portfolio",
    name: "Portfolio",
    phase_slug: "university_application",
    category: "custom",
    category_label: "Application Evidence",
    requirement_level: "conditional",
    condition_note: "For design, architecture, arts, and other portfolio-based programs.",
    upload_type: "multiple",
    accepted_formats: ["pdf", "jpg", "png"],
    ai_validation: false,
    instructions: "Upload the portfolio or selected work requested by the program."
  }),
  template({
    key: "sponsor_id",
    name: "Sponsor CNIC / Passport",
    phase_slug: "financial_sponsor_file",
    category: "sponsor",
    category_label: "Sponsor Identity",
    requirement_level: "required",
    upload_type: "multi_part",
    expiry_validation: true,
    instructions: "Upload clear sponsor identity document images.",
    parts: frontBack
  }),
  template({
    key: "sponsor_relationship",
    name: "Relationship Proof with Sponsor",
    phase_slug: "financial_sponsor_file",
    category: "sponsor",
    category_label: "Sponsor Identity",
    requirement_level: "required",
    upload_type: "single",
    instructions: "Upload a family registration, birth certificate, or other relationship proof."
  }),
  template({
    key: "sponsorship_affidavit",
    name: "Sponsorship Affidavit",
    phase_slug: "financial_sponsor_file",
    category: "sponsor",
    category_label: "Sponsor Commitment",
    requirement_level: "required",
    upload_type: "single",
    instructions: "Upload the signed sponsorship affidavit or declaration."
  }),
  template({
    key: "bank_statement",
    name: "Bank Statements",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Funds",
    requirement_level: "required",
    upload_type: "multiple",
    accepted_formats: ["pdf"],
    expiry_validation: true,
    instructions: "Upload recent statements showing the required financial history."
  }),
  template({
    key: "bank_maintenance",
    name: "Bank Maintenance Certificate",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Funds",
    requirement_level: "required",
    upload_type: "single",
    expiry_validation: true,
    instructions: "Upload the latest bank-issued account maintenance certificate."
  }),
  template({
    key: "business_documents",
    name: "Business Registration / NTN / Company Documents",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Income Source",
    requirement_level: "required",
    upload_type: "multiple",
    sponsor_tags: ["business", "company", "entrepreneur"],
    instructions: "Upload business registration, NTN, partnership, or company ownership evidence."
  }),
  template({
    key: "business_bank_statement",
    name: "Business Bank Statements",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Income Source",
    requirement_level: "conditional",
    upload_type: "multiple",
    accepted_formats: ["pdf"],
    sponsor_tags: ["business", "company", "entrepreneur"],
    instructions: "Upload recent business account statements."
  }),
  template({
    key: "business_tax_returns",
    name: "Business Tax Returns",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Income Source",
    requirement_level: "conditional",
    upload_type: "multiple",
    accepted_formats: ["pdf"],
    sponsor_tags: ["business", "company", "entrepreneur"],
    instructions: "Upload the available business tax returns."
  }),
  template({
    key: "employment_letter",
    name: "Employment Letter",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Income Source",
    requirement_level: "required",
    upload_type: "single",
    sponsor_tags: ["salary", "employment", "employed", "job"],
    instructions: "Upload the current employment confirmation letter."
  }),
  template({
    key: "salary_slips",
    name: "Salary Slips",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Income Source",
    requirement_level: "conditional",
    upload_type: "multiple",
    sponsor_tags: ["salary", "employment", "employed", "job"],
    instructions: "Upload recent salary slips as separate files."
  }),
  template({
    key: "salary_bank_statement",
    name: "Salary Bank Statement",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Income Source",
    requirement_level: "conditional",
    upload_type: "multiple",
    accepted_formats: ["pdf"],
    sponsor_tags: ["salary", "employment", "employed", "job"],
    instructions: "Upload statements showing regular salary credits."
  }),
  template({
    key: "tax_returns",
    name: "Tax Returns",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Income Source",
    requirement_level: "conditional",
    condition_note: "Provide when available or required to support declared income.",
    upload_type: "multiple",
    accepted_formats: ["pdf"],
    instructions: "Upload recent personal or sponsor tax returns."
  }),
  template({
    key: "property_source",
    name: "Property / Agriculture Source-of-Funds Evidence",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Source of Funds",
    requirement_level: "conditional",
    condition_note: "Use only when property, land, agriculture, or sale proceeds fund the case.",
    upload_type: "multiple",
    sponsor_tags: ["property", "agriculture", "land", "sale"],
    instructions: "Upload ownership, sale deed, valuation, or income evidence relevant to the funds."
  }),
  template({
    key: "special_funds",
    name: "Special Source-of-Funds Evidence",
    phase_slug: "financial_sponsor_file",
    category: "financial",
    category_label: "Source of Funds",
    requirement_level: "conditional",
    condition_note: "For gold sale, provident fund, gratuity, or another significant source.",
    upload_type: "multiple",
    sponsor_tags: ["gold", "provident", "gratuity", "fund"],
    instructions: "Upload official valuation, sale, provident fund, or gratuity evidence."
  }),
  template({
    key: "offer_letter",
    name: "Offer Letter / Admission Letter",
    phase_slug: "admission_offer_stage",
    category: "custom",
    category_label: "Admission",
    requirement_level: "conditional",
    condition_note: "Add when an institution issues an offer or admission decision.",
    upload_type: "single",
    instructions: "Upload the latest complete offer or admission letter."
  }),
  template({
    key: "tuition_receipt",
    name: "Tuition Fee Deposit Receipt",
    phase_slug: "admission_offer_stage",
    category: "financial",
    category_label: "Admission",
    requirement_level: "conditional",
    condition_note: "Needed after a tuition or enrollment deposit is paid.",
    upload_type: "single",
    instructions: "Upload the university-issued tuition payment receipt."
  }),
  template({
    key: "scholarship_letter",
    name: "Scholarship Award Letter",
    phase_slug: "admission_offer_stage",
    category: "custom",
    category_label: "Funding",
    requirement_level: "conditional",
    condition_note: "Only when scholarship or funded admission applies.",
    upload_type: "single",
    instructions: "Upload the official scholarship or funding award letter."
  }),
  template({
    key: "deferral_letter",
    name: "Admission Deferral / Late Arrival Letter",
    phase_slug: "admission_offer_stage",
    category: "custom",
    category_label: "Admission",
    requirement_level: "conditional",
    condition_note: "Only when intake, arrival, or enrollment timing changes.",
    upload_type: "single",
    instructions: "Upload the institution-approved deferral or late-arrival confirmation."
  }),
  template({
    key: "ibcc_attestation",
    name: "IBCC Attestation",
    phase_slug: "verification_attestation",
    category: "educational",
    category_label: "Attestation",
    requirement_level: "conditional",
    condition_note: "Use where Matric or Intermediate records require IBCC attestation.",
    upload_type: "multiple",
    instructions: "Upload the attested certificates or official IBCC evidence."
  }),
  template({
    key: "hec_attestation",
    name: "HEC Attestation",
    phase_slug: "verification_attestation",
    category: "educational",
    category_label: "Attestation",
    requirement_level: "conditional",
    condition_note: "Use where higher education records require HEC attestation.",
    upload_type: "multiple",
    instructions: "Upload the attested degree and transcript or HEC evidence."
  }),
  template({
    key: "mofa_apostille",
    name: "MOFA Attestation / Apostille",
    phase_slug: "verification_attestation",
    category: "educational",
    category_label: "Attestation",
    requirement_level: "conditional",
    condition_note: "Country and institution requirements vary.",
    upload_type: "multiple",
    instructions: "Upload MOFA attestation or apostille evidence when requested."
  }),
  template({
    key: "certified_translation",
    name: "Certified Translation",
    phase_slug: "verification_attestation",
    category: "educational",
    category_label: "Translation",
    requirement_level: "conditional",
    condition_note: "Needed when documents are not in an accepted language.",
    upload_type: "multiple",
    instructions: "Upload the certified translation together with its source document."
  }),
  template({
    key: "visa_form",
    name: "Visa Application Form",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Visa Submission",
    requirement_level: "conditional",
    condition_note: "Complete when the visa stage begins.",
    upload_type: "single",
    accepted_formats: ["pdf"],
    ai_validation: false,
    instructions: "Upload the completed visa application form."
  }),
  template({
    key: "visa_appointments",
    name: "Visa / Biometric Appointment Confirmation",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Appointments",
    requirement_level: "conditional",
    condition_note: "Needed once an appointment is booked.",
    upload_type: "multiple",
    instructions: "Upload visa and biometric appointment confirmations."
  }),
  template({
    key: "visa_fee",
    name: "Visa Fee Receipt",
    phase_slug: "visa_processing",
    category: "financial",
    category_label: "Visa Submission",
    requirement_level: "conditional",
    condition_note: "Needed after the visa fee is paid.",
    upload_type: "single",
    instructions: "Upload the official visa fee payment receipt."
  }),
  template({
    key: "travel_history",
    name: "Travel History / Previous Visa Pages",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Travel History",
    requirement_level: "conditional",
    condition_note: "Provide when previous travel or visa history exists.",
    upload_type: "multiple",
    expiry_validation: true,
    instructions: "Upload relevant entry stamps, visas, and travel history pages."
  }),
  template({
    key: "police_certificate",
    name: "Police Character Certificate",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Clearance",
    requirement_level: "conditional",
    condition_note: "Country and applicant-history requirements vary.",
    upload_type: "single",
    expiry_validation: true,
    instructions: "Upload the current police character or clearance certificate."
  }),
  template({
    key: "medical_tb",
    name: "Medical / TB Certificate",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Health",
    requirement_level: "conditional",
    condition_note: "Only when requested for the selected destination or visa route.",
    upload_type: "single",
    expiry_validation: true,
    instructions: "Upload the approved medical or TB screening certificate."
  }),
  template({
    key: "health_insurance",
    name: "Health Insurance",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Health",
    requirement_level: "conditional",
    condition_note: "Coverage rules depend on the destination and visa route.",
    upload_type: "single",
    expiry_validation: true,
    instructions: "Upload insurance evidence showing the relevant coverage period."
  }),
  template({
    key: "accommodation",
    name: "Accommodation Proof",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Travel Plan",
    requirement_level: "conditional",
    condition_note: "Provide when accommodation evidence is requested.",
    upload_type: "single",
    instructions: "Upload the booking, tenancy, or host accommodation confirmation."
  }),
  template({
    key: "visa_sop",
    name: "Visa SOP / Study Plan",
    phase_slug: "visa_processing",
    category: "visa",
    category_label: "Visa Submission",
    requirement_level: "conditional",
    condition_note: "Needed for visa routes that request a study plan or explanation.",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    instructions: "Upload the final visa statement, study plan, or motivation letter."
  }),
  template({
    key: "uk_cas",
    name: "CAS Letter / Number",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "United Kingdom",
    requirement_level: "required",
    upload_type: "structured_field",
    country_tags: ["united kingdom", "uk"],
    instructions: "Upload the CAS statement or confirmation containing the CAS number. Direct number entry is planned for a later release."
  }),
  template({
    key: "uk_ihs",
    name: "IHS Payment Receipt",
    phase_slug: "country_specific_requirements",
    category: "financial",
    category_label: "United Kingdom",
    requirement_level: "conditional",
    condition_note: "Needed after the immigration health surcharge is paid.",
    upload_type: "single",
    country_tags: ["united kingdom", "uk"],
    instructions: "Upload the IHS payment confirmation."
  }),
  template({
    key: "uk_atas",
    name: "ATAS Certificate",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "United Kingdom",
    requirement_level: "conditional",
    condition_note: "Only for programs and nationalities subject to ATAS.",
    upload_type: "single",
    country_tags: ["united kingdom", "uk"],
    instructions: "Upload the valid ATAS certificate when the offer requires it."
  }),
  template({
    key: "us_i20",
    name: "I-20",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "United States",
    requirement_level: "required",
    upload_type: "single",
    country_tags: ["united states", "usa", "us"],
    instructions: "Upload the signed Form I-20 issued by the institution."
  }),
  template({
    key: "us_sevis",
    name: "SEVIS Fee Receipt",
    phase_slug: "country_specific_requirements",
    category: "financial",
    category_label: "United States",
    requirement_level: "required",
    upload_type: "single",
    country_tags: ["united states", "usa", "us"],
    instructions: "Upload the I-901 SEVIS fee payment receipt."
  }),
  template({
    key: "us_ds160",
    name: "DS-160 Confirmation",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "United States",
    requirement_level: "required",
    upload_type: "single",
    country_tags: ["united states", "usa", "us"],
    instructions: "Upload the DS-160 confirmation page with barcode."
  }),
  template({
    key: "canada_loa",
    name: "Letter of Acceptance",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Canada",
    requirement_level: "required",
    upload_type: "single",
    country_tags: ["canada"],
    instructions: "Upload the current letter of acceptance from the institution."
  }),
  template({
    key: "canada_gic",
    name: "GIC Certificate",
    phase_slug: "country_specific_requirements",
    category: "financial",
    category_label: "Canada",
    requirement_level: "conditional",
    condition_note: "Only when a Guaranteed Investment Certificate is used.",
    upload_type: "single",
    country_tags: ["canada"],
    instructions: "Upload the GIC investment or account certificate."
  }),
  template({
    key: "canada_attestation",
    name: "Provincial / Territorial Attestation Letter",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Canada",
    requirement_level: "conditional",
    condition_note: "Applicability depends on the current study permit route.",
    upload_type: "single",
    country_tags: ["canada"],
    instructions: "Upload the applicable provincial or territorial attestation letter."
  }),
  template({
    key: "australia_coe",
    name: "Confirmation of Enrolment (CoE)",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Australia",
    requirement_level: "required",
    upload_type: "single",
    country_tags: ["australia"],
    instructions: "Upload the current Confirmation of Enrolment."
  }),
  template({
    key: "australia_oshc",
    name: "OSHC Proof",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Australia",
    requirement_level: "required",
    upload_type: "single",
    expiry_validation: true,
    country_tags: ["australia"],
    instructions: "Upload Overseas Student Health Cover evidence."
  }),
  template({
    key: "australia_gs",
    name: "Genuine Student Statement",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Australia",
    requirement_level: "required",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    country_tags: ["australia"],
    instructions: "Upload the final Genuine Student statement."
  }),
  template({
    key: "italy_universitaly",
    name: "Universitaly Pre-Enrolment Summary",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Italy",
    requirement_level: "required",
    upload_type: "structured_field",
    country_tags: ["italy"],
    instructions: "Upload the Universitaly pre-enrolment summary containing the reference. Direct reference entry is planned for a later release."
  }),
  template({
    key: "italy_cimea_dov",
    name: "CIMEA / Declaration of Value",
    phase_slug: "country_specific_requirements",
    category: "educational",
    category_label: "Italy",
    requirement_level: "conditional",
    condition_note: "Use the credential route requested by the institution or consulate.",
    upload_type: "multiple",
    country_tags: ["italy"],
    instructions: "Upload CIMEA statements or the Declaration of Value when requested."
  }),
  template({
    key: "germany_admission",
    name: "German University Admission Letter",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Germany",
    requirement_level: "required",
    upload_type: "single",
    country_tags: ["germany"],
    instructions: "Upload the current admission or conditional admission letter."
  }),
  template({
    key: "germany_blocked_account",
    name: "Blocked Account / Financial Proof",
    phase_slug: "country_specific_requirements",
    category: "financial",
    category_label: "Germany",
    requirement_level: "required",
    upload_type: "single",
    country_tags: ["germany"],
    instructions: "Upload blocked-account confirmation or the accepted financial alternative."
  }),
  template({
    key: "germany_aps",
    name: "APS / Credential Verification",
    phase_slug: "country_specific_requirements",
    category: "educational",
    category_label: "Germany",
    requirement_level: "conditional",
    condition_note: "Applicability depends on education jurisdiction and current requirements.",
    upload_type: "single",
    country_tags: ["germany"],
    instructions: "Upload APS or other credential verification evidence when applicable."
  }),
  template({
    key: "gap_explanation",
    name: "Gap Explanation Letter",
    phase_slug: "risk_explanation",
    category: "custom",
    category_label: "Profile Explanation",
    requirement_level: "conditional",
    condition_note: "Added because the education or employment history mentions a gap.",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    education_tags: ["gap"],
    instructions: "Upload a concise timeline and supporting explanation for the study or work gap."
  }),
  template({
    key: "refusal_explanation",
    name: "Previous Visa Refusal Explanation",
    phase_slug: "risk_explanation",
    category: "visa",
    category_label: "Visa History",
    requirement_level: "conditional",
    condition_note: "Only when a previous visa refusal exists.",
    upload_type: "multiple",
    education_tags: ["refusal", "refused"],
    instructions: "Upload the refusal letter and a clear factual explanation."
  }),
  template({
    key: "academic_risk_explanation",
    name: "Low Marks / Backlog Explanation",
    phase_slug: "risk_explanation",
    category: "educational",
    category_label: "Academic Explanation",
    requirement_level: "conditional",
    condition_note: "Only when academic history includes low marks or backlogs.",
    upload_type: "single",
    accepted_formats: ["pdf", "docx"],
    ai_validation: false,
    education_tags: ["low marks", "backlog"],
    instructions: "Upload a factual explanation with any relevant supporting evidence."
  }),
  template({
    key: "awards",
    name: "Academic Awards and Competition Certificates",
    phase_slug: "optional_profile_boosters",
    category: "custom",
    category_label: "Achievements",
    requirement_level: "optional",
    upload_type: "multiple",
    instructions: "Upload strong awards, merit scholarships, competitions, or project certificates."
  }),
  template({
    key: "activities",
    name: "Leadership, Sports, Arts, and Volunteering Proof",
    phase_slug: "optional_profile_boosters",
    category: "custom",
    category_label: "Activities",
    requirement_level: "optional",
    upload_type: "multiple",
    instructions: "Upload selected evidence that strengthens the student profile."
  }),
  template({
    key: "courses_certifications",
    name: "Courses and Professional Certifications",
    phase_slug: "optional_profile_boosters",
    category: "custom",
    category_label: "Skills",
    requirement_level: "optional",
    upload_type: "multiple",
    instructions: "Upload relevant online courses, professional certifications, or language certificates."
  }),
  template({
    key: "reference_sevis_id",
    name: "SEVIS ID Confirmation",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "United States",
    requirement_level: "conditional",
    condition_note: "Reference-field template for future structured entry.",
    upload_type: "structured_field",
    country_tags: ["united states", "usa", "us"],
    instructions: "Upload a confirmation showing the SEVIS ID. Direct identifier entry is planned for a later release."
  }),
  template({
    key: "reference_coe_code",
    name: "CoE Code Confirmation",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Australia",
    requirement_level: "conditional",
    condition_note: "Reference-field template for future structured entry.",
    upload_type: "structured_field",
    country_tags: ["australia"],
    instructions: "Upload a confirmation showing the CoE code. Direct code entry is planned for a later release."
  }),
  template({
    key: "reference_dli_number",
    name: "DLI Number Confirmation",
    phase_slug: "country_specific_requirements",
    category: "visa",
    category_label: "Canada",
    requirement_level: "conditional",
    condition_note: "Reference-field template for future structured entry.",
    upload_type: "structured_field",
    country_tags: ["canada"],
    instructions: "Upload the institution confirmation showing the DLI number. Direct number entry is planned for a later release."
  }),
  template({
    key: "reference_gic_code",
    name: "GIC Certificate Code Confirmation",
    phase_slug: "country_specific_requirements",
    category: "financial",
    category_label: "Canada",
    requirement_level: "conditional",
    condition_note: "Reference-field template for future structured entry.",
    upload_type: "structured_field",
    country_tags: ["canada"],
    instructions: "Upload the certificate showing the GIC reference. Direct code entry is planned for a later release."
  })
];

const templateByKey = new Map(DOCUMENT_TEMPLATES.map((item) => [item.key, item]));

export function getDocumentTemplate(key: string) {
  const result = templateByKey.get(key);

  if (!result) {
    throw new Error(`Unknown document template: ${key}`);
  }

  return result;
}
