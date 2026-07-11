import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileUp,
  Mail,
  MessageCircle,
  Plus,
  Users
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentProfile,
  getDashboardMetrics
} from "@/lib/actions/students";
import { normalizeRole } from "@/lib/auth/role-utils";
import { formatDate } from "@/lib/date";

const metricItems = [
  { key: "totalStudents", label: "Active students", icon: Users },
  { key: "missingDocuments", label: "Missing docs", icon: AlertCircle },
  { key: "problemDocuments", label: "Needs review", icon: Clock3 },
  { key: "readyFiles", label: "Ready to export", icon: FileCheck2 },
  { key: "deadlineRisk", label: "Deadline risk", icon: CalendarDays }
] as const;

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  if (normalizeRole(profile?.role) === "platform_admin") {
    redirect("/admin");
  }

  const metrics = await getDashboardMetrics();
  const name = profile?.full_name || "Consultant";
  const firstName = name.trim().split(/\s+/)[0];
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const total = Math.max(metrics.totalChecklistItems, 1);
  const progressRows = [
    {
      label: "Accepted",
      value: metrics.acceptedDocuments,
      width: Math.round((metrics.acceptedDocuments / total) * 100),
      tone: "success"
    },
    {
      label: "Missing",
      value: metrics.missingDocuments,
      width: Math.round((metrics.missingDocuments / total) * 100),
      tone: "danger"
    },
    {
      label: "Needs review",
      value: metrics.problemDocuments,
      width: Math.round((metrics.problemDocuments / total) * 100),
      tone: "warning"
    }
  ];
  const activity = [
    ...metrics.recentUploads.map((item) => ({
      id: `upload-${item.id}`,
      label: item.original_filename,
      detail: String(item.scan_status || item.status || "uploaded").replaceAll(
        "_",
        " "
      ),
      createdAt: item.created_at,
      icon: FileUp
    })),
    ...metrics.recentWhatsApp.map((item) => ({
      id: `whatsapp-${item.id}`,
      label: "WhatsApp follow-up",
      detail: String(item.status || "queued"),
      createdAt: item.created_at,
      icon: MessageCircle
    })),
    ...metrics.recentEmails.map((item) => ({
      id: `email-${item.id}`,
      label: item.subject || "Email follow-up",
      detail: String(item.status || "pending"),
      createdAt: item.created_at,
      icon: Mail
    })),
    ...metrics.recentExports.map((item) => ({
      id: `export-${item.id}`,
      label: "Application packet",
      detail: String(item.status || "queued"),
      createdAt: item.created_at,
      icon: FileCheck2
    }))
  ]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 7);

  return (
    <main className="app-shell dashboard-shell">
      <div className="workspace premium-dashboard-grid">
        <section className="dashboard-center">
          <header className="dashboard-greeting">
            <div>
              <span className="eyebrow">Workspace overview</span>
              <h1>Hello, {firstName}</h1>
              <p>
                Track student document progress here. You are close to a clean
                application pipeline.
              </p>
            </div>
            <div className="dashboard-header-actions">
              <span className="date-control">
                <CalendarDays aria-hidden="true" size={15} />
                {formatDate(new Date())}
              </span>
              <Link className="button compact-button" href="/students/new">
                <Plus aria-hidden="true" size={15} />
                New student
              </Link>
            </div>
          </header>

          <section className="metric-strip" aria-label="Document operations metrics">
            {metricItems.map((item) => {
              const Icon = item.icon;
              return (
                <article className="strip-metric" key={item.key}>
                  <span className="strip-metric-icon">
                    <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                  </span>
                  <div>
                    <span>{item.label}</span>
                    <strong>{metrics[item.key]}</strong>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="panel document-progress-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Pipeline health</span>
                <h2>Document progress</h2>
                <p>Current checklist status across active student cases.</p>
              </div>
              <div className="completion-value">
                <strong>{metrics.completionPercentage}%</strong>
                <span>complete</span>
              </div>
            </div>
            <div className="overall-progress-track">
              <span style={{ width: `${metrics.completionPercentage}%` }} />
            </div>
            <div className="progress-status-grid">
              {progressRows.map((row) => (
                <div className="progress-status" key={row.label}>
                  <div>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className={`mini-progress-track ${row.tone}`}>
                    <span style={{ width: `${Math.min(row.width, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel current-cases-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Current cases</span>
                <h2>Students needing action</h2>
              </div>
              <Link className="minimal-link" href="/students">
                View all
                <ChevronRight aria-hidden="true" size={14} />
              </Link>
            </div>
            {metrics.studentsNeedingAction.length ? (
              <div className="case-action-list">
                {metrics.studentsNeedingAction.slice(0, 5).map((student) => (
                  <div className="case-action-row" key={student.id}>
                    <span className="case-avatar">
                      {student.full_name
                        .split(/\s+/)
                        .map((part: string) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div>
                      <strong>{student.full_name}</strong>
                      <span>Required documents still missing</span>
                    </div>
                    <span className="case-due">
                      {formatDate(student.deadline_date) || "No deadline"}
                    </span>
                    <Link
                      aria-label={`Open ${student.full_name}`}
                      className="row-action"
                      href={`/students/${student.id}`}
                    >
                      <ChevronRight aria-hidden="true" size={16} />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="soft-empty-state">
                <span className="soft-empty-icon">
                  <Check aria-hidden="true" size={17} />
                </span>
                <div>
                  <strong>No cases need immediate follow-up</strong>
                  <p>Your required document requests are moving well.</p>
                </div>
              </div>
            )}
          </section>
        </section>

        <aside className="dashboard-rail">
          <section className="consultant-card">
            <span className="consultant-avatar">{initials}</span>
            <div>
              <strong>{name}</strong>
              <span>
                {profile?.role?.replaceAll("_", " ") || "Consultant"} ·
                Workspace
              </span>
            </div>
          </section>

          <section className="rail-section">
            <div className="rail-heading">
              <h2>Recent activity</h2>
              <span>{activity.length}</span>
            </div>
            {activity.length ? (
              <div className="rail-activity-list">
                {activity.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div className="rail-activity-item" key={item.id}>
                      <span className="rail-activity-icon">
                        <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
                      </span>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                      <time>{formatDate(item.createdAt) || "Recently"}</time>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rail-empty">No recent activity yet.</div>
            )}
          </section>

          <section className="rail-section">
            <div className="rail-heading">
              <h2>Deadline risk</h2>
              <span>{metrics.deadlineStudents.length}</span>
            </div>
            {metrics.deadlineStudents.length ? (
              <div className="deadline-mini-list">
                {metrics.deadlineStudents.map((student) => (
                  <Link href={`/students/${student.id}`} key={student.id}>
                    <span className="deadline-dot" />
                    <div>
                      <strong>{student.full_name}</strong>
                      <span>{formatDate(student.deadline_date)}</span>
                    </div>
                    <ChevronRight aria-hidden="true" size={14} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rail-empty">No deadlines at risk.</div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
