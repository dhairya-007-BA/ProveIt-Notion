import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getTranscriptionAvailability, transcribeMeetingAudio } from "@/lib/meeting-transcription";

describe("meeting transcription adapter", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.WHISPER_API_URL;
    delete process.env.WHISPER_BASE_URL;
    delete process.env.WHISPER_API_KEY;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("is explicitly unavailable when no endpoint is configured", async () => {
    expect(getTranscriptionAvailability().available).toBe(false);
    await expect(transcribeMeetingAudio(new Blob(["audio"], { type: "audio/webm" }), "meeting.webm")).rejects.toMatchObject({
      detail: { code: "provider_unavailable", retryable: false },
    });
  });

  it("uses the Whisper-compatible multipart endpoint without exposing its key", async () => {
    process.env.WHISPER_BASE_URL = "https://whisper.internal";
    process.env.WHISPER_API_KEY = "private-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ text: " Preserved raw transcript " }), { status: 200 }));

    await expect(transcribeMeetingAudio(new Blob(["audio"], { type: "audio/webm" }), "meeting.webm")).resolves.toBe("Preserved raw transcript");
    expect(fetchMock).toHaveBeenCalledWith("https://whisper.internal/v1/audio/transcriptions", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer private-key" },
      body: expect.any(FormData),
      cache: "no-store",
    }));
  });
});
