import Link from "next/link";

import { StudentForm } from "@/components/students/student-form";
import { PageHeader } from "@/components/ui/page-header";
import { listConsultants } from "@/lib/actions/students";

export default async function NewStudentPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const consultants = await listConsultants();
  const params = await searchParams;

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title="Create student case"
          subtitle="Start a smart document workflow for a new applicant."
          actions={
            <Link className="button secondary" href="/students">
              Back to students
            </Link>
          }
        />
        <section className="panel">
          <StudentForm consultants={consultants} error={params.error} />
        </section>
      </div>
    </main>
  );
}
