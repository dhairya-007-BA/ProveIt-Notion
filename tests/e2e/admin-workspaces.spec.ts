import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, employeeId: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/");
}

test("workspace administration opens BOD-only workspace settings", async ({ page }) => {
  await signIn(page, "admin-test", "admin-test-password");
  await page.goto("/admin/workspaces");

  await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
  for (const workspace of [
    { name: "Company", id: "company" },
    { name: "Business", id: "business" },
    { name: "Technology", id: "technology" },
    { name: "Board", id: "board" },
  ]) {
    await expect(page.getByRole("link", { name: workspace.name, exact: true })).toHaveAttribute(
      "href",
      `/admin/workspaces/${workspace.id}`
    );
  }

  await expect(page.getByRole("link", { name: "Dhairya", exact: true })).toHaveAttribute(
    "href",
    "/admin/workspaces/dhairya"
  );
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

  await page.getByRole("link", { name: "Company", exact: true }).click();
  await expect(page).toHaveURL("/admin/workspaces/company");
  await expect(page.getByRole("heading", { name: "Company settings" })).toBeVisible();
  await expect(page.getByText("404", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Open workspace" }).click();
  await expect(page).toHaveURL("/workspaces/company");
  await page.goBack();
  await expect(page).toHaveURL("/admin/workspaces/company");
  await page.goBack();
  await expect(page).toHaveURL("/admin/workspaces");
  await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();

  for (const workspace of ["Business", "Technology", "Board"]) {
    await page.getByRole("link", { name: workspace, exact: true }).click();
    await expect(page).toHaveURL(`/admin/workspaces/${workspace.toLowerCase()}`);
    await expect(page.getByRole("heading", { name: `${workspace} settings` })).toBeVisible();
    await expect(page.getByText("404", { exact: true })).toHaveCount(0);
    await page.goBack();
  }

  await page.getByRole("link", { name: "Dhairya", exact: true }).click();
  await expect(page).toHaveURL("/admin/workspaces/dhairya");
  await expect(page.getByRole("heading", { name: "Dhairya settings" })).toBeVisible();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open workspace" })).toHaveCount(0);
});

test("non-BOD users cannot access workspace-admin settings", async ({ page }) => {
  await signIn(page, "database-test", "database-test-password");
  await page.goto("/admin/workspaces/board");

  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByText("404", { exact: true })).toHaveCount(0);
});
