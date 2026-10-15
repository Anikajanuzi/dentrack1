import { expect, test } from "@playwright/test";
import { login, uniq } from "./helpers";

test("cost breakdown records materials, labor and other costs and totals them exactly", async ({ page }) => {
  const ref = uniq();
  await login(page);
  await page.goto("/cases/new");
  await page.getByLabel("Dental clinic").selectOption({ index: 1 });
  await page.getByLabel("Patient reference").fill(`P-${ref}`);
  await page.getByLabel("Prosthetic category").selectOption({ label: "Zirconia crowns" });
  await page.getByLabel("Case reference").fill(ref);
  await page.getByLabel(/Selling price/).fill("120.00");
  await page.getByLabel(/Discount/).fill("10");
  await page.getByRole("button", { name: "Create case" }).click();
  await expect(page.getByRole("heading", { level: 1, name: ref })).toBeVisible();

  await page.getByRole("tab", { name: "Cost breakdown" }).click();
  await expect(page.getByText("Not recorded").first()).toBeVisible(); // missing ≠ zero

  // Material: 0.5 × 33.00 = 16.50
  await page.getByRole("button", { name: "Add material" }).click();
  await page.getByLabel("Material name").fill("Zirconia block");
  await page.getByLabel("Unit", { exact: true }).fill("block");
  await page.getByLabel("Quantity used").fill("0.5");
  await page.getByLabel(/Unit cost/).fill("33");
  await page.getByRole("button", { name: "Save material" }).click();
  await expect(page.getByRole("cell", { name: "€16.50" })).toBeVisible();

  // Labor recorded as a manual amount: 20.00
  await page.getByRole("button", { name: "Add labor" }).click();
  await page.getByLabel("Task").fill("Design and milling");
  await page.getByLabel("Recorded by").selectOption("manual");
  await page.getByLabel(/^Amount/).fill("20");
  await page.getByRole("button", { name: "Save labor" }).click();
  await expect(page.getByRole("cell", { name: "€20.00" })).toBeVisible();

  // Other direct cost: 8.00
  await page.getByRole("button", { name: "Add cost" }).click();
  await page.getByLabel("Description").fill("External scan");
  await page.getByLabel(/^Amount/).fill("8");
  await page.getByRole("button", { name: "Save cost" }).click();

  const summary = page.locator("div").filter({ has: page.getByRole("heading", { name: "Cost breakdown summary" }) }).last();
  await expect(summary).toContainText("€44.50");
  // Not every section is confirmed → contribution wording, not "gross profit".
  await expect(page.getByText("Contribution after recorded costs").first()).toBeVisible();
  await expect(page.getByText("€65.50").first()).toBeVisible(); // 110.00 − 44.50

  // Confirm all three sections → it becomes gross profit, margin 59.5%.
  for (const name of ["Material costs complete", "Labor costs complete", "Other direct costs complete"]) {
    await page.getByRole("switch", { name }).click();
    await expect(page.getByRole("switch", { name })).toBeChecked();
  }
  await expect(page.getByText("Gross profit", { exact: true })).toBeVisible();
  await expect(page.getByText("59.5%")).toBeVisible();
  await expect(page.getByText("37.1%")).toBeVisible();
  await expect(page.getByText("44.9%")).toBeVisible();
  await expect(page.getByText("18.0%")).toBeVisible();
});
