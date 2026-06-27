begin;

alter type public.document_issue_type add value if not exists 'cropped';
alter type public.document_issue_type add value if not exists 'missing_page';
alter type public.document_issue_type add value if not exists 'low_confidence';
alter type public.document_issue_type add value if not exists 'attestation_missing';
alter type public.document_issue_type add value if not exists 'needs_manual_review';

alter table public.documents
  add column if not exists scan_status text not null default 'not_scanned',
  add column if not exists scan_error_message text,
  add column if not exists scanned_at timestamptz;

alter table public.documents
  drop constraint if exists documents_scan_status_check;

alter table public.documents
  add constraint documents_scan_status_check
  check (
    scan_status in (
      'not_scanned',
      'scanning',
      'scanned',
      'scan_failed',
      'needs_review'
    )
  );

alter table public.document_issues
  add column if not exists evidence text,
  add column if not exists recommended_action text;

create index if not exists documents_scan_status_idx
  on public.documents(scan_status);

create index if not exists document_extractions_status_idx
  on public.document_extractions(status);

commit;
