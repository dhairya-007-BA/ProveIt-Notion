import "server-only";

import { NextResponse } from "next/server";

import { KaneoError, kaneoGet } from "@/lib/kaneo";
import { KaneoRouteAuthError, requireKaneoUser } from "@/lib/kaneo-route-auth";

function errorResponse(error: unknown) {
  if (error instanceof KaneoRouteAuthError || error instanceof KaneoError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error("Kaneo health route failed", { errorType: typeof error });
  return NextResponse.json({ success: false, message: "Kaneo service is unavailable." }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    await requireKaneoUser(request);
    const response = await kaneoGet("/api/health");
    if (typeof response !== "object" || response === null ||
      (response as { status?: unknown }).status !== "ok") {
      throw new KaneoError("Kaneo returned an invalid response.", 502);
    }
    return NextResponse.json({ success: true, status: "ok" });
  } catch (error) {
    return errorResponse(error);
  }
}
