import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = "proveit-test";
const userId = "database-e2e-user";
const employeeId = "database-test";

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST
) {
  throw new Error(
    "E2E seed data may only be created when both Firebase emulators are configured."
  );
}

const app = initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);

async function ensureTestUser(uid: string, id: string, password: string) {
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({
      uid,
      email: `${id}@auth.proveit.internal`,
      password,
    });
  }
}

async function main() {
  await ensureTestUser(userId, employeeId, "database-test-password");
  await ensureTestUser("mentioned-user", "mentioned-user", "mentioned-user-password");

  await firestore.doc(`users/${userId}`).set({
    active: true,
    employeeId,
    name: "Database Test User",
    role: "business_intern",
    mustChangePassword: false,
  });
  await firestore.doc("users/mentioned-user").set({
    active: true,
    employeeId: "mentioned-user",
    name: "Mentioned User",
    role: "business_intern",
    mustChangePassword: false,
  });
  await firestore.doc("workspaces/company").set({
    name: "Company",
    slug: "company",
    kind: "company",
    icon: "🏢",
    description: "The company workspace used by the emulator test suite.",
    active: true,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await firestore
    .doc(`workspaceMemberships/company_${userId}`)
    .set({
      workspaceId: "company",
      userId,
      active: true,
      role: "member",
      createdBy: userId,
    });
  await firestore.doc("workspaceMemberships/company_mentioned-user").set({
    workspaceId: "company",
    userId: "mentioned-user",
    active: true,
    role: "member",
    createdBy: userId,
  });
  await firestore.doc("databases/database-e2e").set({
    name: "Candidate pipeline",
    description: "A local emulator database",
    workspaceId: "company",
    createdBy: userId,
    properties: [
      { id: "title", name: "Name", type: "title" },
      { id: "notes", name: "Notes", type: "text" },
      { id: "score", name: "Score", type: "number" },
      { id: "contacted", name: "Contacted", type: "checkbox" },
      {
        id: "legacy-stage",
        name: "Legacy stage",
        type: "select",
        options: [
          { id: "legacy-stage-interview", name: "Interview" },
        ],
      },
    ],
  });
  await firestore
    .doc("databases/database-e2e/rows/row-e2e")
    .set({
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      values: {
        title: "Ada Lovelace",
        notes: "Initial screen",
        score: 95,
        contacted: false,
        "legacy-stage": "Historical follow-up",
      },
    });
  await firestore.doc("tasks/task-e2e").set({
    title: "Prepare candidate review",
    description: "Seeded task for the workspace test.",
    workspaceId: "company",
    status: "todo",
    priority: "medium",
    createdBy: userId,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await firestore.doc("meetings/meeting-e2e").set({
    title: "Candidate review",
    workspaceId: "company",
    createdBy: userId,
    transcript: "Initial transcript",
    notes: "Initial notes",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await firestore.doc("documents/document-e2e").set({
    title: "Hiring rubric",
    content: "Use this rubric during candidate review.",
    workspaceId: "company",
    type: "document",
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await firestore.doc("activity/activity-e2e").set({
    workspaceId: "company",
    entityType: "task",
    entityId: "task-e2e",
    action: "created",
    description: "Created task \"Prepare candidate review\"",
    createdAt: new Date(),
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
