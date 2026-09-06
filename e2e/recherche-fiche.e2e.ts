import { expect, test } from "@playwright/test";

test("chercher « hotel » rend des fiches", async ({ page }) => {
  await page.goto("/recherche?q=hotel");
  await expect(page.locator("h1")).toContainText(/hotel/i);
  await expect(page.locator('a[href^="/p/"]').first()).toBeVisible({ timeout: 20_000 });
  // Les résultats ne s'indexent pas ; la page nue, si.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("une fiche d'établissement : titre, contact, balisage", async ({ page }) => {
  await page.goto("/p/les-trois-metis");
  await expect(page.locator("h1")).toContainText("Les Trois Métis", { timeout: 20_000 });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/p\/les-trois-metis$/);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.length).toBeGreaterThan(0);
  for (const bloc of ld) expect(() => JSON.parse(bloc)).not.toThrow();
  // Un moyen de contact direct, et jamais le vocabulaire de la réservation sur
  // une action (règle du projet : « Demander », jamais « Réserver » ni « Payer »).
  await expect(page.getByRole("button", { name: /Appeler|Écrire|Demander|WhatsApp/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Réserver|Payer/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Réserver|Payer/ })).toHaveCount(0);
});

test("une fiche inexistante dit qu'elle n'existe pas et ne s'indexe pas", async ({ page }) => {
  await page.goto("/p/nexiste-pas-du-tout");
  await expect(page.locator("h1")).toContainText(/n'existe pas/, { timeout: 20_000 });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("une destination mène à où dormir et où manger", async ({ page }) => {
  // La page ne liste pas les fiches : elle compte et renvoie vers la
  // recherche filtrée (Destination.tsx:412-431). Mahajanga : 192 fiches
  // publiées le 06/09/2026.
  await page.goto("/lieu/mahajanga");
  await expect(page.locator("h1")).toContainText("Mahajanga", { timeout: 20_000 });
  const dormir = page.getByRole("link", { name: /Où dormir/ });
  await expect(dormir).toBeVisible({ timeout: 20_000 });
  await expect(dormir).toHaveAttribute("href", /\/recherche\?q=.*cat=hotel/);
  await expect(page.getByRole("link", { name: /Où manger/ })).toHaveAttribute("href", /cat=restaurant/);
});
