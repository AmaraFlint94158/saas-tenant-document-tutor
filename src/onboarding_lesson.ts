import { createTenantCollection, embedText, indexTenantLessons } from "./tenant_document_qa.js";

const collection = "saas-team-handbook";
const lessons = [
  { id: "acme-invite", tenant_id: "acme-learning", text: "Workspace admins invite instructors from Admin, Members, then Invite. Invitations expire after 72 hours." },
  { id: "acme-pause", tenant_id: "acme-learning", text: "When an account is suspended, learners keep their course history but cannot begin a new lesson until an admin reactivates the account." },
  { id: "acme-export", tenant_id: "acme-learning", text: "Admins export course completion records from Reports, Course progress, then Export CSV." }
];

const probe = await embedText(lessons[0]!.text);
await createTenantCollection(collection, probe.length);
await indexTenantLessons(collection, lessons);
console.log(`Indexed ${lessons.length} onboarding lessons in ${collection}.`);
