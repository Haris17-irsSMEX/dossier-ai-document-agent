type DocumentIssue = {
  id: string;
  issue_type: string;
  severity: string;
  message: string;
  evidence?: string | null;
  recommended_action?: string | null;
  is_resolved?: boolean | null;
};

const severityTone: Record<string, string> = {
  low: "info",
  medium: "warning",
  high: "danger"
};

function friendlyIssueText(value?: string | null) {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  if (/azure|invalid request|ocr failed|timeout|exception/i.test(text)) {
    return "Automated scan could not complete. Please review this file manually.";
  }

  return text;
}

export function DocumentIssuesList({ issues }: { issues: DocumentIssue[] }) {
  const activeIssues = issues.filter((issue) => !issue.is_resolved);

  if (!activeIssues.length) {
    return (
      <div className="empty-state compact-empty">
        <strong>No active issues</strong>
        <p>Scanned evidence has not produced any open issues for this file.</p>
      </div>
    );
  }

  return (
    <div className="issues-list">
      {activeIssues.map((issue) => (
        <div className="issue-row" key={issue.id}>
          <div className="button-row">
            <span className={`chip ${severityTone[issue.severity] || "info"}`}>
              {issue.severity}
            </span>
            <span className="chip info">{issue.issue_type.replaceAll("_", " ")}</span>
          </div>
          <strong>{friendlyIssueText(issue.message) || "Manual review needed."}</strong>
          {friendlyIssueText(issue.evidence) ? <p>{friendlyIssueText(issue.evidence)}</p> : null}
          {friendlyIssueText(issue.recommended_action) ? (
            <p>
              <span className="muted">Recommended action: </span>
              {friendlyIssueText(issue.recommended_action)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
