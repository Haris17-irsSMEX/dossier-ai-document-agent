begin;

alter table public.checklist_items
  add column if not exists phase_slug text,
  add column if not exists phase_label text,
  add column if not exists phase_order integer not null default 999,
  add column if not exists category_slug text,
  add column if not exists category_label text,
  add column if not exists category_order integer not null default 999,
  add column if not exists item_order integer not null default 999,
  add column if not exists requirement_level text not null default 'required',
  add column if not exists condition_note text,
  add column if not exists is_custom boolean not null default false,
  add column if not exists visible_to_student boolean not null default true,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;

update public.checklist_items
set requirement_level = case
  when is_required then 'required'
  else 'optional'
end
where requirement_level is null
   or requirement_level not in ('required', 'conditional', 'optional');

update public.checklist_items
set
  phase_slug = case
    when document_name ~* '(bank|sponsor|affidavit|tax|salary|business|property|agriculture|gold|funds)'
      then 'financial_sponsor_file'
    when document_name ~* '(offer letter|admission letter|tuition|scholarship|application receipt)'
      then 'admission_offer_stage'
    when document_name ~* '(ibcc|hec|mofa|apostille|equivalence|translation|verification)'
      then 'verification_attestation'
    when document_name ~* '(aps|cimea|declaration of value|dov|cas|coe|i-20|sevis|gic|universitaly|blocked account)'
      then 'country_specific_requirements'
    when document_name ~* '(gap|refusal|explanation|backlog|low marks)'
      then 'risk_explanation'
    when document_name ~* '(sports|award|competition|hackathon|volunteer|freelance|portfolio|professional certification)'
      then 'optional_profile_boosters'
    when document_name ~* '(arrival|pickup|currency|flight ticket|enrollment extension)'
      then 'pre_departure'
    when document_name ~* '(visa|appointment|medical|tb|police|insurance|flight|accommodation)'
      then 'visa_processing'
    when document_name ~* '(university application|application form|application fee|recommendation|course description|research proposal)'
      then 'university_application'
    else 'profile_academic_file'
  end
where phase_slug is null;

update public.checklist_items
set
  phase_label = case phase_slug
    when 'profile_academic_file' then 'Profile & Academic File'
    when 'university_application' then 'University Application'
    when 'financial_sponsor_file' then 'Financial & Sponsor File'
    when 'admission_offer_stage' then 'Admission / Offer Stage'
    when 'visa_processing' then 'Visa Processing'
    when 'verification_attestation' then 'Verification / Attestation'
    when 'country_specific_requirements' then 'Country-Specific Requirements'
    when 'risk_explanation' then 'Risk & Explanation Documents'
    when 'optional_profile_boosters' then 'Optional Profile Boosters'
    when 'pre_departure' then 'Pre-Departure'
    else 'Profile & Academic File'
  end,
  phase_order = case phase_slug
    when 'profile_academic_file' then 1
    when 'university_application' then 2
    when 'financial_sponsor_file' then 3
    when 'admission_offer_stage' then 4
    when 'visa_processing' then 5
    when 'verification_attestation' then 6
    when 'country_specific_requirements' then 7
    when 'risk_explanation' then 8
    when 'optional_profile_boosters' then 9
    when 'pre_departure' then 10
    else 999
  end,
  category_slug = coalesce(category_slug, category::text),
  category_label = coalesce(
    category_label,
    initcap(replace(category::text, '_', ' '))
  ),
  category_order = case category::text
    when 'personal' then 1
    when 'educational' then 2
    when 'financial' then 3
    when 'sponsor' then 4
    when 'visa' then 5
    else 6
  end
where phase_label is null
   or phase_order = 999
   or category_slug is null
   or category_label is null;

with ordered_items as (
  select
    id,
    row_number() over (
      partition by student_id, phase_slug
      order by created_at, id
    ) as generated_order
  from public.checklist_items
  where item_order = 999
)
update public.checklist_items as checklist_item
set item_order = ordered_items.generated_order
from ordered_items
where checklist_item.id = ordered_items.id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'checklist_items_requirement_level_check'
      and conrelid = 'public.checklist_items'::regclass
  ) then
    alter table public.checklist_items
      add constraint checklist_items_requirement_level_check
      check (requirement_level in ('required', 'conditional', 'optional'));
  end if;
end $$;

create index if not exists checklist_items_phase_order_idx
  on public.checklist_items(student_id, phase_order, item_order);

create index if not exists checklist_items_active_requests_idx
  on public.checklist_items(agency_id, student_id, is_archived);

commit;

notify pgrst, 'reload schema';
