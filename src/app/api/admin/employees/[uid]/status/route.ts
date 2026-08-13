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

interface StatusBody {
  active?: boolean;
}

interface RouteContext {
  params: Promise<{
    uid: string;
  }>;
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
      (await request.json()) as StatusBody;

    if (typeof body.active !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          message:
            "The active status is required.",
        },
        {
          status: 400,
        }
      );
    }

    // Prevent an administrator from
    // disabling their own account.
    if (
      uid === administrator.uid &&
      body.active === false
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You cannot deactivate your own account.",
        },
        {
          status: 400,
        }
      );
    }

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

    const currentActive =
      employee?.active === true;

    // Nothing needs to change.
    if (currentActive === body.active) {
      return NextResponse.json({
        success: true,
        employee: {
          uid,
          active: body.active,
        },
      });
    }

    // ─────────────────────────────
    // LAST BOD PROTECTION
    // ─────────────────────────────

    if (
      employee?.role === "bod" &&
      body.active === false
    ) {
      const activeBODSnapshot =
        await adminDb
          .collection("users")
          .where("role", "==", "bod")
          .where("active", "==", true)
          .get();

      if (activeBODSnapshot.size <= 1) {
        return NextResponse.json(
          {
            success: false,
            message:
              "The last active BOD member cannot be deactivated.",
          },
          {
            status: 400,
          }
        );
      }
    }

    // ─────────────────────────────
    // UPDATE FIREBASE AUTH
    // ─────────────────────────────

    await adminAuth.updateUser(uid, {
      disabled: !body.active,
    });

    // When deactivating, explicitly revoke
    // refresh tokens as an additional
    // session termination measure.
    if (!body.active) {
      await adminAuth.revokeRefreshTokens(
        uid
      );
    }

    try {
      // ─────────────────────────────
      // UPDATE FIRESTORE
      // ─────────────────────────────

      const batch = adminDb.batch();

      batch.update(userRef, {
        active: body.active,

        updatedAt:
          FieldValue.serverTimestamp(),

        updatedBy:
          administrator.uid,
      });

      // Find explicit workspace memberships
      // belonging to this employee.
      const membershipsSnapshot =
        await adminDb
          .collection(
            "workspaceMemberships"
          )
          .where("userId", "==", uid)
          .get();

      membershipsSnapshot.docs.forEach(
        (membershipDocument) => {
          batch.update(
            membershipDocument.ref,
            {
              active: body.active,

              updatedAt:
                FieldValue.serverTimestamp(),

              updatedBy:
                administrator.uid,
            }
          );
        }
      );

      await batch.commit();
    } catch (firestoreError) {
      // Authentication changed successfully,
      // but Firestore failed.
      //
      // Restore the previous Auth state so
      // Auth and Firestore do not intentionally
      // remain inconsistent.

      try {
        await adminAuth.updateUser(uid, {
          disabled: !currentActive,
        });
      } catch (rollbackError) {
        console.error(
          "Failed to rollback Firebase Auth status:",
          rollbackError
        );
      }

      throw firestoreError;
    }

    return NextResponse.json({
      success: true,

      employee: {
        uid,
        active: body.active,
      },

      message: body.active
        ? "Employee reactivated."
        : "Employee deactivated.",
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
      "Failed to change employee status:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Employee status could not be changed.",
      },
      {
        status: 500,
      }
    );
  }
}