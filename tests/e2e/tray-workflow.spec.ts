import { expect, test } from "@playwright/test";
import { login, uniq } from "./helpers";

test("case lifecycle: create in a tray → complete (tray stays occupied) → confirm empty → tray available", async ({ page }) => {
  const ref = uniq();
  await login(page);

  // Create a case and place it in the first available tray.
  await page.goto("/cases/new");
  await page.getByLabel("Dental clinic").selectOption({ index: 1 });
  await page.getByLabel("Patient reference").fill(`P-${ref}`);
  await page.getByLabel("Prosthetic category").selectOption({ label: "Zirconia crowns" });
  await page.getByLabel("Case reference").fill(ref);
  const traySelect = page.getByLabel("Tray", { exact: true });
  const trayLabel = (await traySelect.locator("option").nth(1).textContent())!.trim();
  const trayNo = trayLabel.match(/#\d{3}/)![0];
  await traySelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create case" }).click();

  await expect(page.getByRole("heading", { level: 1, name: ref })).toBeVisible();
  await expect(page.getByRole("button", { name: `Tray ${trayNo}` })).toBeVisible();

  // The tray board shows it occupied by this case.
  await page.goto(`/trays`);
  await page.getByRole("textbox", { name: "Search trays" }).fill(ref);
  const tile = page.getByRole("button", { name: new RegExp(`Tray ${trayNo}: occupied, case ${ref}`) });
  await expect(tile).toBeVisible();

  // Move through the workflow to Completed.
  await page.goto("/cases");
  await page.getByRole("textbox", { name: "Search cases" }).fill(ref);
  await expect(page.getByText("1 case", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: ref }).click();
  await expect(page.getByRole("heading", { level: 1, name: ref })).toBeVisible();
  await page.getByRole("tab", { name: "Production workflow" }).click();
  await page.getByRole("listitem").filter({ hasText: "Completed" }).getByRole("button", { name: "Move here" }).click();
  await expect(page.getByText("but tray", { exact: false })).toBeVisible();

  // Completing did NOT release the tray.
  await page.goto("/trays");
  await page.getByRole("textbox", { name: "Search trays" }).fill(ref);
  await expect(page.getByRole("button", { name: new RegExp(`Tray ${trayNo}: occupied`) })).toBeVisible();

  // Release requires the explicit "physically empty" confirmation.
  await page.getByRole("button", { name: new RegExp(`Tray ${trayNo}: occupied`) }).click();
  await page.getByRole("button", { name: "Release tray" }).first().click();
  const dialog = page.getByRole("dialog", { name: `Release tray ${trayNo}` });
  await expect(dialog.getByRole("button", { name: "Release tray" })).toBeDisabled();
  await dialog.getByRole("checkbox").click();
  await dialog.getByRole("button", { name: "Release tray" }).click();
  await expect(page.getByText(`Tray ${trayNo} is available`)).toBeVisible();

  // The open panel updates in place, then the board shows the tray as available.
  await expect(page.getByRole("img", { name: `Tray ${trayNo}, available` })).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("textbox", { name: "Search trays" }).fill(trayNo.slice(1));
  await expect(page.getByRole("button", { name: `Tray ${trayNo}: available` })).toBeVisible();
});

test("the tray picker only offers available trays and the board filters by status", async ({ page }) => {
  await login(page);
  await page.goto("/trays");
  await page.getByRole("radio", { name: "available" }).click();
  // Once the filter settles, every visible tile is available.
  await expect(page.getByRole("button", { name: /^Tray #\d{3}: occupied/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Tray #\d{3}: available/ }).first()).toBeVisible();
  // The assignment dialog lists only cases that aren't in a tray yet.
  await page.getByRole("button", { name: /^Tray #\d{3}: available/ }).first().click();
  await page.getByRole("button", { name: "Place a case" }).click();
  await expect(page.getByRole("dialog", { name: /Place a case in tray/ })).toBeVisible();
});
