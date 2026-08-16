export type UserGroup =
  | "business_intern"
  | "tech_intern"
  | "bod";

export type WorkspaceRole =
  | "viewer"
  | "member"
  | "manager"
  | "admin";

export interface WorkspaceMembership {
  workspaceId: string;
  role: WorkspaceRole;
  accessLevel?: "member" | "admin";
}

export interface ProveItUser {
  uid: string;

  employeeId: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  department?: string;

  group: UserGroup;

  active: boolean;
  capabilities?: {
    manageEmployees?: boolean;
    manageWorkspaces?: boolean;
    manageGlobalSettings?: boolean;
  };

  /*
   * When true, the employee has signed
   * in using a temporary password and
   * must create their own password
   * before accessing ProveIt.
   */
  mustChangePassword?: boolean;

  workspaceMemberships?: WorkspaceMembership[];

  createdAt?: Date;
  updatedAt?: Date;
}
