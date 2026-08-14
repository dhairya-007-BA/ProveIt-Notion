import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, employeeId: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

test("comments, replies, mentions, and inbox navigation work for emulator users", async ({ page }) => {
  await signIn(page, "database-test", "database-test-password");
  await page.goto("/workspaces/company/tasks/task-e2e");

  await page.getByLabel("Comment").fill("Task discussion for the mention test.");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByRole("article").getByText("Task discussion for the mention test.")).toBeVisible();
  await page.getByRole("article").getByRole("button", { name: "Reply" }).first().click();
  await page.getByLabel("Comment").fill("A reply on the same task.");
  await page.getByTestId("comment-submit").click();
  await expect(page.getByRole("article").getByText("A reply on the same task.")).toBeVisible();

  await page.getByLabel("Comment").fill("Please review this task.");
  await page.getByLabel("Mention teammate").selectOption({ label: "@Mentioned User" });
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByRole("article").getByText("Please review this task.")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Sign Out" }).click();
  await signIn(page, "mentioned-user", "mentioned-user-password");
  await page.goto("/workspaces/company/inbox");

  const notification = page.getByRole("article").filter({ hasText: "Database Test User mentioned you." }).last();
  await expect(notification).toBeVisible();
  await notification.getByRole("button", { name: "Open You were mentioned" }).click();
  await expect(page).toHaveURL("/workspaces/company/tasks/task-e2e");
  await page.goto("/workspaces/company/inbox");
  await page.getByRole("button", { name: "all" }).click();
  await expect(notification.getByRole("button", { name: "Unread" })).toBeVisible();
  await page.reload();
  await expect(notification.getByRole("button", { name: "Unread" })).toBeVisible();
});
