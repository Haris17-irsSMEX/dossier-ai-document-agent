import { buildAbsoluteAppUrl, getPublicAppUrl } from "@/lib/config/app-url";

export function inviteRedirectUrl() {
  return `${getPublicAppUrl()}/auth/callback?next=/set-password`;
}

export function dossierInviteUrl(publicToken: string) {
  return buildAbsoluteAppUrl(`/invite/${encodeURIComponent(publicToken)}`);
}
