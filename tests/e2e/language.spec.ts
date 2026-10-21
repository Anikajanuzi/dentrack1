import { expect, test, type Page } from "@playwright/test";
import { ADMIN, login, uniq } from "./helpers";

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

  test("the mobile menu switch alternates EN → SQ → EN → SQ → EN", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = () => page.getByRole("dialog");
    await alternate(page, "mobile menu", drawer, (l) => drawer().getByRole("link", { name: l === "EN" ? "Dashboard" : "Paneli" }));
  });
});

type Lang = "EN" | "SQ";
const SEQUENCE: Lang[] = ["EN", "SQ", "EN", "SQ", "EN"];
const RADIO = { EN: "English", SQ: "Shqip" } as const;

/**
 * Regression test for one-way switching: click EN → SQ → EN → SQ → EN on the given switch and,
 * after every click, check the visible text and the switch state within one second, while the
 * server is held back (so nothing can depend on a server round trip).
 */
async function alternate(page: Page, where: string, scope: () => import("@playwright/test").Locator, text: (l: Lang) => import("@playwright/test").Locator) {
  await slowServer(page, 4000);
  for (const l of SEQUENCE) {
    await scope().getByRole("radio", { name: RADIO[l] }).click();
    await expect(text(l), `${where}: after clicking ${l}`).toBeVisible({ timeout: 1000 });
    await expect(scope().getByRole("radio", { name: RADIO[l] }), `${where}: ${l} selected`).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
  }
  await page.unroute("**/*");
}

test("both directions work repeatedly on every page, including the tour", async ({ page }) => {
  test.setTimeout(240_000);

  // sign-in page (signed out)
  await page.goto("/login");
  await alternate(page, "login", () => page.locator("body"), (l) => page.getByRole("heading", { name: l === "EN" ? "Sign in" : "Hyr" }));

  // setup wizard
  const email = `${uniq().toLowerCase()}@lang.dentrack.test`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Lena Lang");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("first-time-pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to DENTRACK" })).toBeVisible({ timeout: 60_000 });
  await alternate(page, "onboarding", () => page.locator("body"), (l) => page.getByRole("heading", { name: l === "EN" ? "Welcome to DENTRACK" : "Mirë se vini në DENTRACK" }));

  // finish the wizard in Albanian (the situation that used to trap people in Albanian)
  await page.getByRole("radio", { name: "Shqip" }).click();
  await page.getByRole("button", { name: "Krijo laboratorin tim" }).click();
  await page.getByLabel("Emri i laboratorit").fill("Laboratori Lena");
  await page.getByRole("button", { name: "Vazhdo" }).click();
  await expect(page.getByText("Do të krijohen 24 tabaka dixhitale: nga #001 deri në #024.")).toBeVisible();
  await page.getByRole("button", { name: "Krijo laboratorin" }).click();
  await page.getByRole("link", { name: "Shko te paneli im" }).click();

  // the tour invitation covers the page: its own switch must work in both directions
  const invite = () => page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /Start tutorial|Nis udhëzuesin/ }) });
  await expect(invite()).toBeVisible();
  await alternate(page, "tour invitation", invite, (l) => invite().getByRole("heading", { name: l === "EN" ? "Welcome to DENTRACK!" : "Mirë se vini në DENTRACK!" }));
  // clicking outside no longer dismisses it (it used to swallow clicks on the header switch and count as "skip")
  await page.mouse.click(5, 5);
  await expect(invite()).toBeVisible();

  // the open tour: its own switch
  await invite().getByRole("button", { name: "Start tutorial" }).click();
  const tour = () => page.getByRole("dialog").filter({ hasText: /Step \d of \d|Hapi \d nga \d/ });
  await expect(tour().getByText("Step 1 of 6")).toBeVisible();
  await alternate(page, "guided tour", tour, (l) => tour().getByRole("heading", { name: l === "EN" ? "Your dashboard" : "Paneli juaj" }));
  await tour().getByRole("button", { name: "Next" }).click();
  await expect(tour().getByRole("heading", { name: "Numbered trays" })).toBeVisible();
  await tour().getByRole("radio", { name: "Shqip" }).click();
  await expect(tour().getByRole("heading", { name: "Tabaka të numëruara" })).toBeVisible({ timeout: 1000 });
  await tour().getByRole("radio", { name: "English" }).click();
  await expect(tour().getByRole("heading", { name: "Numbered trays" })).toBeVisible({ timeout: 1000 });
  await tour().getByRole("button", { name: "Skip tour" }).click();

  // dashboard and settings: the header switch
  await page.goto("/dashboard");
  await alternate(page, "dashboard", () => page.locator("header"), (l) => page.getByRole("link", { name: l === "EN" ? "Tray board" : "Tabela e tabakave" }).first());
  await page.goto("/settings");
  await alternate(page, "settings", () => page.locator("header"), (l) => page.getByRole("heading", { level: 1, name: l === "EN" ? "Settings" : "Cilësimet" }));

  // the last choice (EN) survives a refresh; then SQ survives navigation and refresh
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.locator("header").getByRole("radio", { name: "Shqip" }).click();
  await page.getByRole("link", { name: "Rastet" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Rastet" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Rastet" })).toBeVisible();
  await page.locator("header").getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cases" })).toBeVisible({ timeout: 1000 });
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});
