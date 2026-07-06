import { formatDateTime } from "@/lib/date";
import type { WhatsAppHandoff, WhatsAppProvider } from "@/lib/types";

type TwilioMessageHistoryItem = {
  id: string;
  body: string;
  status: string;
  message_type?: string | null;
  to_phone?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  created_at?: string | null;
};

function preview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

export function MessageHistory({
  provider,
  messages,
  handoffs
}: {
  provider: WhatsAppProvider;
  messages: TwilioMessageHistoryItem[];
  handoffs: WhatsAppHandoff[];
}) {
  const isManual = provider === "manual_handoff";

  return (
    <section className="panel">
      <h2>{isManual ? "WhatsApp handoff history" : "Message history"}</h2>
      {isManual ? (
        handoffs.length ? (
          <div className="list">
            {handoffs.map((handoff) => (
              <div className="list-item message-history-item" key={handoff.id}>
                <div>
                  <strong>
                    {handoff.status === "sent_manually"
                      ? "Sent manually"
                      : handoff.status === "handoff_opened"
                        ? "Opened"
                        : handoff.status.replaceAll("_", " ")}
                  </strong>
                  <span>To: {handoff.to_number}</span>
                  <span>{preview(handoff.message_body)}</span>
                  {handoff.error_message ? (
                    <span className="inline-error">{handoff.error_message}</span>
                  ) : null}
                </div>
                <span>
                  {formatDateTime(handoff.marked_sent_at || handoff.opened_at) ||
                    handoff.marked_sent_at ||
                    handoff.opened_at ||
                    "-"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No WhatsApp handoffs yet</strong>
            <p>Open the student chat in WhatsApp and send the message manually when ready.</p>
          </div>
        )
      ) : messages.length ? (
        <div className="list">
          {messages.map((message) => (
            <div className="list-item message-history-item" key={message.id}>
              <div>
                <strong>
                  {message.message_type?.replaceAll("_", " ") || "WhatsApp"} -{" "}
                  {message.status}
                </strong>
                <span>{message.body}</span>
                {message.to_phone ? <span>To: {message.to_phone}</span> : null}
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
