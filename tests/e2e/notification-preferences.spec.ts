import { expect, test } from "@playwright/test";

test("a user can persist their own notification preferences", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await page.goto("/profile");
  await expect(page.getByText("No company work email has been provisioned")).toBeVisible();
  await expect(page.getByText(/@auth\.proveit\.internal/)).toHaveCount(0);
  await expect(page.getByLabel("Phone number")).toHaveAttribute("type", "tel");
  const emailPreferences = page.getByRole("group", { name: "Email" });
  const mentionEmail = emailPreferences.getByRole("checkbox", { name: "Mentions" });

  await expect(mentionEmail).not.toBeChecked();
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Notification preferences" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await mentionEmail.check();
  await page.getByRole("button", { name: "Save notification preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Notification preferences saved.");

  await page.reload();
  await expect(emailPreferences.getByRole("checkbox", { name: "Mentions" })).toBeChecked();

  // Restore the deterministic default so this test does not affect later
  // notification-delivery scenarios in the serialized suite.
  await emailPreferences.getByRole("checkbox", { name: "Mentions" }).uncheck();
  await page.getByRole("button", { name: "Save notification preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Notification preferences saved.");
});
