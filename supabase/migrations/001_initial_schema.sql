begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.profile_role as enum (
    'agency_owner',
    'admin',
    'consultant',
    'reviewer'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.checklist_category as enum (
    'personal',
    'educational',
    'visa',
    'financial',
    'sponsor',
    'custom'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.upload_type as enum (
    'single',
    'multiple',
    'multi_part'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.checklist_item_status as enum (
    'missing',
    'uploaded',
    'wrong_format',
    'wrong_document',
    'blurry',
    'expired',
    'name_mismatch',
    'needs_review',
    'suspicious',
    'accepted',
    'rejected',
    'official_verification_required',
    'officially_verified'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_part_status as enum (
    'missing',
    'uploaded',
    'accepted',
    'rejected',
    'needs_review'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_issue_type as enum (
    'missing',
    'wrong_format',
    'wrong_document',
    'blurry',
    'expired',
    'name_mismatch',
    'suspicious',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.upload_token_status as enum (
    'active',
    'used',
    'expired',
    'revoked'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_provider_type as enum (
    'api_future',
    'qr_portal_manual',
    'portal_manual',
    'manual'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_request_status as enum (
    'not_started',
    'queued',
    'submitted',
    'in_review',
    'verified',
    'failed',
    'rejected',
    'needs_action'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.whatsapp_message_status as enum (
    'queued',
    'sent',
    'delivered',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.export_packet_status as enum (
    'queued',
    'generating',
    'ready',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role public.profile_role not null default 'consultant',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  assigned_consultant_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  full_name text not null,
  preferred_name text,
  email text,
  phone text,
  destination_country text,
  target_institution text,
  target_program text,
  intake text,
  intake_year integer,
  stage text not null default 'lead',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id),
  constraint students_assigned_consultant_agency_fk
    foreign key (assigned_consultant_id, agency_id)
    references public.profiles(id, agency_id)
    on delete restrict
);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  template_key text not null,
  category public.checklist_category not null,
  document_name text not null,
  is_required boolean not null default true,
  instructions text,
  accepted_formats text[] not null default array['pdf'],
  upload_type public.upload_type not null default 'single',
  required_parts jsonb not null default '[]'::jsonb,
  ai_validation_enabled boolean not null default true,
  expiry_validation_enabled boolean not null default false,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_templates_system_scope_check
    check (
      (is_system = true and agency_id is null and created_by is null)
      or (is_system = false and agency_id is not null)
    )
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  template_id uuid references public.checklist_templates(id) on delete set null,
  category public.checklist_category not null,
  document_name text not null,
  is_required boolean not null default true,
  instructions text,
  accepted_formats text[] not null default array['pdf'],
  upload_type public.upload_type not null default 'single',
  required_parts jsonb not null default '[]'::jsonb,
  ai_validation_enabled boolean not null default true,
  expiry_validation_enabled boolean not null default true,
  submission_deadline date,
  status public.checklist_item_status not null default 'missing',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id),
  unique (id, student_id, agency_id),
  constraint checklist_items_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade
);

create table public.document_parts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  checklist_item_id uuid not null,
  part_name text not null,
  is_required boolean not null default true,
  status public.document_part_status not null default 'missing',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id),
  unique (id, checklist_item_id, agency_id),
  constraint document_parts_checklist_item_agency_fk
    foreign key (checklist_item_id, agency_id)
    references public.checklist_items(id, agency_id)
    on delete cascade
);

create table public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  checklist_item_id uuid,
  token_hash text not null unique,
  status public.upload_token_status not null default 'active',
  max_uploads integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upload_tokens_max_uploads_check check (max_uploads > 0),
  constraint upload_tokens_used_count_check check (used_count >= 0),
  constraint upload_tokens_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade,
  constraint upload_tokens_checklist_item_agency_fk
    foreign key (checklist_item_id, agency_id)
    references public.checklist_items(id, agency_id)
    on delete cascade
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  checklist_item_id uuid not null,
  document_part_id uuid,
  upload_token_id uuid references public.upload_tokens(id) on delete set null,
  storage_bucket text not null default 'students-documents',
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size_bytes bigint,
  checksum text,
  status public.checklist_item_status not null default 'uploaded',
  uploaded_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id),
  constraint documents_file_size_check
    check (file_size_bytes is null or file_size_bytes >= 0),
  constraint documents_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade,
  constraint documents_checklist_item_student_agency_fk
    foreign key (checklist_item_id, student_id, agency_id)
    references public.checklist_items(id, student_id, agency_id)
    on delete cascade,
  constraint documents_part_checklist_item_agency_fk
    foreign key (document_part_id, checklist_item_id, agency_id)
    references public.document_parts(id, checklist_item_id, agency_id)
);

create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  document_id uuid not null,
  provider text not null,
  model text,
  raw_text text,
  extracted_fields jsonb not null default '{}'::jsonb,
  confidence numeric(5, 4),
  status text not null default 'completed',
  error_message text,
  created_at timestamptz not null default now(),
  constraint document_extractions_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint document_extractions_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade,
  constraint document_extractions_document_agency_fk
    foreign key (document_id, agency_id)
    references public.documents(id, agency_id)
    on delete cascade
);

create table public.document_issues (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  checklist_item_id uuid not null,
  document_id uuid,
  issue_type public.document_issue_type not null,
  message text not null,
  severity text not null default 'medium',
  is_resolved boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint document_issues_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade,
  constraint document_issues_checklist_item_student_agency_fk
    foreign key (checklist_item_id, student_id, agency_id)
    references public.checklist_items(id, student_id, agency_id)
    on delete cascade,
  constraint document_issues_document_agency_fk
    foreign key (document_id, agency_id)
    references public.documents(id, agency_id)
    on delete cascade
);

create table public.verification_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  provider_type public.verification_provider_type not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  checklist_item_id uuid,
  document_id uuid,
  provider_id uuid not null references public.verification_providers(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete set null,
  status public.verification_request_status not null default 'queued',
  deadline_date date,
  portal_reference text,
  instructions text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id),
  constraint verification_requests_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade,
  constraint verification_requests_checklist_item_agency_fk
    foreign key (checklist_item_id, agency_id)
    references public.checklist_items(id, agency_id)
    on delete restrict,
  constraint verification_requests_document_agency_fk
    foreign key (document_id, agency_id)
    references public.documents(id, agency_id)
    on delete restrict
);

create table public.verification_results (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  verification_request_id uuid not null,
  student_id uuid not null,
  provider_id uuid not null references public.verification_providers(id) on delete restrict,
  status public.verification_request_status not null,
  verified_name text,
  verified_identifier text,
  result_payload jsonb not null default '{}'::jsonb,
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint verification_results_request_agency_fk
    foreign key (verification_request_id, agency_id)
    references public.verification_requests(id, agency_id)
    on delete cascade,
  constraint verification_results_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade
);

create table public.student_consents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  consent_type text not null,
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint student_consents_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  to_phone text not null,
  from_phone text not null,
  body text not null,
  provider text not null default 'twilio',
  provider_message_id text,
  status public.whatsapp_message_status not null default 'queued',
  error_message text,
  message_type text,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint whatsapp_messages_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade
);

