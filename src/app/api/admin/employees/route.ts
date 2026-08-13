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

interface CreateEmployeeBody {
  name?: string;
  employeeId?: string;
  password?: string;
  role?: EmployeeRole;
}

function employeeIdToEmail(
  employeeId: string
) {
  return `${employeeId
    .trim()
    .toLowerCase()}@auth.proveit.internal`;
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

export async function POST(
  request: Request
) {
  let createdUid: string | null = null;

  try {
    // Only an authenticated, active BOD member
    // may provision another employee.
    const administrator =
      await requireBOD(request);

    const body =
      (await request.json()) as CreateEmployeeBody;

    const name = body.name?.trim();

    const employeeId =
      body.employeeId
        ?.trim()
        .toLowerCase();

    const password = body.password;
    const role = body.role;

    // ─────────────────────────────
    // VALIDATION
    // ─────────────────────────────

    if (
      !name ||
      !employeeId ||
      !password ||
      !role
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Name, employee ID, password and role are required.",
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

    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Temporary password must contain at least 8 characters.",
        },
        {
          status: 400,
        }
      );
    }

    // ─────────────────────────────
    // CHECK EMPLOYEE ID
    // ─────────────────────────────

    const existingEmployee =
      await adminDb
        .collection("users")
        .where(
          "employeeId",
          "==",
          employeeId
        )
        .limit(1)
        .get();

    if (!existingEmployee.empty) {
      return NextResponse.json(
        {
          success: false,
          message:
            "That employee ID already exists.",
        },
        {
          status: 409,
        }
      );
    }

    // ─────────────────────────────
    // CREATE FIREBASE AUTH USER
    // ─────────────────────────────

    const email =
      employeeIdToEmail(employeeId);

    const authUser =
      await adminAuth.createUser({
        email,
        password,
        displayName: name,
        disabled: false,
      });

    createdUid = authUser.uid;

    const department =
      departmentFromRole(role);

    // ─────────────────────────────
    // FIRESTORE BATCH
    // ─────────────────────────────

    const batch = adminDb.batch();

    const userRef = adminDb
      .collection("users")
      .doc(authUser.uid);

    batch.set(userRef, {
      employeeId,
      name,
      department,
      role,
      active: true,

      createdBy: administrator.uid,

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });

    // ─────────────────────────────
    // WORKSPACE MEMBERSHIP
    // ─────────────────────────────
    //
    // Business and Technology employees
    // receive explicit membership documents.
    //
    // BOD access is role-based and therefore
    // does not require individual membership
    // documents for the canonical workspaces.

    if (role !== "bod") {
      const membershipId =
        `${department}_${authUser.uid}`;

      const membershipRef = adminDb
        .collection(
          "workspaceMemberships"
        )
        .doc(membershipId);

      batch.set(membershipRef, {
        workspaceId: department,
        userId: authUser.uid,
        role: "member",
        active: true,

        createdBy:
          administrator.uid,

        createdAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      });
    }

    // Commit the Firestore profile and
    // membership together.
    await batch.commit();

    // Authentication account now has
    // a corresponding Firestore profile.
    createdUid = null;

    return NextResponse.json(
      {
        success: true,

        employee: {
          uid: authUser.uid,
          employeeId,
          name,
          role,
          department,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    // ─────────────────────────────
    // AUTH ROLLBACK
    // ─────────────────────────────
    //
    // Firebase Authentication and Firestore
    // cannot share one transaction.
    //
    // If Auth succeeded but the Firestore
    // provisioning failed, remove the newly
    // created Authentication account.

    if (createdUid) {
      try {
        await adminAuth.deleteUser(
          createdUid
        );
      } catch (rollbackError) {
        console.error(
          "Failed to rollback Authentication user:",
          rollbackError
        );
      }
    }

    // ─────────────────────────────
    // AUTHORIZATION ERRORS
    // ─────────────────────────────

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
      "Employee provisioning failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Employee could not be created.",
      },
      {
        status: 500,
      }
    );
  }
}