import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { CUSTOM_FIELD_LIMITS, isCustomFieldType, normalizeLabel, normalizeOptions } from "@/lib/custom-fields";

type Context = { params: Promise<{ workspaceId: string; fieldId: string }> };
type Body = { name?: unknown; description?: unknown; required?: unknown; options?: unknown; active?: unknown; type?: unknown; position?: unknown };

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, fieldId } = await context.params;
    await requireCustomFieldWorkspaceUser(request, workspaceId, true);
    const body = await request.json() as Body;
    if (Object.keys(body).some((key) => !["name", "description", "required", "options", "active", "position", "type"].includes(key))) return NextResponse.json({ success: false, message: "Unexpected field properties." }, { status: 400 });
    const ref = adminDb.collection("workspaceCustomFields").doc(fieldId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.workspaceId !== workspaceId) return NextResponse.json({ success: false, message: "Custom field not found." }, { status: 404 });
    const current = snapshot.data()!;
    if (body.type !== undefined && (!isCustomFieldType(body.type) || body.type !== current.type)) return NextResponse.json({ success: false, message: "Custom field type is immutable." }, { status: 400 });
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) { const name = normalizeLabel(body.name, CUSTOM_FIELD_LIMITS.nameLength); if (!name) return NextResponse.json({ success: false, message: "Invalid field name." }, { status: 400 }); update.name = name; }
    if (body.description !== undefined) { const description = body.description === "" ? "" : normalizeLabel(body.description, CUSTOM_FIELD_LIMITS.descriptionLength); if (description === null) return NextResponse.json({ success: false, message: "Invalid description." }, { status: 400 }); update.description = description; }
    if (body.required !== undefined) { if (typeof body.required !== "boolean") return NextResponse.json({ success: false, message: "Invalid required value." }, { status: 400 }); update.required = body.required; }
    if (body.active !== undefined) { if (typeof body.active !== "boolean") return NextResponse.json({ success: false, message: "Invalid archive value." }, { status: 400 }); update.active = body.active; }
    if (body.position !== undefined) { if (!Number.isInteger(body.position) || (body.position as number) < 0 || (body.position as number) > CUSTOM_FIELD_LIMITS.fieldsPerWorkspace) return NextResponse.json({ success: false, message: "Invalid field order." }, { status: 400 }); update.position = body.position; }
    if (body.options !== undefined) {
      const options = normalizeOptions(body.options, current.type);
      if (options === null) return NextResponse.json({ success: false, message: "Invalid custom field options." }, { status: 400 });
      const removed = (current.options as string[]).filter((option) => !options.includes(option));
      if (removed.length) {
        const tasks = await adminDb.collection("tasks").where("workspaceId", "==", workspaceId).get();
        const inUse = tasks.docs.some((task) => { const value = task.data().customFields?.[fieldId]; return typeof value === "string" ? removed.includes(value) : Array.isArray(value) && value.some((item) => removed.includes(item)); });
        if (inUse) return NextResponse.json({ success: false, message: "Options with historical values cannot be removed." }, { status: 400 });
      }
      update.options = options;
    }
    await ref.update(update);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: "Custom field could not be updated." }, { status: 500 });
  }
}
