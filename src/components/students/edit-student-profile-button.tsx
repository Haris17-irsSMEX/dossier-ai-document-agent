"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EducationBackgroundField } from "@/components/students/education-background-field";
import { updateStudentProfileAction } from "@/lib/actions/students";
import { programLevelOptions } from "@/lib/students/education-background";

type Consultant = {
  id: string;
  full_name: string;
};

type StudentProfile = {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  target_country?: string | null;
  destination_country?: string | null;
  intake?: string | null;
  program_level?: string | null;
  education_background?: string | null;
  sponsor_type?: string | null;
  assigned_consultant_id?: string | null;
  deadline_date?: string | null;
  status?: string | null;
};

export function EditStudentProfileButton({
  canAssignCounselor = false,
  consultants,
  compact = false,
  student
}: {
  canAssignCounselor?: boolean;
  consultants: Consultant[];
  compact?: boolean;
  student: StudentProfile;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setStatus(null);
    setWarning(null);

    startTransition(async () => {
      try {
        const result = await updateStudentProfileAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setStatus(result.message);
        setWarning(result.warning || null);
        router.refresh();
      } catch (actionError) {
        console.error("[edit-student-profile] update failed", actionError);
        setError("Could not update this student profile right now.");
      }
    });
  }

  return (
    <>
      <button
        className={compact ? "button secondary table-action" : "button secondary"}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Pencil aria-hidden="true" size={compact ? 14 : 15} />
        Edit profile
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !isPending && setIsOpen(false)}>
          <div
            aria-labelledby={`edit-student-${student.id}`}
            aria-modal="true"
            className="modal-panel"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2 id={`edit-student-${student.id}`}>Edit student profile</h2>
                <p>Update the student details without changing existing document requests.</p>
              </div>
              <button
                className="button secondary compact-button"
                disabled={isPending}
                type="button"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
            </div>

            <form action={handleSubmit} className="student-form">
              <input name="student_id" type="hidden" value={student.id} />

              {status ? <div className="alert success">{status}</div> : null}
              {warning ? <div className="alert info">{warning}</div> : null}
              {error ? <div className="alert error">{error}</div> : null}

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Student identity</h2>
                  <p>Primary contact details for the applicant.</p>
                </div>
                <div className="form-section-fields">
                  <label>
                    Full name
                    <input defaultValue={student.full_name} name="full_name" required />
                  </label>
                  <label>
                    Phone
                    <input defaultValue={student.phone || ""} name="phone" placeholder="+923001234567" />
                  </label>
                  <label>
                    Email
                    <input
                      defaultValue={student.email || ""}
                      name="email"
                      placeholder="student@example.com"
                      type="email"
                    />
                  </label>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Study plan</h2>
                  <p>Keep destination and intake details current.</p>
                </div>
                <div className="form-section-fields">
                  <label>
                    Destination country
                    <input
                      defaultValue={student.target_country || student.destination_country || ""}
                      name="target_country"
                      required
                    />
                  </label>
                  <label>
                    Intake
                    <input defaultValue={student.intake || ""} name="intake" required />
                  </label>
                  <label>
                    Applying for
                    <select
                      defaultValue={student.program_level || ""}
                      name="program_level"
                      required
                    >
                      <option value="" disabled>
                        Choose level
                      </option>
                      {programLevelOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <span className="field-help">
                      Select the program level the student wants admission in.
                    </span>
                  </label>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Background</h2>
                  <p>Update sponsor and study background when the case changes.</p>
                </div>
                <div className="form-section-fields">
                  <div>
                    <span className="field-label">Education completed</span>
                    <EducationBackgroundField defaultValue={student.education_background || ""} />
                  </div>
                  <label>
                    Sponsor type
                    <input defaultValue={student.sponsor_type || ""} name="sponsor_type" required />
                  </label>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Ownership & deadline</h2>
                  <p>Keep assignment, status, and timing up to date.</p>
                </div>
                <div className="form-section-fields">
                  {canAssignCounselor ? (
                    <label>
                      Assigned counselor
                      <select
                        defaultValue={student.assigned_consultant_id || consultants[0]?.id || ""}
                        name="assigned_consultant_id"
                        required
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
                      value={student.assigned_consultant_id || consultants[0]?.id || ""}
                    />
                  )}
                  <label>
                    Deadline date
                    <input
                      defaultValue={student.deadline_date || ""}
                      name="deadline_date"
                      type="date"
                    />
                  </label>
                  <label>
                    Status
                    <select defaultValue={student.status || "active"} name="status">
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>
              </section>

              <div className="form-actions">
                <span className="form-note">
                  Upload links, requested documents, and uploaded files stay as they are.
                </span>
                <div className="button-row">
                  <button
                    className="button secondary"
                    disabled={isPending}
                    type="button"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </button>
                  <button className="button" disabled={isPending} type="submit">
                    {isPending ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
