export const GLOBAL_CAPABILITIES = [
  "manageEmployees",
  "manageWorkspaces",
  "manageGlobalSettings",
] as const;

export type GlobalCapability = (typeof GLOBAL_CAPABILITIES)[number];
export type WorkspaceAccessLevel = "member" | "admin";

export type ExplicitCapabilities = Partial<Record<GlobalCapability, boolean>>;

export function hasExplicitCapability(
  capabilities: unknown,
  capability: GlobalCapability
) {
  return typeof capabilities === "object" && capabilities !== null &&
    (capabilities as ExplicitCapabilities)[capability] === true;
}
