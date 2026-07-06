import { formatDateTime } from "@/lib/date";
import { PageHeader } from "@/components/ui/page-header";
import { saveCommunicationSettingsAction } from "@/lib/actions/communication-settings";
import { requireProfileOrRedirect } from "@/lib/auth/require-profile";
import {
  getActiveGmailConnection,
  getCommunicationSettings
} from "@/lib/communication/settings";
import {
  getConfiguredWhatsAppProvider,
  isGoogleGmailConfigured,
  isTokenEncryptionConfigured
} from "@/lib/server-env";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const query = await searchParams;
  const profile = await requireProfileOrRedirect();
  let settingsError: string | null = null;
  let gmailError: string | null = null;
  let settings = null as Awaited<ReturnType<typeof getCommunicationSettings>> | null;
  let gmailConnection = null as Awaited<ReturnType<typeof getActiveGmailConnection>> | null;

  try {
    settings = await getCommunicationSettings();
  } catch (error) {
    settingsError =
      error instanceof Error
        ? error.message
        : "Communication settings are not ready yet.";
  }

  try {
    gmailConnection = await getActiveGmailConnection();
  } catch (error) {
    gmailError =
      error instanceof Error
        ? error.message
        : "Gmail connection status is not ready yet.";
  }

  const provider = getConfiguredWhatsAppProvider();
  const isGmailReady =
    isGoogleGmailConfigured() && isTokenEncryptionConfigured();

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          eyebrow="Settings"
          title="Communication Settings"
          subtitle="Set up manual WhatsApp handoff details for your counselor workflow."
        />

        {query.success ? <div className="alert success">{query.success}</div> : null}
        {query.error ? <div className="alert error">{query.error}</div> : null}
        {provider !== "manual_handoff" ? (
          <div className="alert info">
            <code>WHATSAPP_PROVIDER</code> is currently set to <code>{provider}</code>.
            Manual handoff settings are saved here, but the follow-up flow will
            use the active provider from the environment.
          </div>
        ) : null}
        {settingsError ? <div className="alert error">{settingsError}</div> : null}
        {gmailError ? <div className="alert error">{gmailError}</div> : null}

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Manual WhatsApp Handoff</h2>
              <p>
                Dossier opens WhatsApp with a ready message. You send it
                manually from your own WhatsApp account.
              </p>
            </div>
          </div>

          <div className="dashboard">
            <div className="panel compact">
              <span className="eyebrow">Status</span>
              <h2>
                {settings?.consultant_whatsapp_number
                  ? "Manual handoff ready"
                  : "Manual handoff not configured"}
              </h2>
              <p className="muted">
                {settings?.consultant_whatsapp_number
                  ? `Number: ${settings.consultant_whatsapp_number}`
                  : "Add your WhatsApp number to show your preferred sending identity."}
              </p>
              <p className="muted">No API key required.</p>
            </div>

            <div className="panel compact">
              <span className="eyebrow">Reminder</span>
              <h2>Use your own WhatsApp account</h2>
              <p className="muted">
                Make sure WhatsApp Web or your phone is logged in with this
                number before sending.
              </p>
              <p className="muted">
                Your consultant number is used for display, warnings, and the
                optional signature only. Student chat links always use the
                student&apos;s phone number.
              </p>
            </div>
          </div>

          <form action={saveCommunicationSettingsAction} className="section-stack">
            <div className="form-grid two">
              <label>
                Your WhatsApp number
                <input
                  defaultValue={settings?.consultant_whatsapp_number || ""}
                  name="consultant_whatsapp_number"
                  placeholder="+923001234567"
                />
              </label>
              <label>
                Display name / consultant name
                <input
                  defaultValue={
                    settings?.consultant_whatsapp_display_name ||
                    profile.full_name ||
                    ""
                  }
                  name="consultant_whatsapp_display_name"
                  placeholder="Your name"
                  required
                />
              </label>
            </div>

            <label>
              Message signature
              <textarea
                className="message-box"
                defaultValue={settings?.message_signature || ""}
                name="message_signature"
                placeholder="Kind regards,&#10;Hassan&#10;Dossier Consultants"
                rows={5}
              />
            </label>

            <div className="button-row">
              <button className="button" type="submit">
                Save WhatsApp settings
              </button>
            </div>
          </form>
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Gmail / Google Workspace</h2>
              <p>
                Send follow-up emails from your own Gmail or Google Workspace
                mailbox.
              </p>
            </div>
          </div>

          {!isGmailReady ? (
            <div className="alert info">
              Add <code>GOOGLE_CLIENT_ID</code>,{" "}
              <code>GOOGLE_CLIENT_SECRET</code>,{" "}
              <code>GOOGLE_GMAIL_REDIRECT_URI</code>, and{" "}
              <code>TOKEN_ENCRYPTION_KEY</code> to enable Gmail connection.
            </div>
          ) : null}

          <div className="dashboard">
            <div className="panel compact">
              <span className="eyebrow">Status</span>
              <h2>
                {gmailConnection
                  ? `Connected as: ${gmailConnection.email_address}`
                  : "Gmail not connected"}
              </h2>
              <p className="muted">
                Status:{" "}
                {gmailConnection?.status === "connected"
                  ? "Connected"
                  : "Not connected"}
              </p>
              <p className="muted">
                Last used:{" "}
                {formatDateTime(gmailConnection?.last_used_at) || "Not used yet"}
              </p>
            </div>

            <div className="panel compact">
              <span className="eyebrow">Permission scope</span>
              <h2>Send-only access</h2>
              <p className="muted">
                Dossier only asks permission to send email. It does not read
                your inbox.
              </p>
              <p className="muted">
                OAuth is connected to your counselor account only. Tokens stay
                encrypted on the server.
              </p>
            </div>
          </div>

          <div className="button-row">
            {isGmailReady ? (
              <a className="button" href="/api/integrations/google/gmail/start">
                {gmailConnection ? "Reconnect Gmail" : "Connect Gmail"}
              </a>
            ) : (
              <button className="button" disabled type="button">
                Connect Gmail
              </button>
            )}

            {gmailConnection ? (
              <form
                action="/api/integrations/google/gmail/disconnect"
                method="post"
              >
                <button className="button secondary" type="submit">
                  Disconnect
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
