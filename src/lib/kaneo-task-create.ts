import "server-only";

import {
  getKaneoConfig,
  getKaneoColumns,
  kaneoPost,
  KaneoError,
  type KaneoConfig,
} from "@/lib/kaneo";
import { getKaneoProjectIdForWorkspace } from "@/lib/kaneo-routing";

export const DISPOSABLE_KANEO_TEST_TITLE =
  "[PROVEIT INTEGRATION TEST] Disposable task";
export const DISPOSABLE_KANEO_TEST_MARKER =
  "ProveIt integration marker: proveit-kaneo-test-business-v1";
export const DISPOSABLE_KANEO_TEST_DESCRIPTION =
  "Created only to verify the ProveIt → Kaneo integration.\n" +
  "Safe to delete after verification.\n\n---\n" +
  DISPOSABLE_KANEO_TEST_MARKER;

export const DISPOSABLE_KANEO_TEST_PAYLOAD = {
  title: DISPOSABLE_KANEO_TEST_TITLE,
  description: DISPOSABLE_KANEO_TEST_DESCRIPTION,
  priority: "no-priority",
  status: "to-do",
} as const;

export type KaneoCreatedTask = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  priority: "no-priority" | "low" | "medium" | "high" | "urgent";
};

export type KaneoBusinessTaskInput = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};

const BUSINESS_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

export class KaneoTaskCreateError extends Error {
  status: 422 | 502 | 503;

  constructor(message: string, status: 422 | 502 | 503) {
    super(message);
    this.name = "KaneoTaskCreateError";
    this.status = status;
  }
}

type CreateDependencies = {
  getColumns: typeof getKaneoColumns;
  post: typeof kaneoPost;
};

const defaultDependencies: CreateDependencies = {
  getColumns: getKaneoColumns,
  post: kaneoPost,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createdTaskFromUnknown(value: unknown): KaneoCreatedTask | null {
  if (!isRecord(value) || typeof value.id !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.title !== "string" || typeof value.status !== "string" ||
    (value.priority !== "no-priority" && value.priority !== "low" &&
      value.priority !== "medium" && value.priority !== "high" &&
      value.priority !== "urgent")) return null;

  return {
    id: value.id,
    projectId: value.projectId,
    title: value.title,
    status: value.status,
    priority: value.priority,
  };
}

function normalizeBusinessTaskInput(input: KaneoBusinessTaskInput) {
  if (typeof input.title !== "string" || !input.title.trim() ||
    (input.description !== undefined && typeof input.description !== "string") ||
    (input.priority !== undefined && !BUSINESS_PRIORITIES.has(input.priority))) {
    throw new KaneoTaskCreateError("A valid Business task is required.", 422);
  }

  return {
    title: input.title.trim(),
    ...(input.description === undefined ? {} : { description: input.description.trim() }),
    ...(input.priority === undefined
      ? { priority: "no-priority" as const }
      : { priority: input.priority }),
  };
}

export async function preflightDisposableKaneoTask(
  projectId: string,
  options: {
    config?: KaneoConfig;
    dependencies?: Pick<CreateDependencies, "getColumns">;
  } = {}
) {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const columns = await dependencies.getColumns(projectId, { config: options.config });

  if (!columns.some((column) => column.projectId === projectId && column.slug === "to-do")) {
    throw new KaneoTaskCreateError(
      "The mapped Kaneo project does not expose the required to-do status.",
      422
    );
  }
}

export async function createDisposableKaneoTask(
  projectId: string,
  options: {
    config?: KaneoConfig;
    dependencies?: Pick<CreateDependencies, "post">;
  } = {}
) {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  let response: unknown;

  try {
    response = await dependencies.post(
      `/api/task/${encodeURIComponent(projectId)}`,
      DISPOSABLE_KANEO_TEST_PAYLOAD,
      { config: options.config }
    );
  } catch (error) {
    if (error instanceof KaneoError) throw error;
    throw new KaneoTaskCreateError("Kaneo service is unavailable.", 503);
  }

  const task = createdTaskFromUnknown(response);
  if (!task || task.projectId !== projectId || task.title !== DISPOSABLE_KANEO_TEST_TITLE ||
    task.status !== "to-do" || task.priority !== "no-priority") {
    throw new KaneoTaskCreateError("Kaneo returned an invalid response.", 502);
  }

  return task;
}

/**
 * Creates one Business task without Firestore reservation or retry behavior.
 * A timeout or network failure is ambiguous: callers must not retry this
 * request automatically because Kaneo may have received the single POST.
 */
export async function createKaneoBusinessTask(
  input: KaneoBusinessTaskInput,
  options: {
    config?: KaneoConfig;
    dependencies?: Pick<CreateDependencies, "getColumns" | "post">;
  } = {}
) {
  const normalizedInput = normalizeBusinessTaskInput(input);
  const config = options.config ?? getKaneoConfig();
  const projectId = getKaneoProjectIdForWorkspace("business", config.projects);
  const priority = normalizedInput.priority;
  const payload = {
    title: normalizedInput.title,
    ...(normalizedInput.description === undefined ? {} : { description: normalizedInput.description }),
    priority,
    status: "to-do" as const,
  };

  await preflightDisposableKaneoTask(projectId, {
    config,
    dependencies: options.dependencies,
  });

  const dependencies = { ...defaultDependencies, ...options.dependencies };
  let response: unknown;
  try {
    response = await dependencies.post(
      `/api/task/${encodeURIComponent(projectId)}`,
      payload,
      { config }
    );
  } catch (error) {
    if (error instanceof KaneoError) throw error;
    throw new KaneoTaskCreateError("Kaneo service is unavailable.", 503);
  }

  const task = createdTaskFromUnknown(response);
  if (!task || task.projectId !== projectId || task.title !== normalizedInput.title ||
    task.status !== "to-do" || task.priority !== priority) {
    throw new KaneoTaskCreateError("Kaneo returned an invalid response.", 502);
  }

  return task;
}
