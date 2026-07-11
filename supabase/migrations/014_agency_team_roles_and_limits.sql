begin;

alter type public.profile_role add value if not exists 'platform_admin';
alter type public.profile_role add value if not exists 'agency_admin';
alter type public.profile_role add value if not exists 'counselor';

alter table public.agencies
  add column if not exists status text not null default 'active',
  add column if not exists plan_name text not null default 'starter',
  add column if not exists max_counselors integer not null default 4,
  add column if not exists max_students_per_counselor integer not null default 5;

alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists joined_at timestamptz;

alter table public.students
  add column if not exists assigned_counselor_id uuid,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_assigned_counselor_agency_fk'
  ) then
    alter table public.students
      add constraint students_assigned_counselor_agency_fk
      foreign key (assigned_counselor_id, agency_id)
      references public.profiles(id, agency_id)
      on delete set null;
  end if;
end $$;

update public.agencies
set
  status = coalesce(nullif(status, ''), 'active'),
  plan_name = coalesce(nullif(plan_name, ''), 'starter'),
  max_counselors = coalesce(max_counselors, 4),
  max_students_per_counselor = coalesce(max_students_per_counselor, 5);

update public.profiles
set
  status = case
    when is_active = false then 'suspended'
    else coalesce(nullif(status, ''), 'active')
  end,
  joined_at = coalesce(joined_at, created_at)
where joined_at is null
   or status is null
   or status = '';

update public.students
set assigned_counselor_id = assigned_consultant_id
where assigned_counselor_id is null
  and assigned_consultant_id is not null;

do $$
declare
  first_user_id uuid;
begin
  if not exists (select 1 from public.agencies) then
    select id into first_user_id
    from auth.users
    order by created_at
    limit 1;

    if first_user_id is not null then
      insert into public.agencies (name, slug, created_by)
      values ('Default Agency', 'default-agency', first_user_id)
      on conflict (slug) do nothing;
    end if;
  end if;
end $$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role::text = 'platform_admin' then 'platform_admin'
    when p.role::text in ('agency_admin', 'agency_owner', 'owner', 'admin') then 'agency_admin'
    else 'counselor'
  end
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
    and coalesce(p.status, 'active') = 'active'
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and coalesce(p.status, 'active') = 'active'
      and p.role::text = 'platform_admin'
  );
$$;

create or replace function public.is_agency_member(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_agency_id is not null
    and (
      public.is_platform_admin()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.agency_id = target_agency_id
          and p.is_active = true
          and coalesce(p.status, 'active') = 'active'
      )
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
    and (
      public.is_platform_admin()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.agency_id = target_agency_id
          and p.is_active = true
          and coalesce(p.status, 'active') = 'active'
          and p.role::text in ('agency_admin', 'agency_owner', 'owner', 'admin')
      )
    );
$$;

create or replace function public.can_access_student(
  target_agency_id uuid,
  target_assigned_counselor_id uuid,
  target_assigned_consultant_id uuid
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
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and coalesce(p.status, 'active') = 'active'
        and (
          p.role::text = 'platform_admin'
          or (
            p.agency_id = target_agency_id
            and (
              p.role::text in ('agency_admin', 'agency_owner', 'owner', 'admin')
              or p.id = target_assigned_counselor_id
              or p.id = target_assigned_consultant_id
            )
          )
        )
    );
$$;

create or replace function public.can_create_or_assign_student(
  target_agency_id uuid,
  target_assigned_counselor_id uuid,
  target_assigned_consultant_id uuid
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
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and coalesce(p.status, 'active') = 'active'
        and (
          p.role::text = 'platform_admin'
          or (
            p.agency_id = target_agency_id
            and (
              p.role::text in ('agency_admin', 'agency_owner', 'owner', 'admin')
              or (
                p.id = target_assigned_counselor_id
                or p.id = target_assigned_consultant_id
              )
            )
          )
        )
    );
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.is_platform_admin() from public;
revoke all on function public.can_access_student(uuid, uuid, uuid) from public;
revoke all on function public.can_create_or_assign_student(uuid, uuid, uuid) from public;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.can_access_student(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_create_or_assign_student(uuid, uuid, uuid) to authenticated;

create index if not exists agencies_status_idx
  on public.agencies(status);

create index if not exists profiles_agency_role_status_idx
  on public.profiles(agency_id, role, status);

create index if not exists students_assigned_counselor_id_idx
  on public.students(assigned_counselor_id);

drop policy if exists agencies_select_own on public.agencies;
create policy agencies_select_own
on public.agencies
for select
to authenticated
using (public.is_agency_member(id));

drop policy if exists agencies_update_admin on public.agencies;
create policy agencies_update_admin
on public.agencies
for update
to authenticated
using (public.is_agency_admin(id))
with check (public.is_agency_admin(id));

drop policy if exists profiles_select_own_agency on public.profiles;
create policy profiles_select_own_agency
on public.profiles
for select
to authenticated
using (public.is_agency_member(agency_id) or id = auth.uid());

drop policy if exists profiles_insert_bootstrap_or_admin on public.profiles;
create policy profiles_insert_bootstrap_or_admin
on public.profiles
for insert
to authenticated
with check (
  (
    id = auth.uid()
    and role::text in ('agency_owner', 'owner', 'agency_admin')
    and public.can_bootstrap_agency_profile(agency_id)
  )
  or public.is_agency_admin(agency_id)
);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (public.is_agency_admin(agency_id) or id = auth.uid())
with check (public.is_agency_admin(agency_id) or id = auth.uid());

drop policy if exists students_select_own_agency on public.students;
create policy students_select_own_agency
on public.students
for select
to authenticated
using (
  public.can_access_student(
    agency_id,
    assigned_counselor_id,
    assigned_consultant_id
  )
);

drop policy if exists students_insert_own_agency on public.students;
create policy students_insert_own_agency
on public.students
for insert
to authenticated
with check (
  public.can_create_or_assign_student(
    agency_id,
    assigned_counselor_id,
    assigned_consultant_id
  )
);

drop policy if exists students_update_own_agency on public.students;
create policy students_update_own_agency
on public.students
for update
to authenticated
using (
  public.can_access_student(
    agency_id,
    assigned_counselor_id,
    assigned_consultant_id
  )
)
with check (
  public.can_create_or_assign_student(
    agency_id,
    assigned_counselor_id,
    assigned_consultant_id
  )
);

drop policy if exists students_delete_admin on public.students;
create policy students_delete_admin
on public.students
for delete
to authenticated
using (public.is_agency_admin(agency_id));

notify pgrst, 'reload schema';

commit;
