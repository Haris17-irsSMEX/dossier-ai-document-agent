import Link from "next/link";

import { StudentForm } from "@/components/students/student-form";
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
        <div className="topbar">
          <div>
            <h1>Create student</h1>
            <p className="muted">Start a smart document workflow.</p>
          </div>
          <Link className="button secondary" href="/students">
            Back to students
          </Link>
        </div>
        <section className="panel">
          <StudentForm consultants={consultants} error={params.error} />
        </section>
      </div>
    </main>
  );
}
