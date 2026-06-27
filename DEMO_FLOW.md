# ApplicationOps AI Demo Flow

1. Open `/login` and sign in, or create an account at `/signup`.
2. Complete `/onboarding` to create the agency workspace.
3. Open `/students/new` and create a student with phone and email.
4. Confirm the smart checklist is generated with the student.
5. Open the checklist builder and customize instructions, formats, upload type,
   parts, AI/expiry checks, and deadlines.
6. Generate an upload link and show the local link, mobile link, expiry, and QR.
7. Open Follow-up, generate an upload-link message, and send it through the
   Twilio WhatsApp Sandbox.
8. Send the optional Resend upload-link email when the student has an email.
9. Scan the QR on a phone and upload one document or CNIC side at a time.
10. Confirm the file remains saved even if Azure or DeepSeek is unavailable.
11. Open the consultant Documents page and review scan status and issues.
12. Open Verification and update a manual provider status/reference/notes.
13. Open Export, generate the ZIP, and inspect the summary PDF and documents.
14. Review WhatsApp/email history and Supabase `audit_logs` for the actions.

For HTTP LAN testing, the native `Take photo` fallback is expected. Use an
HTTPS deployment or tunnel to demonstrate the live `getUserMedia` scanner.
