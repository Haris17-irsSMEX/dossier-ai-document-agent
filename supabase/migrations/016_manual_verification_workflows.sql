begin;

create table if not exists public.verification_workflows (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  student_id uuid not null,
  provider text not null,
  provider_label text not null,
  related_document_request_ids uuid[],
  status text not null default 'not_started',
  reference_number text,
  selected_board text,
  official_url text,
  evidence_url text,
  evidence_file_name text,
  notes text,
  verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_workflows_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade,
  constraint verification_workflows_provider_check
    check (provider in ('nadra', 'board', 'ibcc', 'hec', 'mofa', 'other')),
  constraint verification_workflows_status_check
    check (
      status in (
        'not_started',
        'portal_opened',
        'submitted',
        'in_progress',
        'verified',
        'issue_found',
        'not_required'
      )
    )
);

create unique index if not exists verification_workflows_student_provider_idx
  on public.verification_workflows(student_id, provider);

create index if not exists verification_workflows_agency_id_idx
  on public.verification_workflows(agency_id);

create index if not exists verification_workflows_student_id_idx
  on public.verification_workflows(student_id);

create index if not exists verification_workflows_status_idx
  on public.verification_workflows(status);

create index if not exists verification_workflows_related_documents_idx
  on public.verification_workflows using gin(related_document_request_ids);

insert into public.verification_workflows (
  agency_id,
  student_id,
  provider,
  provider_label,
  related_document_request_ids,
  status,
  reference_number,
  notes,
  verified_at,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  vr.agency_id,
  vr.student_id,
  case lower(vp.code)
    when 'nadra' then 'nadra'
    when 'board' then 'board'
    when 'ibcc' then 'ibcc'
    when 'hec' then 'hec'
    else 'other'
  end,
  case lower(vp.code)
    when 'board' then 'Board Verification'
    when 'manual' then 'Other manual verification'
    else vp.name
  end,
  case
    when vr.checklist_item_id is null then null
    else array[vr.checklist_item_id]
  end,
  case vr.status::text
    when 'submitted' then 'submitted'
    when 'in_review' then 'in_progress'
    when 'pending' then 'in_progress'
    when 'verified' then 'verified'
    when 'failed' then 'issue_found'
    when 'rejected' then 'issue_found'
    when 'needs_action' then 'issue_found'
    when 'suspicious' then 'issue_found'
    when 'manual_review' then 'issue_found'
    when 'not_required' then 'not_required'
    else 'not_started'
  end,
  vr.portal_reference,
  vr.instructions,
  case when vr.status::text = 'verified' then vr.completed_at else null end,
  vr.requested_by,
  vr.requested_by,
  vr.created_at,
  vr.updated_at
from public.verification_requests vr
join public.verification_providers vp on vp.id = vr.provider_id
where lower(vp.code) in ('nadra', 'board', 'ibcc', 'hec', 'manual')
  and vr.status::text <> 'api_not_connected'
on conflict (student_id, provider) do nothing;

drop trigger if exists verification_workflows_set_updated_at
  on public.verification_workflows;
create trigger verification_workflows_set_updated_at
before update on public.verification_workflows
for each row execute function public.set_updated_at();

alter table public.verification_workflows enable row level security;

drop policy if exists verification_workflows_select_accessible_student
  on public.verification_workflows;
create policy verification_workflows_select_accessible_student
on public.verification_workflows
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = verification_workflows.student_id
      and s.agency_id = verification_workflows.agency_id
      and public.can_access_student(
        s.agency_id,
        s.assigned_counselor_id,
        s.assigned_consultant_id
      )
  )
);

drop policy if exists verification_workflows_insert_accessible_student
  on public.verification_workflows;
create policy verification_workflows_insert_accessible_student
on public.verification_workflows
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    where s.id = verification_workflows.student_id
      and s.agency_id = verification_workflows.agency_id
      and public.can_access_student(
        s.agency_id,
        s.assigned_counselor_id,
        s.assigned_consultant_id
      )
  )
);

drop policy if exists verification_workflows_update_accessible_student
  on public.verification_workflows;
create policy verification_workflows_update_accessible_student
on public.verification_workflows
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = verification_workflows.student_id
      and s.agency_id = verification_workflows.agency_id
      and public.can_access_student(
        s.agency_id,
        s.assigned_counselor_id,
        s.assigned_consultant_id
      )
  )
)
with check (
  exists (
    select 1
    from public.students s
    where s.id = verification_workflows.student_id
      and s.agency_id = verification_workflows.agency_id
      and public.can_access_student(
        s.agency_id,
        s.assigned_counselor_id,
        s.assigned_consultant_id
      )
  )
);

NOTIFY pgrst, 'reload schema';

commit;
