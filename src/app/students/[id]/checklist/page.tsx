import Link from "next/link";

import { ChecklistView } from "@/components/checklists/checklist-view";
import { listChecklistItems } from "@/lib/actions/checklists";
import { getStudent } from "@/lib/actions/students";
import { getPublicAppUrl, getPublicMobileAppUrl } from "@/lib/env";

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
  const uploadPath = query.uploadToken ? `/upload/${query.uploadToken}` : undefined;
  const localUploadUrl = uploadPath ? `${getPublicAppUrl()}${uploadPath}` : undefined;
  const mobileUploadUrl = uploadPath
    ? `${getPublicMobileAppUrl()}${uploadPath}`
    : undefined;

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <div className="topbar">
          <div>
            <h1>{student.full_name}</h1>
            <p className="muted">Checklist and document request builder.</p>
          </div>
          <Link className="button secondary" href={`/students/${id}`}>
            Student profile
          </Link>
        </div>
        <ChecklistView
          studentId={id}
          items={items}
          localUploadUrl={localUploadUrl}
          mobileUploadUrl={mobileUploadUrl}
          uploadPath={uploadPath}
          uploadExpiresAt={query.uploadExpiresAt}
          success={query.success}
          error={query.error}
        />
      </div>
    </main>
  );
}
