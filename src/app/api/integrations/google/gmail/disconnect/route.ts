import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/actions/audit";
import { getAuthProfileState } from "@/lib/auth/require-profile";
import { disconnectGmailConnection } from "@/lib/integrations/google/gmail-connection";
import { captureAppError } from "@/lib/monitoring/sentry";

function redirectWithMessage(
  request: Request,
  key: "error" | "success" | "message",
  message: string,
  status = 303,
  path = "/settings"
) {
  const url = new URL(path, request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, status);
}

export async function POST(request: Request) {
  const authState = await getAuthProfileState();

  if (authState.status === "signed_out") {
    return redirectWithMessage(
      request,
      "message",
      "Please sign in to continue.",
      303,
      "/login"
    );
  }

  if (authState.status === "needs_onboarding") {
    return redirectWithMessage(
      request,
      "message",
      "Create your agency workspace to continue.",
      303,
      "/onboarding"
    );
  }

  try {
    const connection = await disconnectGmailConnection(authState.profile);

    if (connection) {
      await createAuditLog({
        agencyId: authState.profile.agency_id,
        actorProfileId: authState.profile.id,
        tableName: "email_connections",
        recordId: connection.id,
        action: "email_connection_disconnected",
        oldData: {
          provider: "google",
          email_address: connection.email_address
        },
        newData: {
          status: connection.status,
          revoked_at: connection.revoked_at
        }
      });
    }

    revalidatePath("/settings");
    return redirectWithMessage(
      request,
      "success",
      connection
        ? "Gmail connection disconnected."
        : "No active Gmail connection was found."
    );
  } catch (error) {
    captureAppError(error, {
      module: "gmail_oauth",
      action: "gmail_disconnect",
      provider: "google",
      agencyId: authState.profile.agency_id
    });

    return redirectWithMessage(
      request,
      "error",
      error instanceof Error
        ? error.message
        : "Gmail could not be disconnected."
    );
  }
}
