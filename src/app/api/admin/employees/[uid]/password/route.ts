import "server-only";

import { NextResponse } from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin";

import {
  AdminAuthError,
  requireBOD,
} from "@/lib/admin-auth";

interface RouteContext {
  params: Promise<{
    uid: string;
  }>;
}

/*
 * Generates a temporary password.
 *
 * The password is NOT stored in
 * Firestore. It is returned once to
 * the administrator after the reset.
 */
function generateTemporaryPassword() {
  const random =
    crypto.randomUUID()
      .replaceAll("-", "")
      .slice(0, 12);

  return `Pv!${random}9`;
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    /*
     * Only authenticated BOD users
     * may initiate password resets.
     */
    await requireBOD(request);

    const { uid } =
      await context.params;

    /*
     * Confirm employee exists.
     */
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

    const employeeData =
      employeeSnapshot.data();

    if (
      employeeData?.active !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Password cannot be reset for an inactive employee.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Generate a temporary password.
     */
    const temporaryPassword =
      generateTemporaryPassword();

    /*
     * Update Firebase Authentication.
     *
     * The password itself never goes
     * into Firestore.
     */
    await adminAuth.updateUser(
      uid,
      {
        password:
          temporaryPassword,
      }
    );

    /*
     * Force the employee through the
     * private password creation screen
     * after their next login.
     */
    await employeeRef.update({
      mustChangePassword: true,
      updatedAt:
        new Date(),
    });

    /*
     * Return the temporary password
     * once so the administrator can
     * securely give it to the employee.
     */
    return NextResponse.json({
      success: true,

      temporaryPassword,

      message:
        "Temporary password generated successfully.",
    });
  } catch (error) {
    if (
      error instanceof
      AdminAuthError
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
      "Failed to reset employee password:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Employee password could not be reset.",
      },
      {
        status: 500,
      }
    );
  }
}