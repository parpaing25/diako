import { expect, test } from "@playwright/test";

test("l'écran de connexion : champs nommés, mot de passe court refusé, Google présent", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const mail = page.getByRole("textbox", { name: /Adresse e-mail/ });
  const mdp = page.getByRole("textbox", { name: /Mot de passe/ });
  await expect(mail).toBeVisible();
  await expect(mdp).toBeVisible();
  await mail.fill("test@example.com");
  await mdp.fill("abc");
  await page.getByRole("button", { name: /Se connecter/ }).click();
  // ⚠ Aucun compte n'est créé et aucun appel réseau ne part : le champ porte
  //   `minLength={8}`, la validation native du navigateur retient le formulaire.
  await expect(mdp).toHaveJSProperty("validity.tooShort", true);
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("button", { name: /Continuer avec Google/ })).toBeVisible();
});

test("le menu s'ouvre au bouton et se ferme à Échap", async ({ page }) => {
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  // ⚠ Viser le DIALOGUE, pas le premier lien du nom : « Villes et villages »
  //   existe aussi dans la page et dans le pied de page (règle du 04/09).
  const menu = page.getByRole("dialog");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: /Villes et villages/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("une route inconnue rend la page introuvable, non indexable", async ({ page }) => {
  await page.goto("/cette-route-nexiste-pas");
  await expect(page.locator("h1")).toContainText(/n'existe pas/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("link", { name: /Retour à l'accueil/ })).toBeVisible();
});
