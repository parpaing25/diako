import { expect, test } from "@playwright/test";

test("l'accueil a un h1 et un récit s'ouvre", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page).toHaveTitle(/Diako/);
  // Le fil plein écran : la première publication porte un lien vers le récit.
  const ouvrir = page.getByRole("link", { name: /Ouvrir le récit/ }).first();
  await expect(ouvrir).toBeVisible({ timeout: 20_000 });
  await ouvrir.click();
  await expect(page).toHaveURL(/\/post\/[0-9a-f-]{36}/);
  await expect(page.locator("h1")).toBeVisible();
});

test("aucun défilement horizontal à 390 px sur cinq pages", async ({ page }) => {
  for (const u of ["/", "/explorer", "/plats", "/quand-partir", "/lieu/mahajanga"]) {
    await page.goto(u);
    await page.waitForTimeout(1500);
    const [sw, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw, `${u} déborde : ${sw} > ${vw}`).toBeLessThanOrEqual(vw);
  }
});
