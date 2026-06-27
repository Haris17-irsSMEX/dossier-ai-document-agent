import Link from "next/link";

import { VerificationCenter } from "@/components/verification/verification-center";
import { getStudent } from "@/lib/actions/students";
import { getVerificationCenter } from "@/lib/actions/verification";

export default async function StudentVerificationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [student, center] = await Promise.all([getStudent(id), getVerificationCenter(id)]);

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <div className="topbar">
          <div>
            <h1>{student.full_name}</h1>
            <p className="muted">Official verification tracking.</p>
          </div>
          <Link className="button secondary" href={`/students/${id}`}>
            Student profile
          </Link>
        </div>
        <VerificationCenter studentId={id} providers={center.providers} requests={center.requests} />
      </div>
    </main>
  );
}
