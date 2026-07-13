export const educationBackgroundOptions = [
  "Matric / SSC",
  "O-Level",
  "Intermediate / HSSC",
  "A-Level",
  "Diploma",
  "Foundation",
  "Bachelor",
  "Master",
  "MPhil / MS",
  "PhD",
  "Other"
] as const;

export const EDUCATION_COMPLETED_OPTIONS = educationBackgroundOptions;

export const programLevelOptions = [
  "Foundation",
  "Diploma",
  "Bachelor",
  "Master",
  "PhD"
] as const;

const educationAliases: Record<string, string[]> = {
  "Matric / SSC": ["matric", "ssc", "secondary"],
  "O-Level": ["o-level", "olevel"],
  "Intermediate / HSSC": ["intermediate", "hssc", "higher secondary"],
  "A-Level": ["a-level", "alevel"],
  Diploma: ["diploma", "dae"],
  Foundation: ["foundation"],
  Bachelor: ["bachelor", "bs", "ba", "bsc", "bba", "be"],
  Master: ["master", "msc", "ma", "mba"],
  "MPhil / MS": ["mphil", "mphil / ms", "ms"],
  PhD: ["phd", "doctorate", "doctoral"],
  Other: ["other"]
};

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function matchesOption(input: string, option: string) {
  const normalizedInput = normalizeValue(input);
  const aliases = educationAliases[option] || [];

  return aliases.some(
    (alias) =>
      normalizedInput === alias ||
      normalizedInput.includes(alias) ||
      alias.includes(normalizedInput)
  );
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
  const selected = new Set<string>();
  const otherEntries: string[] = [];
  const parts = splitStoredEducationValue(value);

  for (const part of parts) {
    const normalizedPart = normalizeValue(part);

    if (normalizedPart.startsWith("other:")) {
      selected.add("Other");
      const custom = part.slice(part.indexOf(":") + 1).trim();

      if (custom) {
        otherEntries.push(custom);
      }
      continue;
    }

    const matchedOption = educationBackgroundOptions.find((option) =>
      option !== "Other" ? matchesOption(part, option) : false
    );

    if (matchedOption) {
      selected.add(matchedOption);
      continue;
    }

    selected.add("Other");
    otherEntries.push(part);
  }

  return {
    selected: educationBackgroundOptions.filter((option) => selected.has(option)),
    otherText: otherEntries.join(", ")
  };
}

export function serializeEducationBackground(
  selectedOptions: string[],
  otherText?: string
) {
  const knownSelections: string[] = educationBackgroundOptions.filter(
    (option) => option !== "Other" && selectedOptions.includes(option)
  );
  const trimmedOther = otherText?.trim();

  if (selectedOptions.includes("Other") && trimmedOther) {
    knownSelections.push(`Other: ${trimmedOther}`);
  }

  return knownSelections.join(", ");
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
  return normalizeEducationBackground(value);
}

export function parseEducationCompleted(value?: string | null) {
  return parseEducationBackground(value).selected;
}

export function serializeEducationCompleted(values: string[]) {
  return serializeEducationBackground(values);
}
