import "server-only";

import type { MeetingIntelligenceError } from "@/types/meeting";

export class MeetingIntelligenceProviderError extends Error {
  constructor(
    public detail: MeetingIntelligenceError,
    public httpStatus: 502 | 503 | 504 = detail.code === "provider_timeout" ? 504 : detail.code === "provider_unavailable" ? 503 : 502,
  ) {
    super(detail.message);
    this.name = "MeetingIntelligenceProviderError";
  }
}

export function unavailableProvider(message: string) {
  return new MeetingIntelligenceProviderError({
    code: "provider_unavailable",
    message,
    retryable: false,
  }, 503);
}

export function normalizeProviderFailure(error: unknown, provider: "transcription" | "analysis") {
  if (error instanceof MeetingIntelligenceProviderError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new MeetingIntelligenceProviderError({
      code: "provider_timeout",
      message: `The ${provider} service timed out. Try again.`,
      retryable: true,
    }, 504);
  }
  return new MeetingIntelligenceProviderError({
    code: "provider_unavailable",
    message: `The ${provider} service is temporarily unavailable. Try again.`,
    retryable: true,
  }, 503);
}
