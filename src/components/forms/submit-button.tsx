"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "button",
  disabled
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending || disabled}>
      {pending ? pendingLabel : children}
    </button>
  );
}
