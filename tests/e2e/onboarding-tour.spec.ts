import { expect, test, type Page } from "@playwright/test";
import { dismissTourInvite, uniq } from "./helpers";

// A brand-new user, end to end: sign up → setup wizard → dashboard → guided tour.
// (Email confirmation only exists with Supabase Auth; this suite runs with local sign-in.)

const PASSWORD = "first-time-pass";
const tourBox = (page: Page) => page.getByRole("dialog").filter({ hasText: /Step \d of \d/ });
const stepLabel = (page: Page) => tourBox(page).getByText(/^Step \d of \d$/);

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Nora First");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}

test("new user: setup wizard, guided tour, progress, restart and completion", async ({ page }) => {
  test.setTimeout(240_000);
  const email = `${uniq().toLowerCase()}@new.dentrack.test`;

  // 1–3 · sign up, then the welcome step explains both options
  await signUp(page, email);
  await expect(page.getByRole("heading", { name: "Welcome to DENTRACK" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create my laboratory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Explore demo" })).toBeVisible();
  await page.getByRole("button", { name: "Create my laboratory" }).click();

  // 4 · laboratory information, with validation and Back
  await expect(page.getByRole("heading", { name: "Your laboratory" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the laboratory name")).toBeVisible();
  await page.getByLabel("Laboratory name").fill("Nora Dental Lab");
  await expect(page.getByText(/Due dates and overdue warnings use .+ time\./)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5 · trays: custom first number, live preview, validation
  await expect(page.getByRole("heading", { name: "Your numbered trays" })).toBeVisible();
  await page.getByLabel("How many numbered trays do you have?").fill("12");
  await page.getByLabel("What number is the first tray?").fill("9995");
  await expect(page.getByText("The last tray would be above #9999. Lower the first number or the count.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create laboratory" })).toBeDisabled();
  await page.getByLabel("What number is the first tray?").fill("25");
  await expect(page.getByText("12 digital trays will be created: #025 to #036.")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Laboratory name")).toHaveValue("Nora Dental Lab");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("What number is the first tray?")).toHaveValue("25");
  await page.getByRole("button", { name: "Create laboratory" }).click();

  // finish step
  await expect(page.getByRole("heading", { name: "Your laboratory is ready" })).toBeVisible();
  await expect(page.getByText("Nora Dental Lab is set up with 12 trays, numbered #025 to #036.")).toBeVisible();
  await page.getByRole("link", { name: "Go to my dashboard" }).click();

  // 6 · the dashboard
  await expect(page).toHaveURL(/\/dashboard/);

  // 7 · the optional tour invitation
  const invite = page.getByRole("dialog", { name: "Welcome to DENTRACK!" });
  await expect(invite).toBeVisible();
  await invite.getByRole("button", { name: "Start tutorial" }).click();
  await expect(stepLabel(page)).toHaveText("Step 1 of 6");
  await expect(tourBox(page).getByRole("heading", { name: "Your dashboard" })).toBeVisible();

  // 8–9 · every step, Next and Back, on the real pages
  await tourBox(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/trays$/);
  await expect(stepLabel(page)).toHaveText("Step 2 of 6");
  await tourBox(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/cases\/new$/);
  await expect(tourBox(page).getByRole("heading", { name: "Creating a case" })).toBeVisible();
  await tourBox(page).getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/trays$/);
  await expect(stepLabel(page)).toHaveText("Step 2 of 6");
  await page.keyboard.press("ArrowRight");
  await expect(stepLabel(page)).toHaveText("Step 3 of 6");
  await tourBox(page).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(stepLabel(page)).toHaveText("Step 4 of 6");

  // 12 · refresh in the middle: the tour comes back at the same step
  await page.reload();
  await expect(stepLabel(page)).toHaveText("Step 4 of 6");

  // 10 · skip; it doesn't come back by itself
  await tourBox(page).getByRole("button", { name: "Skip tour" }).click();
  await expect(tourBox(page)).toBeHidden();
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Welcome to DENTRACK!" })).toBeHidden();
  // the Getting started checklist, with trays already ticked
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await expect(page.getByText("1 of 4 done. Each step takes a minute or two.")).toBeVisible();

  // 11 · restart from Help
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Restart the guided tour" }).click();
  await expect(stepLabel(page)).toHaveText("Step 1 of 6");

  // close halfway (Esc) → "Continue tour" → resumes
  await tourBox(page).getByRole("button", { name: "Next" }).click();
  await expect(stepLabel(page)).toHaveText("Step 2 of 6");
  await page.keyboard.press("Escape");
  await expect(tourBox(page)).toBeHidden();
  await page.getByRole("button", { name: "Continue tour · step 2 of 6" }).click();
  await expect(stepLabel(page)).toHaveText("Step 2 of 6");

  // 13 · complete
  for (const n of [3, 4, 5, 6]) {
    await tourBox(page).getByRole("button", { name: "Next" }).click();
    await expect(stepLabel(page)).toHaveText(`Step ${n} of 6`);
  }
  await expect(page).toHaveURL(/\/finance$/); // the last step stays on the finance page (step 5)
  await expect(tourBox(page).getByRole("heading", { name: "You're ready to use DENTRACK!" })).toBeVisible();
  await tourBox(page).getByRole("button", { name: "Explore the dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tourBox(page)).toBeHidden();

  // checklist: hide, then bring back from Help
  await page.getByRole("button", { name: "Hide the checklist (bring it back from Help)" }).click();
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeHidden();
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Show the Getting started checklist" }).click();
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();

  // 14 · sign out and in again: no invitation, no "continue" prompt
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, email);
  await expect(page.getByRole("dialog", { name: "Welcome to DENTRACK!" })).toBeHidden();
  await expect(page.getByRole("button", { name: /Continue tour/ })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();

  // a second laboratory: the tour was completed elsewhere, so it isn't offered automatically
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Add or try a laboratory" }).click();
  await page.getByRole("button", { name: "Create my laboratory" }).click();
  await page.getByLabel("Laboratory name").fill("Nora Second Lab");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip, I'll add trays later" }).click();
  await expect(page.getByText(/Nora Second Lab is set up\. You can add your numbered trays/)).toBeVisible();
  await page.getByRole("link", { name: "Go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Welcome to DENTRACK!" })).toBeHidden();
  await expect(page.getByText("0 of 4 done. Each step takes a minute or two.")).toBeVisible();
});

test("new user can choose the demo instead; a real laboratory is not created", async ({ page }) => {
  const email = `${uniq().toLowerCase()}@demo-first.dentrack.test`;
  await signUp(page, email);
  await page.getByRole("button", { name: "Explore demo" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page.getByText("Demo data")).toBeVisible();
  // the demo is complete sample data: no Getting started checklist there
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Welcome to DENTRACK!" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("dialog", { name: "Welcome to DENTRACK!" })).toBeHidden();
});

test("technicians get a five-step tour without finance", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("tech@demo.dentrack.test");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await dismissTourInvite(page);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: /the guided tour/ }).click();
  await expect(stepLabel(page)).toHaveText("Step 1 of 5");
  for (const n of [2, 3, 4, 5]) {
    await tourBox(page).getByRole("button", { name: "Next" }).click();
    await expect(stepLabel(page)).toHaveText(`Step ${n} of 5`);
  }
  await expect(page).not.toHaveURL(/finance/);
  await tourBox(page).getByRole("button", { name: "Start managing cases" }).click();
  await expect(page).toHaveURL(/\/cases$/);
});
