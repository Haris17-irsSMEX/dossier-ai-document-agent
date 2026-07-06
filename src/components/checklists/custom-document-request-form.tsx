import { addCustomChecklistItemAction } from "@/lib/actions/checklists";
import { CHECKLIST_PHASES } from "@/lib/checklists/phases";
import { acceptedFormats, requirementLevels } from "@/lib/checklists/rules";

export function CustomDocumentRequestForm({
  studentId,
  defaultPhaseSlug
}: {
  studentId: string;
  defaultPhaseSlug?: string;
}) {
  return (
    <form action={addCustomChecklistItemAction} className="request-form custom-request-form">
      <input type="hidden" name="student_id" value={studentId} />
      <div className="request-form-grid">
        <label>
          Document name
          <input
            name="document_name"
            placeholder="e.g. Work experience letter"
            required
          />
        </label>
        <label>
          Phase
          <select
            name="phase_slug"
            defaultValue={defaultPhaseSlug || CHECKLIST_PHASES[0].slug}
          >
            {CHECKLIST_PHASES.map((phase) => (
              <option key={phase.slug} value={phase.slug}>
                {phase.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Requirement level
          <select name="requirement_level" defaultValue="required">
            {requirementLevels.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Upload type
          <select name="upload_type" defaultValue="single">
            <option value="single">Single file</option>
            <option value="multiple">Multiple files</option>
            <option value="front_back">Front &amp; back</option>
            <option value="multi_part">Multi-part</option>
            <option value="reference">Reference document</option>
          </select>
        </label>
      </div>
      <label>
        Condition note
        <input
          name="condition_note"
          placeholder="When should the student provide this?"
        />
      </label>
      <label>
        Upload instructions
        <textarea
          name="instructions"
          placeholder="Tell the student exactly what to upload."
          rows={3}
        />
      </label>
      <fieldset>
        <legend>Accepted formats</legend>
        <div className="inline-controls">
          {acceptedFormats.map((format) => (
            <label className="check-row" key={format}>
              <input
                name="accepted_formats"
                type="checkbox"
                value={format}
                defaultChecked={format !== "docx"}
              />
              {format.toUpperCase()}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Required parts for multi-part uploads
        <textarea
          name="required_parts_text"
          rows={3}
          placeholder={"Front Side\nBack Side\nSupporting Page (optional)"}
        />
      </label>
      <div className="inline-controls request-toggles">
        <label className="check-row">
          <input name="ai_validation_enabled" type="checkbox" defaultChecked />
          AI quality check
        </label>
        <label className="check-row">
          <input name="expiry_validation_enabled" type="checkbox" />
          Expiry validation
        </label>
        <label className="check-row">
          <input name="visible_to_student" type="checkbox" defaultChecked />
          Visible to student
        </label>
      </div>
      <label>
        Submission deadline
        <input name="submission_deadline" type="date" />
      </label>
      <div className="form-actions">
        <button className="button" type="submit">
          Save document request
        </button>
        <button className="button secondary" type="reset">
          Cancel
        </button>
      </div>
    </form>
  );
}
