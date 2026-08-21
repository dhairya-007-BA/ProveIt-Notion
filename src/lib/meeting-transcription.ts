import "server-only";

import { MeetingIntelligenceProviderError, normalizeProviderFailure, unavailableProvider } from "@/lib/meeting-intelligence-provider";

const DEFAULT_TIMEOUT_MS = 120_000;

type WhisperConfig = { endpoint: string; apiKey?: string; model: string; timeoutMs: number };

function positiveTimeout(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 300_000) : DEFAULT_TIMEOUT_MS;
}

function whisperConfig(): WhisperConfig | null {
  const exactEndpoint = process.env.WHISPER_API_URL?.trim();
  const baseUrl = process.env.WHISPER_BASE_URL?.trim().replace(/\/$/, "");
  const endpoint = exactEndpoint || (baseUrl ? `${baseUrl}/v1/audio/transcriptions` : "");
  if (!endpoint) return null;
  try { new URL(endpoint); } catch { return null; }
  return {
    endpoint,
    apiKey: process.env.WHISPER_API_KEY?.trim() || undefined,
    model: process.env.WHISPER_MODEL?.trim() || "whisper-1",
    timeoutMs: positiveTimeout(process.env.WHISPER_TIMEOUT_MS),
  };
}

export function getTranscriptionAvailability() {
  return whisperConfig()
    ? { available: true, message: "Whisper transcription is configured." }
    : { available: false, message: "Whisper transcription is not configured." };
}

export async function transcribeMeetingAudio(audio: Blob, filename: string): Promise<string> {
  const config = whisperConfig();
  if (!config) throw unavailableProvider("Whisper transcription is not configured.");

  const form = new FormData();
  form.set("model", config.model);
  form.set("response_format", "json");
  form.set("file", audio, filename);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
      body: form,
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new MeetingIntelligenceProviderError({
        code: "provider_error",
        message: "The transcription service could not process this audio.",
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      }, response.status >= 500 ? 503 : 502);
    }
    const body = await response.json().catch(() => null) as { text?: unknown } | null;
    if (!body || typeof body.text !== "string" || !body.text.trim()) {
      throw new MeetingIntelligenceProviderError({
        code: "invalid_provider_response",
        message: "The transcription service returned an invalid response.",
        retryable: true,
      });
    }
    return body.text.trim();
  } catch (error) {
    throw normalizeProviderFailure(error, "transcription");
  }
}
