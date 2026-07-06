begin;

alter table public.checklist_items
  add column if not exists is_requested boolean not null default true,
  add column if not exists requested_at timestamptz,
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists source_template_key text,
  add column if not exists applies_from_stage text,
  add column if not exists counts_toward_completion boolean not null default true;

alter table public.students
  add column if not exists case_stage text not null default 'profile_collection';

update public.students
set case_stage = case
  when stage in (
    'profile_collection',
    'university_application',
    'offer_received',
    'visa_processing',
    'verification_attestation',
    'pre_departure',
    'completed'
  ) then stage
  else 'profile_collection'
end
where case_stage is null
   or case_stage = ''
   or (
     case_stage = 'profile_collection'
     and stage in (
       'university_application',
       'offer_received',
       'visa_processing',
       'verification_attestation',
       'pre_departure',
       'completed'
     )
   );

update public.checklist_items
set
  source_template_key = case
    when document_name ~* '^(current valid )?passport$' then 'passport'
    when document_name ~* '^(cnic|cnic / national id|national id)' then 'cnic'
    when document_name ~* 'passport.?size photograph' then 'photo'
    when document_name ~* '^(cv|cv / resume)$' then 'cv'
    when document_name ~* '^(sop|sop / personal statement)$' then 'sop'
    when document_name ~* '(ielts|english language proficiency|english language proof)' then 'language_proof'
    when document_name ~* 'medium of instruction' then 'language_proof'
    when document_name ~* 'matric|secondary certificate' then 'matric_records'
    when document_name ~* 'intermediate|higher secondary' then 'intermediate_records'
    when document_name ~* 'o-level' then 'olevel_records'
    when document_name ~* 'a-level' then 'alevel_records'
    when document_name ~* 'bachelor degree' then 'bachelor_degree'
    when document_name ~* 'bachelor transcript' then 'bachelor_transcript'
    when document_name ~* 'recommendation letter' then 'recommendations'
    when document_name ~* 'sponsor.*(cnic|passport)' then 'sponsor_id'
    when document_name ~* 'relationship proof' then 'sponsor_relationship'
    when document_name ~* 'sponsorship affidavit' then 'sponsorship_affidavit'
    when document_name ~* '^bank statements?$' then 'bank_statement'
    when document_name ~* 'bank maintenance' then 'bank_maintenance'
    when document_name ~* 'business registration|company documents|ntn' then 'business_documents'
    when document_name ~* 'business bank' then 'business_bank_statement'
    when document_name ~* 'business tax' then 'business_tax_returns'
    when document_name ~* 'employment letter' then 'employment_letter'
    when document_name ~* 'salary slips' then 'salary_slips'
    when document_name ~* 'salary bank' then 'salary_bank_statement'
    when document_name ~* '^tax returns?$' then 'tax_returns'
    when document_name ~* 'property|agriculture' then 'property_source'
    when document_name ~* 'gold|provident|gratuity' then 'special_funds'
    when document_name ~* 'offer letter|admission letter' then 'offer_letter'
    when document_name ~* 'tuition.*receipt' then 'tuition_receipt'
    when document_name ~* 'scholarship.*letter' then 'scholarship_letter'
    when document_name ~* 'deferral|late arrival' then 'deferral_letter'
    when document_name ~* 'ibcc' then 'ibcc_attestation'
    when document_name ~* 'hec' then 'hec_attestation'
    when document_name ~* 'mofa|apostille' then 'mofa_apostille'
    when document_name ~* 'certified translation' then 'certified_translation'
    when document_name ~* 'visa application form' then 'visa_form'
    when document_name ~* 'visa.*appointment|biometric.*appointment' then 'visa_appointments'
    when document_name ~* 'visa fee' then 'visa_fee'
    when document_name ~* 'travel history|previous visa' then 'travel_history'
    when document_name ~* 'police character' then 'police_certificate'
    when document_name ~* 'medical|tb certificate' then 'medical_tb'
    when document_name ~* 'health insurance' then 'health_insurance'
    when document_name ~* 'accommodation' then 'accommodation'
    when document_name ~* 'visa sop|study plan' then 'visa_sop'
    else source_template_key
  end
where source_template_key is null;

update public.checklist_items
set applies_from_stage = case phase_slug
  when 'profile_academic_file' then 'profile_collection'
  when 'university_application' then 'university_application'
  when 'financial_sponsor_file' then 'profile_collection'
  when 'admission_offer_stage' then 'offer_received'
  when 'visa_processing' then 'visa_processing'
  when 'verification_attestation' then 'verification_attestation'
  when 'country_specific_requirements' then 'offer_received'
  when 'risk_explanation' then 'profile_collection'
  when 'optional_profile_boosters' then 'profile_collection'
  when 'pre_departure' then 'pre_departure'
  else 'profile_collection'
