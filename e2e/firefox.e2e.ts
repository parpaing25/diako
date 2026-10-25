import { expect, test } from "@playwright/test";

/**
 * FIREFOX — LA PAGE NE DOIT PAS ÊTRE BLANCHE (25/10/2026).
 *
 * 🔴 POURQUOI CE FICHIER. Changer l'ordre d'initialisation des modules a déjà
 *    donné « can't access lexical declaration before initialization » sous
 *    Firefox, donc une PAGE BLANCHE, alors que Chrome tolère (vite.config.ts,
 *    en-tête ; CLAUDE.md, « Build »). Aucun banc ne lançait Firefox : la seule
 *    garde contre ce défaut était un commentaire. Ce test est cette garde.
 *
 * ⚠ LECTURE SEULE, comme le reste de e2e/ : il ouvre des pages et écoute les
 *   erreurs. Servi par `vite preview` sur 127.0.0.1, le compteur de visites
 *   (src/lib/pageviews.ts) ne part pas.
 * ⚠ PAS D'`isMobile` : Playwright ne le gère pas sous Firefox (il lève). La
 *   largeur de 390 px suffit à rendre le fil du téléphone (useEstMobile < 768).
 */

/** Ce qui trahit un module mal initialisé ou un rendu cassé, en console. */
const FATAL = /ReferenceError|TypeError|before initialization|lexical declaration|is not defined|Minified React error/i;

async function ouvrirSansErreur(page: import("@playwright/test").Page, chemin: string) {
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(`pageerror : ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && FATAL.test(m.text())) erreurs.push(`console : ${m.text()}`);
  });
  await page.goto(chemin);
  // main.tsx retire le squelette statique une fois React monté ET peint.
  await expect(page.locator("#dk-shell")).toHaveCount(0, { timeout: 20_000 });
  // `toBeAttached` et non `toBeVisible` : le h1 de l'accueil est `sr-only`.
  await expect(page.locator("#root h1").first()).toBeAttached({ timeout: 20_000 });
  await expect(page.getByText("Quelque chose s'est mal passé")).toHaveCount(0);
  const texte = (await page.locator("#root").innerText()).trim();
  expect(texte.length, `${chemin} : #root presque vide (${texte.length} caractères)`).toBeGreaterThan(200);
  // Les morceaux différés s'évaluent après le montage : on leur laisse le temps.
  await page.waitForTimeout(1500);
  expect(erreurs, `${chemin} : erreurs sous Firefox`).toEqual([]);
}

test.describe("téléphone (390 px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("accueil : le fil se monte et un récit apparaît", async ({ page }) => {
    await ouvrirSansErreur(page, "/");
    await expect(page.getByRole("link", { name: /Ouvrir le récit/ }).first()).toBeVisible({ timeout: 20_000 });
  });

  for (const chemin of ["/explorer", "/lieu/mahajanga", "/p/les-trois-metis"]) {
    test(`${chemin} se monte sans erreur`, async ({ page }) => {
      await ouvrirSansErreur(page, chemin);
    });
  }
});

test.describe("ordinateur (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("accueil en grille, rails compris", async ({ page }) => {
    await ouvrirSansErreur(page, "/");
    await expect(page.locator('a[href^="/post/"]').first()).toBeVisible({ timeout: 20_000 });
  });
});
