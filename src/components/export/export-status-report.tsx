import Link from "next/link";

import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { requirementLevel } from "@/lib/checklists/request-logic";
import type { ExportPacketPreview } from "@/lib/export/create-packet";

function scanTone(status?: string | null) {
  switch (status) {
    case "scanned":
      return "success";
    case "scan_failed":
      return "warning";
    case "scanning":
    case "needs_review":
      return "warning";
    default:
      return "info";
  }
}

function scanLabel(status?: string | null) {
  switch (status) {
    case "scanned":
      return "Passed";
    case "scanning":
    case "needs_review":
      return "Needs review";
    case "scan_failed":
      return "AI scan unavailable";
    default:
      return "Not uploaded";
  }
}

export function ExportStatusReport({ preview }: { preview: ExportPacketPreview }) {
  const issueCount = preview.documents.reduce(
    (total, document) => total + (document.document_issues?.length ?? 0),
    0
  );
  const requestedItems = preview.checklistItems;

  if (!requestedItems.length) {
    return (
      <section className="panel section-stack">
        <div className="section-title">
          <div>
            <h2>Packet contents preview</h2>
            <p>Review the requested student file before generating the ZIP.</p>
          </div>
        </div>
        <div className="empty-state">
          <strong>No documents requested yet.</strong>
          <p>
            Go to Checklist and request the documents you want to collect before
            exporting.
          </p>
          <div className="button-row">
            <Link className="button secondary" href={`/students/${preview.student.id}/checklist`}>
              Go to checklist
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel section-stack">
      <div className="section-title">
        <div>
          <h2>Packet contents preview</h2>
          <p>Requested documents, upload status, and AI scan results.</p>
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
              <th>File status</th>
              <th>AI scan</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {requestedItems.map((item) => {
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
                    <div className="export-document-cell">
                      <strong>{item.document_name}</strong>
                      <span className="chip archived">
                        {requirementLevel(item).charAt(0).toUpperCase() + requirementLevel(item).slice(1)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <DocumentStatusBadge status={item.status} />
                  </td>
                  <td>
                    {latest ? (
                      <span className={`chip ${scanTone(latest.scan_status)}`}>
                        {scanLabel(latest.scan_status)}
                      </span>
                    ) : (
                      <span className="chip info">Not uploaded</span>
                    )}
                  </td>
                  <td className="export-issue-copy">
                    {itemIssues ? `${itemIssues} issue${itemIssues === 1 ? "" : "s"}` : "No issues"}
                  </td>
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
