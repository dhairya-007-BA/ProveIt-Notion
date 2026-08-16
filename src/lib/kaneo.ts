import "server-only";

export type KaneoConfig = {
  baseUrl: string;
  apiToken: string;
  workspaceId: string;
  projects: {
    business: string;
    technology: string;
  };
};

type Environment = Record<string, string | undefined>;

export class KaneoError extends Error {
  status: 502 | 503;
  category: "timeout" | "network" | "upstream_4xx" | "upstream_5xx" | "malformed_response" | "configuration";

  constructor(
    message: string,
    status: 502 | 503,
    category: KaneoError["category"] = "configuration"
  ) {
    super(message);
    this.name = "KaneoError";
    this.status = status;
    this.category = category;
  }
}

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new KaneoError(
      "Kaneo integration is not configured.",
      503,
      "configuration"
    );
  }

  return value;
}

export function getKaneoConfig(
  environment: Environment = process.env
): KaneoConfig {
  const baseUrl = required(environment, "KANEO_BASE_URL").replace(/\/+$/, "");

  try {
    new URL(baseUrl);
  } catch {
    throw new KaneoError(
      "Kaneo integration is not configured.",
      503,
      "configuration"
    );
  }

  return {
    baseUrl,
    apiToken: required(environment, "KANEO_API_TOKEN"),
    workspaceId: required(environment, "KANEO_WORKSPACE_ID"),
    projects: {
      business: required(environment, "KANEO_PROJECT_BUSINESS_ID"),
      technology: required(environment, "KANEO_PROJECT_TECHNOLOGY_ID"),
    },
  };
}

type FetchLike = typeof fetch;

async function parseJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    throw new KaneoError("Kaneo returned an invalid response.", 502, "malformed_response");
  }
}

async function parseSuccessfulResponse(response: Response, method: "GET" | "POST" | "PUT" | "DELETE") {
  // Kaneo currently returns a JSON task from DELETE, but successful DELETE
  // endpoints may also legitimately use 204 or an empty body.  Updates and
  // reads still require JSON so malformed responses are never accepted there.
  if (method === "DELETE") {
    const contentLength = response.headers.get("content-length");
    if (response.status === 204 || contentLength === "0") return null;

    const body = await response.text();
    if (!body.trim()) return null;
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new KaneoError("Kaneo returned an invalid response.", 502, "malformed_response");
    }
  }

  return parseJson(response);
}

async function kaneoRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: {
    config?: KaneoConfig;
    fetcher?: FetchLike;
    body?: unknown;
  } = {}
) {
  const config = options.config ?? getKaneoConfig();
  const fetcher = options.fetcher ?? fetch;
  const url = new URL(path, `${config.baseUrl}/`);

  let response: Response;

  try {
    response = await fetcher(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "POST" || method === "PUT" ? { "Content-Type": "application/json" } : {}),
        "x-api-key": config.apiToken,
      },
      ...(method === "POST" || method === "PUT" ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    if (error instanceof KaneoError) throw error;

    throw new KaneoError(
      "Kaneo service is unavailable.",
      503,
      error instanceof DOMException && error.name === "TimeoutError"
        ? "timeout"
        : "network"
    );
  }

  if (!response.ok) {
    throw new KaneoError(
      "Kaneo service could not complete the request.",
      response.status >= 500 ? 503 : 502,
      response.status >= 500 ? "upstream_5xx" : "upstream_4xx"
    );
  }

  return parseSuccessfulResponse(response, method);
}

export async function kaneoGet(
  path: string,
  options: {
    config?: KaneoConfig;
    fetcher?: FetchLike;
  } = {}
) {
  return kaneoRequest("GET", path, options);
}

export async function kaneoPost(
  path: string,
  body: unknown,
  options: {
    config?: KaneoConfig;
    fetcher?: FetchLike;
  } = {}
) {
  return kaneoRequest("POST", path, { ...options, body });
}

export async function kaneoPut(path: string, body: unknown, options: { config?: KaneoConfig; fetcher?: FetchLike } = {}) {
  return kaneoRequest("PUT", path, { ...options, body });
}

export async function kaneoDelete(path: string, options: { config?: KaneoConfig; fetcher?: FetchLike } = {}) {
  return kaneoRequest("DELETE", path, options);
}

