import { updateChecklistItemAction } from "@/lib/actions/checklists";
import { CHECKLIST_PHASES } from "@/lib/checklists/phases";
import {
  acceptedFormats,
  requirementLevels,
  uploadTypes
} from "@/lib/checklists/rules";

type ChecklistItem = {
  id: string;
  student_id: string;
  document_name: string;
  is_required: boolean;
  phase_slug?: string | null;
  requirement_level?: string | null;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  applies_from_stage?: string | null;
  condition_note?: string | null;
  instructions?: string | null;
  accepted_formats: string[];
  upload_type: string;
  required_parts: Array<{ part_name: string; is_required: boolean }>;
  ai_validation_enabled: boolean;
  expiry_validation_enabled: boolean;
  visible_to_student?: boolean | null;
  submission_deadline?: string | null;
};

export function DocumentRequestForm({ item }: { item: ChecklistItem }) {
  const partsText =
    item.required_parts
      ?.map((part) => `${part.part_name}${part.is_required ? "" : " (optional)"}`)
      .join("\n") || "";

  return (
    <form action={updateChecklistItemAction} className="request-form">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="student_id" value={item.student_id} />
      <div className="request-form-grid">
        <label>
          Document name
          <input name="document_name" defaultValue={item.document_name} required />
        </label>
        <label>
          Phase
          <select
            name="phase_slug"
            defaultValue={item.phase_slug || CHECKLIST_PHASES[0].slug}
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
          <select
            name="requirement_level"
            defaultValue={
              item.requirement_level || (item.is_required ? "required" : "optional")
            }
          >
            {requirementLevels.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Submission deadline
          <input
            name="submission_deadline"
            type="date"
            defaultValue={item.submission_deadline || ""}
          />
        </label>
      </div>
      <label>
        Condition note
        <input name="condition_note" defaultValue={item.condition_note || ""} />
      </label>
      <label>
        Consultant instructions
        <textarea
          name="instructions"
          defaultValue={item.instructions || ""}
          rows={3}
        />
      </label>
      <div className="inline-controls">
        <label className="check-row">
          <input
            name="ai_validation_enabled"
            type="checkbox"
            defaultChecked={item.ai_validation_enabled}
          />
          AI validation
        </label>
        <label className="check-row">
          <input
            name="expiry_validation_enabled"
            type="checkbox"
            defaultChecked={item.expiry_validation_enabled}
          />
          Expiry validation
        </label>
        <label className="check-row">
          <input
            name="visible_to_student"
            type="checkbox"
            defaultChecked={item.visible_to_student !== false}
          />
          Visible to student
        </label>
      </div>
      <fieldset>
        <legend>Accepted formats</legend>
        <div className="inline-controls">
          {acceptedFormats.map((format) => (
            <label className="check-row" key={format}>
              <input
                name="accepted_formats"
                type="checkbox"
                value={format}
                defaultChecked={item.accepted_formats?.includes(format)}
              />
              {format.toUpperCase()}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Upload type
        <select name="upload_type" defaultValue={item.upload_type}>
          {uploadTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Required parts for multi-part uploads
        <textarea
          name="required_parts_text"
          defaultValue={partsText}
          rows={3}
          placeholder={"Front Side\nBack Side\nAdditional Visa Pages (optional)"}
        />
      </label>
      <button className="button secondary" type="submit">
        Save request
      </button>
    </form>
  );
}
