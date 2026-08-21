import { NextResponse } from "next/server";

/** Assignment notifications are now planned atomically by the task mutation routes. */
export async function POST() {
  return NextResponse.json({ success: false, message: "Use the authoritative task assignment mutation route." }, { status: 410 });
}
