"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAuditLog } from "@/lib/actions/audit";
import { captureAppError } from "@/lib/monitoring/sentry";

const onboardingSchema = z.object({
  agency_name: z.string().trim().min(2, "Agency name is required."),
  owner_name: z.string().trim().min(2, "Owner name is required."),
  phone: z.string().trim().optional()
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function emptyToNull(value?: string) {
  return value?.trim() ? value.trim() : null;
}

export async function createAgencyWorkspaceAction(formData: FormData) {
  const sessionSupabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await sessionSupabase.auth.getUser();

  if (!user) {
    redirect("/login?message=Please%20sign%20in%20to%20continue.");
  }

  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Invalid workspace details.")}`);
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: existingProfile, error: existingProfileError } = await adminSupabase
    .from("profiles")
    .select("id, agency_id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    captureAppError(existingProfileError, {
      module: "onboarding",
      action: "profile_lookup"
    });
    redirect(`/onboarding?error=${encodeURIComponent(existingProfileError.message)}`);
  }

  if (existingProfile?.agency_id) {
    redirect("/dashboard");
  }

  const slugBase = slugify(parsed.data.agency_name) || "agency";
  const { data: agency, error: agencyError } = await adminSupabase
    .from("agencies")
    .insert({
      name: parsed.data.agency_name,
      slug: `${slugBase}-${user.id.slice(0, 8)}`,
      created_by: user.id
    })
    .select("id")
    .single();

  if (agencyError) {
    captureAppError(agencyError, {
      module: "onboarding",
      action: "agency_create"
    });
    redirect(`/onboarding?error=${encodeURIComponent(agencyError.message)}`);
  }

  const { error: profileError } = await adminSupabase.from("profiles").upsert({
    id: user.id,
    agency_id: agency.id,
    full_name: parsed.data.owner_name,
    email: user.email,
    phone: emptyToNull(parsed.data.phone),
    role: "owner"
  });

  if (profileError) {
    captureAppError(profileError, {
      module: "onboarding",
      action: "profile_create",
      agencyId: agency.id
    });
    redirect(`/onboarding?error=${encodeURIComponent(profileError.message)}`);
  }

  await Promise.all([
    createAuditLog({
      agencyId: agency.id,
      actorProfileId: user.id,
      tableName: "agencies",
      recordId: agency.id,
      action: "agency_created",
      newData: { name: parsed.data.agency_name }
    }),
    createAuditLog({
      agencyId: agency.id,
      actorProfileId: user.id,
      tableName: "profiles",
      recordId: user.id,
      action: "profile_created",
      newData: {
        full_name: parsed.data.owner_name,
        email: user.email,
        role: "owner"
      }
    })
  ]);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
