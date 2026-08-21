import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
}

test("meeting sheets trap focus, restore focus, and close with Escape", async ({ page }) => {
  await signIn(page);
  await page.goto("/workspaces/company/meetings");

  const newMeetingButton = page.getByRole("button", { name: /New meeting/ });
  await newMeetingButton.click();
  const createDialog = page.getByRole("dialog", { name: "New meeting" });
  await expect(createDialog).toBeVisible();
  await expect(page.getByLabel("Meeting title")).toBeFocused();
  await createDialog.getByRole("button", { name: "Close new meeting" }).click();
  await expect(createDialog).toHaveCount(0);
  await expect(newMeetingButton).toBeFocused();

  const meetingRow = page.getByRole("button", { name: /Candidate review/ });
  await meetingRow.click();
  const detailDialog = page.getByRole("dialog", { name: "Meeting details" });
  await expect(detailDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailDialog).toHaveCount(0);
  await expect(meetingRow).toBeFocused();
});

test("employee picker supports keyboard multi-selection and schedule validation on phones", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspaces/company/meetings");
  await page.getByRole("button", { name: /New meeting/ }).click();

  const dialog = page.getByRole("dialog", { name: "New meeting" });
  const picker = dialog.getByRole("combobox", { name: "Meeting attendees" });
  await picker.focus();
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(dialog.getByText("1 employee selected", { exact: true })).toBeVisible();
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(dialog.getByText("2 employees selected", { exact: true })).toBeVisible();

  await dialog.getByLabel("Meeting title").fill("Phone schedule check");
  await dialog.getByLabel("Meeting date").fill("2026-08-21");
  await dialog.getByLabel("Meeting start time").fill("11:00");
  await dialog.getByLabel("Meeting end time").fill("10:30");
  await dialog.getByRole("button", { name: "Create meeting" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("End time must be after the start time.");
  await expect(dialog).toBeVisible();
});
