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

interface RemoveEmployeeBody {
  employeeId?: string;
}

interface RouteContext {
  params: Promise<{
    uid: string;
  }>;
}

export async function DELETE(
  request: Request,
  context: RouteContext
) {
  try {
    // ─────────────────────────────
    // AUTHORIZE BOD
    // ─────────────────────────────

    const administrator =
      await requireBOD(request);

    const { uid } =
      await context.params;

    // Never allow an administrator
    // to remove their own account.
    if (uid === administrator.uid) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You cannot permanently remove your own account.",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      (await request.json()) as RemoveEmployeeBody;

    const confirmationEmployeeId =
      body.employeeId
        ?.trim()
        .toLowerCase();

    // ─────────────────────────────
    // LOAD EMPLOYEE
    // ─────────────────────────────

    const employeeRef =
      adminDb
        .collection("users")
        .doc(uid);

    const employeeSnapshot =
      await employeeRef.get();

    if (!employeeSnapshot.exists) {
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
      employeeSnapshot.data();

    const actualEmployeeId =
      String(
        employee?.employeeId || ""
      )
        .trim()
        .toLowerCase();

    if (!actualEmployeeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee profile does not contain an employee ID.",
        },
        {
          status: 400,
        }
      );
    }

    // ─────────────────────────────
    // REQUIRE EXPLICIT CONFIRMATION
    // ─────────────────────────────

    if (
      !confirmationEmployeeId ||
      confirmationEmployeeId !==
        actualEmployeeId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee ID confirmation does not match.",
        },
        {
          status: 400,
        }
      );
    }

    if (employee?.removed === true) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This employee has already been removed.",
        },
        {
          status: 409,
        }
      );
    }

    // ─────────────────────────────
    // FIND WORKSPACE MEMBERSHIPS
    // ─────────────────────────────

    const membershipsSnapshot =
      await adminDb
        .collection(
          "workspaceMemberships"
        )
        .where(
          "userId",
          "==",
          uid
        )
        .get();

    // ─────────────────────────────
    // REMOVE FIREBASE AUTH ACCOUNT
    // ─────────────────────────────

    try {
      await adminAuth.deleteUser(uid);
    } catch (error: unknown) {
      // If the Auth account is already gone,
      // we can still finish the Firestore
      // historical cleanup.
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(
              (
                error as {
                  code?: unknown;
                }
              ).code
            )
          : "";

      if (
        code !==
        "auth/user-not-found"
      ) {
        throw error;
      }
    }

    // ─────────────────────────────
    // PRESERVE HISTORICAL PROFILE
    // ─────────────────────────────

    const batch =
      adminDb.batch();

    batch.update(employeeRef, {
      active: false,
      removed: true,

      removedBy:
        administrator.uid,

      removedAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });

    // Explicit workspace memberships
    // are access-control records, so these
    // can be deleted. Historical business
    // records are intentionally untouched.
    membershipsSnapshot.docs.forEach(
      (membershipDocument) => {
        batch.delete(
          membershipDocument.ref
        );
      }
    );

    await batch.commit();

    return NextResponse.json({
      success: true,

      message:
        "Employee access was permanently removed while historical records were preserved.",
    });
  } catch (error) {
    if (
      error instanceof AdminAuthError
    ) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    console.error(
      "Failed to remove employee:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Employee could not be removed.",
      },
      {
        status: 500,
      }
    );
  }
}