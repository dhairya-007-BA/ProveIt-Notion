export const PROFILE_PHONE_MAX_LENGTH = 40;

export function normalizePhoneNumber(value: unknown) {
  if (typeof value !== "string") return null;
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length > PROFILE_PHONE_MAX_LENGTH) return null;
  if (!/^[0-9+().\- ]+$/.test(normalized)) return null;
  return normalized;
}

export function profileResponse(uid: string, profile: Record<string, unknown>) {
  return {
    uid,
    name: typeof profile.name === "string" ? profile.name : "",
    email: typeof profile.email === "string" ? profile.email : null,
    phoneNumber: typeof profile.phoneNumber === "string" ? profile.phoneNumber : null,
    employeeId: typeof profile.employeeId === "string" ? profile.employeeId : "",
    role: typeof profile.role === "string" ? profile.role : "",
    department: typeof profile.department === "string" ? profile.department : null,
  };
}
