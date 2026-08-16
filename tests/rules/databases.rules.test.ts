import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "vitest";

const projectId = "proveit-test";
const databaseId = "database-company";
let testEnv: RulesTestEnvironment;

async function seedDatabase() {
  await testEnv.withSecurityRulesDisabled(
    async (context) => {
      const firestore = context.firestore();

      await setDoc(
        doc(firestore, "users", "company-member"),
        { active: true, role: "business_intern" }
      );
      await setDoc(doc(firestore, "workspaces", "company"), { active: true });
      await setDoc(doc(firestore, "workspaces", "business"), { active: true });
      await setDoc(doc(firestore, "workspaces", "technology"), { active: true });
      await setDoc(doc(firestore, "tasks", "custom-fields-task"), {
        workspaceId: "business", title: "Protected custom fields", status: "todo", priority: "medium", createdBy: "company-member", customFields: { historicalField: "retained" },
      });
      await setDoc(doc(firestore, "workspaces", "tombstoned"), {
        active: false,
        deletedAt: new Date(),
        deletedBy: "bod-member",
      });
      await setDoc(doc(firestore, "meetings", "meeting-1"), { workspaceId: "business", title: "Rules meeting", createdBy: "company-member" });
      await setDoc(
        doc(firestore, "users", "other-member"),
        { active: true, role: "business_intern" }
      );
      await setDoc(
        doc(firestore, "users", "business-recipient"),
        { active: true, role: "business_intern" }
      );
      await setDoc(
        doc(firestore, "users", "inactive-business-member"),
        { active: false, role: "business_intern" }
      );
      await setDoc(
        doc(firestore, "users", "business-non-member"),
        { active: true, role: "business_intern" }
      );
      await setDoc(
        doc(firestore, "users", "bod-member"),
        { active: true, role: "bod" }
      );
      await setDoc(
        doc(
          firestore,
          "workspaceMemberships",
          "business_company-member"
        ),
        {
          workspaceId: "business",
          userId: "company-member",
          active: true,
        }
      );
      await setDoc(
        doc(
          firestore,
          "workspaceMemberships",
          "business_business-recipient"
        ),
        {
          workspaceId: "business",
          userId: "business-recipient",
          active: true,
        }
      );
      await setDoc(
        doc(
          firestore,
          "workspaceMemberships",
          "technology_other-member"
        ),
        {
          workspaceId: "technology",
          userId: "other-member",
          active: true,
        }
      );
      await setDoc(
        doc(
          firestore,
          "workspaceMemberships",
          "business_inactive-business-member"
        ),
        {
          workspaceId: "business",
          userId: "inactive-business-member",
          active: true,
        }
      );
      await setDoc(
        doc(firestore, "databases", databaseId),
        {
          name: "Candidates",
          workspaceId: "business",
          createdBy: "company-member",
          properties: [
            { id: "title", name: "Name", type: "title" },
          ],
        }
      );
      await setDoc(
        doc(
          firestore,
          "databases",
          databaseId,
          "rows",
          "row-1"
        ),
        {
          createdBy: "company-member",
          values: { title: "Ada" },
        }
      );
    }
  );
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedDatabase();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("database Firestore rules", () => {
  it("allows only BOD users to delete meetings", async () => {
    const member = testEnv.authenticatedContext("company-member").firestore();
    const bod = testEnv.authenticatedContext("bod-member").firestore();
    await assertFails(deleteDoc(doc(member, "meetings", "meeting-1")));
    await assertSucceeds(deleteDoc(doc(bod, "meetings", "meeting-1")));
  });

  it("does not allow a tombstoned workspace to be restored", async () => {
    const bod = testEnv.authenticatedContext("bod-member").firestore();
    await assertFails(updateDoc(doc(bod, "workspaces", "tombstoned"), { active: true }));
  });
  it("rejects unauthenticated database access", async () => {
    const firestore = testEnv.unauthenticatedContext().firestore();

    await assertFails(
      getDoc(doc(firestore, "databases", databaseId))
    );
  });

  it("allows an active member to read a database in their workspace", async () => {
    const firestore = testEnv
      .authenticatedContext("company-member")
      .firestore();

    await assertSucceeds(
      getDoc(doc(firestore, "databases", databaseId))
    );
  });

  it("rejects a user who belongs to a different workspace", async () => {
    const firestore = testEnv
      .authenticatedContext("other-member")
      .firestore();

    await assertFails(
      getDoc(doc(firestore, "databases", databaseId))
    );
  });

  it("allows an authorized member to access database rows", async () => {
    const firestore = testEnv
      .authenticatedContext("company-member")
      .firestore();

    await assertSucceeds(
      getDoc(
        doc(
          firestore,
          "databases",
          databaseId,
          "rows",
          "row-1"
        )
      )
    );
  });

  it("allows authorized members to create shared table views but rejects other workspaces", async () => {
    const member = testEnv.authenticatedContext("company-member").firestore();
    const other = testEnv.authenticatedContext("other-member").firestore();
    const view = { name: "Screened", databaseId, workspaceId: "business", type: "table", createdBy: "company-member" };
    await assertSucceeds(setDoc(doc(member, "databaseViews", "screened"), view));
    await assertFails(setDoc(doc(other, "databaseViews", "blocked"), { ...view, createdBy: "other-member" }));
    await assertSucceeds(getDocs(query(
      collection(member, "databaseViews"),
      where("databaseId", "==", databaseId),
      where("workspaceId", "==", "business")
    )));
    await assertFails(getDocs(query(
      collection(other, "databaseViews"),
      where("databaseId", "==", databaseId),
      where("workspaceId", "==", "business")
    )));
  });

  it("rejects unauthorized database row access", async () => {
    const firestore = testEnv
      .authenticatedContext("other-member")
      .firestore();

    await assertFails(
      getDoc(
        doc(
          firestore,
          "databases",
          databaseId,
          "rows",
          "row-1"
        )
      )
    );
  });

  it("allows an active workspace member to create activity in their workspace", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertSucceeds(setDoc(doc(firestore, "activity", "activity-1"), {
      workspaceId: "business", entityType: "task", entityId: "task-1", action: "created",
    }));
  });

  it("allows a workspace member to create their own comment and notification", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertSucceeds(setDoc(doc(firestore, "comments", "comment-1"), {
      workspaceId: "business", entityType: "meeting", entityId: "meeting-1", authorUid: "company-member",
    }));
    await assertSucceeds(setDoc(doc(firestore, "notifications", "notification-1"), {
      workspaceId: "business", recipientUid: "business-recipient", actorUid: "company-member",
      entityType: "meeting", entityId: "meeting-1",
    }));
  });

  it("rejects a notification sent to someone outside the workspace", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertFails(setDoc(doc(firestore, "notifications", "notification-cross-workspace"), {
      workspaceId: "business", recipientUid: "other-member", actorUid: "company-member",
      entityType: "meeting", entityId: "meeting-1",
    }));
  });

  it("allows members to query and reply to comments in their workspace", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertSucceeds(setDoc(doc(firestore, "comments", "comment-parent"), {
      workspaceId: "business", entityType: "meeting", entityId: "meeting-1", authorUid: "company-member",
    }));
    await assertSucceeds(getDocs(query(collection(firestore, "comments"), where("workspaceId", "==", "business"), where("entityId", "==", "meeting-1"))));
    await assertSucceeds(setDoc(doc(firestore, "comments", "comment-reply"), {
      workspaceId: "business", entityType: "meeting", entityId: "meeting-1", authorUid: "company-member", parentCommentId: "comment-parent",
    }));
  });

  it("rejects direct client task-comment mutation so task comments use the protected route", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertFails(setDoc(doc(firestore, "comments", "task-comment-direct"), {
      workspaceId: "business", entityType: "task", entityId: "task-1", authorUid: "company-member", body: "Spoof attempt",
    }));
  });

  it("rejects comment reads and creates from a different workspace, inactive users, and unauthenticated users", async () => {
    const owner = testEnv.authenticatedContext("company-member").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "comments", "comment-business"), {
      workspaceId: "business", entityType: "task", entityId: "task-1", authorUid: "company-member",
    }));
    const other = testEnv.authenticatedContext("other-member").firestore();
    const inactive = testEnv.authenticatedContext("inactive-business-member").firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(other, "comments", "comment-business")));
    await assertFails(setDoc(doc(other, "comments", "comment-other"), { workspaceId: "business", entityType: "task", entityId: "task-1", authorUid: "other-member" }));
    await assertFails(setDoc(doc(inactive, "comments", "comment-inactive"), { workspaceId: "business", entityType: "task", entityId: "task-1", authorUid: "inactive-business-member" }));
    await assertFails(setDoc(doc(anonymous, "comments", "comment-anonymous"), { workspaceId: "business", entityType: "task", entityId: "task-1", authorUid: null }));
    await assertSucceeds(getDoc(doc(owner, "comments", "comment-business")));
  });

  it("allows only the recipient to read and mark their notification state", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "notifications", "notification-recipient"), {
      workspaceId: "business", recipientUid: "business-recipient", actorUid: "company-member", entityType: "task", entityId: "task-1", readAt: null, archivedAt: null,
    }));
    const recipient = testEnv.authenticatedContext("business-recipient").firestore();
    const other = testEnv.authenticatedContext("company-member").firestore();
    const inactive = testEnv.authenticatedContext("inactive-business-member").firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(recipient, "notifications", "notification-recipient")));
    await assertSucceeds(updateDoc(doc(recipient, "notifications", "notification-recipient"), { readAt: new Date() }));
    await assertFails(updateDoc(doc(recipient, "notifications", "notification-recipient"), { workspaceId: "technology" }));
    await assertFails(getDoc(doc(other, "notifications", "notification-recipient")));
    await assertFails(getDoc(doc(inactive, "notifications", "notification-recipient")));
    await assertFails(getDoc(doc(anonymous, "notifications", "notification-recipient")));
  });
});

