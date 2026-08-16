import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin";

import {
  AdminAuthError,
  requireBOD,
} from "@/lib/admin-auth";

const ALLOWED_ROLES = [
  "business_intern",
  "tech_intern",
  "bod",
] as const;

type EmployeeRole =
  (typeof ALLOWED_ROLES)[number];

interface UpdateEmployeeBody {
  name?: string;
  role?: EmployeeRole;
}

interface RouteContext {
  params: Promise<{
    uid: string;
  }>;
}

function departmentFromRole(
  role: EmployeeRole
) {
  if (role === "business_intern") {
    return "business";
  }

  if (role === "tech_intern") {
    return "tech";
  }

  return "bod";
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const administrator =
      await requireBOD(request);

    const { uid } = await context.params;

    const body =
      (await request.json()) as UpdateEmployeeBody;

    const name = body.name?.trim();
    const role = body.role;

    // ─────────────────────────────
    // VALIDATION
    // ─────────────────────────────

    if (!name || !role) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee name and role are required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !ALLOWED_ROLES.includes(role)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid employee role.",
        },
        {
          status: 400,
        }
      );
    }

    // ─────────────────────────────
    // LOAD EMPLOYEE
    // ─────────────────────────────

    const userRef = adminDb
      .collection("users")
      .doc(uid);

    const userSnapshot =
      await userRef.get();

    if (!userSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee profile not found.",
        },
        {
          status: 404,
        }
      );
    }

    const employee =
      userSnapshot.data();

    const currentRole =
      employee?.role as EmployeeRole;

    const currentName =
      employee?.name as string;

    const currentActive =
      employee?.active === true;

    // ─────────────────────────────
    // SELF-DEMOTION PROTECTION
    // ─────────────────────────────

    if (
      uid === administrator.uid &&
      currentRole === "bod" &&
      role !== "bod"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You cannot remove your own BOD access.",
        },
        {
          status: 400,
        }
      );
    }

    // ─────────────────────────────
    // LAST ACTIVE BOD PROTECTION
    // ─────────────────────────────

    if (
      currentRole === "bod" &&
      role !== "bod" &&
      currentActive
    ) {
      const activeBODSnapshot =
        await adminDb
          .collection("users")
          .where("role", "==", "bod")
          .where("active", "==", true)
          .get();

      if (
        activeBODSnapshot.size <= 1
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "The last active BOD member cannot be changed to another role.",
          },
          {
            status: 400,
          }
        );
      }
    }

    const newDepartment =
      departmentFromRole(role);

    // ─────────────────────────────
    // UPDATE FIREBASE AUTH
    // ─────────────────────────────

    await adminAuth.updateUser(uid, {
      displayName: name,
    });

    try {
      // ─────────────────────────────
      // FIRESTORE BATCH
      // ─────────────────────────────

      const batch = adminDb.batch();

      batch.update(userRef, {
        name,
        role,
        department: newDepartment,

        updatedBy:
          administrator.uid,

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      // Role and department edits never alter canonical membership documents.

      await batch.commit();
    } catch (firestoreError) {
      // Firebase Auth was already updated.
      // Restore the old display name if
      // Firestore provisioning failed.

      try {
        await adminAuth.updateUser(uid, {
          displayName: currentName,
        });
      } catch (rollbackError) {
        console.error(
          "Failed to rollback Authentication profile:",
          rollbackError
        );
      }

      throw firestoreError;
    }

    return NextResponse.json({
      success: true,

      employee: {
        uid,
        name,
        role,
        department:
          newDepartment,
        active: currentActive,
      },

      message:
        "Employee updated successfully.",
    });
  } catch (error) {
    if (
      error instanceof AdminAuthError
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            error.message,
        },
        {
          status:
            error.status,
        }
      );
    }

    console.error(
      "Failed to update employee:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Employee could not be updated.",
      },
      {
        status: 500,
      }
    );
  }
}
