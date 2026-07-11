"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/layout/sidebar";

const publicPrefixes = [
  "/auth",
  "/login",
  "/signup",
  "/onboarding",
  "/invite",
  "/set-password",
  "/upload"
];

function isPublicRoute(pathname: string) {
  return (
    pathname === "/" ||
    publicPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  );
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/profile-role", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) {
          setRole(data?.role ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setRole(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (isPublicRoute(pathname)) {
    return children;
  }

  return (
    <div className="app-frame">
      <Sidebar pathname={pathname} role={role} />
      <div className="app-main">{children}</div>
    </div>
  );
}
