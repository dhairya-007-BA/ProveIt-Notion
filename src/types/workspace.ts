export type WorkspaceKind =
  | "company"
  | "team"
  | "board"
  | "custom";

export interface Workspace {
  id: string;

  name: string;
  slug: string;

  kind: WorkspaceKind;

  icon?: string;
  description?: string;

  active: boolean;

  createdAt?: Date;
  updatedAt?: Date;

  createdBy: string;
}