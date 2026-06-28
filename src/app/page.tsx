import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  FileWarning,
  ShieldCheck,
  Sparkles
} from "lucide-react";

import {
  APP_NAME,
  APP_TAGLINE,
  DEFAULT_DOCUMENT_CHECKLIST,
  OFFICIAL_VERIFICATION_WORKFLOW
} from "@/lib/constants";
import { getAuthProfileState } from "@/lib/auth/require-profile";

const documentIssues = [
  { label: "Missing", value: "6", tone: "danger" },
  { label: "Wrong file", value: "2", tone: "warning" },
  { label: "Blurry scan", value: "3", tone: "warning" },
  { label: "Expired", value: "1", tone: "danger" }
];

const activeStudents = [
  {
    name: "Ayesha Khan",
    route: "Canada - Fall 2026",
    status: "Needs bank statement",
    tone: "danger"
  },
  {
    name: "Hamza Ali",
    route: "Australia - Spring 2027",
    status: "HEC queued",
    tone: "info"
  },
  {
    name: "Mina Shah",
    route: "United Kingdom - Fall 2026",
    status: "Ready to export",
    tone: "success"
  }
];

function chipClass(tone?: string) {
  if (tone === "danger") {
    return "chip danger";
  }

  if (tone === "warning") {
    return "chip warning";
  }

  if (tone === "info") {
    return "chip info";
  }

  return "chip";
}

export default async function Home() {
  const authState = await getAuthProfileState();

  if (authState.status === "ready") {
    redirect("/dashboard");
  }

  if (authState.status === "needs_onboarding") {
    redirect("/onboarding");
  }

  return (
    <main className="app-shell">
      <div className="workspace">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <span>{APP_NAME}</span>
          </div>
          <span className="status-pill">{APP_TAGLINE}</span>
        </header>

        <section className="dashboard" aria-label="Application operations">
          <div className="section-stack">
            <div className="panel">
              <h1>Every student document, moving in the right direction.</h1>
              <p className="lead">
                Create student profiles, generate smart document checklists,
                flag missing or unusable files, send WhatsApp reminders, track
                official verification steps, and prepare application exports.
              </p>
              <div className="actions" aria-label="Primary actions">
                <Link className="button" href="/students/new">
                  Create student profile
                </Link>
                <Link className="button secondary" href="/students/new">
                  Generate checklist
                </Link>
                <Link className="button secondary" href="/students">
                  Select a student first
                </Link>
              </div>

              <div className="metrics" aria-label="Document issue summary">
                {documentIssues.map((issue) => (
                  <div className="metric" key={issue.label}>
                    <strong>{issue.value}</strong>
                    <span>{issue.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Active students</h2>
              <div className="list">
                {activeStudents.map((student) => (
                  <div className="list-item" key={student.name}>
                    <div>
                      <strong>{student.name}</strong>
                      <span>{student.route}</span>
                    </div>
                    <span className={chipClass(student.tone)}>
                      {student.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="section-stack">
            <div className="panel">
              <h2>Smart checklist base</h2>
              <div className="list">
                {DEFAULT_DOCUMENT_CHECKLIST.slice(0, 5).map((item) => (
                  <div className="list-item" key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.category}</span>
                    </div>
                    <span className={item.required ? "chip" : "chip info"}>
                      {item.required ? "Required" : "Conditional"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Verification workflow</h2>
              <div className="timeline">
                {OFFICIAL_VERIFICATION_WORKFLOW.map((step) => (
                  <div className="timeline-row" key={step.id}>
                    <span className="timeline-dot">
                      <ShieldCheck size={15} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <span>{step.authority} tracked manually</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Dossier workflow</h2>
              <div className="timeline">
                <div className="timeline-row">
                  <span className="timeline-dot">
                    <FileWarning size={15} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Collect student files</strong>
                    <span>Secure links, mobile capture, and clear requests</span>
                  </div>
                </div>
                <div className="timeline-row">
                  <span className="timeline-dot">
                    <CheckCircle2 size={15} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Review what needs attention</strong>
                    <span>Missing, blurry, expired, and review states</span>
                  </div>
                </div>
                <div className="timeline-row">
                  <span className="timeline-dot">
                    <Archive size={15} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Prepare the final packet</strong>
                    <span>Export a clean consultant-ready application file</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
