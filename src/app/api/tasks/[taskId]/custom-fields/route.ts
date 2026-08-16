import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { type CustomFieldValue, type WorkspaceCustomField, validateCustomFieldValue } from "@/lib/custom-fields";

type Context = { params: Promise<{ taskId: string }> };
type Body = { customFields?: unknown };

export async function PUT(request: Request, context: Context) {
  try {
    const { taskId } = await context.params;
    const body = await request.json() as Body;
    if (!body.customFields || typeof body.customFields !== "object" || Array.isArray(body.customFields) || Object.keys(body).length !== 1) return NextResponse.json({ success: false, message: "Invalid custom property payload." }, { status: 400 });
    const task = await adminDb.collection("tasks").doc(taskId).get();
    if (!task.exists || typeof task.data()?.workspaceId !== "string") return NextResponse.json({ success: false, message: "Task not found." }, { status: 404 });
    const workspaceId = task.data()!.workspaceId as string;
    await requireCustomFieldWorkspaceUser(request, workspaceId);
    const [fieldSnapshot, membershipSnapshot] = await Promise.all([
      adminDb.collection("workspaceCustomFields").where("workspaceId", "==", workspaceId).get(),
      adminDb.collection("workspaceMemberships").where("workspaceId", "==", workspaceId).where("active", "==", true).get(),
    ]);
    const fields = fieldSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as WorkspaceCustomField));
    const active = fields.filter((field) => field.active !== false);
    const values = body.customFields as Record<string, unknown>;
    if (Object.keys(values).some((id) => !active.some((field) => field.id === id))) return NextResponse.json({ success: false, message: "Unknown or archived custom field." }, { status: 400 });
    const allowedPeople = new Set(membershipSnapshot.docs.map((item) => item.data().userId).filter((id): id is string => typeof id === "string"));
    const validated: Record<string, CustomFieldValue> = {};
    for (const field of active) {
      const value = validateCustomFieldValue(field, values[field.id], allowedPeople);
      if (value === undefined) return NextResponse.json({ success: false, message: "A custom property value is invalid or required." }, { status: 400 });
      if (value !== null) validated[field.id] = value;
    }
    const historical = task.data()?.customFields;
    const archived = typeof historical === "object" && historical !== null && !Array.isArray(historical)
      ? Object.fromEntries(Object.entries(historical as Record<string, unknown>).filter(([id]) => !active.some((field) => field.id === id))) : {};
    await task.ref.update({ customFields: { ...archived, ...validated }, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: "Custom properties could not be saved." }, { status: 500 });
  }
}
