import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * axe-core sur six pages : aucune violation « serious » ni « critical ».
 * ⚠ Une règle écartée ici doit porter son motif. Aucune ne l'est en entier ;
 *   deux familles de NŒUDS le sont, chacune avec son motif ci-dessous.
 */
const PAGES = ["/", "/explorer", "/p/les-trois-metis", "/lieu/mahajanga", "/auth", "/quand-partir"];

for (const u of PAGES) {
  test(`axe : ${u}`, async ({ page }) => {
    await page.goto(u);
    await page.waitForTimeout(2500);
    const resultats = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      /* ⚠ SEULE EXCLUSION, ET SON MOTIF (06/09/2026). Le texte du fil plein
         écran est posé sur une carte `bg-black/60` au-dessus de la photo ;
         axe, dans le Chromium de Playwright, calcule son fond comme le papier
         de la page (#faf4ed, 1,09:1) même avec une carte opaque à 95 % — la
         pile d'éléments relue par elementsFromPoint contient pourtant la carte
         et le conteneur noir. Le même axe-core injecté dans un Chrome 151
         (scripts de l'audit, $TEMP/axe-detail.mjs) ne signale rien, et le
         contraste réel est ≥ 5,7:1 (blanc sur 60 % de noir, quel que soit le
         cliché). On écarte ce nœud, pas la règle. */
      .exclude('article [class*="max-w-[85%]"]')
      .analyze();
    /* ⚠ DEUXIÈME MOTIF (25/10/2026) : `target-size` sur une cible `.dk-tap`.
         Ces boutons (« Lire la suite » du fil) gardent la hauteur de leur
         texte, 20 px, et portent une zone de toucher de 44 x 44 px en
         `::after` (index.css, `.dk-tap`) : axe ne mesure pas les
         pseudo-éléments et les compte à 20 px. Vu en CI le 25/10/2026 (93 x
         20 px), seulement quand le premier récit est assez long pour avoir
         « Lire la suite » : un échec qui dépend du contenu du jour. On écarte
         ces nœuds-là ; la règle reste active pour tout le reste. */
    const graves = resultats.violations
      .map((v) => (v.id === "target-size" ? { ...v, nodes: v.nodes.filter((n) => !/\bdk-tap\b/.test(n.html)) } : v))
      .filter((v) => (v.impact === "serious" || v.impact === "critical") && v.nodes.length > 0);
    expect(
      graves.map((v) => `${v.id} (${v.impact}) — ${v.nodes.length} nœud(s) : ${v.nodes[0]?.target.join(" ")} — ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? null)}`),
      `violations graves sur ${u}`
    ).toEqual([]);
  });
}
