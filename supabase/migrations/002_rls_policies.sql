begin;

create or replace function public.current_profile_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.agency_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

create or replace function public.is_agency_member(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_agency_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.agency_id = target_agency_id
        and p.is_active = true
    );
$$;

create or replace function public.is_agency_admin(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_agency_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.agency_id = target_agency_id
        and p.is_active = true
        and p.role in ('agency_owner', 'admin')
    );
$$;

create or replace function public.can_bootstrap_agency_profile(
  target_agency_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_agency_id is not null
    and exists (
      select 1
      from public.agencies a
      where a.id = target_agency_id
        and a.created_by = auth.uid()
    )
    and not exists (
      select 1
      from public.profiles p
      where p.agency_id = target_agency_id
    );
$$;

revoke all on function public.current_profile_agency_id() from public;
revoke all on function public.is_agency_member(uuid) from public;
revoke all on function public.is_agency_admin(uuid) from public;
revoke all on function public.can_bootstrap_agency_profile(uuid) from public;

grant execute on function public.current_profile_agency_id() to authenticated;
grant execute on function public.is_agency_member(uuid) to authenticated;
grant execute on function public.is_agency_admin(uuid) to authenticated;
grant execute on function public.can_bootstrap_agency_profile(uuid) to authenticated;

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_items enable row level security;
alter table public.document_parts enable row level security;
alter table public.documents enable row level security;
alter table public.document_extractions enable row level security;
alter table public.document_issues enable row level security;
alter table public.upload_tokens enable row level security;
alter table public.verification_providers enable row level security;
alter table public.verification_requests enable row level security;
alter table public.verification_results enable row level security;
alter table public.student_consents enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.export_packets enable row level security;
alter table public.audit_logs enable row level security;

create policy agencies_select_own
on public.agencies
for select
to authenticated
using (public.is_agency_member(id));

create policy agencies_insert_created_by_self
on public.agencies
for insert
to authenticated
with check (created_by = auth.uid());

create policy agencies_update_admin
on public.agencies
for update
to authenticated
using (public.is_agency_admin(id))
with check (public.is_agency_admin(id));

create policy profiles_select_own_agency
on public.profiles
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy profiles_insert_bootstrap_or_admin
on public.profiles
for insert
to authenticated
with check (
  (
    id = auth.uid()
    and role = 'agency_owner'
    and public.can_bootstrap_agency_profile(agency_id)
  )
  or public.is_agency_admin(agency_id)
);

create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (public.is_agency_admin(agency_id))
with check (public.is_agency_admin(agency_id));

create policy profiles_delete_admin
on public.profiles
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy students_select_own_agency
on public.students
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy students_insert_own_agency
on public.students
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy students_update_own_agency
on public.students
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy students_delete_admin
on public.students
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy checklist_templates_select_available
on public.checklist_templates
for select
to authenticated
using (is_system = true or public.is_agency_member(agency_id));

create policy checklist_templates_insert_own_agency
on public.checklist_templates
for insert
to authenticated
with check (
  is_system = false
  and public.is_agency_member(agency_id)
);

create policy checklist_templates_update_own_agency
on public.checklist_templates
for update
to authenticated
using (
  is_system = false
  and public.is_agency_member(agency_id)
)
with check (
  is_system = false
  and public.is_agency_member(agency_id)
);

create policy checklist_templates_delete_admin
on public.checklist_templates
for delete
to authenticated
using (
  is_system = false
  and public.is_agency_admin(agency_id)
);

create policy checklist_items_select_own_agency
on public.checklist_items
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy checklist_items_insert_own_agency
on public.checklist_items
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy checklist_items_update_own_agency
on public.checklist_items
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy checklist_items_delete_admin
on public.checklist_items
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy document_parts_select_own_agency
on public.document_parts
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy document_parts_insert_own_agency
on public.document_parts
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy document_parts_update_own_agency
on public.document_parts
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy document_parts_delete_admin
on public.document_parts
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy upload_tokens_select_own_agency
on public.upload_tokens
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy upload_tokens_insert_own_agency
on public.upload_tokens
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy upload_tokens_update_own_agency
on public.upload_tokens
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy upload_tokens_delete_admin
on public.upload_tokens
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy documents_select_own_agency
on public.documents
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy documents_insert_own_agency
on public.documents
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy documents_update_own_agency
on public.documents
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy documents_delete_admin
on public.documents
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy document_extractions_select_own_agency
on public.document_extractions
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy document_extractions_insert_own_agency
on public.document_extractions
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy document_extractions_update_own_agency
on public.document_extractions
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy document_extractions_delete_admin
on public.document_extractions
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy document_issues_select_own_agency
on public.document_issues
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy document_issues_insert_own_agency
on public.document_issues
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy document_issues_update_own_agency
on public.document_issues
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy document_issues_delete_admin
on public.document_issues
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy verification_providers_select_active
on public.verification_providers
for select
to authenticated
using (is_active = true);

create policy verification_requests_select_own_agency
on public.verification_requests
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy verification_requests_insert_own_agency
on public.verification_requests
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy verification_requests_update_own_agency
on public.verification_requests
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy verification_requests_delete_admin
on public.verification_requests
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy verification_results_select_own_agency
on public.verification_results
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy verification_results_insert_own_agency
on public.verification_results
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy verification_results_update_own_agency
on public.verification_results
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy verification_results_delete_admin
on public.verification_results
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy student_consents_select_own_agency
on public.student_consents
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy student_consents_insert_own_agency
on public.student_consents
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy student_consents_update_own_agency
on public.student_consents
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy student_consents_delete_admin
on public.student_consents
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy whatsapp_messages_select_own_agency
on public.whatsapp_messages
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy whatsapp_messages_insert_own_agency
on public.whatsapp_messages
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy whatsapp_messages_update_own_agency
on public.whatsapp_messages
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy whatsapp_messages_delete_admin
on public.whatsapp_messages
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy export_packets_select_own_agency
on public.export_packets
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy export_packets_insert_own_agency
on public.export_packets
for insert
to authenticated
with check (public.is_agency_member(agency_id));

create policy export_packets_update_own_agency
on public.export_packets
for update
to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

create policy export_packets_delete_admin
on public.export_packets
for delete
to authenticated
using (public.is_agency_admin(agency_id));

create policy audit_logs_select_own_agency
on public.audit_logs
for select
to authenticated
using (public.is_agency_member(agency_id));

create policy audit_logs_insert_own_agency
on public.audit_logs
for insert
to authenticated
with check (public.is_agency_member(agency_id));

commit;
