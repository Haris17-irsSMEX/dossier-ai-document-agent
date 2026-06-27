import { createStudentAction } from "@/lib/actions/students";
import { SubmitButton } from "@/components/forms/submit-button";

type Consultant = {
  id: string;
  full_name: string;
  email?: string | null;
};

export function StudentForm({
  consultants,
  error
}: {
  consultants: Consultant[];
  error?: string;
}) {
  const defaultConsultantId = consultants[0]?.id || "";

  return (
    <form action={createStudentAction} className="form-grid">
      {error ? <div className="alert error">{error}</div> : null}
      <label>
        Student name
        <input name="full_name" required placeholder="Ayesha Khan" />
      </label>
      <label>
        Phone
        <input name="phone" placeholder="+923001234567" />
      </label>
      <label>
        Email
        <input name="email" type="email" placeholder="student@example.com" />
      </label>
      <label>
        Target country
        <input name="target_country" required placeholder="Canada" />
      </label>
      <label>
        Intake
        <input name="intake" required placeholder="Fall 2026" />
      </label>
      <label>
        Program level
        <select name="program_level" required defaultValue="">
          <option value="" disabled>
            Choose level
          </option>
          <option>Bachelor</option>
          <option>Master</option>
          <option>PhD</option>
          <option>Diploma</option>
          <option>Foundation</option>
        </select>
      </label>
      <label>
        Education background
        <input
          name="education_background"
          required
          placeholder="Intermediate, O-Level, Bachelor"
        />
      </label>
      <label>
        Sponsor type
        <select name="sponsor_type" required defaultValue="">
          <option value="" disabled>
            Choose sponsor
          </option>
          <option>Self</option>
          <option>Parent / Family</option>
          <option>Business Sponsor</option>
          <option>Scholarship</option>
        </select>
      </label>
      <label>
        Assigned consultant
        <select name="assigned_consultant_id" required defaultValue={defaultConsultantId}>
          {consultants.map((consultant) => (
            <option key={consultant.id} value={consultant.id}>
              {consultant.full_name}
            </option>
          ))}
        </select>
      </label>
      {!consultants.length ? (
        <div className="alert error span-2">
          No active consultant profile is available for this agency.
        </div>
      ) : null}
      <label>
        Deadline date
        <input name="deadline_date" type="date" />
      </label>
      <div className="form-actions">
        <SubmitButton pendingLabel="Creating student..." disabled={!consultants.length}>
          Create student
        </SubmitButton>
      </div>
    </form>
  );
}
