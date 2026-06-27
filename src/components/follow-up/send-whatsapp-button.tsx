"use client";

export function SendWhatsAppButton({
  disabled,
  isPending,
  onSend
}: {
  disabled?: boolean;
  isPending?: boolean;
  onSend: () => void;
}) {
  return (
    <button
      className="button"
      disabled={disabled || isPending}
      type="button"
      onClick={onSend}
    >
      {isPending ? "Sending..." : "Send WhatsApp"}
    </button>
  );
}
