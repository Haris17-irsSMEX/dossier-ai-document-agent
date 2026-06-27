import Link from "next/link";

import { StudentTable } from "@/components/students/student-table";
import { listStudents } from "@/lib/actions/students";

export default async function StudentsPage() {
  const students = await listStudents();

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <div className="topbar">
          <div>
            <h1>Students</h1>
            <p className="muted">Manage profiles, checklists, uploads, and follow-ups.</p>
          </div>
          <Link className="button" href="/students/new">
            Create student
          </Link>
        </div>
        <section className="panel">
          <StudentTable students={students} />
        </section>
      </div>
    </main>
  );
}
