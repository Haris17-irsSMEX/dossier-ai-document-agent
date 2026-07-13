"use client";

import { useState } from "react";

import {
  educationBackgroundOptions,
  parseEducationBackground
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

  const hasOther = selected.includes("Other");
  const selectedDisplay = selected.filter((option) => option !== "Other");

  const showSummary = selectedDisplay.length > 0 || (hasOther && otherText.trim());

  return (
    <div className="education-background-field">
      <span className="field-help">
        Select all qualifications the student has completed.
      </span>
      <div className="education-background-grid">
        {educationBackgroundOptions.map((option) => {
          const checked = selected.includes(option);

          return (
            <label
              key={option}
              className={`education-option ${checked ? "selected" : ""}`}
            >
              <input
                checked={checked}
                name={`${name}_values`}
                type="checkbox"
                value={option}
                onChange={() => toggleOption(option)}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
      {showSummary ? (
        <div className="education-selection-summary">
          {selectedDisplay.map((option) => (
            <span className="chip" key={option}>
              {option}
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
