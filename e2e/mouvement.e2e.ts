import { expect, test, type Page } from "@playwright/test";

/**
 * LE MOUVEMENT NE CACHE JAMAIS RIEN (25/10/2026).
 *
 * 🔴 POURQUOI CE FICHIER. `.dk-reveal` part à opacité 0 et n'apparaît que
 *    lorsqu'on le lui dit (useReveal, src/hooks/useReveal.ts). Un chemin
 *    oublié, et le contenu reste INVISIBLE, sans la moindre erreur : quatre
 *    incidents de cette famille sont écrits dans le code (/sites filtré,
 *    /post/<id>, « Voir plus » des Événements, onglets des Favoris), et un
 *    cinquième a été mesuré le 25/10/2026 (le bouton « Rechercher dans cette
 *    zone » de /recherche, invisible). Aucun banc ne le vérifiait, et aucun ne
 *    simulait « réduire les animations ».
 * ⚠ DEUX RÉGLAGES. « Réduire les animations » (recette G de la veille du
 *   25/10/2026) : AUCUNE animation lancée par JavaScript, et AUCUN
 *   `.dk-reveal` à opacité 0, nulle part. Mouvement normal : en descendant la
 *   page, rien de ce qui est à l'écran ne reste vide — c'est le test qu'exige
 *   toute nouvelle mécanique de révélation.
 * ⚠ « À L'ÉCRAN » ET NON « DANS LA PAGE » en mouvement normal : sous le bas
 *   de l'écran, une carte n'a pas encore été vue, elle est cachée à bon droit
 *   (et le fil en ajoute en bas quand on y arrive).
 * ⚠ LECTURE SEULE, comme le reste de e2e/ : on ouvre, on clique des filtres,
 *   on fait défiler. Servi sur 127.0.0.1, le compteur de visites ne part pas.
 */

// Une page longue se parcourt en 25 pas au plus : de quoi couvrir quinze écrans.
test.slow();

/**
 * Descend la page par pas de 0,6 écran (25 pas au plus). À chaque pas, après
 * `pause` ms (une apparition dure 0,74 s au plus), relève les `.dk-reveal` à
 * opacité 0 dans les trois quarts hauts de l'écran : ce qu'un visiteur
 * verrait vide.
 */
async function videsALEcran(page: Page, pause = 850) {
  const vides = new Map<string, string>();
  let fond = 0;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(pause);
    const r = await page.evaluate(() => {
      const zone = window.innerHeight * 0.75;
      const caches: [string, string][] = [];
      document.querySelectorAll<HTMLElement>(".dk-reveal").forEach((e, n) => {
        const b = e.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) return;
        // Dans un <details> fermé (les régions de /villes) : pas à l'écran, quoi qu'en dise le rectangle.
        if (!e.checkVisibility()) return;
        if (b.bottom <= 0 || b.top >= zone || b.right <= 0 || b.left >= window.innerWidth) return;
        if (getComputedStyle(e).opacity !== "0") return;
        caches.push([`${n}`, `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join(".")} data-vu=${e.getAttribute("data-vu")} à ${Math.round(window.scrollY + b.top)} px`]);
      });
      const fin = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (!fin) window.scrollBy(0, window.innerHeight * 0.6);
      return { caches, fin };
    });
    for (const [cle, quoi] of r.caches) vides.set(cle, quoi);
    if (r.fin && ++fond >= 2) break;
  }
  return [...vides.values()];
}

