"use client";

import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";

const publicPrefixes = ["/login", "/signup", "/onboarding", "/upload"];

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

  if (isPublicRoute(pathname)) {
    return children;
  }

  return (
    <div className="app-frame">
      <Sidebar pathname={pathname} />
      <div className="app-main">{children}</div>
    </div>
  );
}
