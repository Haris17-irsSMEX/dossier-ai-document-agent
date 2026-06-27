begin;

do $$
begin
  alter type public.profile_role add value if not exists 'owner';
exception
  when duplicate_object then null;
end $$;

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
        and p.role in ('agency_owner', 'owner', 'admin')
    );
$$;

drop policy if exists profiles_insert_bootstrap_or_admin on public.profiles;

create policy profiles_insert_bootstrap_or_admin
on public.profiles
for insert
to authenticated
with check (
  (
    id = auth.uid()
    and role in ('agency_owner', 'owner')
    and public.can_bootstrap_agency_profile(agency_id)
  )
  or public.is_agency_admin(agency_id)
);

commit;
