export type MembershipRole =
  | "viewer"
  | "member"
  | "manager"
  | "admin";

export interface WorkspaceMembership {
  id: string;

  workspaceId: string;
  userId: string;

  role: MembershipRole;

  active: boolean;

  createdBy: string;

  createdAt?: Date;
  updatedAt?: Date;
}