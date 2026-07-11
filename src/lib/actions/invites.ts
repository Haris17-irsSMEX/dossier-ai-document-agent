"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { inviteRedirectUrl } from "@/lib/invites/urls";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const inviteTokenSchema = z.object({
  token: z.string().trim().min(16, "Invite token is missing.")
});

function inviteErrorPath(token: string, message: string): string {
  return `/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`;
}

export async function acceptCounselorInviteAction(formData: FormData) {
  const parsed = inviteTokenSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/login?error=Invite link is invalid.");
  }

  const token = parsed.data.token;
  const supabase = createSupabaseAdminClient();
  const { data: invite, error } = await supabase
    .from("counselor_invites")
    .select("id, agency_id, profile_id, email, role, status, expires_at")
    .eq("public_token", token)
    .maybeSingle();

  if (error || !invite) {
    redirect(inviteErrorPath(token, "Invite link not found."));
  }

  if (invite.status === "accepted") {
    redirect(inviteErrorPath(token, "Invite already accepted. Go to sign in."));
  }

  if (invite.status === "revoked") {
    redirect(inviteErrorPath(token, "Invite link is no longer active."));
  }

  if (
    invite.status === "expired" ||
    new Date(invite.expires_at).getTime() <= Date.now()
  ) {
    await supabase
      .from("counselor_invites")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", invite.id);
    redirect(
      inviteErrorPath(
        token,
        "Invite link expired. Ask your senior counselor to generate a new invite link."
      )
    );
  }

  let generated = await supabase.auth.admin.generateLink({
    type: "invite",
    email: invite.email,
    options: {
      data: {
        agency_id: invite.agency_id,
        role: invite.role
      },
      redirectTo: inviteRedirectUrl()
    }
  });

  if (generated.error || !generated.data.properties?.action_link) {
    generated = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: invite.email,
      options: {
        redirectTo: inviteRedirectUrl()
      }
    });
  }

  if (generated.error || !generated.data.properties?.action_link) {
    captureAppError(generated.error || new Error("Missing Supabase invite action link."), {
      module: "invites",
      action: "accept_counselor_invite",
      agencyId: invite.agency_id,
      extra: {
        profileId: invite.profile_id
      }
    });
    redirect(
      inviteErrorPath(
        token,
        "Could not start invite acceptance. Ask your senior counselor to generate a new invite link."
      )
    );
  }

  redirect(generated.data.properties.action_link);
}
