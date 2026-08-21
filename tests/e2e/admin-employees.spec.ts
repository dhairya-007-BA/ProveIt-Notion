import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("admin-test");
  await page.getByLabel("Password").fill("admin-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
}

test("BOD employee administration has a responsive searchable employee list", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/employees");

  const search = page.getByLabel("Search employees");
  await expect(search).toBeVisible();
  await search.fill("Mentioned User");
  await expect(page.getByText("Mentioned User", { exact: true })).toBeVisible();
  await expect(page.getByText("Database Test User", { exact: true })).toHaveCount(0);

  await search.fill("not-a-real-employee");
  await expect(page.getByText("No matching employees")).toBeVisible();
  await search.fill("");

  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
