import { UserGroup } from "@/types/user";

export type Workspace =
  | "hq"
  | "business"
  | "tech"
  | "bod";

const permissions: Record<UserGroup, Workspace[]> = {
  business_intern: ["hq", "business"],
  tech_intern: ["hq", "tech"],
  bod: ["hq", "business", "tech", "bod"],
};

export function canAccessWorkspace(
  group: UserGroup,
  workspace: Workspace
): boolean {
  return permissions[group].includes(workspace);
}