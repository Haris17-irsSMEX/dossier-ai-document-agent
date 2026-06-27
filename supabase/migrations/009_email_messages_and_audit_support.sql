begin;

alter type public.document_issue_type
  add value if not exists 'needs_manual_review';

alter table public.documents
  add column if not exists scan_summary text,
  add column if not exists extracted_fields jsonb not null default '{}'::jsonb,
  add column if not exists detected_document_type text,
  add column if not exists scan_confidence numeric(5, 4);

alter table public.export_packets
  add column if not exists file_name text,
  add column if not exists included_documents_count integer not null default 0,
  add column if not exists options jsonb not null default '{}'::jsonb;

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  to_email text not null,
  from_email text not null,
  subject text not null,
  body text not null,
  message_type text not null,
  status text not null default 'pending',
  provider text not null default 'resend',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint email_messages_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade,
  constraint email_messages_status_check
    check (status in ('pending', 'sent', 'failed'))
);

create index if not exists email_messages_agency_id_idx
  on public.email_messages(agency_id);
create index if not exists email_messages_student_id_idx
  on public.email_messages(student_id);
create index if not exists email_messages_status_idx
  on public.email_messages(status);
create index if not exists email_messages_created_at_idx
  on public.email_messages(created_at desc);
create index if not exists documents_scan_status_created_at_idx
  on public.documents(scan_status, created_at desc);

alter table public.email_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_messages'
      and policyname = 'email_messages_select_own_agency'
  ) then
    create policy email_messages_select_own_agency
      on public.email_messages
      for select
      to authenticated
      using (public.is_agency_member(agency_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_messages'
      and policyname = 'email_messages_insert_own_agency'
  ) then
    create policy email_messages_insert_own_agency
      on public.email_messages
      for insert
      to authenticated
      with check (public.is_agency_member(agency_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_messages'
      and policyname = 'email_messages_update_own_agency'
  ) then
    create policy email_messages_update_own_agency
      on public.email_messages
      for update
      to authenticated
      using (public.is_agency_member(agency_id))
      with check (public.is_agency_member(agency_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_messages'
      and policyname = 'email_messages_delete_admin'
  ) then
    create policy email_messages_delete_admin
      on public.email_messages
      for delete
      to authenticated
      using (public.is_agency_admin(agency_id));
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
