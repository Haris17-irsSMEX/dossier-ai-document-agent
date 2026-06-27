import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentRequestForm } from "@/components/checklists/document-request-form";

type ChecklistItem = Parameters<typeof DocumentRequestForm>[0]["item"] & {
  status: string;
};

export function DocumentRequestBuilder({ items }: { items: ChecklistItem[] }) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <strong>No checklist items</strong>
        <p>Generate a smart checklist before editing document requests.</p>
      </div>
    );
  }

  return (
    <div className="builder-list">
      {items.map((item) => (
        <section className="panel compact" key={item.id}>
          <div className="section-title">
            <div>
              <h2>{item.document_name}</h2>
              <p>{item.upload_type.replace("_", " ")} upload</p>
            </div>
            <DocumentStatusBadge status={item.status} />
          </div>
          <DocumentRequestForm item={item} />
        </section>
      ))}
    </div>
  );
}
