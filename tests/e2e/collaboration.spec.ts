import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, employeeId: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

async function signOut(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Open account options" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
}

test("comments, replies, mentions, and inbox navigation work for emulator users", async ({ page }) => {
  await signIn(page, "database-test", "database-test-password");
  await page.goto("/workspaces/company/tasks/task-e2e");

  const composer = page.getByLabel("Write a comment");
  await composer.fill("Task discussion for the mention test.");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.getByRole("article").getByText("Task discussion for the mention test.")).toBeVisible({ timeout: 15_000 });
  const originalComment = page.getByRole("article").filter({ hasText: "Task discussion for the mention test." }).first();
  await originalComment.getByRole("button", { name: "Reply" }).click();
  await composer.fill("A reply on the same task.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByRole("article").getByText("A reply on the same task.")).toBeVisible({ timeout: 15_000 });

  await composer.fill("Please review this task with @Men");
  await expect(page.getByRole("option", { name: "@Mentioned User" })).toBeVisible();
  await composer.press("Enter");
  await expect(composer).toHaveValue("Please review this task with @Mentioned User ");
  await composer.fill("Please review this task with @Mentioned User before tomorrow.");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.getByRole("article").getByText(/Please review this task with/)).toBeVisible({ timeout: 15_000 });

  await signOut(page);
  await signIn(page, "mentioned-user", "mentioned-user-password");
  await page.goto("/workspaces/company/inbox");

  const notification = page.getByRole("article").filter({ hasText: "Database Test User mentioned you in a comment." }).last();
  await expect(notification).toBeVisible();
  await notification.getByRole("button", { name: "Open You were mentioned" }).click();
  await expect(page).toHaveURL("/workspaces/company/tasks/task-e2e");
  await expect(page.getByText("A reply on the same task.")).toBeVisible();
  await expect(page.getByText("@Mentioned User", { exact: true })).toBeVisible();
});
