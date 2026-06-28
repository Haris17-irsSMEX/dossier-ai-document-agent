"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveStudent } from "@/lib/actions/students";

type ArchiveStudentButtonProps = {
  studentId: string;
  studentName: string;
  archived?: boolean;
  compact?: boolean;
};

export function ArchiveStudentButton({
  studentId,
  studentName,
  archived = false,
  compact = false
}: ArchiveStudentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleArchive() {
    if (archived || isPending) {
      return;
    }

    const confirmed = window.confirm(
      "Archive this student case? You can still find it under Archived cases."
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await archiveStudent(studentId);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        const message = encodeURIComponent(
          `${studentName} was moved to Archived cases.`
        );
        router.replace(`/students?success=${message}`);
        router.refresh();
      } catch (actionError) {
        console.error("[archive-student-button] archive failed", actionError);
        setError("Could not archive this student case. Please try again.");
      }
    });
  }

  if (archived) {
    if (compact) {
      return null;
    }

    return (
      <div className="archive-action-stack">
        <span className="chip archived">Archived</span>
      </div>
    );
  }

  return (
    <div className={compact ? "table-action-stack" : "archive-action-stack"}>
      <button
        aria-label={`Archive ${studentName}`}
        className={compact ? "button ghost-danger table-action" : "button ghost-danger"}
        disabled={isPending}
        type="button"
        onClick={handleArchive}
      >
        <Archive aria-hidden="true" size={compact ? 14 : 15} />
        {isPending ? "Archiving..." : "Archive"}
      </button>
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}
