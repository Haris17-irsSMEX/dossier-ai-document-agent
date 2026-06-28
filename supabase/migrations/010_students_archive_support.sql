begin;

alter table public.students
  add column if not exists status text default 'active',
  add column if not exists archived_at timestamptz;

update public.students
set status = 'active'
where status is null;

alter table public.students
  alter column status set default 'active',
  alter column status set not null;

alter table public.students
  drop constraint if exists students_status_check;

alter table public.students
  add constraint students_status_check
  check (status in ('active', 'archived'));

create index if not exists students_status_idx
  on public.students(status);

create index if not exists students_archived_at_idx
  on public.students(archived_at desc);

notify pgrst, 'reload schema';

commit;
