export const EDUCATION_COMPLETED_OPTIONS = [
  {
    value: "matric_ssc",
    label: "Matric / SSC",
    aliases: ["matric", "ssc", "secondary certificate", "secondary school"]
  },
  {
    value: "o_level",
    label: "O-Level",
    aliases: ["o-level", "olevel", "o level", "cambridge o level"]
  },
  {
    value: "intermediate_hssc",
    label: "Intermediate / HSSC",
    aliases: ["intermediate", "hssc", "higher secondary", "higher secondary certificate"]
  },
  {
    value: "a_level",
    label: "A-Level",
    aliases: ["a-level", "alevel", "a level", "cambridge a level"]
  },
  {
    value: "diploma",
    label: "Diploma",
    aliases: ["diploma", "dae"]
  },
  {
    value: "foundation",
    label: "Foundation",
    aliases: ["foundation", "foundation year"]
  },
  {
    value: "bachelor",
    label: "Bachelor",
    aliases: ["bachelor", "bachelors", "bs", "ba", "bsc", "bba", "be"]
  },
  {
    value: "master",
    label: "Master",
    aliases: ["master", "masters", "msc", "ma", "mba"]
  },
  {
    value: "mphil_ms",
    label: "MPhil / MS",
    aliases: ["mphil", "m phil", "mphil ms", "ms"]
  },
  {
    value: "phd",
    label: "PhD",
    aliases: ["phd", "doctorate", "doctoral"]
  },
  {
    value: "other",
    label: "Other",
    aliases: ["other"]
  }
] as const;

export type EducationCompletedValue =
  (typeof EDUCATION_COMPLETED_OPTIONS)[number]["value"];

export const educationBackgroundOptions = EDUCATION_COMPLETED_OPTIONS.map(
  (option) => option.label
);

export const programLevelOptions = [
  "Foundation",
  "Diploma",
  "Bachelor",
  "Master",
  "PhD"
] as const;

const optionOrder = EDUCATION_COMPLETED_OPTIONS.map((option) => option.value);

function normalizeForMatch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function optionForValue(value: string) {
  const normalized = normalizeForMatch(value);

  return EDUCATION_COMPLETED_OPTIONS.find((option) => {
    if (option.value === value) {
      return true;
    }

    const candidates = [option.value, option.label, ...option.aliases];

    return candidates.some((candidate) => normalizeForMatch(candidate) === normalized);
  });
}

function splitStoredEducationValue(value?: string | null) {
  const trimmed = value?.trim() || "";

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed
        .map((part) => String(part).trim())
        .filter(Boolean);
    }
  } catch {
    // Older Dossier records use plain text. Keep parsing them below.
  }

  const separator = trimmed.includes("|") ? "|" : ",";

  return trimmed
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseEducationBackground(value?: string | null) {
  const selected = new Set<EducationCompletedValue>();
  const otherEntries: string[] = [];
  const parts = splitStoredEducationValue(value);

  for (const part of parts) {
    const trimmedPart = part.trim();
    const normalizedPart = trimmedPart.toLowerCase();

    if (normalizedPart.startsWith("other:")) {
      selected.add("other");
      const custom = trimmedPart.slice(trimmedPart.indexOf(":") + 1).trim();

      if (custom) {
        otherEntries.push(custom);
      }
      continue;
    }

    const matchedOption = optionForValue(trimmedPart);

    if (matchedOption) {
      selected.add(matchedOption.value);
      continue;
    }

    selected.add("other");
    otherEntries.push(trimmedPart);
  }

  return {
    selected: optionOrder.filter((option) => selected.has(option)),
    otherText: otherEntries.join(", ")
  };
}

export function educationCompletedLabel(value: string) {
  return optionForValue(value)?.label || value;
}

export function serializeEducationBackground(
  selectedOptions: string[],
  otherText?: string
) {
  const selected = new Set<EducationCompletedValue>();

  for (const option of selectedOptions) {
    const matched = optionForValue(option);

    if (matched) {
      selected.add(matched.value);
    }
  }

  const values: string[] = optionOrder.filter(
    (option) => option !== "other" && selected.has(option)
  );
  const trimmedOther = otherText?.trim();

  if (selected.has("other")) {
    values.push(trimmedOther ? `other:${trimmedOther}` : "other");
  }

  return JSON.stringify(values);
}

export function normalizeEducationBackground(
  value?: string | null,
  fallbackOtherText?: string
) {
  const parsed = parseEducationBackground(value);
  const otherText =
    parsed.otherText.trim() || fallbackOtherText?.trim() || "";

  return serializeEducationBackground(parsed.selected, otherText);
}

export function formatEducationBackgroundDisplay(value?: string | null) {
  const parsed = parseEducationBackground(value);
  const labels = parsed.selected
    .filter((option) => option !== "other")
    .map(educationCompletedLabel);

  if (parsed.selected.includes("other") && parsed.otherText.trim()) {
    labels.push(`Other: ${parsed.otherText.trim()}`);
  } else if (parsed.selected.includes("other")) {
    labels.push("Other");
  }

  return labels.join(", ");
}

export function parseEducationCompleted(value?: string | null) {
  return parseEducationBackground(value).selected;
}

export function serializeEducationCompleted(values: string[]) {
  return serializeEducationBackground(values);
}
