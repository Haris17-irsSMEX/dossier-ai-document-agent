# Dossier

AI Document Agent for study-abroad and immigration document operations.

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill the core Supabase values.
3. Run the Supabase migrations in order.
4. Create a private Supabase Storage bucket named `students-documents`.
5. Start the app with `npm run dev`.

The dev script uses `next dev -H 0.0.0.0`, so localhost and same-Wi-Fi
mobile testing both work.

## Environment

Core:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_MOBILE_APP_URL=http://YOUR_LAPTOP_IP:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional integrations fail gracefully when omitted:

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=
AZURE_DOCUMENT_INTELLIGENCE_KEY=

WHATSAPP_PROVIDER=manual_handoff

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/google/gmail/callback
TOKEN_ENCRYPTION_KEY=

# Only needed when you want Twilio WhatsApp sending instead of manual handoff.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

RESEND_API_KEY=
RESEND_FROM_EMAIL=

TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_REF=

NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_UPLOAD_SOURCEMAPS=false
```

Only `NEXT_PUBLIC_*` values are available to client components. Service-role,
AI, OCR, Twilio, Resend, Trigger.dev, and Sentry auth tokens stay server-side.

## Supabase

Run these migrations in order:

1. `001_initial_schema.sql`
2. `002_rls_policies.sql`
3. `003_mvp_workflow_support.sql`
4. `004_core_mvp_status_fix.sql`
5. `005_onboarding_bootstrap_fix.sql`
6. `006_document_scan_support.sql`
7. `009_email_messages_and_audit_support.sql`
8. `010_students_archive_support.sql`
9. `011_phase_based_checklist_support.sql`
10. `012_checklist_request_logic.sql`
11. `013_communication_connections.sql`

Migration `009` adds `email_messages`, its agency-isolation RLS policies,
indexes, and document scan summary columns. It ends by reloading the PostgREST
schema cache. Migration `010` adds safe student archiving. Migration `011`
adds phase, ordering, requirement-level, visibility, custom-request, and
request-archive metadata to `checklist_items`. Migration `012` separates active
student requests from conditional, optional, and future-stage suggestions and
adds the student case-stage field.

The Storage bucket must be exactly `students-documents` and must remain private.
Uploads and downloads use the server-side Supabase admin client.

## Phase-Based Dossiers

Smart checklists are organized into ten consultant workflow phases, from
Profile & Academic File through Pre-Departure. Generation selects a practical
base from the student's country, program level, education background, sponsor
type, intake, and deadline. Requests are marked required, conditional, or
optional rather than treating every possible document as mandatory.

Counselors can add a custom document request inside any phase, edit generated
requests, control student visibility, configure multipart uploads, and archive
a request without deleting its uploaded files. The public upload portal shows
only visible, active requests under simpler student-facing section labels.

Required profile and sponsor documents are requested immediately. Conditional,
optional, admission, visa, verification, country-specific, and pre-departure
templates remain available to the counselor without counting as missing.
`Request from student` activates one of these items; `Mark as not needed`
removes it from completion counts and the upload portal without deleting any
existing upload.

## Communication Foundation

Manual WhatsApp handoff is the zero-cost fallback mode. Set:

```env
WHATSAPP_PROVIDER=manual_handoff
```

In this mode, no WhatsApp API keys are required. Dossier stores consultant
communication preferences, manual handoff logs, and future Gmail connection
metadata without changing the existing Twilio flow.

Gmail / Google Workspace support now includes consultant-owned OAuth connect,
callback, encrypted token storage, status display, reconnect, and disconnect.
Tokens are stored encrypted server-side using `TOKEN_ENCRYPTION_KEY`, and the
database uses `email_connections` plus `communication_settings` for
consultant-owned communication.

Dossier requests only these Google scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.send`

Inbox-reading scopes are not requested. Actual Gmail sending is still not
implemented in this pass.

