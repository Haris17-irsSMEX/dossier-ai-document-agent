import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is disabled in production.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.DEMO_OWNER_EMAIL;

if (!url || !serviceRoleKey || !ownerEmail) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DEMO_OWNER_EMAIL before running the demo seed."
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    throw error;
  }

  return data.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );
}

async function ensureDemoUser(email, fullName) {
  const existing = await findUserByEmail(email);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `Demo-${randomUUID()}`
  });

  if (error || !data.user) {
    throw error || new Error(`Could not create ${fullName}.`);
  }

  return data.user;
}

async function ensureStudent(input) {
  const { data: existing } = await supabase
    .from("students")
    .select("id")
    .eq("agency_id", input.agency_id)
    .eq("email", input.email)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("students")
    .insert(input)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

const owner = await findUserByEmail(ownerEmail);

if (!owner) {
  throw new Error(
    `No Supabase Auth user exists for ${ownerEmail}. Sign up once, then run the seed again.`
  );
}

let { data: ownerProfile } = await supabase
  .from("profiles")
  .select("id, agency_id")
  .eq("id", owner.id)
  .maybeSingle();

let agencyId = ownerProfile?.agency_id;

if (!agencyId) {
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .insert({
      name: "ApplicationOps Demo Agency",
      slug: `applicationops-demo-${owner.id.slice(0, 8)}`,
      created_by: owner.id
    })
    .select("id")
    .single();

  if (agencyError) {
    throw agencyError;
  }

  agencyId = agency.id;
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: owner.id,
    agency_id: agencyId,
    full_name: "Demo Agency Owner",
    email: owner.email,
    role: "owner"
  });

  if (profileError) {
    throw profileError;
  }

  ownerProfile = { id: owner.id, agency_id: agencyId };
}

const consultantUsers = await Promise.all([
  ensureDemoUser("demo.consultant.one@example.com", "Ayesha Consultant"),
  ensureDemoUser("demo.consultant.two@example.com", "Bilal Consultant")
]);

await supabase.from("profiles").upsert(
  consultantUsers.map((user, index) => ({
    id: user.id,
    agency_id: agencyId,
    full_name: index === 0 ? "Ayesha Consultant" : "Bilal Consultant",
    email: user.email,
    role: "consultant",
    is_active: true
  }))
);

const studentInputs = [
  {
    full_name: "Haris Ahmed",
    email: "haris.demo@example.com",
    phone: "+923001234567",
    target_country: "United Kingdom",
    destination_country: "United Kingdom",
    intake: "September 2026",
    program_level: "Bachelor",
    education_background: "Intermediate",
    sponsor_type: "Parent",
    deadline_date: "2026-07-04"
  },
  {
    full_name: "Sara Khan",
    email: "sara.demo@example.com",
    phone: "+923111234567",
    target_country: "Canada",
    destination_country: "Canada",
    intake: "January 2027",
    program_level: "Master",
    education_background: "Bachelor",
    sponsor_type: "Self",
    deadline_date: "2026-08-15"
  },
  {
    full_name: "Usman Ali",
    email: "usman.demo@example.com",
    phone: "+923221234567",
    target_country: "Australia",
    destination_country: "Australia",
    intake: "February 2027",
    program_level: "Master",
    education_background: "Bachelor",
    sponsor_type: "Parent",
    deadline_date: "2026-09-30"
  }
];

const students = [];

for (const [index, student] of studentInputs.entries()) {
  students.push(
    await ensureStudent({
      ...student,
      agency_id: agencyId,
      assigned_consultant_id: consultantUsers[index % 2].id,
      created_by: owner.id
    })
  );
}

const statuses = ["missing", "needs_review", "accepted"];
const checklistNames = ["Passport", "CNIC", "Bank Statements"];

