import type { Metadata } from "next";
import Link from "next/link";

import { logoutAction } from "@/lib/actions/auth";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Operations workspace for study-abroad and immigration consultants."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <nav className="app-nav">
          <Link className="brand nav-brand" href="/">
            {APP_NAME}
          </Link>
          <div className="nav-links">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/students">Students</Link>
          <Link href="/students/new">New student</Link>
          <Link href="/login">Login</Link>
          <form action={logoutAction}>
            <button className="nav-button" type="submit">
              Logout
            </button>
          </form>
        </div>
      </nav>
        {children}
      </body>
    </html>
  );
}
