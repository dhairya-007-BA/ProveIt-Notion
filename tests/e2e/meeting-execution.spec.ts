import { expect, test } from "@playwright/test";

test("a human reviews meeting intelligence before creating one provenance-linked task", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await page.goto("/workspaces/company/meetings/meeting-e2e");
  await expect(page.getByRole("heading", { name: "Meeting intelligence" })).toBeVisible();
  await expect(page.getByText("The team aligned on completing the candidate review rubric.")).toBeVisible();
  await expect(page.getByText("Use the updated rubric for the next candidate.")).toBeVisible();
  await expect(page.getByText("The review must finish before the next interview.")).toBeVisible();

  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel("Task title for proposal 1")).toBeVisible();
    const layout = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflow: [...document.querySelectorAll("main *")].flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > window.innerWidth + 1
          ? [{ tag: element.tagName, label: element.getAttribute("aria-label"), type: element.getAttribute("type"), className: element.className, right: Math.round(bounds.right), text: element.textContent?.trim().slice(0, 40) }]
          : [];
      }).slice(0, 8),
    }));
    expect(layout.fits, `meeting layout at ${width}px: ${JSON.stringify(layout)}`).toBe(true);
  }

  await page.getByLabel("Task title for proposal 1").fill("Finalize candidate review rubric");
  await page.getByLabel("Task assignee for proposal 1").selectOption("mentioned-user");
  await page.getByLabel("Task priority for proposal 1").selectOption("high");
  await page.getByRole("button", { name: "Approve 1 task" }).click();

  await expect(page.getByRole("status")).toContainText("1 task created");
  const taskLink = page.getByRole("link", { name: "Open created task" });
  await expect(taskLink).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Open created task" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve selected tasks/ })).toBeDisabled();
  await page.getByRole("link", { name: "Open created task" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/tasks\?task=meeting-/);
  await expect(page.getByLabel("Task title")).toHaveValue("Finalize candidate review rubric");
  await expect(page.getByRole("region", { name: "Task properties" }).getByLabel("Assignee")).toHaveValue("mentioned-user");
});
