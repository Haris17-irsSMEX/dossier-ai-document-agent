import { EducationBackgroundField } from "@/components/students/education-background-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { createStudentAction } from "@/lib/actions/students";
import { programLevelOptions } from "@/lib/students/education-background";

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
  canAssignCounselor = false,
  consultants,
  error
}: {
  canAssignCounselor?: boolean;
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
          Applying for
          <select name="program_level" required defaultValue="">
            <option value="" disabled>
              Choose level
            </option>
            {programLevelOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <span className="field-help">
            Select the program level the student wants admission in.
          </span>
        </label>
      </FormSection>

      <FormSection
        title="Background"
        description="Context used to prepare smart document options."
      >
        <div>
          <span className="field-label">Education completed</span>
          <EducationBackgroundField />
        </div>
        <label className="sponsor-field">
          Sponsor type
          <select name="sponsor_type" required defaultValue="">
            <option value="" disabled>
              Choose sponsor type
            </option>
            <option>Parent / Family</option>
            <option>Self-funded</option>
            <option>Scholarship</option>
            <option>Education loan</option>
            <option>Government / Employer sponsored</option>
            <option>Other</option>
          </select>
          <span className="field-help">Choose who will fund this application.</span>
        </label>
      </FormSection>

      <FormSection
        title="Ownership & deadline"
        description="Assign the case and set the application timeline."
      >
        {canAssignCounselor ? (
          <label>
            Assigned counselor
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
        ) : (
          <input
            name="assigned_consultant_id"
            type="hidden"
            value={defaultConsultantId}
          />
        )}
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
          Document options are prepared after the student profile is created.
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
