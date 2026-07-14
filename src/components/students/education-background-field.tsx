"use client";

import { useState } from "react";

import {
  EDUCATION_COMPLETED_OPTIONS,
  educationCompletedLabel,
  parseEducationBackground,
  serializeEducationBackground
} from "@/lib/students/education-background";

export function EducationBackgroundField({
  defaultValue,
  name = "education_background"
}: {
  defaultValue?: string | null;
  name?: string;
}) {
  const parsed = parseEducationBackground(defaultValue);
  const [selected, setSelected] = useState<string[]>(parsed.selected);
  const [otherText, setOtherText] = useState(parsed.otherText);

  function toggleOption(option: string) {
    setSelected((current) => {
      if (current.includes(option)) {
        return current.filter((value) => value !== option);
      }

      return [...current, option];
    });
  }

  const hasOther = selected.includes("other");
  const selectedDisplay = selected.filter((option) => option !== "other");
  const serializedValue = serializeEducationBackground(selected, otherText);

  const showSummary = selectedDisplay.length > 0 || (hasOther && otherText.trim());

  return (
    <div className="education-background-field">
      <input name={name} type="hidden" value={serializedValue} />
      <span className="field-help">
        Select all qualifications the student has completed.
      </span>
      <div className="education-background-grid">
        {EDUCATION_COMPLETED_OPTIONS.map((option) => {
          const checked = selected.includes(option.value);

          return (
            <label
              key={option.value}
              className={`education-option ${checked ? "selected" : ""}`}
            >
              <input
                checked={checked}
                name={`${name}_values`}
                type="checkbox"
                value={option.value}
                onChange={() => toggleOption(option.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      {showSummary ? (
        <div className="education-selection-summary">
          {selectedDisplay.map((option) => (
            <span className="chip" key={option}>
              {educationCompletedLabel(option)}
            </span>
          ))}
          {hasOther && otherText.trim() ? (
            <span className="chip">Other: {otherText.trim()}</span>
          ) : null}
        </div>
      ) : null}
      {hasOther ? (
        <label className="span-2">
          Other education background
          <input
            name={`${name}_other`}
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
            placeholder="DAE Electrical"
          />
        </label>
      ) : null}
    </div>
  );
}
