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
          <strong>{issue.message}</strong>
          {issue.evidence ? <p>{issue.evidence}</p> : null}
          {issue.recommended_action ? (
            <p>
              <span className="muted">Recommended action: </span>
              {issue.recommended_action}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