create table public.export_packets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  status public.export_packet_status not null default 'queued',
  format text not null default 'zip',
  storage_bucket text,
  storage_path text,
  included_document_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint export_packets_format_check check (format in ('zip', 'pdf')),
  constraint export_packets_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  actor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create trigger agencies_set_updated_at
before update on public.agencies
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create trigger checklist_templates_set_updated_at
before update on public.checklist_templates
for each row execute function public.set_updated_at();

create trigger checklist_items_set_updated_at
before update on public.checklist_items
for each row execute function public.set_updated_at();

create trigger document_parts_set_updated_at
before update on public.document_parts
for each row execute function public.set_updated_at();

create trigger upload_tokens_set_updated_at
before update on public.upload_tokens
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create trigger verification_requests_set_updated_at
before update on public.verification_requests
for each row execute function public.set_updated_at();

create trigger export_packets_set_updated_at
before update on public.export_packets
for each row execute function public.set_updated_at();

create index agencies_created_by_idx on public.agencies(created_by);

create index profiles_agency_id_idx on public.profiles(agency_id);
create unique index profiles_agency_email_idx
  on public.profiles(agency_id, lower(email))
  where email is not null;

create index students_agency_id_idx on public.students(agency_id);
create index students_assigned_consultant_id_idx
  on public.students(assigned_consultant_id);

create index checklist_templates_agency_id_idx
  on public.checklist_templates(agency_id);
create index checklist_templates_category_idx
  on public.checklist_templates(category);
create unique index checklist_templates_system_template_key_idx
  on public.checklist_templates(template_key)
  where is_system = true;
create unique index checklist_templates_agency_template_key_idx
  on public.checklist_templates(agency_id, template_key)
  where is_system = false;

