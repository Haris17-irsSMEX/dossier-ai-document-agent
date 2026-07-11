import Link from "next/link";

import { StudentTable } from "@/components/students/student-table";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentProfile, listConsultants, listStudents } from "@/lib/actions/students";
import { isAgencyAdmin, isPlatformAdmin } from "@/lib/auth/roles";

export default async function StudentsPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const query = await searchParams;
  const [students, consultants, profile] = await Promise.all([
    listStudents(),
    listConsultants(),
    getCurrentProfile()
  ]);
  const canManageAssignments =
    Boolean(profile && (isAgencyAdmin(profile) || isPlatformAdmin(profile)));

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title="Students"
          subtitle="Manage student cases, document progress, and deadlines."
          actions={
            <Link className="button" href="/students/new">
              New student
            </Link>
          }
        />
        {query.success ? <div className="alert success">{query.success}</div> : null}
        {query.error ? <div className="alert error">{query.error}</div> : null}
        <section className="panel">
          <StudentTable
            canManageAssignments={canManageAssignments}
            consultants={consultants}
            students={students}
          />
        </section>
      </div>
    </main>
  );
}
