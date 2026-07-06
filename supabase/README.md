# Dossier Supabase Schema

This folder contains the database foundation for the Dossier MVP.

## Migration Order

Run the migrations in this order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_mvp_workflow_support.sql`
4. `supabase/migrations/004_core_mvp_status_fix.sql`
5. `supabase/migrations/005_onboarding_bootstrap_fix.sql`
6. `supabase/migrations/006_document_scan_support.sql`
7. `supabase/migrations/009_email_messages_and_audit_support.sql`
8. `supabase/migrations/010_students_archive_support.sql`
9. `supabase/migrations/011_phase_based_checklist_support.sql`
10. `supabase/migrations/012_checklist_request_logic.sql`
11. `supabase/migrations/013_communication_connections.sql`

With the Supabase CLI, link the project and run `supabase db push`. Without the CLI, paste the migration files into the Supabase SQL editor in the same order.

## What The Schema Covers

The schema is built around agencies. Consultants are stored in `profiles`, and every profile links directly to `auth.users`. Students belong to one `agency_id` and one `assigned_consultant_id`.

Document configuration starts in `checklist_templates`. System templates seed common study-abroad documents such as Passport, CNIC, Bank Statements, IBCC Equivalence Certificate, IELTS Certificate, SOP, Sponsor CNIC, Visa Application Form, Offer Letter, Accommodation Proof, and Health Insurance.

When a student application is created, the app copies selected templates into `checklist_items`. Consultants can customize each student-specific item:

- `category`: `personal`, `educational`, `visa`, `financial`, `sponsor`, or `custom`
- `upload_type`: `single`, `multiple`, or `multi_part`
- `required_parts`: JSON instructions for multi-part uploads
- validation flags for AI checks and expiry checks
- `submission_deadline`
- workflow status such as `missing`, `uploaded`, `blurry`, `expired`, `needs_review`, `accepted`, or `officially_verified`
- phase, category, and item ordering for the consultant dossier
- `requirement_level`: `required`, `conditional`, or `optional`
- student visibility, custom-request status, and safe request archiving
- explicit request activation, completion-count participation, template keys,
  applicable case stage, and requester metadata

Only active requested items participate in completion. Conditional, optional,
and future-stage templates remain available to counselors without appearing as
missing or being exposed through the public upload portal.

For `multi_part` items, create rows in `document_parts`. Example: Passport has Bio Data Page and optional Additional Visa Pages; CNIC has Front Side and Back Side.

Uploaded files are stored in `documents`. Validation output goes into `document_extractions` and `document_issues`. Secure upload links are represented by hashed `upload_tokens`; the raw token should only be shown to the student once and never stored directly.

Verification workflow is manual/RLS-ready. `verification_providers` seeds NADRA, IBCC, HEC, Board, University, Bank, and Manual provider rows, but the schema does not call any real NADRA, IBCC, HEC, bank, or university APIs.

WhatsApp delivery history is stored in `whatsapp_messages` with Twilio-ready fields: `to_phone`, `from_phone`, `body`, `provider`, `provider_message_id`, `status`, `error_message`, `sent_at`, and `created_at`.

Exports are tracked in `export_packets`, and application events can be recorded in `audit_logs`.

Migration `013` adds the consultant-owned communication foundation:

- `communication_settings` for WhatsApp/email preferences and signatures
- `email_connections` for encrypted Gmail / Google Workspace token storage
- `whatsapp_handoffs` for manual WhatsApp handoff logs
- `email_messages` extensions for future Gmail-linked sends

Those tables follow the existing RLS style and remain private to the owning
profile, with agency-admin access only for agency-level rows.

## RLS Model

Row Level Security is enabled on every business table. Most policies call:

- `public.is_agency_member(agency_id)`
- `public.is_agency_admin(agency_id)`

Those functions look up the signed-in user through `auth.uid()` and the `profiles` table. A user can only select, insert, or update rows for their own agency. Deletes are limited to agency admins or owners on tables where deletes are allowed.

The only shared readable rows are safe configuration rows:

- system `checklist_templates`
- active `verification_providers`

Those rows do not contain private agency or student data and are readable only by authenticated users, not anonymous public clients.

Do not expose any Supabase service role key in frontend code. If an upload-token route or Twilio webhook needs elevated database writes later, keep that logic server-side only.

The MVP upload portal uses a server action plus `SUPABASE_SERVICE_ROLE_KEY` to write validated student uploads into the private `students-documents` bucket. Keep that key only in server environment variables such as `.env.local`; it must never be imported into client components.
