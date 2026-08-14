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

  const search = page.getByLabel("Search rows");
  const titleInputs = page.locator('tbody input[placeholder="Untitled"]');

  await search.fill("ada");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await expect(page.locator('input[value="Grace Hopper"]')).toBeHidden();
  await search.fill("INITIAL SCREEN");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await search.fill("ada");
  await page.getByTitle("Open row").click();
  await expect(page.getByRole("complementary", { name: "Row detail pane" })).toBeVisible();
  await search.fill("grace");
  await expect(page.getByRole("complementary", { name: "Row detail pane" })).toBeVisible();
  await page.getByRole("button", { name: "Close row pane" }).click();
  await page.getByLabel("Clear search").click();
  await expect(page.locator('input[value="Grace Hopper"]')).toBeVisible();

  const filters = page.getByRole("dialog", { name: "Filter rows" });
  const addFilter = async () => {
    if (!await filters.isVisible()) {
      await page.getByRole("button", { name: /Filter/ }).click();
    }
    const filterIndex = await filters.getByTestId("filter-row").count();
    await filters.getByRole("button", { name: "+ Add filter" }).click();
    return filters.getByTestId("filter-row").nth(filterIndex);
  };
  const clearFilters = async () => {
    await filters.getByRole("button", { name: "Clear all" }).click();
  };

  let filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("title");
  await filter.getByLabel("Filter operator").selectOption("contains");
  await filter.getByLabel("Filter value").fill("Ada");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await expect(page.locator('input[value="Grace Hopper"]')).toBeHidden();
  await clearFilters();

  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("notes");
  await filter.getByLabel("Filter operator").selectOption("does_not_contain");
  await filter.getByLabel("Filter value").fill("technical");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await clearFilters();

  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("score");
  await filter.getByLabel("Filter operator").selectOption("greater_than_or_equal");
  await filter.getByLabel("Filter value").fill("90");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await expect(page.locator('input[value="Grace Hopper"]')).toBeHidden();
  await clearFilters();

  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("review-date");
  await filter.getByLabel("Filter operator").selectOption("after");
  await filter.getByLabel("Filter value").fill("2026-01-01");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await clearFilters();

  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("contacted");
  await filter.getByLabel("Filter operator").selectOption("is_checked");
  await expect(page.locator('input[value="Grace Hopper"]')).toBeVisible();
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeHidden();
  await clearFilters();

  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("legacy-stage");
  await filter.getByLabel("Filter operator").selectOption("is");
  await filter.getByLabel("Filter value").selectOption("stage-z");
  await expect(page.locator('input[value="Grace Hopper"]')).toBeVisible();
  await clearFilters();

  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("legacy-stage");
  await filter.getByLabel("Filter operator").selectOption("is");
  await filter.getByLabel("Filter value").selectOption("Historical follow-up");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await clearFilters();

  for (const [propertyId, value] of [["email", "ada@example.test"], ["portfolio", "https://example.test/ada"], ["phone", "555-0101"]]) {
    filter = await addFilter();
    await filter.getByLabel("Filter property").selectOption(propertyId);
    await filter.getByLabel("Filter operator").selectOption("is");
    await filter.getByLabel("Filter value").fill(value);
    await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
    await clearFilters();
  }

  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("review-date");
  await filter.getByLabel("Filter operator").selectOption("is_empty");
  await expect(page.locator('input[value="Grace Hopper"]')).toBeVisible();
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeHidden();
  await clearFilters();

  const firstFilter = await addFilter();
  await firstFilter.getByLabel("Filter property").selectOption("score");
  await firstFilter.getByLabel("Filter operator").selectOption("greater_than");
  await firstFilter.getByLabel("Filter value").fill("90");
  filter = await addFilter();
  await filter.getByLabel("Filter property").selectOption("notes");
  await filter.getByLabel("Filter operator").selectOption("contains");
  await filter.getByLabel("Filter value").fill("initial");
  await expect(page.locator('input[value="Ada Lovelace"]')).toBeVisible();
  await expect(page.locator('input[value="Grace Hopper"]')).toBeHidden();
  await page.getByTitle("Open row").click();
  await expect(page.getByRole("complementary", { name: "Row detail pane" })).toBeVisible();
  await firstFilter.getByLabel("Filter operator").selectOption("less_than_or_equal");
  await firstFilter.getByLabel("Filter value").fill("82");
  await expect(page.getByRole("complementary", { name: "Row detail pane" })).toBeVisible();
  await page.getByRole("button", { name: "Close row pane" }).click();
  await clearFilters();
  await filters.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: /Sort/ }).click();
  await page.getByLabel("Sort property").selectOption("title");
  await expect(titleInputs.first()).toHaveValue("Ada Lovelace");
  await page.getByLabel("Sort direction").selectOption("desc");
  await expect(titleInputs.first()).toHaveValue("Grace Hopper");

  await page.getByLabel("Sort property").selectOption("score");
  await page.getByLabel("Sort direction").selectOption("asc");
  await expect(titleInputs.first()).toHaveValue("Grace Hopper");
  await page.getByLabel("Sort direction").selectOption("desc");
  await expect(titleInputs.first()).toHaveValue("Ada Lovelace");

  await page.getByLabel("Sort property").selectOption("legacy-stage");
  await page.getByLabel("Sort direction").selectOption("asc");
  await expect(titleInputs.first()).toHaveValue("Grace Hopper");
  await page.getByRole("button", { name: "Clear sort" }).click();
  await expect(titleInputs.first()).toHaveValue("Ada Lovelace");
  await page.getByRole("button", { name: "Done" }).click();
  await search.fill("screen");
  await page.getByRole("button", { name: /Sort/ }).click();
  await page.getByLabel("Sort property").selectOption("score");
  await page.getByLabel("Sort direction").selectOption("asc");
  await expect(titleInputs.first()).toHaveValue("Grace Hopper");
  await page.getByRole("button", { name: "Clear sort" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Clear search").click();

  const notes = page.locator(
    'input[type="text"][placeholder="Empty"]'
  ).first();
  await notes.fill("Strong initial screen");
  await expect(notes).toHaveValue("Strong initial screen");

  await page.locator('input[value="95"]').fill("96");
  await page.getByRole("row", { name: /Ada Lovelace/ }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "New" }).first().click();

  await expect(page.getByText("3 rows")).toBeVisible();
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

  const decision = page.getByLabel("Decision for row row-e2e", { exact: true });
  await decision.selectOption({ label: "Interview" });
  await expect(decision).toHaveValue(/.+/);
  await page.reload();
  await expect(
    page.getByLabel("Decision for row row-e2e", { exact: true })
  ).toHaveValue(/.+/);

  const persistedDecision = page.getByLabel(
    "Decision for row row-e2e",
    { exact: true }
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
      .getByLabel("Decision for row row-e2e", { exact: true })
      .getByRole("option", { name: "Technical Interview" })
  ).toHaveText("Technical Interview");
  await expect(
    page
      .getByLabel("Decision for row row-e2e", { exact: true })
      .locator("option:checked")
  ).toHaveText("Technical Interview");
  await page.getByLabel("Close property editor").click();

  await page.getByTitle("Edit Decision").click();

  await page.getByLabel("Delete Technical Interview").click();
  await expect(
    page.getByText(/is in use by 1 row/)
  ).toBeVisible();
  await page.getByLabel("Close property editor").click();

  await page.getByLabel("Decision for row row-e2e", { exact: true }).selectOption({
    label: "Offer",
  });
  await expect(
    page
      .getByLabel("Decision for row row-e2e", { exact: true })
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
  const rowDecision = page.getByLabel("Decision for row row-e2e", { exact: true }).last();
  await expect(rowDecision).toHaveValue(/.+/);
  await rowDecision.selectOption({ label: "Review" });
  await expect(rowDecision.locator("option:checked")).toHaveText("Review");
  await page.getByRole("button", { name: "Close row pane" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/databases\/database-e2e$/);
  await expect(
    page
      .getByLabel("Decision for row row-e2e", { exact: true })
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
  await expect(page.getByLabel("Comment")).toBeVisible();
  await page.goto("/workspaces/company/databases/database-e2e?row=row-e2e");
  await expect(page.getByRole("button", { name: "Close row pane" })).toBeVisible();
  await page.getByRole("button", { name: "Close row pane" }).click();
  await expect(page).toHaveURL(/\/workspaces\/company\/databases\/database-e2e$/);
});
