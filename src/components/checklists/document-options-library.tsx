"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import {
  activateChecklistItemAction,
  bulkRequestChecklistItemsAction
} from "@/lib/actions/checklists";
import { DocumentRequestForm } from "@/components/checklists/document-request-form";
import { getChecklistPhase } from "@/lib/checklists/phases";

type ChecklistItem = Parameters<typeof DocumentRequestForm>[0]["item"] & {
  status: string;
  phase_label?: string | null;
  phase_order?: number | null;
  category?: string | null;
  category_label?: string | null;
  item_order?: number | null;
  is_custom?: boolean | null;
  source_template_key?: string | null;
};

type LibraryFilter =
  | "all"
  | "core"
  | "academic"
  | "financial"
  | "visa"
  | "verification"
  | "optional";

const filters: Array<{ value: LibraryFilter; label: string }> = [
  { value: "all", label: "All options" },
  { value: "core", label: "Core profile" },
  { value: "academic", label: "Academic" },
  { value: "financial", label: "Financial" },
  { value: "visa", label: "Visa" },
  { value: "verification", label: "Verification" },
  { value: "optional", label: "Optional" }
];

const coreTemplateKeys = new Set(["passport", "cnic", "photo", "cv", "sop"]);
const academicTemplateKeys = new Set([
  "matric_records",
  "intermediate_records",
  "olevel_records",
  "alevel_records",
  "oa_equivalence",
  "bachelor_degree",
  "bachelor_transcript",
  "master_degree",
  "master_transcript",
  "language_proof",
  "recommendations",
  "course_descriptions",
  "research_proposal",
  "supervisor_acceptance",
  "thesis_abstract"
]);
const financialTemplateKeys = new Set([
  "sponsor_id",
  "sponsor_relationship",
  "sponsorship_affidavit",
  "bank_statement",
  "bank_maintenance",
  "tax_returns",
  "business_documents",
  "business_bank_statement",
  "business_tax_returns",
  "employment_letter",
  "salary_slips",
  "salary_bank_statement",
  "property_source",
  "special_funds"
]);
const visaTemplateKeys = new Set([
  "visa_form",
  "visa_appointments",
  "visa_fee",
  "travel_history",
  "police_certificate",
  "medical_tb",
  "health_insurance",
  "accommodation",
  "visa_sop"
]);

function phaseLabel(item: ChecklistItem) {
  return item.phase_label || getChecklistPhase(item.phase_slug).label;
}

function matchesFilter(item: ChecklistItem, filter: LibraryFilter) {
  const templateKey = item.source_template_key || "";
  const phaseSlug = item.phase_slug || "";
  const category = item.category || "";

  if (filter === "all") return true;
  if (filter === "core") return coreTemplateKeys.has(templateKey);
  if (filter === "academic") {
    return (
      academicTemplateKeys.has(templateKey) ||
      category === "educational" ||
      phaseSlug === "profile_academic_file" ||
      phaseSlug === "university_application"
    );
  }
  if (filter === "financial") {
    return (
      financialTemplateKeys.has(templateKey) ||
      category === "financial" ||
      category === "sponsor" ||
      phaseSlug === "financial_sponsor_file"
    );
  }
  if (filter === "visa") {
    return (
      visaTemplateKeys.has(templateKey) ||
      category === "visa" ||
      phaseSlug === "visa_processing" ||
      phaseSlug === "country_specific_requirements"
    );
  }
  if (filter === "verification") {
    return phaseSlug === "verification_attestation";
  }

  return phaseSlug === "optional_profile_boosters";
}

function RequestEditor({ item }: { item: ChecklistItem }) {
  return (
    <details className="request-editor-disclosure">
      <summary className="button secondary compact-button">
        <SlidersHorizontal aria-hidden="true" size={15} />
        Edit
      </summary>
      <div className="request-editor-panel">
        <DocumentRequestForm actionLabel="Save changes" item={item} />
      </div>
    </details>
  );
}

export function DocumentOptionsLibrary({
  studentId,
  items
}: {
  studentId: string;
  items: ChecklistItem[];
}) {
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visibleItems = items.filter((item) => matchesFilter(item, activeFilter));
  const selectedCount = selectedIds.length;

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((itemId) => itemId !== id)
    );
  }

  function selectAllShown() {
    setSelectedIds((current) => [
      ...new Set([...current, ...visibleItems.map((item) => item.id)])
    ]);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  return (
    <section className="panel request-builder-panel">
      <div className="section-title">
        <div>
          <h2>Suggested by Dossier</h2>
          <p>Select documents when you want to collect them.</p>
        </div>
        <form action={bulkRequestChecklistItemsAction} className="bulk-request-form">
          <input type="hidden" name="student_id" value={studentId} />
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="selected_ids" value={id} />
          ))}
          <button className="button compact-button" disabled={!selectedCount} type="submit">
            Request selected documents
          </button>
        </form>
      </div>

      <div className="document-library-toolbar">
        <div className="preset-action-row" aria-label="Document option filters">
          {filters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.value}
              className={`button secondary compact-button ${activeFilter === filter.value ? "active-filter-pill" : ""}`}
              key={filter.value}
              type="button"
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="selection-action-row">
          <span className="muted">Selected: {selectedCount} documents</span>
          <button
            className="button secondary compact-button"
            disabled={!visibleItems.length}
            type="button"
            onClick={selectAllShown}
          >
            Select all shown
          </button>
          <button
            className="button secondary compact-button"
            disabled={!selectedCount}
            type="button"
            onClick={clearSelection}
          >
            Clear selection
          </button>
        </div>
      </div>

      {!selectedCount ? (
        <p className="muted">Select one or more documents to request.</p>
      ) : null}

      {visibleItems.length ? (
        <div className="phase-request-list">
          {visibleItems.map((item) => (
            <article className="phase-request-row suggested-request-row" key={item.id}>
              <div className="phase-request-main">
                <div className="phase-request-title">
                  <label className="check-row request-select-row">
                    <input
                      checked={selectedIds.includes(item.id)}
                      type="checkbox"
                      onChange={(event) =>
                        toggleSelected(item.id, event.currentTarget.checked)
                      }
                    />
                    <strong>{item.document_name}</strong>
                  </label>
                  <span className="chip info">Suggested</span>
                  <span className="chip">Not requested</span>
                </div>
                <p>{item.instructions || "No upload instructions added."}</p>
                <div className="phase-request-meta">
                  <span>{phaseLabel(item)}</span>
                  <span>{item.category_label || item.upload_type.replaceAll("_", " ")}</span>
                  <span>{item.accepted_formats.join(", ").toUpperCase()}</span>
                  {item.is_custom ? <span>Custom option</span> : null}
                </div>
              </div>
              <div className="phase-request-actions">
                <form action={activateChecklistItemAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="student_id" value={item.student_id} />
                  <button className="button compact-button" type="submit">
                    Request
                  </button>
                </form>
                <RequestEditor item={item} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <strong>No options in this category</strong>
          <p>Switch filters or prepare document options for this student.</p>
        </div>
      )}
    </section>
  );
}
