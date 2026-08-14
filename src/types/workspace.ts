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
  accentColor?: WorkspaceAccentColor;

  active: boolean;

  /** A permanent-delete tombstone. Archived workspaces do not have this. */
  deletedAt?: Date;
  deletedBy?: string;

  createdAt?: Date;
  updatedAt?: Date;

  createdBy: string;
}

export type WorkspaceAccentColor =
  | "proveit-blue"
  | "teal"
  | "orange"
  | "charcoal";
