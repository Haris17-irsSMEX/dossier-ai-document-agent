import { formatDateTime } from "@/lib/date";

type MessageHistoryItem = {
  id: string;
  body: string;
  status: string;
  message_type?: string | null;
  to_phone?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  created_at?: string | null;
};

export function MessageHistory({ messages }: { messages: MessageHistoryItem[] }) {
  return (
    <section className="panel">
      <h2>Message history</h2>
      {messages.length ? (
        <div className="list">
          {messages.map((message) => (
            <div className="list-item message-history-item" key={message.id}>
              <div>
                <strong>
                  {message.message_type?.replaceAll("_", " ") || "WhatsApp"} -{" "}
                  {message.status}
                </strong>
                <span>{message.body}</span>
                {message.error_message ? (
                  <span className="inline-error">{message.error_message}</span>
                ) : null}
                {message.provider_message_id ? (
                  <span>Twilio ID: {message.provider_message_id}</span>
                ) : null}
              </div>
              <span>{formatDateTime(message.created_at) || message.created_at || "-"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No WhatsApp messages yet</strong>
          <p>Generate a draft and send it when ready.</p>
        </div>
      )}
    </section>
  );
}
