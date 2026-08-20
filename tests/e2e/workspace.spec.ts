import { expect, test } from "@playwright/test";

test("global search finds authorized records and keeps routes canonical", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.goto("/workspaces/company/tasks?task=task-e2e");
  await page.getByRole("button", { name: "Open search" }).click();
  const palette = page.getByRole("dialog", { name: "Search ProveIt" });
  await expect(palette).toBeVisible();
  const searchInput = page.getByRole("textbox", { name: "Search ProveIt" });
  await expect(searchInput).toBeFocused();
  await searchInput.fill("PREPARE");
  await expect(palette.getByTestId("search-results").getByText("Tasks", { exact: true })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Task: Prepare candidate review/ })).toBeVisible();
  await expect(palette.getByText("Private business planning")).toHaveCount(0);
  await searchInput.press("ArrowDown");
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/\/workspaces\/company\/tasks\/task-e2e$/);
  await page.keyboard.press("Control+k");
  await searchInput.fill("candidate");
  await expect(palette.getByText("Meetings", { exact: true })).toBeVisible();
  await expect(palette.getByText("Documents", { exact: true })).toBeVisible();
  await expect(palette.getByText("Databases", { exact: true })).toBeVisible();
  await searchInput.fill("ada");
  await expect(palette.getByText("Database rows", { exact: true })).toBeVisible();
  await searchInput.fill("no matching result");
  await expect(palette.getByText(/No results for/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search ProveIt" })).toHaveCount(0);
  await expect(page.getByLabel("Task status")).toBeVisible();
});

test("global search renders correctly at product viewports", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  for (const viewport of [
    { name: "1440", width: 1440, height: 900 },
    { name: "1280", width: 1280, height: 800 },
    { name: "1024", width: 1024, height: 768 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/workspaces/company/tasks?task=task-e2e");
    await expect(page.getByRole("complementary", { name: "Task detail panel" })).toBeVisible();
    await page.getByRole("button", { name: "Open search" }).click();
    const palette = page.getByRole("dialog", { name: "Search ProveIt" });
    const input = page.getByRole("textbox", { name: "Search ProveIt" });
    await expect(input).toBeFocused();
    await expect(palette.getByText("Search across your accessible workspace content.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-empty-task-peek.png`) });

    await input.fill("prepare");
    await expect(palette.getByTestId("search-results").getByText("Tasks", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-task.png`) });

    await input.fill("visual");
    for (const label of ["Tasks", "Meetings", "Documents", "Databases", "Database rows"]) {
      await expect(palette.getByTestId("search-results").getByText(label, { exact: true })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-mixed.png`) });
    await input.press("ArrowDown");
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-keyboard-selected.png`) });

    const resultList = page.getByTestId("search-results");
    expect(await resultList.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await resultList.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-long-scrolled.png`) });

    await input.fill("no-match-zzzz");
    await expect(palette.getByText(/No results for/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-no-results.png`) });
    const routeBeforeEscape = page.url();
    await input.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(page).toHaveURL(routeBeforeEscape);
    await expect(page.getByRole("complementary", { name: "Task detail panel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open search" })).toBeFocused();

    await page.goto("/workspaces/company/databases/database-e2e?row=row-e2e");
    const rowPane = page.getByRole("complementary", { name: "Row detail pane" });
    await expect(rowPane).toBeVisible();
    await expect(rowPane.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();
    await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Open search" }).click();
    await expect(palette.getByText("Search across your accessible workspace content.")).toBeVisible();
    await expect(rowPane).toBeVisible();
    await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-database-row-peek.png`) });
    await page.getByRole("textbox", { name: "Search ProveIt" }).press("Escape");
    await expect(rowPane).toBeVisible();
  }
});

test("workspace tasks, meetings, and activity routes work", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.goto("/workspaces/company/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: /Board/ }).click();
  await expect(page.getByText("To do", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prepare candidate review" }).dispatchEvent("dragstart");
  await page.getByLabel("In progress column").dispatchEvent("drop");
  await page.getByRole("button", { name: /List/ }).click();
  await expect(page.getByLabel("Status for Prepare candidate review")).toHaveValue("in_progress");
  await page.reload();
  await page.getByRole("button", { name: /List/ }).click();
  await expect(page.getByLabel("Status for Prepare candidate review")).toHaveValue("in_progress");
  await page.goto("/workspaces/company/meetings");
  await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();
  await page.getByText("Candidate review", { exact: true }).click();
  await expect(page).toHaveURL(/\?meeting=meeting-e2e/);
  await expect(page.getByRole("complementary", { name: "Meeting detail pane" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Meeting detail pane" }).getByRole("paragraph").filter({ hasText: /^Mentioned User$/ })).toBeVisible();
  await page.getByLabel("Meeting status").selectOption("completed");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("complementary", { name: "Meeting detail pane" }).getByRole("link", { name: "Open full page", exact: true }).click();
  await page.waitForURL(/\/meetings\/meeting-e2e$/);
  await expect(page.getByLabel("Transcript")).toBeVisible();
  await page.getByLabel("Meeting notes").fill("Decision: continue.");
  await page.getByRole("button", { name: "Save" }).click();
  await page.reload();
  await expect(page.getByLabel("Meeting status")).toHaveValue("completed");
  await expect(page.getByRole("button", { name: "Delete meeting" })).toHaveCount(0);
  await page.getByLabel("Write a comment").fill("Please review this.");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.getByRole("article").getByText("Please review this.")).toBeVisible();
  await page.goto("/workspaces/company/activity");
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();

  await page.goto("/workspaces/company/documents/document-e2e");
  await expect(page.getByLabel("Document title")).toHaveValue("Hiring rubric");
  await expect(page.getByLabel("Document content")).toContainText("candidate review");
  await expect(page.getByLabel("Write a comment")).toBeVisible();
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
  await expect(page.getByText("Open tasks", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Visual search task 01/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Visual search meeting 01/ })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Close task detail" })).toBeVisible();
  await expect(page.getByLabel("Task title")).toHaveValue("Prepare candidate review");
  await expect(page.getByLabel("In progress column")).toBeVisible();
  await page.getByLabel("Task status").selectOption("done");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel("Done column")).toContainText("Prepare candidate review");
  await page.getByRole("button", { name: "Close task detail" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/tasks$/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Close task detail" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("button", { name: "Close task detail" })).toBeHidden();
  await page.goBack();
  await page.getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/tasks\/task-e2e$/);
  await expect(page.getByLabel("Task status")).toHaveValue("done");
  await expect(page.getByLabel("Write a comment")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Task title")).toHaveValue("Prepare candidate review");
});
