import { test, expect } from "@playwright/test";

test("login and navigate core pages", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Community OS")).toBeVisible();

  await page.getByLabel("Email").fill("treasurer@willows.local");
  await page.getByLabel("Password").fill("willows-demo");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Financial Health" })).toBeVisible();
  await expect(page.getByText("Unknown").first()).toBeVisible();

  await page.getByRole("link", { name: "Data Health" }).click();
  await expect(page.getByRole("heading", { name: "Data Health" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "2025 Meeting Minutes" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Buildings" }).click();
  await expect(page.getByRole("heading", { name: "Buildings" })).toBeVisible();
});