create index checklist_items_agency_id_idx
  on public.checklist_items(agency_id);
create index checklist_items_student_id_idx
  on public.checklist_items(student_id);
create index checklist_items_status_idx
  on public.checklist_items(status);
create index checklist_items_deadline_date_idx
  on public.checklist_items(submission_deadline);

create index document_parts_agency_id_idx on public.document_parts(agency_id);
create index document_parts_checklist_item_id_idx
  on public.document_parts(checklist_item_id);
create index document_parts_status_idx on public.document_parts(status);

create index upload_tokens_agency_id_idx on public.upload_tokens(agency_id);
create index upload_tokens_student_id_idx on public.upload_tokens(student_id);
create index upload_tokens_checklist_item_id_idx
  on public.upload_tokens(checklist_item_id);
create index upload_tokens_status_idx on public.upload_tokens(status);
create index upload_tokens_deadline_date_idx on public.upload_tokens(expires_at);

create index documents_agency_id_idx on public.documents(agency_id);
create index documents_student_id_idx on public.documents(student_id);
create index documents_checklist_item_id_idx
  on public.documents(checklist_item_id);
create index documents_status_idx on public.documents(status);

create index document_extractions_agency_id_idx
  on public.document_extractions(agency_id);
create index document_extractions_student_id_idx
  on public.document_extractions(student_id);
create index document_extractions_document_id_idx
  on public.document_extractions(document_id);

create index document_issues_agency_id_idx on public.document_issues(agency_id);
create index document_issues_student_id_idx on public.document_issues(student_id);
create index document_issues_checklist_item_id_idx
  on public.document_issues(checklist_item_id);
create index document_issues_document_id_idx
  on public.document_issues(document_id);
create index document_issues_issue_type_idx on public.document_issues(issue_type);
create index document_issues_is_resolved_idx
  on public.document_issues(is_resolved);

create index verification_requests_agency_id_idx
  on public.verification_requests(agency_id);
create index verification_requests_student_id_idx
  on public.verification_requests(student_id);
create index verification_requests_checklist_item_id_idx
  on public.verification_requests(checklist_item_id);
create index verification_requests_document_id_idx
  on public.verification_requests(document_id);
create index verification_requests_status_idx
  on public.verification_requests(status);
create index verification_requests_deadline_date_idx
  on public.verification_requests(deadline_date);
create index verification_requests_provider_id_idx
  on public.verification_requests(provider_id);

create index verification_results_agency_id_idx
  on public.verification_results(agency_id);
create index verification_results_student_id_idx
  on public.verification_results(student_id);
create index verification_results_request_id_idx
  on public.verification_results(verification_request_id);

create index student_consents_agency_id_idx on public.student_consents(agency_id);
create index student_consents_student_id_idx on public.student_consents(student_id);

create index whatsapp_messages_agency_id_idx on public.whatsapp_messages(agency_id);
create index whatsapp_messages_student_id_idx on public.whatsapp_messages(student_id);
create index whatsapp_messages_status_idx on public.whatsapp_messages(status);
create index whatsapp_messages_provider_message_id_idx
  on public.whatsapp_messages(provider_message_id);

create index export_packets_agency_id_idx on public.export_packets(agency_id);
create index export_packets_student_id_idx on public.export_packets(student_id);
create index export_packets_status_idx on public.export_packets(status);

create index audit_logs_agency_id_idx on public.audit_logs(agency_id);
create index audit_logs_actor_user_id_idx on public.audit_logs(actor_user_id);
create index audit_logs_record_id_idx on public.audit_logs(record_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at);

insert into public.verification_providers (code, name, provider_type, notes)
values
  ('NADRA', 'NADRA', 'api_future', 'Workflow placeholder for future API support. No live NADRA API call is made.'),
  ('IBCC', 'IBCC', 'qr_portal_manual', 'Manual QR or portal verification workflow.'),
  ('HEC', 'HEC', 'portal_manual', 'Manual HEC portal verification workflow.'),
  ('Board', 'Board', 'manual', 'Manual board verification workflow.'),
  ('University', 'University', 'manual', 'Manual university verification workflow.'),
  ('Bank', 'Bank', 'manual', 'Manual bank document verification workflow.'),
  ('Manual', 'Manual', 'manual', 'Generic manual verification workflow.');

