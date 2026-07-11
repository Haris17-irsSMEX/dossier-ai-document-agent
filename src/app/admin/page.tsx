import { Building2, Users } from "lucide-react";

import {
  createAgencyAction,
  createAgencyAdminAction,
  getAdminAgencies,
  updateAgencyAction
} from "@/lib/actions/team";
import { CopyInviteLink } from "@/components/team/copy-invite-link";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string; invite_link?: string; invite_email?: string }>;
}) {
  const query = await searchParams;
  const agencies = await getAdminAgencies();

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          eyebrow="Platform admin"
          title="Agency control"
          subtitle="Manage Dossier agencies, plans, limits, and senior counselor access."
        />

        {query.success ? <div className="alert success">{query.success}</div> : null}
        {query.error ? <div className="alert error">{query.error}</div> : null}
        {query.invite_link ? (
          <section className="panel invite-link-panel">
            <div>
              <span className="eyebrow">Invite link</span>
              <h2>Agency admin invited</h2>
              <p>
                Copy this invite link and send it to{" "}
                {query.invite_email || "the senior counselor"}.
              </p>
              <input readOnly value={query.invite_link} aria-label="Invite link" />
            </div>
            <CopyInviteLink inviteLink={query.invite_link} />
          </section>
        ) : null}

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Create agency</h2>
              <p>Add a paid agency workspace with starter team limits.</p>
            </div>
          </div>
          <form action={createAgencyAction} className="form-grid">
            <label>
              Agency name
              <input name="name" required placeholder="Bright Future Consultants" />
            </label>
            <label>
              Slug
              <input name="slug" placeholder="bright-future" />
            </label>
            <label>
              Plan
              <input name="plan_name" defaultValue="starter" />
            </label>
            <label>
              Status
              <select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Max counselors
              <input min={0} name="max_counselors" type="number" defaultValue={4} />
            </label>
            <label>
              Max students per counselor
              <input
                min={1}
                name="max_students_per_counselor"
                type="number"
                defaultValue={5}
              />
            </label>
            <div className="form-actions span-2">
              <span className="form-note">Agency admins and counselors are invited after the agency exists.</span>
              <button className="button" type="submit">
                Create agency
              </button>
            </div>
          </form>
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Agencies</h2>
              <p>Platform-level view of agency usage and team limits.</p>
            </div>
          </div>

          {agencies.length ? (
            <div className="table-wrap">
              <table className="student-table">
                <thead>
                  <tr>
                    <th>Agency</th>
                    <th>Plan</th>
                    <th>Users</th>
                    <th>Students</th>
                    <th>Limits</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agencies.map((agency) => (
                    <tr key={agency.id}>
                      <td className="student-cell">
                        <strong>{agency.name}</strong>
                        <span>{agency.slug || "No slug"}</span>
                      </td>
                      <td>{agency.plan_name}</td>
                      <td>
                        <span className="icon-inline">
                          <Users size={15} />
                          {agency.usersCount} users
                        </span>
                      </td>
                      <td>
                        <span className="icon-inline">
                          <Building2 size={15} />
                          {agency.activeStudentsCount} active
                        </span>
                      </td>
                      <td>
                        {agency.counselorsCount}/{agency.max_counselors} counselors ·{" "}
                        {agency.max_students_per_counselor} students each
                      </td>
                      <td>
                        <span className={`chip ${agency.status === "active" ? "success" : "warning"}`}>
                          {agency.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No agencies yet</strong>
              <p>Create the first paid agency workspace above.</p>
            </div>
          )}
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Agency admin invite</h2>
              <p>Invite a senior counselor into an existing agency.</p>
            </div>
          </div>
          <form action={createAgencyAdminAction} className="form-grid">
            <label>
              Agency
              <select name="agency_id" required defaultValue="">
                <option disabled value="">
                  Select agency
                </option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Full name
              <input name="full_name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Phone
              <input name="phone" />
            </label>
            <div className="form-actions span-2">
              <span className="form-note">Uses Supabase auth invite email when configured.</span>
              <button className="button secondary" type="submit">
                Invite agency admin
              </button>
            </div>
          </form>
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Update agency limits</h2>
              <p>Adjust plan status and limits without changing agency data.</p>
            </div>
          </div>
          {agencies.map((agency) => (
            <form action={updateAgencyAction} className="team-inline-form" key={agency.id}>
              <input name="agency_id" type="hidden" value={agency.id} />
              <input name="name" defaultValue={agency.name} aria-label="Agency name" />
              <input name="slug" defaultValue={agency.slug || ""} aria-label="Agency slug" />
              <input name="plan_name" defaultValue={agency.plan_name} aria-label="Plan" />
              <select name="status" defaultValue={agency.status} aria-label="Status">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="archived">Archived</option>
              </select>
              <input
                aria-label="Max counselors"
                min={0}
                name="max_counselors"
                type="number"
                defaultValue={agency.max_counselors}
              />
              <input
                aria-label="Max students per counselor"
                min={1}
                name="max_students_per_counselor"
                type="number"
                defaultValue={agency.max_students_per_counselor}
              />
              <button className="button secondary compact-button" type="submit">
                Save
              </button>
            </form>
          ))}
        </section>
      </div>
    </main>
  );
}
