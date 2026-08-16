export type KaneoProjectKey = "business" | "technology";

export class KaneoRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KaneoRoutingError";
  }
}

export function getKaneoProjectKeyForWorkspace(
  workspaceId: string
): KaneoProjectKey {
  if (workspaceId === "business" || workspaceId === "technology") {
    return workspaceId;
  }

  throw new KaneoRoutingError(
    "This workspace is not mapped to a Kaneo project."
  );
}

export function getKaneoProjectIdForWorkspace(
  workspaceId: string,
  projects: {
    business: string;
    technology: string;
  }
) {
  return projects[getKaneoProjectKeyForWorkspace(workspaceId)];
}

export type KaneoMappedStatus =
  | "to-do"
  | "in-progress"
  | "done";

export function mapProveItStatusToKaneo(
  status: "todo" | "in_progress" | "blocked" | "done"
): KaneoMappedStatus {
  switch (status) {
    case "todo":
      return "to-do";
    case "in_progress":
      return "in-progress";
    case "done":
      return "done";
    case "blocked":
      throw new KaneoRoutingError(
        "Blocked tasks are not supported by the Kaneo Phase 1 mapping."
      );
  }
}
