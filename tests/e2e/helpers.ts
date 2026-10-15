import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "owner@demo.dentrack.test", password: "demo-password" };
export const TECH = { email: "tech@demo.dentrack.test", password: "demo-password" };

export async function login(page: Page, who = ADMIN) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
}

export const uniq = () => `E2E-${Date.now().toString(36).toUpperCase()}`;
