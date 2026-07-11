import Link from "next/link";

import { ChecklistView } from "@/components/checklists/checklist-view";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { listChecklistItems } from "@/lib/actions/checklists";
import { getStudent } from "@/lib/actions/students";

export default async function StudentChecklistPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    uploadToken?: string;
    uploadExpiresAt?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [student, items] = await Promise.all([getStudent(id), listChecklistItems(id)]);

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title={student.full_name}
          subtitle="Select the documents you want to collect from this student."
          actions={
            <Link className="button secondary" href={`/students/${id}`}>
              Student profile
            </Link>
          }
        />
        <StudentTabs active="checklist" studentId={id} />
        <ChecklistView
          studentId={id}
          items={items}
          success={query.success}
          error={query.error}
          caseStage={student.case_stage}
        />
      </div>
    </main>
  );
}
