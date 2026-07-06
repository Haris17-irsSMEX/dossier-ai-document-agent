function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

export function validateWhatsAppNumber(phone: string) {
  const trimmed = phone.trim();

  if (!trimmed) {
    return {
      ok: false as const,
      error: "Student WhatsApp number is missing."
    };
  }

  try {
    const normalized = normalizeWhatsAppNumber(trimmed);

    if (!/^92\d{10}$/.test(normalized)) {
      return {
        ok: false as const,
        error:
          "Add a valid student WhatsApp number in Pakistani format, for example 03001234567 or +923001234567."
      };
    }

    return {
      ok: true as const,
      normalized
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Student WhatsApp number is invalid."
    };
  }
}

export function normalizeWhatsAppNumber(phone: string) {
  const trimmed = phone.trim();

  if (!trimmed) {
    throw new Error("Student WhatsApp number is missing.");
  }

  let normalized = digitsOnly(trimmed);

  if (!normalized) {
    throw new Error("Student WhatsApp number is invalid.");
  }

  if (normalized.startsWith("00")) {
    normalized = normalized.slice(2);
  }

  if (/^03\d{9}$/.test(normalized)) {
    normalized = `92${normalized.slice(1)}`;
  } else if (normalized.startsWith("92")) {
    normalized = normalized;
  } else if (normalized.startsWith("0")) {
    normalized = normalized.replace(/^0+/, "");
  }

  if (normalized.length < 10) {
    throw new Error(
      "Student WhatsApp number is too short. Add a valid number with country code."
    );
  }

  return normalized;
}

export function buildWhatsAppHandoffUrl(phone: string, message: string) {
  const result = validateWhatsAppNumber(phone);

  if (!result.ok) {
    throw new Error(result.error);
  }

  const normalized = result.normalized;
  const body = message.trim();

  if (!body) {
    throw new Error("WhatsApp message is empty.");
  }

  return `https://wa.me/${normalized}?text=${encodeURIComponent(body)}`;
}
