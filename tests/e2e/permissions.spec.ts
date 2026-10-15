import { expect, test } from "@playwright/test";
import { login, TECH } from "./helpers";

test("technicians can't reach finance or prices", async ({ page }) => {
  await login(page, TECH);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Finance" })).toHaveCount(0);
  await page.goto("/finance");
  await expect(page).toHaveURL(/\/dashboard\?denied=1/);
  await page.goto("/cases");
  await page.getByRole("link", { name: /^C-/ }).first().click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pricing & invoicing" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Cost breakdown" })).toHaveCount(0);
  await page.goto("/analytics?tab=financial");
  await expect(page.getByRole("tab", { name: "Financial" })).toHaveCount(0);
});

test("technicians see the tray board", async ({ page }) => {
  await login(page, TECH);
  await page.goto("/trays");
  await expect(page.getByRole("heading", { name: "Tray board" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add trays" })).toHaveCount(0);
});
