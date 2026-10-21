import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "owner@demo.dentrack.test", password: "demo-password" };
export const TECH = { email: "tech@demo.dentrack.test", password: "demo-password" };

export async function login(page: Page, who = ADMIN) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await dismissTourInvite(page);
}

/** The one-time guided tour invitation; answered "Skip for now" so other tests aren't blocked. */
export async function dismissTourInvite(page: Page) {
  await page.waitForLoadState("networkidle");
  const skip = page.getByRole("button", { name: "Skip for now" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(skip).toBeHidden();
  }
}

export const uniq = () => `E2E-${Date.now().toString(36).toUpperCase()}`;
