import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import {
  ActivityAction,
  ActivityEvent,
} from "@/types/activity";

interface CreateActivityInput {
  workspaceId: string;

  entityType:
    | "task"
    | "meeting"
    | "document"
    | "customer"
    | "expense"
    | "budget"
    | "workspace";

  entityId: string;

  action: ActivityAction;

  userId?: string;
  userName?: string;

  description: string;

  previousValue?: unknown;
  newValue?: unknown;

  source?: "proveit" | "notion";
}

export async function createActivity(
  input: CreateActivityInput
) {
  return addDoc(
    collection(
      db,
      "activity"
    ),
    {
      workspaceId:
        input.workspaceId,

      entityType:
        input.entityType,

      entityId:
        input.entityId,

      action:
        input.action,

      userId:
        input.userId || null,

      userName:
        input.userName || null,

      description:
        input.description,

      previousValue:
        input.previousValue ??
        null,

      newValue:
        input.newValue ??
        null,

      source:
        input.source ||
        "proveit",

      createdAt:
        serverTimestamp(),
    }
  );
}

export async function getActivityForWorkspace(
  workspaceId: string
): Promise<ActivityEvent[]> {
  const activityQuery =
    query(
      collection(
        db,
        "activity"
      ),
      where(
        "workspaceId",
        "==",
        workspaceId
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );

  const snapshot =
    await getDocs(
      activityQuery
    );

  return snapshot.docs.map(
    (activityDoc) => {
      const data =
        activityDoc.data();

      return {
        id:
          activityDoc.id,

        workspaceId:
          data.workspaceId,

        entityType:
          data.entityType,

        entityId:
          data.entityId,

        action:
          data.action,

        userId:
          data.userId ||
          undefined,

        userName:
          data.userName ||
          undefined,

        description:
          data.description ||
          "",

        previousValue:
          data.previousValue,

        newValue:
          data.newValue,

        createdAt:
          data.createdAt?.toDate() ??
          new Date(),

        source:
          data.source ||
          "proveit",
      } as ActivityEvent;
    }
  );
}

export async function getActivityForEntity(
  entityType: CreateActivityInput["entityType"],
  entityId: string
): Promise<ActivityEvent[]> {
  const activityQuery =
    query(
      collection(
        db,
        "activity"
      ),
      where(
        "entityType",
        "==",
        entityType
      ),
      where(
        "entityId",
        "==",
        entityId
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );

  const snapshot =
    await getDocs(
      activityQuery
    );

  return snapshot.docs.map(
    (activityDoc) => {
      const data =
        activityDoc.data();

      return {
        id:
          activityDoc.id,

        workspaceId:
          data.workspaceId,

        entityType:
          data.entityType,

        entityId:
          data.entityId,

        action:
          data.action,

        userId:
          data.userId ||
          undefined,

        userName:
          data.userName ||
          undefined,

        description:
          data.description ||
          "",

        previousValue:
          data.previousValue,

        newValue:
          data.newValue,

        createdAt:
          data.createdAt?.toDate() ??
          new Date(),

        source:
          data.source ||
          "proveit",
      } as ActivityEvent;
    }
  );
}
