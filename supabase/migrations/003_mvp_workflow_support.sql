begin;

alter table public.students
  add column if not exists target_country text,
  add column if not exists program_level text,
  add column if not exists education_background text,
  add column if not exists sponsor_type text,
  add column if not exists deadline_date date;

update public.students
set target_country = coalesce(target_country, destination_country)
where target_country is null;

create index if not exists students_deadline_date_idx
  on public.students(deadline_date);

insert into storage.buckets (id, name, public)
values ('students-documents', 'students-documents', false)
on conflict (id) do update set public = false;

commit;
