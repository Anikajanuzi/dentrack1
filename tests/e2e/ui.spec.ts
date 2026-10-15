import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("Ctrl+K opens global search and finds a tray by number", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder(/Search cases, tray numbers/);
  await expect(input).toBeFocused();
  await input.fill("7");
  await expect(page.getByRole("option", { name: /Tray #007/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
});

test("theme switching persists", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  // The header switch works too, and so does the language switch.
  await page.locator("header").getByRole("radio", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.locator("header").getByRole("radio", { name: "Light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.locator("header").getByRole("radio", { name: "Shqip" }).click();
  await expect(page.getByRole("heading", { name: "Cilësimet" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "sq");
  await page.locator("header").getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("mobile layout collapses navigation into a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Tray board" }).click();
  await expect(page).toHaveURL(/\/trays/);
  await expect(page.getByRole("heading", { name: "Tray board" })).toBeVisible();
});

test("notification bell opens and marks all as read", async ({ page }) => {
  await login(page);
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await bell.click();
  await expect(page.getByRole("menu")).toBeVisible();
  const markAll = page.getByRole("button", { name: "Mark all read" });
  if (await markAll.isVisible()) {
    await markAll.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  }
});

test("keyboard users can reach the login form fields in order", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});