When you are ready to wire Google OAuth, set:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/google/gmail/callback
TOKEN_ENCRYPTION_KEY=
```

`TOKEN_ENCRYPTION_KEY` must be a 64-character hex string, for example from:

```text
crypto.randomBytes(32).toString("hex")
```

Country-specific rules are practical MVP workflow templates. They are not
official legal advice, and counselors should confirm current institution,
embassy, and immigration requirements before relying on them.

## DeepSeek

Set the four DeepSeek variables above. The OpenAI npm package is used only as
an OpenAI-compatible client pointed at `DEEPSEEK_BASE_URL`. If DeepSeek is
unavailable, follow-up text uses deterministic templates and document scans
fall back to counselor review.

## Azure OCR

Create an Azure Document Intelligence resource and set its endpoint and key.
Uploaded documents use the `prebuilt-read` model. If Azure is missing or fails,
the upload remains saved and the document is marked `scan_failed` or
`needs_review`.

## Twilio Sandbox

Use `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` for the Twilio Sandbox. Each
test recipient must join the sandbox using the code shown in the Twilio
Console. The app records both sent and failed attempts and enforces a
30-second per-student/message-type cooldown. Keep
`WHATSAPP_PROVIDER=twilio` only when you want the live Twilio sandbox flow.

Delivery webhooks are not implemented yet, so `delivered` is not updated from
Twilio callbacks.

## Resend

Verify the sender/domain in Resend, then set `RESEND_API_KEY` and
`RESEND_FROM_EMAIL`. The student follow-up page exposes email as an optional
fallback and stores each result in `email_messages`. Missing configuration
shows `Email provider not configured` without crashing the page.

## Trigger.dev

Create a Trigger.dev project, set `TRIGGER_SECRET_KEY` and its project ref, then
run:

```text
npx trigger.dev@latest dev
```

Task foundations live in `src/trigger/jobs`:

- `document_scan`
- `ai_document_check`
- `whatsapp_followup_send`
- `email_followup_send`
- `export_packet_generate`
- `deadline_reminder_check`

Current synchronous upload, messaging, and export paths remain active. Tasks
provide a safe migration path to background execution with validation,
cooldowns, audit logging, and Sentry capture.

## Sentry

Set `NEXT_PUBLIC_SENTRY_DSN` to enable client, server, and edge capture. Set the
org, project, and auth token only for production source-map uploads, and set
`SENTRY_UPLOAD_SOURCEMAPS=true` in that build environment. Missing Sentry
configuration does not affect local development. Error context redacts tokens,
signed URLs, phone fields, and document text.

## Mobile Upload Testing

For laptop testing:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For a phone on the same Wi-Fi:

```env
NEXT_PUBLIC_MOBILE_APP_URL=http://YOUR_LAPTOP_IP:3000
NEXT_PUBLIC_APP_URL=http://192.168.1.105:3000
```

Generate an upload QR, scan it from the phone, and use `Take photo`. Live
`getUserMedia` camera scanning requires HTTPS on mobile. An HTTP LAN address
automatically uses the native camera/file-input fallback, which can still
preview, upload, scan, and advance through CNIC front/back.

For real demos, use a public HTTPS base URL:

```env
NEXT_PUBLIC_APP_URL=https://your-public-domain.com
APP_BASE_URL=https://your-public-domain.com
```

For temporary external testing, use ngrok or Cloudflare Tunnel so upload links
open outside your local network.

## Export Testing

Open `/students/[id]/export`, choose the packet options, and generate the ZIP.
The packet contains the summary PDF, eligible private documents, optional
verification/scan reports, and `Missing_Files_Report.json` when a storage file
cannot be downloaded. One unavailable file does not stop the remaining export.

## Demo Seed

The optional seed is explicitly development-only. Set `DEMO_OWNER_EMAIL` to an
existing Supabase Auth user that may own the demo workspace, run migration
`009`, then run `npm run seed:demo`.

It creates or reuses one demo agency, two demo consultant users, three
students, mixed checklist states, verification samples, a scan issue, and
sample WhatsApp/email history. It never runs automatically.

## Vercel Checklist

1. Add all core Supabase variables to the Vercel project.
2. Add only the optional provider variables you intend to enable.
3. Set `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_MOBILE_APP_URL` to the HTTPS
   deployment URL.
4. Run all Supabase migrations and verify the private Storage bucket.
5. Configure Supabase Auth redirect URLs for the deployment.
6. Verify the Resend sender and Twilio Sandbox recipients.
7. Set Sentry source-map variables for production builds if desired.
8. Deploy Trigger.dev tasks separately when background execution is enabled.
9. Run `npm run typecheck`, `npm run lint`, and `npm run build`.

## Known Limitations

- Twilio Sandbox sender only; agency-owned WhatsApp onboarding is not built.
- Twilio delivery-status webhooks are not built.
- Real NADRA, IBCC, and HEC integrations are not built.
- Trigger.dev jobs are a foundation; synchronous flows remain the default.
- Full UI/UX redesign is pending.
- Mobile live camera requires HTTPS; HTTP LAN testing uses native capture.
