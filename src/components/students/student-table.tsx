import Link from "next/link";

type Student = {
  id: string;
  full_name: string;
  phone?: string | null;
  target_country?: string | null;
  destination_country?: string | null;
  intake?: string | null;
  program_level?: string | null;
  deadline_date?: string | null;
};

export function StudentTable({ students }: { students: Student[] }) {
  if (!students.length) {
    return (
      <div className="empty-state">
        <strong>No students yet</strong>
        <p>Create a student profile to start a checklist.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Country</th>
            <th>Intake</th>
            <th>Level</th>
            <th>Deadline</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td>
                <strong>{student.full_name}</strong>
                <span>{student.phone || "No phone"}</span>
              </td>
              <td>{student.target_country || student.destination_country || "-"}</td>
              <td>{student.intake || "-"}</td>
              <td>{student.program_level || "-"}</td>
              <td>{student.deadline_date || "-"}</td>
              <td>
                <Link className="text-link" href={`/students/${student.id}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