insert into public.checklist_templates (
  template_key,
  category,
  document_name,
  is_required,
  instructions,
  accepted_formats,
  upload_type,
  required_parts,
  ai_validation_enabled,
  expiry_validation_enabled,
  is_system
)
values
  (
    'passport',
    'personal',
    'Passport',
    true,
    'Upload clear passport scans. Include the bio data page and any visa pages relevant to the application.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'multi_part',
    '[{"part_name":"Bio Data Page","is_required":true},{"part_name":"Additional Visa Pages","is_required":false}]'::jsonb,
    true,
    true,
    true
  ),
  (
    'cnic',
    'personal',
    'CNIC',
    true,
    'Upload clear front and back scans of the national identity card.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'multi_part',
    '[{"part_name":"Front Side","is_required":true},{"part_name":"Back Side","is_required":true}]'::jsonb,
    true,
    true,
    true
  ),
  (
    'bank-statements',
    'financial',
    'Bank Statements',
    true,
    'Upload recent bank statements matching the destination and institution requirements.',
    array['pdf'],
    'multiple',
    '[]'::jsonb,
    true,
    true,
    true
  ),
  (
    'degree',
    'educational',
    'Degree',
    true,
    'Upload the final degree certificate for the relevant qualification.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'matric-certificate',
    'educational',
    'Matric Certificate',
    true,
    'Upload the matric certificate.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'matric-result-card-transcript',
    'educational',
    'Matric Result Card / Transcript',
    true,
    'Upload the matric result card or transcript.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'intermediate-certificate',
    'educational',
    'Intermediate Certificate',
    true,
    'Upload the intermediate certificate.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'intermediate-result-card-transcript',
    'educational',
    'Intermediate Result Card / Transcript',
    true,
    'Upload the intermediate result card or transcript.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'o-level-certificates',
    'educational',
    'O-Level Certificates',
    false,
    'Upload all O-Level certificates required for equivalence or admission review.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'multiple',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'a-level-certificates',
    'educational',
    'A-Level Certificates',
    false,
    'Upload all A-Level certificates required for equivalence or admission review.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'multiple',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'ibcc-equivalence-certificate',
    'educational',
    'IBCC Equivalence Certificate',
    false,
    'Upload the IBCC equivalence certificate where applicable.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'bachelor-degree',
    'educational',
    'Bachelor Degree',
    false,
    'Upload the bachelor degree certificate where applicable.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'bachelor-transcript',
    'educational',
    'Bachelor Transcript',
    false,
    'Upload the complete bachelor transcript.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'ielts-certificate',
    'educational',
    'IELTS Certificate',
    false,
    'Upload the IELTS certificate if required by the route.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    true,
    true
  ),
  (
    'sop',
    'visa',
    'SOP',
    true,
    'Upload the latest statement of purpose.',
    array['pdf', 'doc', 'docx'],
    'single',
    '[]'::jsonb,
    false,
    false,
    true
  ),
  (
    'cv',
    'custom',
    'CV',
    false,
    'Upload the latest CV or resume.',
    array['pdf', 'doc', 'docx'],
    'single',
    '[]'::jsonb,
    false,
    false,
    true
  ),
  (
    'recommendation-letters',
    'educational',
    'Recommendation Letters',
    false,
    'Upload recommendation letters as separate files.',
    array['pdf', 'doc', 'docx'],
    'multiple',
    '[]'::jsonb,
    false,
    false,
    true
  ),
  (
    'sponsor-cnic',
    'sponsor',
    'Sponsor CNIC',
    false,
    'Upload clear sponsor CNIC scans where sponsorship is used.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'multi_part',
    '[{"part_name":"Front Side","is_required":true},{"part_name":"Back Side","is_required":true}]'::jsonb,
    true,
    true,
    true
  ),
  (
    'sponsorship-affidavit',
    'sponsor',
    'Sponsorship Affidavit',
    false,
    'Upload the signed sponsorship affidavit.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'visa-application-form',
    'visa',
    'Visa Application Form',
    true,
    'Upload the completed visa application form.',
    array['pdf'],
    'single',
    '[]'::jsonb,
    false,
    false,
    true
  ),
  (
    'offer-letter',
    'visa',
    'Offer Letter',
    true,
    'Upload the latest institution offer letter.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'accommodation-proof',
    'visa',
    'Accommodation Proof',
    false,
    'Upload accommodation proof if required for the application route.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    false,
    true
  ),
  (
    'health-insurance',
    'visa',
    'Health Insurance',
    false,
    'Upload health insurance evidence where required.',
    array['pdf', 'jpg', 'jpeg', 'png'],
    'single',
    '[]'::jsonb,
    true,
    true,
    true
  );

commit;
