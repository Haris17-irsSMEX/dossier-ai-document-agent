import { updateChecklistItemAction } from "@/lib/actions/checklists";
import { acceptedFormats, uploadTypes } from "@/lib/checklists/rules";

type ChecklistItem = {
  id: string;
  student_id: string;
  document_name: string;
  is_required: boolean;
  instructions?: string | null;
  accepted_formats: string[];
  upload_type: string;
  required_parts: Array<{ part_name: string; is_required: boolean }>;
  ai_validation_enabled: boolean;
  expiry_validation_enabled: boolean;
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
      <label>
        Document name
        <input name="document_name" defaultValue={item.document_name} required />
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
          <input name="is_required" type="checkbox" defaultChecked={item.is_required} />
          Required
        </label>
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
      <label>
        Submission deadline
        <input
          name="submission_deadline"
          type="date"
          defaultValue={item.submission_deadline || ""}
        />
      </label>
      <button className="button secondary" type="submit">
        Save request
      </button>
    </form>
  );
}
