import { expect, test } from "@playwright/test";

test("workspace tasks, meetings, and activity routes work", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.goto("/workspaces/company/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: /Board/ }).click();
  await expect(page.getByText("Not started", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prepare candidate review" }).dragTo(
    page.getByLabel("In progress column")
  );
  await page.getByRole("button", { name: /Table/ }).click();
  await page.reload();
  await expect(page.getByLabel("Status for Prepare candidate review")).toHaveValue("in_progress");
  await page.goto("/workspaces/company/meetings");
  await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();
  await page.getByText("Candidate review", { exact: true }).click();
  await expect(page.getByLabel("Transcript")).toBeVisible();
  await page.getByLabel("Meeting notes").fill("Decision: continue.");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByLabel("Comment").fill("Please review this.");
  await page.getByLabel("Mention teammate").selectOption({ label: "@Mentioned User" });
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByRole("article").getByText("Please review this.")).toBeVisible();
  await page.goto("/workspaces/company/activity");
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();

  await page.goto("/workspaces/company/documents/document-e2e");
  await expect(page.getByLabel("Document title")).toHaveValue("Hiring rubric");
  await expect(page.getByLabel("Document content")).toContainText("candidate review");
  await expect(page.getByLabel("Comment")).toBeVisible();
});

test("workspace dashboard summarizes live task and meeting data", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await page.goto("/workspaces/company");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL("/workspaces/company/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("All tasks")).toBeVisible();
  await expect(page.getByText("Prepare candidate review")).toBeVisible();
  await expect(page.getByRole("link", { name: /Candidate review/ })).toBeVisible();
});

test("a task opens as a route-backed side peek and expands to its direct page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.goto("/workspaces/company/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: /Board/ }).click();
  await page.getByRole("button", { name: "Prepare candidate review" }).click();
  await expect(page).toHaveURL(/\/tasks\?task=task-e2e/);
  await expect(page.getByRole("button", { name: "Close task pane" })).toBeVisible();
  await expect(page.getByRole("textbox").first()).toHaveValue("Prepare candidate review");
  await expect(page.getByLabel("In progress column")).toBeVisible();
  await page.getByRole("combobox").first().selectOption("done");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel("Done column")).toContainText("Prepare candidate review");
  await page.getByRole("button", { name: "Close task pane" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/tasks$/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Close task pane" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("button", { name: "Close task pane" })).toBeHidden();
  await page.goBack();
  await page.getByRole("link", { name: "Expand task" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/tasks\/task-e2e$/);
  await expect(page.getByLabel("Task status")).toHaveValue("done");
  await expect(page.getByLabel("Comment")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox").first()).toHaveValue("Prepare candidate review");
});
