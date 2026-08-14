import { expect, test } from "@playwright/test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

async function signIn(page: import("@playwright/test").Page, employeeId: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill(employeeId);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/");
}

const emulatorApp = initializeApp({ projectId: "proveit-test" }, "workspace-delete-e2e");
const emulatorFirestore = getFirestore(emulatorApp);

async function readEmulatorWorkspace(workspaceId: string) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") {
    throw new Error("Workspace-delete assertions must use the proveit-test Firestore emulator.");
  }
  return (await emulatorFirestore.doc(`workspaces/${workspaceId}`).get()).data();
}

test("BOD can tombstone archived and active non-system workspaces without orphaning their route data", async ({ page }) => {
  await signIn(page, "admin-test", "admin-test-password");

  await page.goto("/admin/workspaces/dhairya");
  await expect(page.getByRole("heading", { name: "Dhairya settings" })).toBeVisible();
  await page.getByLabel("Delete workspace confirmation").fill("Dhairya");
  await page.getByRole("button", { name: "Delete workspace permanently" }).click();
  await expect(page).toHaveURL("/admin/workspaces");

  await page.goto("/admin/workspaces/business");
  await page.getByLabel("Delete workspace confirmation").fill("Business not confirmed");
  await expect(page.getByRole("button", { name: "Delete workspace permanently" })).toBeDisabled();
  await page.getByLabel("Delete workspace confirmation").fill("Business");
  await page.getByRole("button", { name: "Delete workspace permanently" }).click();
  await expect(page).toHaveURL("/admin/workspaces");
  const businessRow = page.getByRole("link", { name: "Business", exact: true }).locator("../../..");
  await expect(businessRow).toBeVisible();
  await expect(businessRow.getByText("Deleted permanently", { exact: true })).toBeVisible();
  await expect(businessRow.getByRole("button", { name: "Restore" })).toHaveCount(0);

  await expect.poll(async () => {
    const workspace = await readEmulatorWorkspace("business");
    return { active: workspace?.active, deletedBy: workspace?.deletedBy, deletedAt: Boolean(workspace?.deletedAt) };
  }).toEqual({ active: false, deletedBy: "admin-e2e-user", deletedAt: true });

  await page.goto("/workspaces/business");
  await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  await page.goto("/admin/workspaces/business");
  await expect(page.getByText("cannot be restored through the archive flow", { exact: false })).toBeVisible();

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
