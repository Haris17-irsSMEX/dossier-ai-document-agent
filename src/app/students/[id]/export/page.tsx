import Link from "next/link";

import { ExportPacketButton } from "@/components/export/export-packet-button";
import { ExportStatusReport } from "@/components/export/export-status-report";
import { ExportSummary } from "@/components/export/export-summary";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getStudentExportPreview } from "@/lib/actions/export-packets";

export default async function StudentExportPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const preview = await getStudentExportPreview(id);

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title="Export packet"
          subtitle={`Build a clean ZIP for ${preview.student.full_name}'s application file.`}
          actions={
            <div className="button-row">
            <Link className="button secondary" href={`/students/${id}/documents`}>
              Documents
            </Link>
            <Link className="button secondary" href={`/students/${id}`}>
              Student profile
            </Link>
            </div>
          }
        />
        <StudentTabs active="export" studentId={id} />
        <ExportSummary preview={preview} />
        <ExportStatusReport preview={preview} />
        <ExportPacketButton studentId={id} />
      </div>
    </main>
  );
}
