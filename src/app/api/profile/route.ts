import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { AdminAuthError } from "@/lib/admin-auth-core";
import { normalizePhoneNumber, profileResponse } from "@/lib/profile";
import { requireAuthenticatedProfile } from "@/lib/profile-route-auth";

function errorResponse(error: unknown) {
  if (error instanceof AdminAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  return NextResponse.json({ success: false, message: "Profile update is unavailable." }, { status: 503 });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !("phoneNumber" in body)) {
      return NextResponse.json({ success: false, message: "Invalid profile update." }, { status: 422 });
    }
    const phoneNumber = normalizePhoneNumber(body.phoneNumber);
    if (phoneNumber === null) return NextResponse.json({ success: false, message: "Enter a valid phone number." }, { status: 422 });
    const user = await requireAuthenticatedProfile(request);
    await user.ref.update({ phoneNumber: phoneNumber || FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, profile: profileResponse(user.uid, { ...user.profile, phoneNumber: phoneNumber || null }) });
  } catch (error) { return errorResponse(error); }
}
