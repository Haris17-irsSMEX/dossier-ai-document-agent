import { StudentUploadForm } from "@/components/upload/student-upload-form";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { getUploadPortalData } from "@/lib/actions/documents";

export default async function UploadPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; success?: string; documentId?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const portal = await getUploadPortalData(token);

  return (
    <main className="app-shell public-upload-shell">
      <div className="workspace">
        {"error" in portal ? (
          <div className="panel upload-link-error">
            <BrandLockup />
            <h1>Upload link unavailable</h1>
            <p className="lead">{portal.error}</p>
          </div>
        ) : (
          <StudentUploadForm
            token={token}
            studentName={portal.student.full_name}
            checklistItems={portal.checklistItems}
            documents={portal.documents}
            error={query.error}
            success={query.success}
            currentDocumentId={query.documentId}
          />
        )}
      </div>
    </main>
  );
}