async function createTaskAndActivity(
  userId: string | null,
  workspaceId: string,
  taskId: string
) {
  const firestore = userId
    ? testEnv.authenticatedContext(userId).firestore()
    : testEnv.unauthenticatedContext().firestore();
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, "tasks", taskId), {
    title: "Create task authorization test",
    description: "",
    workspaceId,
    status: "todo",
    priority: "medium",
    assigneeId: null,
    dueDate: null,
    createdBy: userId,
    source: "proveit",
    archived: false,
  });
  batch.set(doc(firestore, "activity", `${taskId}-activity`), {
    workspaceId,
    entityType: "task",
    entityId: taskId,
    action: "created",
    userId,
    description: "Created task authorization test",
    previousValue: null,
    newValue: {
      title: "Create task authorization test",
      status: "todo",
      priority: "medium",
      assigneeId: null,
    },
    source: "proveit",
  });

  return batch.commit();
}

describe("task creation Firestore rules", () => {
  it("allows an active Business member to create the task and activity batch", async () => {
    await assertSucceeds(
      createTaskAndActivity("company-member", "business", "business-task")
    );
  });

  it("rejects an unauthenticated task creation", async () => {
    await assertFails(
      createTaskAndActivity(null, "business", "unauthenticated-task")
    );
  });

  it("rejects an inactive Business member", async () => {
    await assertFails(
      createTaskAndActivity(
        "inactive-business-member",
        "business",
        "inactive-business-task"
      )
    );
  });

  it("rejects an active user without a Business membership", async () => {
    await assertFails(
      createTaskAndActivity(
        "business-non-member",
        "business",
        "non-member-business-task"
      )
    );
  });

  it("rejects a member of a different workspace", async () => {
    await assertFails(
      createTaskAndActivity(
        "other-member",
        "business",
        "wrong-workspace-task"
      )
    );
  });

  it("allows an active BOD user without a Business membership", async () => {
    await assertSucceeds(
      createTaskAndActivity("bod-member", "business", "bod-business-task")
    );
  });
});

describe("custom task field Firestore boundary", () => {
  it("rejects direct client creation of a custom field map", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertFails(setDoc(doc(firestore, "tasks", "client-custom-fields-task"), { workspaceId: "business", title: "Blocked", status: "todo", priority: "medium", createdBy: "company-member", customFields: { arbitrary: "value" } }));
  });

  it("rejects direct client changes to an existing custom field map while preserving standard edits", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertFails(updateDoc(doc(firestore, "tasks", "custom-fields-task"), { customFields: { arbitrary: "value" } }));
    await assertSucceeds(updateDoc(doc(firestore, "tasks", "custom-fields-task"), { title: "Standard edit remains permitted" }));
  });
});
