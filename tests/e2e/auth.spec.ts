import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./helpers";

test("redirects signed-out visitors to the login page", async ({ page }) => {
  await page.goto("/trays");
  await expect(page).toHaveURL(/\/login\?next=%2Ftrays/);
});

test("rejects a wrong password with a clear message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
});

test("validates the form before submitting", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});

test("show/hide password toggles the field type", async ({ page }) => {
  await page.goto("/login");
  const pw = page.getByLabel("Password", { exact: true });
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(pw).toHaveAttribute("type", "text");
});

test("signs in, persists the session and signs out", async ({ page }) => {
  await login(page);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Dana/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
