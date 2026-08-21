import "server-only";

export type EmailDeliveryResult =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "unavailable"; reason: "missing_api_key" | "missing_from_address" | "missing_app_url" }
  | { status: "failed"; reason: "provider_rejected" | "provider_unavailable"; providerStatus?: number };

export type ProveItEmail = {
  to: string;
  subject: string;
  preview: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  idempotencyKey: string;
};

type EmailDependencies = {
  fetch?: typeof fetch;
  apiKey?: string;
  fromAddress?: string;
  appUrl?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function absoluteProveItUrl(appUrl: string, relativeUrl: string) {
  const base = new URL(appUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") throw new Error("PROVEIT_APP_URL must use HTTPS.");
  return new URL(relativeUrl.startsWith("/") ? relativeUrl : `/${relativeUrl}`, base).toString();
}

export function renderProveItEmail(email: Omit<ProveItEmail, "to" | "idempotencyKey">) {
  const subject = escapeHtml(email.subject);
  const preview = escapeHtml(email.preview);
  const heading = escapeHtml(email.heading);
  const body = escapeHtml(email.body);
  const actionLabel = escapeHtml(email.actionLabel);
  const actionUrl = escapeHtml(email.actionUrl);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;background:#f5f7fa;color:#172033;font-family:Inter,Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${preview}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce2ea;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 28px;background:#173f8f;color:#fff;font-size:20px;font-weight:700">ProveIt</td></tr><tr><td style="padding:32px 28px"><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25">${heading}</h1><p style="margin:0 0 24px;color:#506078;font-size:16px;line-height:1.6">${body}</p><a href="${actionUrl}" style="display:inline-block;border-radius:9px;background:#173f8f;color:#fff;padding:12px 18px;text-decoration:none;font-weight:600">${actionLabel}</a><p style="margin:28px 0 0;color:#79869a;font-size:12px;line-height:1.5">You can manage optional email notifications from your ProveIt profile.</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendProveItEmail(email: ProveItEmail, dependencies: EmailDependencies = {}): Promise<EmailDeliveryResult> {
  const apiKey = dependencies.apiKey ?? process.env.RESEND_API_KEY;
  const fromAddress = dependencies.fromAddress ?? process.env.RESEND_FROM_EMAIL;
  const appUrl = dependencies.appUrl ?? process.env.PROVEIT_APP_URL;
  if (!apiKey) return { status: "unavailable", reason: "missing_api_key" };
  if (!fromAddress) return { status: "unavailable", reason: "missing_from_address" };
  if (!appUrl) return { status: "unavailable", reason: "missing_app_url" };
  let actionUrl: string;
  try { actionUrl = absoluteProveItUrl(appUrl, email.actionUrl); }
  catch { return { status: "failed", reason: "provider_rejected" }; }
  try {
    const response = await (dependencies.fetch ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": email.idempotencyKey },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: fromAddress,
        to: [email.to],
        subject: email.subject,
        text: `${email.heading}\n\n${email.body}\n\n${actionUrl}`,
        html: renderProveItEmail({ ...email, actionUrl }),
      }),
    });
    if (!response.ok) return { status: "failed", reason: response.status >= 500 ? "provider_unavailable" : "provider_rejected", providerStatus: response.status };
    const result = await response.json().catch(() => null) as { id?: unknown } | null;
    return { status: "sent", providerMessageId: typeof result?.id === "string" ? result.id : null };
  } catch {
    return { status: "failed", reason: "provider_unavailable" };
  }
}
