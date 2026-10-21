import { expect, test, type Page } from "@playwright/test";
import { ADMIN, dismissTourInvite, login, uniq } from "./helpers";

// The language switch must change the interface immediately, without waiting for the server,
// and the choice must survive navigation, refresh and signing in again.

/** Hold every request to the app server (page data, server actions) for `ms`. */
async function slowServer(page: Page, ms: number) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const toApp = new URL(req.url()).port === new URL(page.url() || "http://x").port;
    if (toApp && (req.headers()["rsc"] || req.method() === "POST")) await new Promise((r) => setTimeout(r, ms));
    await route.continue().catch(() => {});
  });
}

test("desktop: switching is instant even with a slow server, and persists", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page);
  await slowServer(page, 6000);

  await page.locator("header").getByRole("radio", { name: "Shqip" }).click();
  // Within one second, while the server is still holding its responses:
  await expect(page.getByRole("link", { name: "Paneli" }).first()).toBeVisible({ timeout: 1000 });
  await expect(page.getByRole("link", { name: "Tabela e tabakave" }).first()).toBeVisible({ timeout: 1000 });
  await expect(page.locator("header").getByRole("radio", { name: "Shqip" })).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "sq");
  await page.unroute("**/*");

  // navigation, refresh
  await page.getByRole("link", { name: "Tabela e tabakave" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Tabela e tabakave" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Tabela e tabakave" })).toBeVisible();

  // sign out → the sign-in page is Albanian; sign in again → still Albanian
  await page.getByRole("button", { name: "Menyja e llogarisë" }).click();
  await page.getByRole("menuitem", { name: "Dil" }).click();
  await expect(page.getByRole("heading", { name: "Hyr" })).toBeVisible();
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Fjalëkalimi", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Hyr" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: "Paneli" }).first()).toBeVisible();

  // and back to English, also instant
  await slowServer(page, 6000);
  await page.locator("header").getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({ timeout: 1000 });
  await page.unroute("**/*");
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the switch in the mobile menu changes the interface at once", async ({ page }) => {
    await login(page);
    await slowServer(page, 6000);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Shqip" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Paneli" })).toBeVisible({ timeout: 1000 });
    await page.unroute("**/*");
    await page.reload();
    await expect(page.getByRole("button", { name: "Hap navigimin" })).toBeVisible();
  });
});

test("setup wizard and guided tour follow the language switch", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `${uniq().toLowerCase()}@lang.dentrack.test`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Lena Lang");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("first-time-pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to DENTRACK" })).toBeVisible({ timeout: 60_000 });

  await slowServer(page, 6000);
  await page.getByRole("radio", { name: "Shqip" }).click();
  await expect(page.getByRole("heading", { name: "Mirë se vini në DENTRACK" })).toBeVisible({ timeout: 1000 });
  await expect(page.getByRole("button", { name: "Krijo laboratorin tim" })).toBeVisible({ timeout: 1000 });
  await page.unroute("**/*");

  await page.getByRole("button", { name: "Krijo laboratorin tim" }).click();
  await expect(page.getByRole("heading", { name: "Laboratori juaj" })).toBeVisible();
  await page.getByLabel("Emri i laboratorit").fill("Laboratori Lena");
  await page.getByRole("button", { name: "Vazhdo" }).click();
  await expect(page.getByRole("heading", { name: "Tabakatë tuaja të numëruara" })).toBeVisible();
  await expect(page.getByText("Do të krijohen 24 tabaka dixhitale: nga #001 deri në #024.")).toBeVisible();
  await page.getByRole("button", { name: "Krijo laboratorin" }).click();
  await expect(page.getByRole("heading", { name: "Laboratori juaj është gati" })).toBeVisible();
  await page.getByRole("link", { name: "Shko te paneli im" }).click();

  const invite = page.getByRole("dialog", { name: "Mirë se vini në DENTRACK!" });
  await expect(invite).toBeVisible();
  await invite.getByRole("button", { name: "Nis udhëzuesin" }).click();
  const tour = page.getByRole("dialog").filter({ hasText: /Hapi \d nga \d/ });
  await expect(tour.getByText("Hapi 1 nga 6")).toBeVisible();
  await expect(tour.getByRole("heading", { name: "Paneli juaj" })).toBeVisible();
  await tour.getByRole("button", { name: "Tjetri" }).click();
  await expect(tour.getByRole("heading", { name: "Tabaka të numëruara" })).toBeVisible();
  await tour.getByRole("button", { name: "Kapërce udhëzuesin" }).click();

  // switch back to English: the open page (and the Help menu) follow immediately
  await slowServer(page, 6000);
  await page.locator("header").getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tray board" })).toBeVisible({ timeout: 1000 });
  await page.unroute("**/*");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Restart the guided tour" })).toBeVisible();
  await page.keyboard.press("Escape");
  await dismissTourInvite(page);
});
