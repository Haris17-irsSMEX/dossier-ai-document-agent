"use client";

import {
  FileCheck2,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Settings2,
  UserPlus,
  Users
} from "lucide-react";
import Link from "next/link";

import { logoutAction } from "@/lib/actions/auth";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

const navigation = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true
  },
  { href: "/students", label: "Students", icon: Users, exact: false },
  {
    href: "/students/new",
    label: "New student",
    icon: UserPlus,
    exact: true
  },
  { href: "/settings", label: "Settings", icon: Settings2, exact: true }
];

function isActive(
  pathname: string,
  item: (typeof navigation)[number]
) {
  if (item.href === "/students" && pathname === "/students/new") {
    return false;
  }

  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="sidebar">
      <Link className="sidebar-brand" href="/dashboard">
        <span className="sidebar-brand-mark">
          <FileCheck2 aria-hidden="true" size={18} strokeWidth={2} />
        </span>
        <span>
          <strong>{APP_NAME}</strong>
          <small>{APP_TAGLINE}</small>
        </span>
      </Link>

      <nav className="sidebar-nav" aria-label="Workspace navigation">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              className={isActive(pathname, item) ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-help" aria-disabled="true">
          <HelpCircle aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>Help & information</span>
        </div>
        <div className="sidebar-workspace-label">
          <span>Consultant workspace</span>
          <small>Document operations</small>
        </div>
        <form action={logoutAction}>
          <button className="sidebar-logout" type="submit">
            <LogOut aria-hidden="true" size={18} strokeWidth={1.8} />
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}
