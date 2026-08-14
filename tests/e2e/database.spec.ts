import { expect, test } from "@playwright/test";

test("an authorized employee can use the existing database table workflow", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID").fill("database-test");
  await page.getByLabel("Password").fill("database-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/");

  await page.goto(
    "/workspaces/company/databases/database-e2e"
  );

  await expect(
    page.locator('input[value="Candidate pipeline"]')
  ).toBeVisible();
  await expect(
    page.locator('input[value="Ada Lovelace"]')
  ).toBeVisible();

  const notes = page.locator(
    'input[type="text"][placeholder="Empty"]'
  );
  await notes.fill("Strong initial screen");
  await expect(notes).toHaveValue("Strong initial screen");

  await page.locator('input[value="95"]').fill("96");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "New" }).first().click();

  await expect(page.getByText("2 rows")).toBeVisible();
  await expect(
    page.getByTitle("Open row").first()
  ).toHaveAttribute(
    "href",
    "/workspaces/company/databases/database-e2e?row=row-e2e"
  );

  await expect(
    page.getByRole("option", { name: "Legacy: Historical follow-up" })
  ).toHaveText("Legacy: Historical follow-up");

  await page.getByTitle("Add property").click();
  await page.getByPlaceholder("Property name").fill("Decision");
  await page.locator("select").last().selectOption("select");
  await page.getByRole("button", { name: "Create property" }).click();

  await page.getByTitle("Edit Decision").click();
  const optionName = page.getByLabel("Option name");
  await optionName.fill("Interview");
  await page.getByRole("button", { name: "Add option" }).click();
  await expect(page.getByLabel("Rename Interview")).toBeVisible();
  await optionName.fill("Offer");
  await page.getByRole("button", { name: "Add option" }).click();
  await expect(page.getByLabel("Rename Offer")).toBeVisible();
  await optionName.fill("Review");
  await page.getByRole("button", { name: "Add option" }).click();
  await expect(page.getByLabel("Rename Review")).toBeVisible();
  await page.getByLabel("Close property editor").click();

  const decision = page.getByLabel("Decision for row row-e2e");
  await decision.selectOption({ label: "Interview" });
  await expect(decision).toHaveValue(/.+/);
  await page.reload();
  await expect(
    page.getByLabel("Decision for row row-e2e")
  ).toHaveValue(/.+/);

  const persistedDecision = page.getByLabel(
    "Decision for row row-e2e"
  );
  await persistedDecision.selectOption("");
  await expect(persistedDecision).toHaveValue("");
  await persistedDecision.selectOption({ label: "Interview" });
  await expect(persistedDecision.locator("option:checked")).toHaveText(
    "Interview"
  );

  await page.getByTitle("Edit Decision").click();
  await page.getByLabel("Rename Interview").click();
  await page.getByLabel("Rename Interview").fill("Technical Interview");
  await page.getByLabel("Save Interview").click();
  await expect(
    page
      .getByLabel("Decision for row row-e2e").first()
      .getByRole("option", { name: "Technical Interview" })
  ).toHaveText("Technical Interview");
  await expect(
    page
      .getByLabel("Decision for row row-e2e").first()
      .locator("option:checked")
  ).toHaveText("Technical Interview");
  await page.getByLabel("Close property editor").click();

  await page.getByTitle("Edit Decision").click();

  await page.getByLabel("Delete Technical Interview").click();
  await expect(
    page.getByText(/is in use by 1 row/)
  ).toBeVisible();
  await page.getByLabel("Close property editor").click();

  await page.getByLabel("Decision for row row-e2e").selectOption({
    label: "Offer",
  });
  await expect(
    page
      .getByLabel("Decision for row row-e2e")
      .first()
      .locator("option:checked")
  ).toHaveText("Offer");
  await page.getByTitle("Edit Decision").click();
  await page.getByLabel("Delete Technical Interview").click();
  await expect(
    page.getByRole("option", { name: "Technical Interview" })
  ).toHaveCount(0);
  await page.getByLabel("Close property editor").click();

  await Promise.all([
    page.waitForURL(/\?row=row-e2e$/),
    page.getByTitle("Open row").first().click(),
  ]);
  await expect(page.getByRole("complementary", { name: "Row detail pane" })).toBeVisible();
  const rowDecision = page.getByLabel("Decision for row row-e2e").last();
  await expect(rowDecision).toHaveValue(/.+/);
  await rowDecision.selectOption({ label: "Review" });
  await expect(rowDecision.locator("option:checked")).toHaveText("Review");
  await page.getByRole("button", { name: "Close row pane" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/databases\/database-e2e$/);
  await expect(
    page
      .getByLabel("Decision for row row-e2e")
      .first()
      .locator("option:checked")
  ).toHaveText("Review");
  await page.goForward();
  await expect(page).toHaveURL(/\?row=row-e2e$/);
  await expect(page.getByRole("button", { name: "Close row pane" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Close row pane" })).toBeHidden();
  await page.goForward();
  await expect(page.getByRole("button", { name: "Close row pane" })).toBeVisible();
  await page.getByRole("link", { name: "Expand row" }).click();
  await page.waitForURL(/\/rows\/row-e2e$/);
  await page.reload();
  await expect(page.getByLabel("Decision")).toBeVisible();
  await page.goto("/workspaces/company/databases/database-e2e?row=row-e2e");
  await expect(page.getByRole("button", { name: "Close row pane" })).toBeVisible();
  await page.getByRole("button", { name: "Close row pane" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/databases\/database-e2e$/);
});
