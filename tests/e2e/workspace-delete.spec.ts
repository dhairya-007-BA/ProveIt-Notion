import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, employeeId: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/");
}

test("BOD can tombstone archived and active non-system workspaces without orphaning their route data", async ({ page }) => {
  await signIn(page, "admin-test", "admin-test-password");

  await page.goto("/admin/workspaces/dhairya");
  await expect(page.getByRole("heading", { name: "Dhairya settings" })).toBeVisible();
  await page.getByLabel("Delete workspace confirmation").fill("Dhairya");
  await page.getByRole("button", { name: "Delete workspace permanently" }).click();
  await expect(page).toHaveURL("/admin/workspaces");

  await page.goto("/admin/workspaces/business");
  await page.getByLabel("Delete workspace confirmation").fill("Business");
  await page.getByRole("button", { name: "Delete workspace permanently" }).click();
  await expect(page).toHaveURL("/admin/workspaces");
  await expect(page.getByRole("link", { name: "Business", exact: true })).toBeVisible();

  await page.goto("/admin/workspaces/company");
  await expect(page.getByText("protected system workspace", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete workspace permanently" })).toHaveCount(0);
  await page.goto("/admin/workspaces/board");
  await expect(page.getByText("protected system workspace", { exact: false })).toBeVisible();
});

test("non-BOD users remain denied from destructive workspace settings", async ({ page }) => {
  await signIn(page, "database-test", "database-test-password");
  await page.goto("/admin/workspaces/business");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByLabel("Delete workspace confirmation")).toHaveCount(0);
});
