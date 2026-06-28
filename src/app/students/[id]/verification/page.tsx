import Link from "next/link";

import { VerificationCenter } from "@/components/verification/verification-center";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getStudent } from "@/lib/actions/students";
import { getVerificationCenter } from "@/lib/actions/verification";

export default async function StudentVerificationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [student, center] = await Promise.all([getStudent(id), getVerificationCenter(id)]);

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title={student.full_name}
          subtitle="Official verification tracking."
          actions={
            <Link className="button secondary" href={`/students/${id}`}>
              Student profile
            </Link>
          }
        />
        <StudentTabs active="verification" studentId={id} />
        <VerificationCenter studentId={id} providers={center.providers} requests={center.requests} />
      </div>
    </main>
  );
}
