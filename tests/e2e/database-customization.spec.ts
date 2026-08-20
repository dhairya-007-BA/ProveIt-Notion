import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/");
}

test("shared table views restore presentation state and select colors persist", async ({ page }) => {
  await signIn(page);
  await page.goto("/workspaces/company/databases/database-e2e");
  await expect(page.getByLabel("Saved view")).toHaveValue("default");

  await page.getByRole("button", { name: "+ View" }).click();
  const createViewDialog = page.getByRole("dialog", { name: "Create saved view" });
  await expect(createViewDialog).toBeVisible();
  const viewName = createViewDialog.getByLabel("View name");
  await expect(viewName).toBeFocused();
  await viewName.fill("Screened candidates");
  await createViewDialog.getByRole("button", { name: "Save view" }).click();
  await expect(createViewDialog).toHaveCount(0);
  await expect(page.getByLabel("Saved view")).toHaveText(/Screened candidates/);

  await page.getByRole("button", { name: "Properties" }).click();
  await page.getByLabel("Notes").uncheck();
  await expect(page.getByRole("columnheader", { name: /Notes/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Close properties menu" }).click();
  await page.getByRole("button", { name: "Save view" }).click();
  await page.getByLabel("Saved view").selectOption("default");
  await expect(page.getByRole("columnheader", { name: /Notes/ })).toBeVisible();
  await page.getByLabel("Saved view").selectOption({ label: "Screened candidates" });
  await expect(page.getByRole("columnheader", { name: /Notes/ })).toHaveCount(0);

  await page.getByTitle("Edit Legacy stage").click();
  await page.getByLabel("Color for Alpha").selectOption("purple");
  await page.getByLabel("Close property editor").click();
  await page.reload();
  await expect(page.getByLabel("Legacy stage for row row-e2e-2")).toHaveAttribute("data-select-color", "purple");
});
