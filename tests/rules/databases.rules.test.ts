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
    await assertSucceeds(setDoc(doc(firestore, "activities", "activity-1"), {
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
