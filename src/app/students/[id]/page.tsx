import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Phone,
  UserRound
} from "lucide-react";
import Link from "next/link";

import { ArchiveStudentButton } from "@/components/students/archive-student-button";
import { StudentTabs } from "@/components/students/student-tabs";
import { MetricCard } from "@/components/ui/metric-card";
import { generateUploadTokenAction, listChecklistItems } from "@/lib/actions/checklists";
import { listStudentDocuments } from "@/lib/actions/documents";
import { getStudent } from "@/lib/actions/students";
import {
  getChecklistPhase
} from "@/lib/checklists/phases";
import {
  isActiveChecklistRequest,
  isChecklistReady,
  isMissingActiveRequest,
  needsChecklistReview,
  summarizeChecklist
} from "@/lib/checklists/request-logic";
import { formatDate } from "@/lib/date";

export default async function StudentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [student, items, documents] = await Promise.all([
    getStudent(id),
    listChecklistItems(id),
    listStudentDocuments(id)
  ]);
  const checklistSummary = summarizeChecklist(items);
  const activeItems = checklistSummary.active;
  const completedItems = activeItems.filter(isChecklistReady);
  const missingItems = activeItems.filter(isMissingActiveRequest);
  const problemItems = activeItems.filter(needsChecklistReview);
  const completion = checklistSummary.completionPercent;
  const ready =
    activeItems.length > 0 && completedItems.length === activeItems.length;
  const archived = student.status === "archived";
  const caseStatus = ready
    ? { label: "Ready", tone: "success" }
    : problemItems.length
      ? { label: "Needs review", tone: "warning" }
      : missingItems.length
        ? { label: "Missing documents", tone: "danger" }
        : { label: "Open", tone: "" };
  const displayStatus = archived
    ? { label: "Archived", tone: "archived" }
    : caseStatus;
  const nextAction =
    archived
      ? null
      : items.length === 0
      ? {
          title: "Generate the document checklist",
          description: "Create the first document request set for this student.",
          href: `/students/${id}/checklist`,
          label: "View checklist"
        }
      : problemItems.length
        ? {
            title: "Review document issues",
            description: `${problemItems.length} document request${problemItems.length === 1 ? "" : "s"} need counselor attention.`,
            href: `/students/${id}/documents`,
            label: "Review documents"
          }
        : ready
          ? {
              title: "Prepare the application packet",
              description: "Required documents are ready for packet generation.",
              href: `/students/${id}/export`,
              label: "Export packet"
            }
          : documents.length
            ? {
                title: "Continue document collection",
                description: `${missingItems.length} active document request${missingItems.length === 1 ? "" : "s"} still missing.`,
                href: `/students/${id}/checklist`,
                label: "View checklist"
              }
            : null;
  const phaseProgress = [
    "profile_academic_file",
    "financial_sponsor_file",
    "visa_processing",
    "verification_attestation",
    "optional_profile_boosters"
  ].map((slug) => {
    const phase = getChecklistPhase(slug);
    const phaseItems = items.filter(
      (item) =>
        getChecklistPhase(item.phase_slug).slug === phase.slug &&
        isActiveChecklistRequest(item)
    );
    const complete = phaseItems.filter(isChecklistReady).length;

    return {
      ...phase,
      total: phaseItems.length,
      complete,
      percent: phaseItems.length
        ? Math.round((complete / phaseItems.length) * 100)
        : 0
    };
  });

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <header className="case-header">
          <div>
            <span className={`chip ${displayStatus.tone}`}>{displayStatus.label}</span>
            <h1>{student.full_name}</h1>
            <div className="case-meta">
              <span>
                {student.target_country ||
                  student.destination_country ||
                  "Country not set"}
              </span>
              <span>{student.intake || "Intake not set"}</span>
              <span>{student.program_level || "Level not set"}</span>
              <span>
                Deadline {formatDate(student.deadline_date) || "not set"}
              </span>
            </div>
          </div>
          <Link className="button secondary" href="/students">
            Back to students
          </Link>
        </header>

        <StudentTabs active="overview" studentId={id} />

        {query.success ? <div className="alert success">{query.success}</div> : null}
        {archived ? (
          <div className="alert info">
            This case is archived. It stays available for reference under Archived cases.
          </div>
        ) : null}

        <section className="metric-grid case-metrics">
          <MetricCard
            icon={Phone}
            label="Phone"
            value={student.phone || "Not set"}
          />
          <MetricCard
            icon={UserRound}
            label="Sponsor"
            value={student.sponsor_type || "Not set"}
          />
          <MetricCard
            icon={CalendarDays}
            label="Deadline"
            value={formatDate(student.deadline_date) || "Not set"}
            tone={student.deadline_date ? "warning" : "default"}
          />
          <MetricCard
            icon={CheckCircle2}
            label="Checklist completion"
            value={`${completion}%`}
            tone={ready ? "success" : "primary"}
          />
          <MetricCard
            icon={FileText}
            label="Documents"
            value={`${documents.length} uploaded`}
            hint={`${missingItems.length} active requests missing`}
          />
        </section>

        <section className="panel next-action-card">
          <div>
            <span className="eyebrow">Next best action</span>
            <h2>
              {nextAction?.title ||
                (archived
                  ? "This student case is archived"
                  : "Send the student a secure upload link")}
            </h2>
            <p>
              {nextAction?.description ||
                (archived
                  ? "Archived cases are hidden from the active pipeline but remain available for reference."
                  : "The checklist is ready. Start collecting the requested documents.")}
            </p>
          </div>
          {nextAction ? (
            <Link className="button" href={nextAction.href}>
              {nextAction.label}
            </Link>
          ) : archived ? (
            <span className="chip archived">Archived case</span>
          ) : (
            <form action={generateUploadTokenAction}>
              <input type="hidden" name="student_id" value={id} />
              <button className="button" type="submit">
                Generate upload link
              </button>
            </form>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Case overview</h2>
              <p>Open a workspace section to continue this application.</p>
            </div>
          </div>
          <div className="quick-actions">
            <Link className="quick-action" href={`/students/${id}/checklist`}>
              <span>Customize document checklist</span>
              <span>{items.length} requests</span>
            </Link>
            <Link className="quick-action" href={`/students/${id}/documents`}>
              <span>Review uploaded documents</span>
              <span>{problemItems.length} need review</span>
            </Link>
            <Link className="quick-action" href={`/students/${id}/follow-up`}>
              <span>Send student follow-up</span>
              <span>WhatsApp or email</span>
            </Link>
          </div>
          <div className="case-phase-progress">
            {phaseProgress.map((phase) => (
              <div key={phase.slug}>
                <span>
                  <strong>{phase.shortLabel}</strong>
                  <small>
                    {phase.complete}/{phase.total || 0}
                  </small>
                </span>
                <div
                  className="progress-track"
                  aria-label={`${phase.shortLabel} ${phase.percent}% complete`}
                >
                  <span style={{ width: `${phase.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel case-archive-panel">
          <div className="case-archive-copy">
            <span className="eyebrow">Case settings</span>
            <h2>Archive student case</h2>
            <p>
              Archive hides this student from Active cases without deleting uploads,
              messages, verification history, or export records.
            </p>
          </div>
          <ArchiveStudentButton
            archived={archived}
            studentId={id}
            studentName={student.full_name}
          />
        </section>
      </div>
    </main>
  );
}
