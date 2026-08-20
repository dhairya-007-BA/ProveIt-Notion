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

async function clearCollaborationFixtures() {
  const comments = await firestore
    .collection("comments")
    .where("workspaceId", "==", "company")
    .where("entityId", "==", "task-e2e")
    .get();
  const notificationSnapshots = await Promise.all(["mentioned-user", userId].map((recipientUid) => firestore
    .collection("notifications")
    .where("recipientUid", "==", recipientUid)
    .get()));
  const batch = firestore.batch();
  comments.docs.forEach((comment) => batch.delete(comment.ref));
  notificationSnapshots.flatMap((snapshot) => snapshot.docs).forEach((notification) => batch.delete(notification.ref));
  if (!comments.empty || notificationSnapshots.some((snapshot) => !snapshot.empty)) await batch.commit();
}

async function clearDatabaseRows() {
  const rows = await firestore.collection("databases/database-e2e/rows").get();
  if (rows.empty) return;
  const batch = firestore.batch();
  rows.docs.forEach((row) => batch.delete(row.ref));
  await batch.commit();
}

async function clearDatabaseViews() {
  const views = await firestore.collection("databaseViews").where("databaseId", "==", "database-e2e").get();
  const batch = firestore.batch();
  views.docs.forEach((view) => batch.delete(view.ref));
  if (!views.empty) await batch.commit();
}

async function main() {
  await clearCollaborationFixtures();
  await clearDatabaseRows();
  await clearDatabaseViews();
  await ensureTestUser(userId, employeeId, "database-test-password");
  await ensureTestUser("mentioned-user", "mentioned-user", "mentioned-user-password");
  await ensureTestUser("admin-e2e-user", "admin-test", "admin-test-password");

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
  await firestore.doc("users/admin-e2e-user").set({
    active: true,
    employeeId: "admin-test",
    name: "Admin Test User",
    role: "bod",
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
  for (const workspace of [
    { id: "business", name: "Business", slug: "business", kind: "team", icon: "💼", active: true },
    { id: "technology", name: "Technology", slug: "technology", kind: "team", icon: "💻", active: true },
    { id: "board", name: "Board", slug: "board", kind: "board", icon: "🔒", active: true },
    { id: "dhairya", name: "Dhairya", slug: "dhairya", kind: "custom", icon: "📁", active: false },
  ]) {
    await firestore.doc(`workspaces/${workspace.id}`).set({
      ...workspace,
      description: `The ${workspace.name} workspace used by the emulator test suite.`,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
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
      { id: "review-date", name: "Review date", type: "date" },
      { id: "contacted", name: "Contacted", type: "checkbox" },
      { id: "email", name: "Email", type: "email" },
      { id: "portfolio", name: "Portfolio", type: "url" },
      { id: "phone", name: "Phone", type: "phone" },
      {
        id: "legacy-stage",
        name: "Legacy stage",
        type: "select",
        options: [
          { id: "stage-z", name: "Alpha", color: "teal" },
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
        "review-date": "2026-01-15",
        contacted: false,
        email: "ada@example.test",
        portfolio: "https://example.test/ada",
        phone: "555-0101",
        "legacy-stage": "Historical follow-up",
      },
    });
  await firestore
    .doc("databases/database-e2e/rows/row-e2e-2")
    .set({
      createdBy: userId,
      createdAt: new Date(Date.now() + 1),
      updatedAt: new Date(Date.now() + 1),
      values: {
        title: "Grace Hopper",
        notes: "Technical screen",
        score: 82,
        contacted: true,
        email: "grace@example.test",
        portfolio: "https://example.test/grace",
        phone: "555-0102",
        "legacy-stage": "stage-z",
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
  await firestore.doc("tasks/task-private-e2e").set({
    title: "Private business planning",
    workspaceId: "business",
    status: "todo",
    priority: "medium",
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await firestore.doc("meetings/meeting-e2e").set({
    title: "Candidate review",
    workspaceId: "company",
    createdBy: userId,
    organizerId: userId,
    participantIds: ["mentioned-user"],
    status: "scheduled",
    startAt: new Date("2026-08-20T09:00:00"),
    endAt: new Date("2026-08-20T10:00:00"),
    location: "Room A",
    meetingUrl: "https://example.test/meeting",
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
  const visualSearchBatch = firestore.batch();
  const visualCreatedAt = new Date();
  for (let index = 1; index <= 12; index += 1) {
    const suffix = String(index).padStart(2, "0");
    visualSearchBatch.set(firestore.doc(`tasks/search-visual-task-${suffix}`), {
      title: `Visual search task ${suffix}`,
      workspaceId: "company",
      status: "todo",
      priority: "medium",
      createdBy: userId,
      archived: false,
      createdAt: visualCreatedAt,
      updatedAt: visualCreatedAt,
    });
    visualSearchBatch.set(firestore.doc(`meetings/search-visual-meeting-${suffix}`), {
      title: `Visual search meeting ${suffix}`,
      workspaceId: "company",
      status: "scheduled",
      createdBy: userId,
      createdAt: visualCreatedAt,
      updatedAt: visualCreatedAt,
    });
    visualSearchBatch.set(firestore.doc(`documents/search-visual-document-${suffix}`), {
      title: `Visual search document ${suffix}`,
      content: "Visual search fixture.",
      workspaceId: "company",
      type: "document",
      createdBy: userId,
      createdAt: visualCreatedAt,
      updatedAt: visualCreatedAt,
    });
    visualSearchBatch.set(firestore.doc(`databases/search-visual-database-${suffix}`), {
      name: `Visual search database ${suffix}`,
      workspaceId: "company",
      createdBy: userId,
      properties: [{ id: "title", name: "Name", type: "title" }],
      createdAt: visualCreatedAt,
      updatedAt: visualCreatedAt,
    });
    visualSearchBatch.set(firestore.doc(`databases/search-visual-database-${suffix}/rows/search-visual-row-${suffix}`), {
      createdBy: userId,
      createdAt: visualCreatedAt,
      updatedAt: visualCreatedAt,
      values: { title: `Visual search row ${suffix}` },
    });
  }
  await visualSearchBatch.commit();
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