/** Tous les `.dk-reveal` à opacité 0, où qu'ils soient. */
function tousCaches(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".dk-reveal")]
      .filter((e) => getComputedStyle(e).opacity === "0")
      .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join(".")} data-vu=${e.getAttribute("data-vu")}`)
  );
}

/** Animations lancées par JavaScript (Web Animations), hors CSS. */
function animationsJs(page: Page) {
  return page.evaluate(
    () => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length
  );
}

async function ouvrirUnRecit(page: Page) {
  await page.goto("/");
  const lien = page.locator('a[href^="/post/"]').first();
  await expect(lien).toBeAttached({ timeout: 20_000 });
  await page.goto((await lien.getAttribute("href"))!);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("réduire les animations", () => {
  // ⚠ Par `contextOptions` : `reducedMotion` n'est pas une option de premier niveau de `test.use`.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  for (const chemin of ["/", "/explorer", "/sites", "/evenements", "/lieu/mahajanga", "/p/les-trois-metis"]) {
    test(`${chemin} : aucune animation JS, rien de caché`, async ({ page }) => {
      await page.goto(chemin);
      await expect(page.locator("#root h1").first()).toBeAttached({ timeout: 20_000 });
      /* 🔴 ATTENDRE LE CONTENU, sinon le test passe À VIDE. Vu le 25/10/2026
           sur un build cassé exprès (tout `.dk-reveal` caché, même sous
           « réduire ») : /explorer passait en 5,4 s, ses cartes n'étant pas
           encore arrivées sur un réseau lent. Ces six pages portent toutes des
           `.dk-reveal` (relevé du même jour : 1 à 39 au téléphone ; une page
           /lieu/<slug> en a au moins deux, « Y aller » et « Quand y aller »,
           toujours présentes dans Destination.tsx). */
      await expect(page.locator(".dk-reveal").first(), "le contenu est arrivé").toBeAttached({ timeout: 30_000 });
      await page.waitForTimeout(2000);
      expect(await animationsJs(page), "animations JS au chargement").toBe(0);
      expect(await videsALEcran(page, 300), `${chemin} : vide à l'écran`).toEqual([]);
      expect(await animationsJs(page), "animations JS après défilement").toBe(0);
      expect(await tousCaches(page), `${chemin} : .dk-reveal à opacité 0`).toEqual([]);
    });
  }

  test("la page d'un récit (/post/<id>)", async ({ page }) => {
    await ouvrirUnRecit(page);
    expect(await videsALEcran(page, 300)).toEqual([]);
    expect(await tousCaches(page)).toEqual([]);
  });
});

test.describe("mouvement normal : rien ne reste vide à l'écran", () => {
  test("/ : en descendant toute la page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#root h1").first()).toBeAttached({ timeout: 20_000 });
    await expect(page.locator(".dk-reveal").first(), "le fil est arrivé").toBeAttached({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    expect(await videsALEcran(page)).toEqual([]);
  });

  /* ⚠ OUVRIR LA BANDE, sinon le test ne vérifie RIEN : les 23 cartes de
       /villes vivent dans cinq <details> fermés (Villes.tsx), écartés par
       checkVisibility. Ouvrir, refermer, rouvrir : c'est le cas que la recette
       B bis protège (une animation rejoue quand un ancêtre caché réapparaît). */
  test("/villes : ouvrir une région, la refermer, la rouvrir", async ({ page }) => {
    await page.goto("/villes");
    const bande = page.locator("details").first();
    await expect(bande).toBeAttached({ timeout: 20_000 });
    const resume = bande.locator("summary");
    for (const essai of ["ouverte", "rouverte"]) {
      await resume.click();
      await expect(bande).toHaveAttribute("open", "");
      await page.waitForTimeout(900);
      expect(await bande.locator(".dk-reveal").count(), "des cartes dans la bande").toBeGreaterThan(0);
      expect(await videsALEcran(page), `bande ${essai}`).toEqual([]);
      if (essai === "ouverte") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await resume.click();
        await expect(bande).not.toHaveAttribute("open", "");
      }
    }
  });

  test("/sites : changer de filtre puis tout parcourir", async ({ page }) => {
    await page.goto("/sites");
    const puces = page.locator("button[aria-pressed]");
    await expect(puces.nth(1)).toBeVisible({ timeout: 20_000 });
    for (const i of [1, 2]) {
      await puces.nth(i).click();
      await page.waitForTimeout(1200);
      expect(await videsALEcran(page), `puce ${i}`).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });

  test("/evenements : « Voir plus » puis tout parcourir", async ({ page }) => {
    await page.goto("/evenements");
    await expect(page.locator(".dk-reveal").first()).toBeAttached({ timeout: 20_000 });
    expect(await videsALEcran(page)).toEqual([]);
    const plus = page.getByRole("button", { name: /Voir plus/ });
    if (await plus.count()) {
      await plus.first().click();
      await page.waitForTimeout(1200);
      expect(await videsALEcran(page), "après « Voir plus »").toEqual([]);
    }
  });

  test("la page d'un récit (/post/<id>)", async ({ page }) => {
    await ouvrirUnRecit(page);
    expect(await videsALEcran(page)).toEqual([]);
  });
});
