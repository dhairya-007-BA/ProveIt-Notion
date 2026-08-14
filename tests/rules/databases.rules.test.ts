import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
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
    }));
  });

  it("rejects a notification sent to someone outside the workspace", async () => {
    const firestore = testEnv.authenticatedContext("company-member").firestore();
    await assertFails(setDoc(doc(firestore, "notifications", "notification-cross-workspace"), {
      workspaceId: "business", recipientUid: "other-member", actorUid: "company-member",
    }));
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