end
where applies_from_stage is null;

update public.checklist_items
set
  requirement_level = 'conditional',
  is_required = false
where phase_slug in (
    'university_application',
    'admission_offer_stage',
    'visa_processing',
    'verification_attestation',
    'country_specific_requirements',
    'pre_departure'
  )
  and requirement_level <> 'optional';

update public.checklist_items
set
  requirement_level = 'conditional',
  is_required = false
where source_template_key in (
  'business_bank_statement',
  'business_tax_returns',
  'salary_slips',
  'salary_bank_statement',
  'tax_returns',
  'property_source',
  'special_funds'
);

update public.checklist_items
set
  document_name = 'English Language Proof',
  requirement_level = 'conditional',
  is_required = false,
  condition_note = coalesce(
    condition_note,
    'Provide only when the institution requires English evidence.'
  ),
  instructions = 'Upload IELTS, TOEFL, PTE, Duolingo, MOI, or any English proof accepted by the institution.'
where source_template_key = 'language_proof';

update public.checklist_items as checklist_item
set
  is_requested = case
    when checklist_item.requirement_level = 'optional' then false
    when exists (
      select 1
      from public.documents as document
      where document.checklist_item_id = checklist_item.id
    ) then true
    when checklist_item.requirement_level = 'required'
      and checklist_item.phase_slug in ('profile_academic_file', 'financial_sponsor_file')
      then true
    else false
  end,
  counts_toward_completion = case
    when checklist_item.requirement_level = 'optional' then false
    when exists (
      select 1
      from public.documents as document
      where document.checklist_item_id = checklist_item.id
    ) then true
    when checklist_item.requirement_level = 'required'
      and checklist_item.phase_slug in ('profile_academic_file', 'financial_sponsor_file')
      then true
    else false
  end,
  visible_to_student = case
    when checklist_item.requirement_level = 'optional' then false
    when exists (
      select 1
      from public.documents as document
      where document.checklist_item_id = checklist_item.id
    ) then true
    when checklist_item.requirement_level = 'required'
      and checklist_item.phase_slug in ('profile_academic_file', 'financial_sponsor_file')
      then true
    else false
  end,
  requested_at = case
    when checklist_item.requirement_level = 'required'
      and checklist_item.phase_slug in ('profile_academic_file', 'financial_sponsor_file')
      then coalesce(checklist_item.requested_at, checklist_item.created_at)
    else checklist_item.requested_at
  end,
  requested_by = case
    when checklist_item.requirement_level = 'required'
      and checklist_item.phase_slug in ('profile_academic_file', 'financial_sponsor_file')
      then coalesce(checklist_item.requested_by, checklist_item.created_by)
    else checklist_item.requested_by
  end;

with generated_duplicates as (
  select
    checklist_item.id,
    exists (
      select 1
      from public.documents as document
      where document.checklist_item_id = checklist_item.id
    ) as has_upload,
    row_number() over (
      partition by checklist_item.student_id, checklist_item.source_template_key
      order by
        exists (
          select 1
          from public.documents as document
          where document.checklist_item_id = checklist_item.id
        ) desc,
        checklist_item.created_at,
        checklist_item.id
    ) as duplicate_rank
  from public.checklist_items as checklist_item
  where checklist_item.source_template_key is not null
    and checklist_item.is_custom = false
    and checklist_item.is_archived = false
)
update public.checklist_items as checklist_item
set
  is_archived = case
    when generated_duplicates.has_upload = false then true
    else checklist_item.is_archived
  end,
  archived_at = case
    when generated_duplicates.has_upload = false then coalesce(checklist_item.archived_at, now())
    else checklist_item.archived_at
  end,
  is_requested = false,
  counts_toward_completion = false,
  visible_to_student = false
from generated_duplicates
where checklist_item.id = generated_duplicates.id
  and generated_duplicates.duplicate_rank > 1;

create index if not exists checklist_items_request_state_idx
  on public.checklist_items(agency_id, student_id, is_archived, is_requested);

create index if not exists checklist_items_template_key_idx
  on public.checklist_items(student_id, source_template_key)
  where source_template_key is not null;

create index if not exists students_case_stage_idx
  on public.students(agency_id, case_stage);

commit;

notify pgrst, 'reload schema';
