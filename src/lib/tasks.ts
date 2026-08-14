import {
  collection,
  doc,
  getDocs,
  query,
  writeBatch,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import {
  ProveItTask,
  TaskPriority,
  TaskStatus,
} from "@/types/task";

export interface CreateTaskInput {
  title: string;
  description?: string;

  workspaceId: string;

  status: TaskStatus;
  priority: TaskPriority;

  assigneeId?: string | null;
  dueDate?: Date | null;

  createdBy: string;
}
export async function createTask(
  input: CreateTaskInput
) {
  const batch =
    writeBatch(db);

  const taskRef =
    doc(
      collection(
        db,
        "tasks"
      )
    );

  const activityRef =
    doc(
      collection(db, "activities")
    );

  batch.set(
    taskRef,
    {
      title:
        input.title.trim(),

      description:
        input.description?.trim() ||
        "",

      workspaceId:
        input.workspaceId,

      status:
        input.status,

      priority:
        input.priority,

      assigneeId:
        input.assigneeId ??
        null,

      dueDate:
        input.dueDate
          ? Timestamp.fromDate(
              input.dueDate
            )
          : null,

      createdBy:
        input.createdBy,

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp(),

      source:
        "proveit",

      archived:
        false,
    }
  );

  batch.set(
    activityRef,
    {
      workspaceId:
        input.workspaceId,

      entityType:
        "task",

      entityId:
        taskRef.id,

      action:
        "created",

      userId:
        input.createdBy,

      description:
        `Created task "${input.title.trim()}"`,

      previousValue:
        null,

      newValue: {
        title:
          input.title.trim(),

        status:
          input.status,

        priority:
          input.priority,

        assigneeId:
          input.assigneeId ??
          null,
      },

      source:
        "proveit",

      createdAt:
        serverTimestamp(),
    }
  );

  await batch.commit();

  return taskRef.id;
}
export interface UpdateTaskInput {
  title?: string;
  description?: string;

  status?: TaskStatus;
  priority?: TaskPriority;

  assigneeId?: string | null;
  dueDate?: Date | null;
}

function convertTask(
  id: string,
  data: DocumentData
): ProveItTask {
  return {
    id,

    title:
      data.title ||
      "Untitled task",

    description:
      data.description ||
      "",

    workspaceId:
      data.workspaceId,

    status:
      data.status ||
      "todo",

    priority:
      data.priority ||
      "medium",

    assigneeId:
      data.assigneeId ??
      null,

    createdBy:
      data.createdBy,

    dueDate:
      data.dueDate?.toDate(),

    createdAt:
      data.createdAt?.toDate(),

    updatedAt:
      data.updatedAt?.toDate(),

    source:
      data.source ||
      "proveit",

    originalNotionId:
      data.originalNotionId,

    originalCreatedAt:
      data.originalCreatedAt?.toDate(),

    originalLastEditedAt:
      data.originalLastEditedAt?.toDate(),

    parentTaskId:
      data.parentTaskId,

    meetingId:
      data.meetingId,

    customerId:
      data.customerId,

    documentIds:
      data.documentIds,

    archived:
      data.archived ??
      false,
  };
}

export async function getTasksForWorkspace(
  workspaceId: string
): Promise<ProveItTask[]> {
  const tasksQuery =
    query(
      collection(
        db,
        "tasks"
      ),
      where(
        "workspaceId",
        "==",
        workspaceId
      )
    );

  const snapshot =
    await getDocs(
      tasksQuery
    );

  return snapshot.docs
    .map((taskDoc) =>
      convertTask(
        taskDoc.id,
        taskDoc.data()
      )
    )
    .filter(
      (task) =>
        !task.archived
    );
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput
) {
  const taskRef =
    doc(
      db,
      "tasks",
      taskId
    );

  const updates:
    Record<string, unknown> = {
      updatedAt:
        serverTimestamp(),
    };

  if (
    input.title !== undefined
  ) {
    updates.title =
      input.title.trim();
  }

  if (
    input.description !==
    undefined
  ) {
    updates.description =
      input.description.trim();
  }

  if (
    input.status !== undefined
  ) {
    updates.status =
      input.status;
  }

  if (
    input.priority !== undefined
  ) {
    updates.priority =
      input.priority;
  }

  if (
    input.assigneeId !==
    undefined
  ) {
    updates.assigneeId =
      input.assigneeId;
  }

  if (
    input.dueDate !== undefined
  ) {
    updates.dueDate =
      input.dueDate
        ? Timestamp.fromDate(
            input.dueDate
          )
        : null;
  }

  await updateDoc(
    taskRef,
    updates
  );
}

export async function archiveTask(
  taskId: string
) {
  const taskRef =
    doc(
      db,
      "tasks",
      taskId
    );

  await updateDoc(
    taskRef,
    {
      archived: true,
      updatedAt:
        serverTimestamp(),
    }
  );
}
