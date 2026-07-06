# Dossier Demo Flow

1. Open `/login` and sign in, or create an account at `/signup`.
2. Complete `/onboarding` to create the agency workspace.
3. Open `/students/new` and create a student with phone and email.
4. Confirm the smart checklist is generated from country, level, education,
   sponsor type, intake, and deadline.
5. Open the phase-based checklist and review required, conditional, and
   optional requests across the consultant workflow.
6. Confirm inactive conditional and optional templates do not count as missing.
7. Activate one conditional item with `Request from student`, verify it enters
   the active workflow, then use `Mark as not needed` to remove it safely.
8. Add a custom document request inside a phase, then edit its instructions,
   visibility, formats, upload type, parts, AI/expiry checks, and deadline.
9. Generate an upload link and show the local link, mobile link, expiry, and QR.
10. Open Follow-up, generate an upload-link message, and send it through the
   Twilio WhatsApp Sandbox.
11. Send the optional Resend upload-link email when the student has an email.
12. Scan the QR on a phone and confirm only active requested documents appear
    in simple
    student-facing sections.
13. Upload one document or CNIC side at a time.
14. Confirm the file remains saved even if Azure or DeepSeek is unavailable.
15. Open the consultant Documents page and review scan status and issues.
16. Open Verification and update a manual provider status/reference/notes.
17. Open Export, generate the ZIP, and inspect the phase-grouped summary PDF
    and documents.
18. Review WhatsApp/email history and Supabase `audit_logs` for the actions.

Country-specific checklist templates are practical MVP guidance, not official
legal advice. Confirm current university, embassy, and immigration rules during
the demo.

For HTTP LAN testing, the native `Take photo` fallback is expected. Use an
HTTPS deployment or tunnel to demonstrate the live `getUserMedia` scanner.
