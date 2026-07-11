import { UserPlus, Users } from "lucide-react";

import {
  assignStudentToCounselorAction,
  createCounselorAction,
  getAgencyTeam,
  getAgencyUsage,
  regenerateCounselorInviteAction,
  suspendCounselorAction,
  updateCounselorAction
} from "@/lib/actions/team";
import { CopyInviteLink } from "@/components/team/copy-invite-link";
import { PageHeader } from "@/components/ui/page-header";

export default async function TeamPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string; invite_link?: string; invite_email?: string }>;
}) {
  const query = await searchParams;
  const [team, usage] = await Promise.all([getAgencyTeam(), getAgencyUsage()]);
  const seniorCounselors = team.profiles.filter(
    (profile) => profile.appRole === "agency_admin"
  );
  const counselors = team.profiles.filter((profile) => profile.appRole === "counselor");
  const activeCounselors = counselors.filter(
    (profile) => profile.status === "active" && profile.is_active !== false
  );
  const activeStudents = team.students.filter((student) => student.status !== "archived");
  const profileById = new Map(team.profiles.map((profile) => [profile.id, profile]));
  const activeCounselorIds = new Set(activeCounselors.map((profile) => profile.id));
  const unassignedStudents = activeStudents.filter((student) => {
    const assigneeId =
      student.assigned_counselor_id || student.assigned_consultant_id || null;

    return !assigneeId || !activeCounselorIds.has(assigneeId);
  });
  const counselorLimitReached = usage.counselorsCount >= usage.maxCounselors;

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          eyebrow="Agency team"
          title="Team management"
          subtitle="Manage counselors, student assignments, and agency usage limits."
        />

        {query.success ? <div className="alert success">{query.success}</div> : null}
        {query.error ? <div className="alert error">{query.error}</div> : null}
        {query.invite_link ? (
          <section className="panel invite-link-panel">
            <div>
              <span className="eyebrow">Invite link</span>
              <h2>Counselor invited</h2>
              <p>
                Copy this invite link and send it to{" "}
                {query.invite_email || "the counselor"}. They will create a
                password before entering Dossier.
              </p>
              <input readOnly value={query.invite_link} aria-label="Invite link" />
            </div>
            <CopyInviteLink inviteLink={query.invite_link} />
          </section>
        ) : null}

        <section className="metric-grid case-metrics">
          <div className="metric-card">
            <Users aria-hidden="true" size={18} />
            <span>Agency</span>
            <strong>{usage.agency?.name || "Agency"}</strong>
          </div>
          <div className="metric-card">
            <Users aria-hidden="true" size={18} />
            <span>Counselor seats</span>
            <strong>
              {usage.counselorsCount}/{usage.maxCounselors}
            </strong>
            <small>active counselors</small>
          </div>
          <div className="metric-card">
            <UserPlus aria-hidden="true" size={18} />
            <span>Student limit</span>
            <strong>{usage.maxStudentsPerCounselor} each</strong>
          </div>
          <div className="metric-card">
            <Users aria-hidden="true" size={18} />
            <span>Active students</span>
            <strong>{usage.activeStudentsCount}</strong>
          </div>
          <div className="metric-card">
            <Users aria-hidden="true" size={18} />
            <span>Unassigned</span>
            <strong>{unassignedStudents.length}</strong>
            <small>needs counselor</small>
          </div>
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Senior counselor</h2>
              <p>Can manage counselors and view all agency students.</p>
            </div>
          </div>
          {seniorCounselors.length ? (
            <div className="team-card-grid">
              {seniorCounselors.map((senior) => (
                <article className="team-person-card" key={senior.id}>
                  <div className="student-cell">
                    <strong>{senior.full_name}</strong>
                    <span>{senior.email || "No email"}</span>
                    {senior.phone ? <span>{senior.phone}</span> : null}
                  </div>
                  <div>
                    <span className="chip info">Senior counselor / Agency admin</span>
                    <span className={`chip ${senior.status === "active" ? "success" : "warning"}`}>
                      {senior.status || "active"}
                    </span>
                  </div>
                  <p className="muted">
                    Agency-wide access. Not counted as a counselor seat and no
                    5-student workload limit is shown here.
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No senior counselor profile found</strong>
              <p>The agency admin will appear here after the profile role is set.</p>
            </div>
          )}
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Add counselor</h2>
              <p>
                Invite a counselor into this agency. The agency can have up to{" "}
                {usage.maxCounselors} active counselor accounts.
              </p>
            </div>
          </div>
          {counselorLimitReached ? (
            <div className="alert info">
              This agency already has {usage.maxCounselors} active counselor accounts.
            </div>
          ) : null}
          <form action={createCounselorAction} className="form-grid">
            <label>
              Full name
              <input name="full_name" required placeholder="Sara Ahmed" />
            </label>
            <label>
              Email
              <input name="email" type="email" required placeholder="sara@example.com" />
            </label>
            <label>
              Phone
              <input name="phone" placeholder="+923001234567" />
            </label>
            <div className="form-actions">
              <span className="form-note">
                Dossier will generate a copyable invite link after this counselor is created.
              </span>
              <button
                className="button"
                disabled={counselorLimitReached}
                type="submit"
              >
                Add counselor
              </button>
            </div>
          </form>
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Counselors</h2>
              <p>
                Each counselor can manage up to {usage.maxStudentsPerCounselor} active students.
                Invited counselors appear here but can receive students after activation.
              </p>
            </div>
          </div>
          {counselors.length ? (
            <div className="table-wrap">
              <table className="student-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th>Update</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {counselors.map((profile) => (
                    <tr key={profile.id}>
                      <td className="student-cell">
                        <strong>{profile.full_name}</strong>
                        <span>{profile.email || "No email"}</span>
                        {profile.phone ? <span>{profile.phone}</span> : null}
                      </td>
                      <td>Counselor</td>
                      <td>
                        {profile.activeStudentsCount}/{usage.maxStudentsPerCounselor}
                      </td>
                      <td>
                        <span className={`chip ${profile.status === "active" ? "success" : "warning"}`}>
                          {profile.status || "active"}
                        </span>
                      </td>
                      <td>
                        <form action={updateCounselorAction} className="team-inline-form compact">
                          <input name="profile_id" type="hidden" value={profile.id} />
                          <input
                            aria-label="Full name"
                            name="full_name"
                            defaultValue={profile.full_name}
                          />
                          <input
                            aria-label="Phone"
                            name="phone"
                            defaultValue={profile.phone || ""}
                          />
                          <select
                            aria-label="Status"
                            name="status"
                            defaultValue={profile.status || "active"}
                          >
                            <option value="active">Active</option>
                            <option value="invited">Invited</option>
                            <option value="suspended">Suspended</option>
                            <option value="archived">Archived</option>
                          </select>
                          <button className="button secondary compact-button" type="submit">
                            Save
                          </button>
                        </form>
                      </td>
                      <td>
                        <form action={suspendCounselorAction}>
                          <input name="profile_id" type="hidden" value={profile.id} />
                          <button className="button danger subtle compact-button" type="submit">
                            Suspend
                          </button>
                        </form>
                        {profile.status === "invited" ? (
                          <>
                            {profile.activeInviteLink ? (
                              <CopyInviteLink
                                inviteLink={profile.activeInviteLink}
                                label="Copy invite link"
                              />
                            ) : null}
                            <form action={regenerateCounselorInviteAction}>
                              <input name="profile_id" type="hidden" value={profile.id} />
                              <button className="button secondary compact-button" type="submit">
                                Regenerate invite
                              </button>
                            </form>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No counselors added yet</strong>
              <p>Add a counselor before assigning student workload.</p>
            </div>
          )}
        </section>

        <section className="panel section-stack">
          <div className="section-title">
            <div>
              <h2>Assign students</h2>
              <p>Move active student cases between counselors without changing uploaded documents.</p>
            </div>
          </div>
          <p className="muted">Assign students to counselors so workload limits can be tracked.</p>
          {activeStudents.length && activeCounselors.length ? (
            <div className="team-assignment-list">
              {activeStudents.map((student) => (
                <form action={assignStudentToCounselorAction} className="team-inline-form" key={student.id}>
                  <input name="student_id" type="hidden" value={student.id} />
                  <span className="student-cell">
                    <strong>{student.full_name}</strong>
                    <small>
                      Current:{" "}
                      {profileById.get(
                        student.assigned_counselor_id ||
                          student.assigned_consultant_id ||
                          ""
                      )?.full_name || "Unassigned / needs assignment"}
                    </small>
                  </span>
                  <select
                    aria-label={`Assign ${student.full_name}`}
                    name="counselor_id"
                    required
                    defaultValue={
                      activeCounselorIds.has(
                        student.assigned_counselor_id ||
                          student.assigned_consultant_id ||
                          ""
                      )
                        ? student.assigned_counselor_id ||
                          student.assigned_consultant_id ||
                          ""
                        : ""
                    }
                  >
                    <option disabled value="">
                      Choose active counselor
                    </option>
                    {activeCounselors.map((counselor) => (
                      <option key={counselor.id} value={counselor.id}>
                        {counselor.full_name} ({counselor.activeStudentsCount}/{usage.maxStudentsPerCounselor})
                      </option>
                    ))}
                  </select>
                  <button className="button secondary compact-button" type="submit">
                    Assign
                  </button>
                </form>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>
                {activeCounselors.length ? "No active student cases" : "No counselors yet"}
              </strong>
              <p>
                {activeCounselors.length
                  ? "Create student cases before assigning work."
                  : "No counselors yet. Add a counselor before assigning students."}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
