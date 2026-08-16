import type { User } from "firebase/auth";
import { authenticatedRequest } from "@/lib/authenticated-request";
import type { CustomFieldValue } from "@/lib/custom-fields";

export async function saveTaskCustomFields(user: Pick<User, "getIdToken">, taskId: string, customFields: Record<string, CustomFieldValue>) {
  const response = await authenticatedRequest(user, `/api/tasks/${taskId}/custom-fields`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customFields }) });
  return response.ok;
}
