import { formatDateTime } from "@/lib/date";

type EmailHistoryItem = {
  id: string;
  subject: string;
  status: string;
  message_type?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  from_email?: string | null;
  to_email?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
};

export function EmailHistory({
  messages,
  available
}: {
  messages: EmailHistoryItem[];
  available: boolean;
}) {
  return (
    <section className="panel">
      <h2>Email history</h2>
      {!available ? (
        <div className="empty-state">
          <strong>Email history is not ready</strong>
          <p>Run Supabase migration 009 to enable email activity.</p>
        </div>
      ) : messages.length ? (
        <div className="list">
          {messages.map((message) => (
            <div className="list-item message-history-item" key={message.id}>
              <div>
                <strong>{message.subject}</strong>
                <span>{message.status.replaceAll("_", " ")}</span>
                <span>
                  From {message.from_email || "-"} to {message.to_email || "-"}
                </span>
                <span>{message.message_type?.replaceAll("_", " ") || "Email"}</span>
                {message.error_message ? (
                  <span className="inline-error">{message.error_message}</span>
                ) : null}
              </div>
              <span>
                {formatDateTime(message.sent_at || message.created_at) ||
                  message.sent_at ||
                  message.created_at ||
                  "-"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No emails sent yet</strong>
          <p>Use email as an optional fallback when the student has an address.</p>
        </div>
      )}
    </section>
  );
}