for (const [studentIndex, student] of students.entries()) {
  const { data: existingItems } = await supabase
    .from("checklist_items")
    .select("id, document_name")
    .eq("agency_id", agencyId)
    .eq("student_id", student.id);

  if (!existingItems?.length) {
    const { data: items, error } = await supabase
      .from("checklist_items")
      .insert(
        checklistNames.map((documentName, itemIndex) => ({
          agency_id: agencyId,
          student_id: student.id,
          category: itemIndex === 2 ? "financial" : "personal",
          document_name: documentName,
          is_required: true,
          instructions: `Demo request for ${documentName}. Upload a clear copy.`,
          accepted_formats:
            itemIndex === 2
              ? ["pdf"]
              : ["pdf", "jpg", "jpeg", "png"],
          upload_type:
            documentName === "CNIC" ? "multi_part" : documentName === "Bank Statements" ? "multiple" : "single",
          required_parts:
            documentName === "CNIC"
              ? [
                  { part_name: "Front Side", is_required: true },
                  { part_name: "Back Side", is_required: true }
                ]
              : [],
          status: statuses[(studentIndex + itemIndex) % statuses.length],
          created_by: owner.id
        }))
      )
      .select("id, document_name, status");

    if (error) {
      throw error;
    }

    const cnic = items.find((item) => item.document_name === "CNIC");

    if (cnic) {
      await supabase.from("document_parts").insert([
        {
          agency_id: agencyId,
          checklist_item_id: cnic.id,
          part_name: "Front Side",
          is_required: true,
          sort_order: 0
        },
        {
          agency_id: agencyId,
          checklist_item_id: cnic.id,
          part_name: "Back Side",
          is_required: true,
          sort_order: 1
        }
      ]);
    }

    const reviewItem = items.find((item) => item.status === "needs_review");

    if (reviewItem) {
      await supabase.from("document_issues").insert({
        agency_id: agencyId,
        student_id: student.id,
        checklist_item_id: reviewItem.id,
        issue_type: "other",
        severity: "medium",
        message: "Demo scan could not confidently read the document.",
        evidence: "Development seed sample.",
        recommended_action: "Review the uploaded copy manually."
      });
    }
  }
}

const { data: manualProvider } = await supabase
  .from("verification_providers")
  .select("id")
  .eq("code", "Manual")
  .maybeSingle();

if (manualProvider) {
  for (const student of students) {
    const { data: existing } = await supabase
      .from("verification_requests")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("student_id", student.id)
      .eq("provider_id", manualProvider.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from("verification_requests").insert({
        agency_id: agencyId,
        student_id: student.id,
        provider_id: manualProvider.id,
        requested_by: owner.id,
        status: "manual_review",
        instructions: "Demo manual verification review."
      });
    }
  }
}

const firstStudent = students[0];
const { data: existingWhatsApp } = await supabase
  .from("whatsapp_messages")
  .select("id")
  .eq("agency_id", agencyId)
  .eq("student_id", firstStudent.id)
  .eq("provider_message_id", "demo-whatsapp-message")
  .maybeSingle();

if (!existingWhatsApp) {
  await supabase.from("whatsapp_messages").insert({
    agency_id: agencyId,
    student_id: firstStudent.id,
    to_phone: "whatsapp:+923001234567",
    from_phone: "whatsapp:+14155238886",
    body: "Demo document reminder.",
    provider: "twilio",
    provider_message_id: "demo-whatsapp-message",
    status: "sent",
    message_type: "missing_documents",
    sent_at: new Date().toISOString(),
    created_by: owner.id
  });
}

const { data: existingEmail } = await supabase
  .from("email_messages")
  .select("id")
  .eq("agency_id", agencyId)
  .eq("student_id", firstStudent.id)
  .eq("provider_message_id", "demo-email-message")
  .maybeSingle();

if (!existingEmail) {
  await supabase.from("email_messages").insert({
    agency_id: agencyId,
    student_id: firstStudent.id,
    to_email: "haris.demo@example.com",
    from_email: "demo@example.com",
    subject: "Demo application document reminder",
    body: "This is sample email history created by the development seed.",
    message_type: "missing_document_reminder",
    status: "sent",
    provider: "resend",
    provider_message_id: "demo-email-message",
    sent_at: new Date().toISOString(),
    created_by: owner.id
  });
}

await supabase.from("audit_logs").insert({
  agency_id: agencyId,
  actor_user_id: owner.id,
  actor_profile_id: owner.id,
  table_name: "agencies",
  record_id: agencyId,
  action: "demo_seed_created",
  metadata: { students: students.length, consultants: consultantUsers.length }
});

console.log(
  `Demo data is ready for agency ${agencyId}: ${students.length} students and ${consultantUsers.length} consultants.`
);
