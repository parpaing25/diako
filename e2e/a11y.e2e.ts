import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * axe-core sur six pages : aucune violation « serious » ni « critical ».
 * ⚠ Une règle écartée ici doit porter son motif ; aucune ne l'est aujourd'hui.
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
    const graves = resultats.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      graves.map((v) => `${v.id} (${v.impact}) — ${v.nodes.length} nœud(s) : ${v.nodes[0]?.target.join(" ")} — ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? null)}`),
      `violations graves sur ${u}`
    ).toEqual([]);
  });
}
