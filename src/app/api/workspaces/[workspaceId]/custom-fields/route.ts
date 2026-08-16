import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { CUSTOM_FIELD_LIMITS, isCustomFieldType, normalizeLabel, normalizeOptions } from "@/lib/custom-fields";

type Context = { params: Promise<{ workspaceId: string }> };
type Body = { name?: unknown; type?: unknown; description?: unknown; required?: unknown; options?: unknown };
type ReorderBody = { fieldIds?: unknown };

function failure(error: unknown) {
  if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status });
  return NextResponse.json({ success: false, code: "custom_fields_unknown_failure", message: "Custom fields could not be processed." }, { status: 500 });
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    await requireCustomFieldWorkspaceUser(request, workspaceId);
    let fields;
    try {
      fields = await adminDb.collection("workspaceCustomFields").where("workspaceId", "==", workspaceId).get();
    } catch {
      return NextResponse.json({ success: false, code: "custom_fields_query_failed", message: "Custom fields could not be loaded." }, { status: 503 });
    }
    const result = fields.docs.map((item) => ({ id: item.id, ...item.data() } as { id: string; position?: unknown; [key: string]: unknown })).sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0));
    return NextResponse.json({ success: true, fields: result });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const actor = await requireCustomFieldWorkspaceUser(request, workspaceId, true);
    const body = await request.json() as Body;
    if (Object.keys(body).some((key) => !["name", "type", "description", "required", "options"].includes(key))) return NextResponse.json({ success: false, message: "Unexpected field properties." }, { status: 400 });
    const name = normalizeLabel(body.name, CUSTOM_FIELD_LIMITS.nameLength);
    if (!name || !isCustomFieldType(body.type) || typeof body.required !== "boolean") return NextResponse.json({ success: false, message: "Invalid custom field." }, { status: 400 });
    const description = body.description === undefined ? "" : normalizeLabel(body.description, CUSTOM_FIELD_LIMITS.descriptionLength);
    const options = normalizeOptions(body.options, body.type);
    if (description === null || options === null) return NextResponse.json({ success: false, message: "Invalid custom field options." }, { status: 400 });
    const collection = adminDb.collection("workspaceCustomFields");
    const existing = await collection.where("workspaceId", "==", workspaceId).get();
    if (existing.docs.filter((item) => item.data().active !== false).length >= CUSTOM_FIELD_LIMITS.fieldsPerWorkspace) return NextResponse.json({ success: false, message: "This workspace has reached its custom field limit." }, { status: 400 });
    const field = collection.doc();
    await field.set({ workspaceId, name, type: body.type, description, required: body.required, options, position: existing.docs.length, active: true, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, field: { id: field.id, workspaceId, name, type: body.type, description, required: body.required, options, position: existing.docs.length, active: true } }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    await requireCustomFieldWorkspaceUser(request, workspaceId, true);
    const body = await request.json() as ReorderBody;
    if (!Array.isArray(body.fieldIds) || body.fieldIds.some((id) => typeof id !== "string" || !id)) return NextResponse.json({ success: false, message: "Invalid property order." }, { status: 400 });
    const fields = await adminDb.collection("workspaceCustomFields").where("workspaceId", "==", workspaceId).get();
    const activeIds = fields.docs.filter((item) => item.data().active !== false).map((item) => item.id);
    if (body.fieldIds.length !== activeIds.length || new Set(body.fieldIds).size !== body.fieldIds.length || body.fieldIds.some((id) => !activeIds.includes(id))) return NextResponse.json({ success: false, message: "Property order must contain this workspace's active properties." }, { status: 400 });
    const batch = adminDb.batch();
    body.fieldIds.forEach((id, position) => batch.update(adminDb.collection("workspaceCustomFields").doc(id), { position, updatedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
