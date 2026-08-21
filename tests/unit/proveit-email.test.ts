import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderProveItEmail, sendProveItEmail } from "@/lib/proveit-email";

const email = {
  to: "employee@proveit.test",
  subject: "You were mentioned",
  preview: "A teammate mentioned you.",
  heading: "You were mentioned",
  body: "Alex <script>alert(1)</script> mentioned you.",
  actionLabel: "Open task",
  actionUrl: "/workspaces/company/tasks?task=1",
  idempotencyKey: "email_mention_1_employee",
};

describe("ProveIt email adapter", () => {
  it("reports missing configuration without calling the provider", async () => {
    const request = vi.fn();
    await expect(sendProveItEmail(email, { fetch: request, apiKey: "", fromAddress: "", appUrl: "" })).resolves.toEqual({ status: "unavailable", reason: "missing_api_key" });
    expect(request).not.toHaveBeenCalled();
  });

  it("sends safe branded HTML through Resend with an idempotency key", async () => {
    const request = vi.fn((...args: [RequestInfo | URL, RequestInit?]) => { void args; return Promise.resolve(new Response(JSON.stringify({ id: "resend-1" }), { status: 200 })); });
    await expect(sendProveItEmail(email, { fetch: request as typeof fetch, apiKey: "secret", fromAddress: "ProveIt <updates@proveit.test>", appUrl: "https://workspace.proveit.test" })).resolves.toEqual({ status: "sent", providerMessageId: "resend-1" });
    const [, init] = request.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(init?.headers).toMatchObject({ "Idempotency-Key": email.idempotencyKey });
    const body = JSON.parse(String(init?.body)) as { html: string; text: string };
    expect(body.html).toContain("ProveIt");
    expect(body.html).toContain("Alex &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body.html).not.toContain("<script>alert(1)</script>");
    expect(body.text).toContain("https://workspace.proveit.test/workspaces/company/tasks?task=1");
  });

  it("does not expose provider response bodies and records safe failure categories", async () => {
    const request = vi.fn((...args: [RequestInfo | URL, RequestInit?]) => { void args; return Promise.resolve(new Response("contains sensitive provider detail", { status: 429 })); });
    await expect(sendProveItEmail(email, { fetch: request as typeof fetch, apiKey: "secret", fromAddress: "updates@proveit.test", appUrl: "https://workspace.proveit.test" })).resolves.toEqual({ status: "failed", reason: "provider_rejected", providerStatus: 429 });
  });

  it("escapes all dynamic email content", () => {
    expect(renderProveItEmail({ ...email, actionUrl: "https://workspace.proveit.test" })).not.toContain("<script>alert(1)</script>");
  });
});
