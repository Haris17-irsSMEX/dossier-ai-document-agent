import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import type { ExportPacketPreview } from "@/lib/export/create-packet";

function scanTone(status?: string | null) {
  switch (status) {
    case "scanned":
      return "success";
    case "scan_failed":
      return "danger";
    case "scanning":
    case "needs_review":
      return "warning";
    default:
      return "info";
  }
}

export function ExportStatusReport({ preview }: { preview: ExportPacketPreview }) {
  const issueCount = preview.documents.reduce(
    (total, document) => total + (document.document_issues?.length ?? 0),
    0
  );

  return (
    <section className="panel section-stack">
      <div className="section-title">
        <div>
          <h2>Packet contents preview</h2>
          <p>Document status, scan issues, and verification state.</p>
        </div>
        <span className={issueCount ? "chip warning" : "chip success"}>
          {issueCount} scan issue{issueCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Status</th>
              <th>Scan</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {preview.checklistItems.map((item) => {
              const documents = preview.documents.filter(
                (document) => document.checklist_item?.id === item.id
              );
              const itemIssues = documents.reduce(
                (total, document) => total + (document.document_issues?.length ?? 0),
                0
              );
              const latest = documents[0];

              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.document_name}</strong>
                    <span>{item.is_required ? "Required" : "Optional"}</span>
                  </td>
                  <td>
                    <DocumentStatusBadge status={item.status} />
                  </td>
                  <td>
                    {latest ? (
                      <span className={`chip ${scanTone(latest.scan_status)}`}>
                        {(latest.scan_status || "not_scanned").replaceAll("_", " ")}
                      </span>
                    ) : (
                      <span className="chip info">not uploaded</span>
                    )}
                  </td>
                  <td>{itemIssues}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Verification provider</th>
              <th>Status</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {preview.verificationRequests.length ? (
              preview.verificationRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.provider?.name || "Manual"}</td>
                  <td>
                    <span className="chip info">{request.status.replaceAll("_", " ")}</span>
                  </td>
                  <td>{request.portal_reference || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>No verification workflow records yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
