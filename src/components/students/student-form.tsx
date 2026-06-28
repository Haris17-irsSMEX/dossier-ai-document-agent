import { SubmitButton } from "@/components/forms/submit-button";
import { createStudentAction } from "@/lib/actions/students";

type Consultant = {
  id: string;
  full_name: string;
  email?: string | null;
};

function FormSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="form-section">
      <div className="form-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="form-section-fields">{children}</div>
    </section>
  );
}

export function StudentForm({
  consultants,
  error
}: {
  consultants: Consultant[];
  error?: string;
}) {
  const defaultConsultantId = consultants[0]?.id || "";

  return (
    <form action={createStudentAction} className="student-form">
      {error ? <div className="alert error">{error}</div> : null}

      <FormSection
        title="Student identity"
        description="Primary contact details for the applicant."
      >
        <label>
          Student name
          <input name="full_name" required placeholder="Ayesha Khan" />
        </label>
        <label>
          Phone
          <input name="phone" placeholder="+923001234567" />
          <span className="field-help">Include the country code for WhatsApp.</span>
        </label>
        <label>
          Email
          <input name="email" type="email" placeholder="student@example.com" />
          <span className="field-help">Used for optional email reminders.</span>
        </label>
      </FormSection>

      <FormSection
        title="Study plan"
        description="Where and when the student plans to study."
      >
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
      </FormSection>

      <FormSection
        title="Background"
        description="Context used by the smart checklist rules."
      >
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
      </FormSection>

      <FormSection
        title="Ownership & deadline"
        description="Assign the case and set the application timeline."
      >
        <label>
          Assigned consultant
          <select
            name="assigned_consultant_id"
            required
            defaultValue={defaultConsultantId}
          >
            {consultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {consultant.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deadline date
          <input name="deadline_date" type="date" />
        </label>
        {!consultants.length ? (
          <div className="alert error span-2">
            No active consultant profile is available for this agency.
          </div>
        ) : null}
      </FormSection>

      <div className="form-actions">
        <span className="form-note">
          A smart checklist is generated after the student profile is created.
        </span>
        <SubmitButton
          pendingLabel="Creating student..."
          disabled={!consultants.length}
        >
          Create student & continue
        </SubmitButton>
      </div>
    </form>
  );
}
