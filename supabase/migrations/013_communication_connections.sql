begin;

create table if not exists public.communication_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  whatsapp_provider text not null default 'manual_handoff',
  consultant_whatsapp_number text,
  consultant_whatsapp_display_name text,
  email_provider text not null default 'none',
  default_followup_channel text not null default 'whatsapp',
  message_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.communication_settings
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade,
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists whatsapp_provider text not null default 'manual_handoff',
  add column if not exists consultant_whatsapp_number text,
  add column if not exists consultant_whatsapp_display_name text,
  add column if not exists email_provider text not null default 'none',
  add column if not exists default_followup_channel text not null default 'whatsapp',
  add column if not exists message_signature text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  provider text not null default 'google',
  email_address text not null,
  google_user_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[],
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_connections
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade,
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists provider text not null default 'google',
  add column if not exists email_address text,
  add column if not exists google_user_id text,
  add column if not exists access_token_encrypted text,
  add column if not exists refresh_token_encrypted text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists scopes text[],
  add column if not exists status text not null default 'connected',
  add column if not exists connected_at timestamptz not null default now(),
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.email_connections
set email_address = coalesce(nullif(email_address, ''), 'unknown@example.com')
where email_address is null;

alter table public.email_connections
  alter column email_address set not null;

create table if not exists public.whatsapp_handoffs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  from_display_number text,
  to_number text not null,
  message_body text not null,
  handoff_url text not null,
  status text not null default 'handoff_opened',
  opened_at timestamptz not null default now(),
  marked_sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_handoffs
  add column if not exists agency_id uuid references public.agencies(id) on delete cascade,
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists from_display_number text,
  add column if not exists to_number text,
  add column if not exists message_body text,
  add column if not exists handoff_url text,
  add column if not exists status text not null default 'handoff_opened',
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists marked_sent_at timestamptz,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.whatsapp_handoffs
set
  to_number = coalesce(nullif(to_number, ''), '+00000000000'),
  message_body = coalesce(nullif(message_body, ''), 'Pending manual handoff.'),
  handoff_url = coalesce(nullif(handoff_url, ''), 'https://example.invalid/handoff')
where to_number is null
   or message_body is null
   or handoff_url is null;

alter table public.whatsapp_handoffs
  alter column to_number set not null,
  alter column message_body set not null,
  alter column handoff_url set not null;

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  student_id uuid not null,
  email_connection_id uuid references public.email_connections(id) on delete set null,
  to_email text,
  from_email text,
  subject text,
  body text,
  message_type text,
  status text not null default 'draft',
  provider text not null default 'google',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_messages_student_agency_fk
    foreign key (student_id, agency_id)
    references public.students(id, agency_id)
    on delete cascade
);

alter table public.email_messages
  add column if not exists email_connection_id uuid references public.email_connections(id) on delete set null,
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists from_email text,
  add column if not exists to_email text,
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists provider_message_id text,
  add column if not exists error_message text,
  add column if not exists sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.email_messages
  alter column provider set default 'google',
  alter column status set default 'draft',
  alter column from_email drop not null,
  alter column to_email drop not null,
  alter column subject drop not null,
  alter column body drop not null;

alter table public.email_messages
  drop constraint if exists email_messages_status_check;

