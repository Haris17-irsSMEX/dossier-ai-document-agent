"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatDate } from "@/lib/date";

import { ArchiveStudentButton } from "./archive-student-button";

type Student = {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  target_country?: string | null;
  destination_country?: string | null;
  intake?: string | null;
  program_level?: string | null;
  deadline_date?: string | null;
  status?: string | null;
  archived_at?: string | null;
  checklist_items?: Array<{
    status: string;
    is_required: boolean;
  }> | null;
};

const completedStatuses = new Set(["accepted", "officially_verified"]);
const reviewStatuses = new Set([
  "wrong_format",
  "wrong_document",
  "blurry",
  "expired",
  "name_mismatch",
  "needs_review",
  "suspicious",
  "rejected",
  "official_verification_required"
]);

function studentProgress(student: Student) {
  const required = (student.checklist_items ?? []).filter(
    (item) => item.is_required
  );
  const completed = required.filter((item) =>
    completedStatuses.has(item.status)
  ).length;
  const hasReview = required.some((item) => reviewStatuses.has(item.status));
  const hasMissing = required.some((item) => item.status === "missing");
  const ready = required.length > 0 && completed === required.length;

  return {
    completed,
    total: required.length,
    status: ready
      ? "Ready"
      : hasReview
        ? "Needs review"
        : hasMissing
          ? "Missing documents"
          : "Open",
    tone: ready ? "success" : hasReview ? "warning" : hasMissing ? "danger" : ""
  };
}

export function StudentTable({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("active");
  const [filter, setFilter] = useState("all");
  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return students.filter((student) => {
      const studentStatus = student.status === "archived" ? "archived" : "active";
      const progress = studentProgress(student);
      const matchesQuery =
        !normalized ||
        [
          student.full_name,
          student.phone,
          student.email,
          student.target_country,
          student.destination_country
        ].some((value) => value?.toLowerCase().includes(normalized));
      const matchesScope =
        scope === "all" ||
        (scope === "archived" && studentStatus === "archived") ||
        (scope === "active" && studentStatus !== "archived");
      const matchesFilter =
        filter === "all" ||
        (filter === "ready" && progress.status === "Ready") ||
        (filter === "needs_action" &&
          ["Needs review", "Missing documents"].includes(progress.status));

      return matchesQuery && matchesScope && matchesFilter;
    });
  }, [filter, query, scope, students]);

  if (!students.length) {
    return (
      <div className="empty-state">
        <strong>No students yet</strong>
        <p>Create your first student case.</p>
        <div className="actions">
          <Link className="button" href="/students/new">
            New student
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="student-searchbar">
        <div className="search-input-wrap">
          <Search aria-hidden="true" size={17} />
          <input
            aria-label="Search students"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, email, or country"
            type="search"
            value={query}
          />
        </div>
        <select
          aria-label="Filter archived students"
          onChange={(event) => setScope(event.target.value)}
          value={scope}
        >
          <option value="active">Active cases</option>
          <option value="archived">Archived cases</option>
          <option value="all">All cases</option>
        </select>
        <select
          aria-label="Filter student status"
          onChange={(event) => setFilter(event.target.value)}
          value={filter}
        >
          <option value="all">All cases</option>
          <option value="needs_action">Needs action</option>
          <option value="ready">Ready</option>
        </select>
      </div>

      {filteredStudents.length ? (
        <div className="table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Destination</th>
                <th>Level</th>
                <th>Deadline</th>
                <th>Progress</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => {
                const archived = student.status === "archived";
                const progress = studentProgress(student);

                return (
                  <tr key={student.id}>
                    <td className="student-cell">
                      <strong>{student.full_name}</strong>
                      <span>
                        {student.phone || student.email || "No contact details"}
                      </span>
                    </td>
                    <td className="destination-cell">
                      <strong>
                        {student.target_country ||
                          student.destination_country ||
                          "Not set"}
                      </strong>
                      <span>{student.intake || "Intake not set"}</span>
                    </td>
                    <td>{student.program_level || "-"}</td>
                    <td>{formatDate(student.deadline_date) || "Not set"}</td>
                    <td>
                      {progress.total
                        ? `${progress.completed} of ${progress.total}`
                        : "Not generated"}
                    </td>
                    <td>
                      <span className={`chip ${archived ? "archived" : progress.tone}`}>
                        {archived ? "Archived" : progress.status}
                      </span>
                    </td>
                    <td className="table-actions-cell">
                      <div className="table-actions">
                        <Link
                          className="button secondary table-action"
                          href={`/students/${student.id}`}
                        >
                          Open
                        </Link>
                        <ArchiveStudentButton
                          archived={archived}
                          compact
                          studentId={student.id}
                          studentName={student.full_name}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <strong>No matching students</strong>
          <p>Try a different name, phone number, country, case view, or status.</p>
        </div>
      )}
    </>
  );
}
