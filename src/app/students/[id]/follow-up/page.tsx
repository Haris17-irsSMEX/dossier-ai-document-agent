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

function ItemList({
  title,
  items,
  empty
}: {
  title: string;
  items: Array<{ id?: string; document_name?: string; status?: string; instructions?: string | null; accepted_formats?: string[] | null }>;
  empty: string;
}) {
  return (
    <section className="panel compact">
      <h2>{title}</h2>
      {items.length ? (
        <div className="list">
          {items.map((item) => (
            <div className="list-item" key={item.id || item.document_name}>
              <div>
                <strong>{item.document_name}</strong>
                <span>{item.instructions || "No consultant instructions."}</span>
              </div>
              <span className="chip warning">
                {(item.status || "needs_review").replaceAll("_", " ")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <strong>{empty}</strong>
        </div>
      )}
    </section>
  );
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
  const verificationRequired = data.verificationRequests.filter((request) =>
    ["required", "pending", "failed", "suspicious", "manual_review", "api_not_connected"].includes(
      request.status
    )
  );

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
        <section className="metrics">
          <div className="metric">
            <strong>{data.student.phone || "-"}</strong>
            <span>Student phone</span>
          </div>
          <div className="metric">
            <strong>
              {data.latestUploadToken
                ? formatDateTime(data.latestUploadToken.expires_at) || "Active"
                : "No active link"}
            </strong>
            <span>Upload link expiry</span>
          </div>
          <div className="metric">
            <strong>
              {whatsappProvider === "manual_handoff"
                ? data.manualHandoffs.length
                : data.messages.length}
            </strong>
            <span>
              {whatsappProvider === "manual_handoff"
                ? "WhatsApp handoffs"
                : "WhatsApp messages"}
            </span>
          </div>
        </section>
        <div className="dashboard">
          <ItemList
            title="Missing documents"
            items={data.buckets.missing}
            empty="No missing documents."
          />
          <ItemList
            title="Wrong, blurry, or needs review"
            items={data.buckets.problem}
            empty="No problem documents."
          />
        </div>
        <section className="panel compact">
          <h2>Verification required</h2>
          {verificationRequired.length ? (
            <div className="list">
              {verificationRequired.map((request) => (
                <div className="list-item" key={request.id}>
                  <div>
                    <strong>{request.provider?.name || "Manual verification"}</strong>
                    <span>{request.instructions || "Tracked manually. API not connected."}</span>
                  </div>
                  <span className="chip warning">{request.status.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty">
              <strong>No verification reminders needed.</strong>
            </div>
          )}
        </section>
        <FollowUpMessageGenerator
          gmailConnectedEmail={gmailConnection?.email_address || null}
          hasActiveUploadToken={Boolean(data.latestUploadToken)}
          initialBody={initialBody}
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
