"use client";

import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SetPasswordSessionCheck() {
  const [message, setMessage] = useState(
    "Checking your invite session…"
  );

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (user) {
        window.location.replace("/set-password");
        return;
      }

      setMessage(
        "Invite session expired. Ask your senior counselor to regenerate the invite link."
      );
    }

    checkSession().catch(() => {
      if (active) {
        setMessage(
          "Invite session expired. Ask your senior counselor to regenerate the invite link."
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return <div className="alert error">{message}</div>;
}
