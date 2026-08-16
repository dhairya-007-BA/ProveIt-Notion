import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { AdminAuthError, requireCapability } from "@/lib/admin-auth";
import { GLOBAL_CAPABILITIES, type GlobalCapability, type WorkspaceAccessLevel } from "@/lib/permissions";

type Context = { params: Promise<{ uid: string }> };
type Body = {
  capabilities?: Partial<Record<GlobalCapability, boolean>>;
  workspaceId?: string;
  accessLevel?: WorkspaceAccessLevel | "none";
};

const validCapability = (value: string): value is GlobalCapability =>
  (GLOBAL_CAPABILITIES as readonly string[]).includes(value);

function failure(error: unknown, operation: "load" | "update") {
  if (error instanceof AdminAuthError) {
    const code = error.status === 401
      ? "employee_permissions_authentication_failed"
      : error.status === 403
        ? "employee_permissions_authorization_failed"
      : error.status === 404
          ? "employee_permissions_not_found"
        : error.status === 503
          ? "employee_permissions_server_authentication_unavailable"
          : `employee_permissions_${operation}_failed`;
    return NextResponse.json({ success: false, code, message: error.message }, { status: error.status });
  }
  return NextResponse.json(
    {
      success: false,
      code: `employee_permissions_${operation}_failed`,
      message: operation === "load" ? "Employee permissions could not be loaded." : "Employee permissions could not be updated.",
    },
    { status: 503 }
  );
}

async function effectiveGlobalAdministrators(transaction: FirebaseFirestore.Transaction) {
  const users = await transaction.get(adminDb.collection("users").where("active", "==", true));
  return users.docs.filter((user) => {
    const data = user.data();
    const capabilities = data.capabilities;
    return capabilities?.manageEmployees === true ||
      (data.role === "bod" && (!capabilities || !("manageEmployees" in capabilities)));
  });
}

export async function GET(request: Request, context: Context) {
  try {
    await requireCapability(request, "manageEmployees", "read-employee-permissions");
    const { uid } = await context.params;
    const [user, memberships, workspaces] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("workspaceMemberships").where("userId", "==", uid).get(),
      adminDb.collection("workspaces").get(),
    ]);
    if (!user.exists) return NextResponse.json({ success: false, message: "Employee profile not found." }, { status: 404 });
    return NextResponse.json({ success: true, employee: { uid, ...user.data() }, capabilities: user.data()?.capabilities ?? {}, workspaces: workspaces.docs.filter((doc) => !doc.data().deletedAt).map((doc) => ({ id: doc.id, ...doc.data() })), memberships: memberships.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { return failure(error, "load"); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request, "manageEmployees", "update-employee-permissions");
    const { uid } = await context.params;
    const body = await request.json() as Body;
    if (body.capabilities && Object.keys(body.capabilities).some((key) => !validCapability(key))) return NextResponse.json({ success: false, message: "Invalid capability." }, { status: 400 });
    if (body.accessLevel && !["none", "member", "admin"].includes(body.accessLevel)) return NextResponse.json({ success: false, message: "Invalid workspace access level." }, { status: 400 });
    await adminDb.runTransaction(async (transaction) => {
      const userRef = adminDb.collection("users").doc(uid);
      const user = await transaction.get(userRef);
      if (!user.exists) throw new AdminAuthError("Employee profile not found.", 404);
      if (body.capabilities) {
        const current = user.data()?.capabilities ?? {};
        const next = { ...current, ...body.capabilities };
        if (uid === actor.uid && current.manageEmployees === true && next.manageEmployees !== true) throw new AdminAuthError("You cannot remove your own employee-administration capability.", 400);
        if (current.manageEmployees === true && next.manageEmployees !== true && (await effectiveGlobalAdministrators(transaction)).length <= 1) throw new AdminAuthError("The final effective employee administrator cannot be removed.", 400);
        transaction.update(userRef, { capabilities: next, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
      }
      if (body.workspaceId && body.accessLevel) {
        const workspace = await transaction.get(adminDb.collection("workspaces").doc(body.workspaceId));
        if (!workspace.exists || workspace.data()?.deletedAt) throw new AdminAuthError("Workspace not found.", 404);
        const membershipRef = adminDb.collection("workspaceMemberships").doc(`${body.workspaceId}_${uid}`);
        if (body.accessLevel === "none") transaction.delete(membershipRef);
        else transaction.set(membershipRef, { workspaceId: body.workspaceId, userId: uid, active: true, accessLevel: body.accessLevel, role: body.accessLevel, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error, "update"); }
}