type KaneoProject = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  archivedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectFromUnknown(value: unknown): KaneoProject | null {
  if (!isRecord(value) || typeof value.id !== "string" ||
    typeof value.workspaceId !== "string" || typeof value.name !== "string" ||
    typeof value.slug !== "string") return null;

  return {
    id: value.id,
    workspaceId: value.workspaceId,
    name: value.name,
    slug: value.slug,
    icon: typeof value.icon === "string" ? value.icon : null,
    description: typeof value.description === "string" ? value.description : null,
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt : null,
  };
}

export async function getKaneoProjects(
  options: Parameters<typeof kaneoGet>[1] = {}
) {
  const config = options.config ?? getKaneoConfig();
  const response = await kaneoGet(
    `/api/project?workspaceId=${encodeURIComponent(config.workspaceId)}`,
    { ...options, config }
  );

  if (!Array.isArray(response)) {
    throw new KaneoError("Kaneo returned an invalid response.", 502);
  }

  const projects = response.map(projectFromUnknown);
  if (projects.some((project) => project === null)) {
    throw new KaneoError("Kaneo returned an invalid response.", 502);
  }

  return projects as KaneoProject[];
}

export async function getKaneoProject(
  projectId: string,
  options: Parameters<typeof kaneoGet>[1] = {}
) {
  const config = options.config ?? getKaneoConfig();
  const projects = await getKaneoProjects({ ...options, config });
  const project = projects.find((candidate) => candidate.id === projectId);

  if (!project) {
    throw new KaneoError("Configured Kaneo project was not found.", 502);
  }

  if (project.workspaceId !== config.workspaceId) {
    throw new KaneoError("Configured Kaneo project was not found.", 502);
  }

  return project;
}

export type KaneoTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
};

function taskFromUnknown(value: unknown): KaneoTask | null {
  if (!isRecord(value) || typeof value.id !== "string" ||
    typeof value.title !== "string" || typeof value.status !== "string" ||
    typeof value.priority !== "string") return null;

  return {
    id: value.id,
    title: value.title,
    description: typeof value.description === "string" ? value.description : null,
    status: value.status,
    priority: value.priority,
    dueDate: typeof value.dueDate === "string" ? value.dueDate : null,
    assigneeId: typeof value.assigneeId === "string" ? value.assigneeId : null,
  };
}

export async function getKaneoTasks(
  projectId: string,
  options: Parameters<typeof kaneoGet>[1] = {}
) {
  const response = await kaneoGet(
    `/api/task/tasks/${encodeURIComponent(projectId)}`,
    options
  );

  if (!isRecord(response) || !isRecord(response.data) ||
    !Array.isArray(response.data.columns)) {
    throw new KaneoError("Kaneo returned an invalid response.", 502);
  }

  const tasks: KaneoTask[] = [];
  for (const column of response.data.columns) {
    if (!isRecord(column) || !Array.isArray(column.tasks)) {
      throw new KaneoError("Kaneo returned an invalid response.", 502);
    }

    for (const candidate of column.tasks) {
      const task = taskFromUnknown(candidate);
      if (!task) {
        throw new KaneoError("Kaneo returned an invalid response.", 502);
      }
      tasks.push(task);
    }
  }

  return tasks;
}

export type KaneoColumn = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  position: number;
  isFinal: boolean;
};

function columnFromUnknown(value: unknown): KaneoColumn | null {
  if (!isRecord(value) || typeof value.id !== "string" ||
    typeof value.projectId !== "string" || typeof value.name !== "string" ||
    typeof value.slug !== "string" || typeof value.position !== "number" ||
    typeof value.isFinal !== "boolean") return null;

  return {
    id: value.id,
    projectId: value.projectId,
    name: value.name,
    slug: value.slug,
    position: value.position,
    isFinal: value.isFinal,
  };
}

export async function getKaneoColumns(
  projectId: string,
  options: Parameters<typeof kaneoGet>[1] = {}
) {
  const response = await kaneoGet(
    `/api/column/${encodeURIComponent(projectId)}`,
    options
  );

  if (!Array.isArray(response)) {
    throw new KaneoError("Kaneo returned an invalid response.", 502, "malformed_response");
  }

  const columns = response.map(columnFromUnknown);
  if (columns.some((column) => column === null)) {
    throw new KaneoError("Kaneo returned an invalid response.", 502, "malformed_response");
  }

  return columns as KaneoColumn[];
}
