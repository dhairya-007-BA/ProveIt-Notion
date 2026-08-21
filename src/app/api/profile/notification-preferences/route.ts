import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { AdminAuthError } from "@/lib/admin-auth-core";
import { normalizeNotificationPreferences, parseNotificationPreferences } from "@/lib/notification-preferences";
import { requireAuthenticatedProfile } from "@/lib/profile-route-auth";

function errorResponse(error: unknown) {
  if (error instanceof AdminAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  return NextResponse.json({ success: false, message: "Notification preferences are temporarily unavailable." }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedProfile(request);
    return NextResponse.json({ success: true, preferences: normalizeNotificationPreferences(user.profile.notificationPreferences) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as unknown;
    const preferences = parseNotificationPreferences(body);
    if (!preferences) return NextResponse.json({ success: false, message: "Invalid notification preferences." }, { status: 422 });
    const user = await requireAuthenticatedProfile(request);
    await user.ref.update({ notificationPreferences: preferences, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, preferences });
  } catch (error) { return errorResponse(error); }
}
