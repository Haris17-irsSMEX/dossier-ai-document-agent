import Link from "next/link";

import { generateUploadTokenAction } from "@/lib/actions/checklists";
import { getStudent } from "@/lib/actions/students";
import { formatDateTime } from "@/lib/date";

export default async function StudentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const student = await getStudent(id);
  const tabs = [
    ["Checklist", `/students/${id}/checklist`],
    ["Documents", `/students/${id}/documents`],
    ["Verification", `/students/${id}/verification`],
    ["Follow-up", `/students/${id}/follow-up`],
    ["Export", `/students/${id}/export`]
  ];

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <div className="topbar">
          <div>
            <h1>{student.full_name}</h1>
            <p className="muted">
              {student.target_country || student.destination_country} - {student.intake} - {student.program_level}
            </p>
          </div>
          <Link className="button secondary" href="/students">
            Back
          </Link>
        </div>
        {query.success ? <div className="alert success">{query.success}</div> : null}
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Next action</h2>
              <p>Review the generated checklist or create a secure upload link for the student.</p>
            </div>
            <div className="button-row">
              <Link className="button" href={`/students/${id}/checklist`}>
                View checklist
              </Link>
              <form action={generateUploadTokenAction}>
                <input type="hidden" name="student_id" value={id} />
                <button className="button secondary" type="submit">
                  Generate upload link
                </button>
              </form>
              <Link className="button secondary" href={`/students/${id}/export`}>
                Export packet
              </Link>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="tabs">
            {tabs.map(([label, href]) => (
              <Link className="button secondary" href={href} key={href}>
                {label}
              </Link>
            ))}
          </div>
        </section>
        <section className="metrics">
          <div className="metric">
            <strong>{student.phone || "-"}</strong>
            <span>Phone</span>
          </div>
          <div className="metric">
            <strong>{student.sponsor_type || "-"}</strong>
            <span>Sponsor</span>
          </div>
          <div className="metric">
            <strong>{formatDateTime(student.deadline_date) || student.deadline_date || "-"}</strong>
            <span>Deadline</span>
          </div>
        </section>
      </div>
    </main>
  );
}
