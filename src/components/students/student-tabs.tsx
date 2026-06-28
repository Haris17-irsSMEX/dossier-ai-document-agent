import Link from "next/link";

const tabItems = [
  { key: "overview", label: "Overview", suffix: "" },
  { key: "checklist", label: "Checklist", suffix: "/checklist" },
  { key: "documents", label: "Documents", suffix: "/documents" },
  { key: "verification", label: "Verification", suffix: "/verification" },
  { key: "follow-up", label: "Follow-up", suffix: "/follow-up" },
  { key: "export", label: "Export", suffix: "/export" }
];

export function StudentTabs({
  studentId,
  active
}: {
  studentId: string;
  active: string;
}) {
  return (
    <nav className="case-tabs" aria-label="Student case sections">
      {tabItems.map((item) => (
        <Link
          className={active === item.key ? "active" : ""}
          href={`/students/${studentId}${item.suffix}`}
          key={item.key}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
