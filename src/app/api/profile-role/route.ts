import { NextResponse } from "next/server";

import { getCurrentProfile, normalizeRole } from "@/lib/auth/roles";

export async function GET() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ role: null });
  }

  return NextResponse.json({
    role: normalizeRole(profile.role),
    profileId: profile.id,
    agencyId: profile.agency_id
  });
}
