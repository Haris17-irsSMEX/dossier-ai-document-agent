const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  dateStyle: "medium",
  timeStyle: "short"
});

export function formatDateTime(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return DATE_FORMATTER.format(date);
}
