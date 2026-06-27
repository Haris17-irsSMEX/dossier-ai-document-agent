# ApplicationOps AI Supabase Schema

This folder contains the database foundation for the ApplicationOps AI MVP.

## Migration Order

Run the migrations in this order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_mvp_workflow_support.sql`
4. `supabase/migrations/004_core_mvp_status_fix.sql`

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

For `multi_part` items, create rows in `document_parts`. Example: Passport has Bio Data Page and optional Additional Visa Pages; CNIC has Front Side and Back Side.

Uploaded files are stored in `documents`. Validation output goes into `document_extractions` and `document_issues`. Secure upload links are represented by hashed `upload_tokens`; the raw token should only be shown to the student once and never stored directly.

Verification workflow is manual/RLS-ready. `verification_providers` seeds NADRA, IBCC, HEC, Board, University, Bank, and Manual provider rows, but the schema does not call any real NADRA, IBCC, HEC, bank, or university APIs.

WhatsApp delivery history is stored in `whatsapp_messages` with Twilio-ready fields: `to_phone`, `from_phone`, `body`, `provider`, `provider_message_id`, `status`, `error_message`, `sent_at`, and `created_at`.

Exports are tracked in `export_packets`, and application events can be recorded in `audit_logs`.

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
