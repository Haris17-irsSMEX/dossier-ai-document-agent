"use client";

import { useState } from "react";

export function CopyInviteLink({
  inviteLink,
  label = "Copy invite link"
}: {
  inviteLink: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[invite-link] copy failed", error);
      setCopied(false);
    }
  }

  return (
    <button className="button secondary compact-button" type="button" onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  );
}
