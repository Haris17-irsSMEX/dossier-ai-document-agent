create table if not exists public.counselor_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid null references public.profiles(id) on delete set null,
  email text not null,
  role text not null default 'counselor',
  public_token text unique not null,
  status text not null default 'pending',
  created_by uuid null references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists counselor_invites_agency_id_idx
  on public.counselor_invites(agency_id);

create index if not exists counselor_invites_profile_id_idx
  on public.counselor_invites(profile_id);

create index if not exists counselor_invites_email_idx
  on public.counselor_invites(lower(email));

create index if not exists counselor_invites_pending_idx
  on public.counselor_invites(profile_id, status)
  where status = 'pending';

alter table public.counselor_invites enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'counselor_invites'
      and policyname = 'Agency admins can view counselor invites'
  ) then
    create policy "Agency admins can view counselor invites"
      on public.counselor_invites
      for select
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and (
              p.role = 'platform_admin'
              or (p.role = 'agency_admin' and p.agency_id = counselor_invites.agency_id)
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'counselor_invites'
      and policyname = 'Agency admins can manage counselor invites'
  ) then
    create policy "Agency admins can manage counselor invites"
      on public.counselor_invites
      for all
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and (
              p.role = 'platform_admin'
              or (p.role = 'agency_admin' and p.agency_id = counselor_invites.agency_id)
            )
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and (
              p.role = 'platform_admin'
              or (p.role = 'agency_admin' and p.agency_id = counselor_invites.agency_id)
            )
        )
      );
  end if;
end $$;

notify pgrst, 'reload schema';
