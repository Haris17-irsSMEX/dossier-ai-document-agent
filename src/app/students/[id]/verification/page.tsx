import Link from "next/link";

import { VerificationCenter } from "@/components/verification/verification-center";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getVerificationCenter } from "@/lib/actions/verification";

export default async function StudentVerificationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workflows = await getVerificationCenter(id);

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title="Verification tracker"
          subtitle="Track NADRA, Board, IBCC, HEC, and MOFA verification manually. Dossier stores reference numbers, notes, status, and proof."
          actions={
            <Link className="button secondary" href={`/students/${id}`}>
              Student profile
            </Link>
          }
        />
        <StudentTabs active="verification" studentId={id} />
        <VerificationCenter studentId={id} workflows={workflows} />
      </div>
    </main>
  );
}
