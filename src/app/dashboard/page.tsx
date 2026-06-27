import Link from "next/link";

import { getDashboardMetrics } from "@/lib/actions/students";
import { formatDateTime } from "@/lib/date";

function RecentList<T extends { id: string; created_at?: string | null }>({
  title,
  items,
  empty,
  label
}: {
  title: string;
  items: T[];
  empty: string;
  label: (item: T) => string;
}) {
  return (
    <section className="panel compact">
      <h2>{title}</h2>
      {items.length ? (
        <div className="list">
          {items.map((item) => (
            <div className="list-item" key={item.id}>
              <strong>{label(item)}</strong>
              <span>{formatDateTime(item.created_at) || "Date unavailable"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <strong>{empty}</strong>
        </div>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();
  const cards = [
    ["Total students", metrics.totalStudents],
    ["Students missing files", metrics.studentsWithMissingDocuments],
    ["Ready files", metrics.readyFiles],
    ["Missing documents", metrics.missingDocuments],
    ["Problem documents", metrics.problemDocuments],
    ["Deadline risk", metrics.deadlineRisk],
    ["Completion", `${metrics.completionPercentage}%`]
  ];

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <div className="topbar">
          <div>
            <h1>Dashboard</h1>
            <p className="muted">Application operations overview.</p>
          </div>
          <Link className="button" href="/students/new">
            New student
          </Link>
        </div>
        <section className="metrics">
          {cards.map(([label, value]) => (
            <div className="metric" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
        {metrics.totalStudents === 0 ? (
          <section className="panel">
            <h2>No applications yet</h2>
            <p className="lead">
              Create the first student profile to generate a smart checklist and start collecting documents.
            </p>
            <div className="actions">
              <Link className="button" href="/students/new">
                Create student profile
              </Link>
              <Link className="button secondary" href="/students">
                View students
              </Link>
            </div>
          </section>
        ) : (
          <div className="dashboard">
            <RecentList
              title="Recent uploads"
              items={metrics.recentUploads}
              empty="No documents uploaded yet."
              label={(item) =>
                `${String(item.original_filename || "Document")} - ${String(
                  item.scan_status || item.status || "uploaded"
                ).replaceAll("_", " ")}`
              }
            />
            <RecentList
              title="Recent WhatsApp"
              items={metrics.recentWhatsApp}
              empty="No WhatsApp messages sent yet."
              label={(item) =>
                `${String(item.message_type || "Message").replaceAll("_", " ")} - ${String(
                  item.status || "queued"
                )}`
              }
            />
            <RecentList
              title="Recent email"
              items={metrics.recentEmails}
              empty="No emails sent yet."
              label={(item) =>
                `${String(item.subject || "Email")} - ${String(
                  item.status || "pending"
                )}`
              }
            />
            <RecentList
              title="Recent exports"
              items={metrics.recentExports}
              empty="Export packet has not been generated yet."
              label={(item) =>
                `Application packet - ${String(item.status || "queued")}`
              }
            />
          </div>
        )}
      </div>
    </main>
  );
}