alter table public.email_messages
  add constraint email_messages_status_check
  check (status in ('draft', 'pending', 'sent', 'failed'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_settings_owner_check'
  ) then
    alter table public.communication_settings
      add constraint communication_settings_owner_check
      check (agency_id is not null or profile_id is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_settings_whatsapp_provider_check'
  ) then
    alter table public.communication_settings
      add constraint communication_settings_whatsapp_provider_check
      check (whatsapp_provider in ('manual_handoff', 'twilio', '360dialog_sandbox', '360dialog'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_settings_email_provider_check'
  ) then
    alter table public.communication_settings
      add constraint communication_settings_email_provider_check
      check (email_provider in ('none', 'google'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_settings_followup_channel_check'
  ) then
    alter table public.communication_settings
      add constraint communication_settings_followup_channel_check
      check (default_followup_channel in ('whatsapp', 'email'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_connections_owner_check'
  ) then
    alter table public.email_connections
      add constraint email_connections_owner_check
      check (agency_id is not null or profile_id is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_connections_provider_check'
  ) then
    alter table public.email_connections
      add constraint email_connections_provider_check
      check (provider in ('google'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_connections_status_check'
  ) then
    alter table public.email_connections
      add constraint email_connections_status_check
      check (status in ('connected', 'expired', 'revoked', 'error'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_handoffs_owner_check'
  ) then
    alter table public.whatsapp_handoffs
      add constraint whatsapp_handoffs_owner_check
      check (agency_id is not null or profile_id is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_handoffs_status_check'
  ) then
    alter table public.whatsapp_handoffs
      add constraint whatsapp_handoffs_status_check
      check (status in ('draft', 'handoff_opened', 'sent_manually', 'cancelled', 'failed'));
  end if;
end $$;

create unique index if not exists communication_settings_profile_id_idx
  on public.communication_settings(profile_id)
  where profile_id is not null;
create unique index if not exists communication_settings_agency_default_idx
  on public.communication_settings(agency_id)
  where profile_id is null and agency_id is not null;
create index if not exists communication_settings_agency_id_idx
  on public.communication_settings(agency_id);

create index if not exists email_connections_agency_id_idx
  on public.email_connections(agency_id);
create index if not exists email_connections_profile_id_idx
  on public.email_connections(profile_id);
create index if not exists email_connections_status_idx
  on public.email_connections(status);
create index if not exists email_connections_email_address_idx
  on public.email_connections(lower(email_address));
create unique index if not exists email_connections_active_profile_google_idx
  on public.email_connections(profile_id, provider)
  where profile_id is not null
    and provider = 'google'
    and revoked_at is null
    and status = 'connected';
create unique index if not exists email_connections_active_agency_google_idx
  on public.email_connections(agency_id, provider)
  where profile_id is null
    and agency_id is not null
    and provider = 'google'
    and revoked_at is null
    and status = 'connected';

create index if not exists whatsapp_handoffs_agency_id_idx
  on public.whatsapp_handoffs(agency_id);
create index if not exists whatsapp_handoffs_profile_id_idx
  on public.whatsapp_handoffs(profile_id);
create index if not exists whatsapp_handoffs_student_id_idx
  on public.whatsapp_handoffs(student_id);
create index if not exists whatsapp_handoffs_status_idx
  on public.whatsapp_handoffs(status);
create index if not exists whatsapp_handoffs_opened_at_idx
  on public.whatsapp_handoffs(opened_at desc);

create index if not exists email_messages_email_connection_id_idx
  on public.email_messages(email_connection_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'communication_settings_set_updated_at'
  ) then
    create trigger communication_settings_set_updated_at
    before update on public.communication_settings
    for each row
    execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'email_connections_set_updated_at'
  ) then
    create trigger email_connections_set_updated_at
    before update on public.email_connections
    for each row
    execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'whatsapp_handoffs_set_updated_at'
  ) then
    create trigger whatsapp_handoffs_set_updated_at
    before update on public.whatsapp_handoffs
    for each row
    execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'email_messages_set_updated_at'
  ) then
    create trigger email_messages_set_updated_at
    before update on public.email_messages
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

alter table public.communication_settings enable row level security;
alter table public.email_connections enable row level security;
alter table public.whatsapp_handoffs enable row level security;
alter table public.email_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_settings'
      and policyname = 'communication_settings_select_own'
  ) then
    create policy communication_settings_select_own
      on public.communication_settings
      for select
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_settings'
      and policyname = 'communication_settings_insert_own'
  ) then
    create policy communication_settings_insert_own
      on public.communication_settings
      for insert
      to authenticated
      with check (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_settings'
      and policyname = 'communication_settings_update_own'
  ) then
    create policy communication_settings_update_own
      on public.communication_settings
      for update
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      )
      with check (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_settings'
      and policyname = 'communication_settings_delete_own'
  ) then
    create policy communication_settings_delete_own
      on public.communication_settings
      for delete
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_connections'
      and policyname = 'email_connections_select_own'
  ) then
    create policy email_connections_select_own
      on public.email_connections
      for select
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_connections'
      and policyname = 'email_connections_insert_own'
  ) then
    create policy email_connections_insert_own
      on public.email_connections
      for insert
      to authenticated
      with check (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_connections'
      and policyname = 'email_connections_update_own'
  ) then
    create policy email_connections_update_own
      on public.email_connections
      for update
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      )
      with check (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'email_connections'
      and policyname = 'email_connections_delete_own'
  ) then
    create policy email_connections_delete_own
      on public.email_connections
      for delete
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_handoffs'
      and policyname = 'whatsapp_handoffs_select_own'
  ) then
    create policy whatsapp_handoffs_select_own
      on public.whatsapp_handoffs
      for select
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_handoffs'
      and policyname = 'whatsapp_handoffs_insert_own'
  ) then
    create policy whatsapp_handoffs_insert_own
      on public.whatsapp_handoffs
      for insert
      to authenticated
      with check (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_handoffs'
      and policyname = 'whatsapp_handoffs_update_own'
  ) then
    create policy whatsapp_handoffs_update_own
      on public.whatsapp_handoffs
      for update
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      )
      with check (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_handoffs'
      and policyname = 'whatsapp_handoffs_delete_own'
  ) then
    create policy whatsapp_handoffs_delete_own
      on public.whatsapp_handoffs
      for delete
      to authenticated
      using (
        (
          profile_id = auth.uid()
          and (agency_id is null or public.is_agency_member(agency_id))
        )
        or (
          profile_id is null
          and agency_id is not null
          and public.is_agency_admin(agency_id)
        )
      );
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
