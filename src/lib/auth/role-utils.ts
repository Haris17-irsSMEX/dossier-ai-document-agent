export type AppRole = "platform_admin" | "agency_admin" | "counselor";

export function normalizeRole(role?: string | null): AppRole {
  if (role === "platform_admin") {
    return "platform_admin";
  }

  if (
    role === "agency_admin" ||
    role === "agency_owner" ||
    role === "owner" ||
    role === "admin"
  ) {
    return "agency_admin";
  }

  return "counselor";
}

export function getRoleLandingPath(role?: string | null) {
  return normalizeRole(role) === "platform_admin" ? "/admin" : "/dashboard";
}

export function getRoleContext(role?: string | null) {
  const normalized = normalizeRole(role);

  if (normalized === "platform_admin") {
    return {
      label: "Platform admin",
      detail: "Dossier control"
    };
  }

  if (normalized === "agency_admin") {
    return {
      label: "Senior counselor",
      detail: "Agency workspace"
    };
  }

  return {
    label: "Counselor",
    detail: "Assigned students"
  };
}
