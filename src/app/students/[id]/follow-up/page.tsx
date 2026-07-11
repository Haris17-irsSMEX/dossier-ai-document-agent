import Link from "next/link";

import { FollowUpMessageGenerator } from "@/components/follow-up/follow-up-message-generator";
import { MessageHistory } from "@/components/follow-up/message-history";
import { EmailHistory } from "@/components/follow-up/email-history";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getFollowUpPageData } from "@/lib/actions/whatsapp-messages";
import { buildDeterministicFollowUpMessage } from "@/lib/ai/follow-up-message";
import { generateFollowUpEmailDraftAction } from "@/lib/actions/email-messages";
import { getConnectedGmailConnectionForCurrentUser } from "@/lib/integrations/google/gmail-connection";
import { formatDateTime } from "@/lib/date";

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default async function StudentFollowUpPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, gmailConnection, initialEmailDraft] = await Promise.all([
    getFollowUpPageData(id),
    getConnectedGmailConnectionForCurrentUser().catch(() => null),
    generateFollowUpEmailDraftAction({
      studentId: id,
      messageType: "upload_link",
      uploadLink: ""
    }).catch(() => ({ ok: false as const }))
  ]);
  const initialBody = buildDeterministicFollowUpMessage({
    studentName: data.student.full_name,
    studentPhone: data.student.phone,
    targetCountry: data.student.target_country || data.student.destination_country,
    messageType: "upload_link",
    consultantName:
      data.communicationSettings.consultantWhatsAppDisplayName ||
      data.profile.full_name,
    agencyName: data.agency?.name || null,
    deadline: data.student.deadline_date || null,
    signature: data.communicationSettings.messageSignature || null,
    checklistItems: data.checklistItems,
    verificationRequests: data.verificationRequests
  });
  const whatsappProvider = data.whatsappProvider;
  const uploadExpiryLabel = data.latestUploadToken?.expires_at
    ? formatDateTime(data.latestUploadToken.expires_at)
    : null;
  const uploadStatus = !data.latestUploadToken
    ? {
        tone: "archived" as const,
        label: "Not generated yet",
        detail: null
      }
    : {
        tone: "success" as const,
        label: "Ready",
        detail: uploadExpiryLabel ? `Expires ${uploadExpiryLabel}` : null
      };
  const whatsappCount =
    whatsappProvider === "manual_handoff"
      ? data.manualHandoffs.length
      : data.messages.length;

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title={data.student.full_name}
          subtitle="Send upload links and document reminders."
          actions={
            <Link className="button secondary" href={`/students/${id}`}>
              Student profile
            </Link>
          }
        />
        <StudentTabs active="follow-up" studentId={id} />
        <section className="panel reminder-setup-bar" aria-label="Reminder setup">
          <div className="reminder-setup-heading">
            <h2>Reminder setup</h2>
          </div>
          <div className="reminder-setup-grid">
            <div className="reminder-setup-item">
              <span className="reminder-setup-label">Student</span>
              <div className="reminder-setup-contact">
                <strong>{data.student.phone || "No phone added"}</strong>
                <span>{data.student.email || "No email added"}</span>
              </div>
            </div>
            <div className="reminder-setup-item">
              <span className="reminder-setup-label">Upload link</span>
              <div className="reminder-setup-value">
                <span className={`chip ${uploadStatus.tone}`}>
                  {uploadStatus.label}
                </span>
                {uploadStatus.detail ? <strong>{uploadStatus.detail}</strong> : null}
              </div>
            </div>
            <div className="reminder-setup-item">
              <span className="reminder-setup-label">WhatsApp</span>
              <div className="reminder-setup-value">
                <span className="chip archived">
                  {formatCount(whatsappCount, "handoff", "handoffs")}
                </span>
              </div>
            </div>
            <div className="reminder-setup-item">
              <span className="reminder-setup-label">Email</span>
              <div className="reminder-setup-value">
                <span className="chip archived">
                  {formatCount(data.emailMessages.length, "sent", "sent")}
                </span>
              </div>
            </div>
          </div>
        </section>
        <FollowUpMessageGenerator
          gmailConnectedEmail={gmailConnection?.email_address || null}
          hasActiveUploadToken={Boolean(data.latestUploadToken)}
          initialBody={initialBody}
          initialUploadExpiresAt={data.latestUploadToken?.expires_at || null}
          initialUploadLink={null}
          initialEmailSubject={
            initialEmailDraft.ok ? initialEmailDraft.subject : ""
          }
          initialEmailBody={initialEmailDraft.ok ? initialEmailDraft.body : ""}
          consultantDisplayName={
            data.communicationSettings.consultantWhatsAppDisplayName ||
            data.profile.full_name
          }
          consultantWhatsAppNumber={
            data.communicationSettings.consultantWhatsAppNumber
          }
          communicationSettingsError={data.communicationSettingsError}
          studentEmail={data.student.email}
          studentId={id}
          studentPhone={data.student.phone}
          latestManualHandoffId={data.manualHandoffs[0]?.id || null}
          whatsappProvider={whatsappProvider}
        />
        <MessageHistory
          handoffs={data.manualHandoffs}
          messages={data.messages}
          provider={whatsappProvider}
        />
        <EmailHistory
          available={data.emailMessagesAvailable}
          messages={data.emailMessages}
        />
      </div>
    </main>
  );
}
