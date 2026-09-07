import { describe, expect, it } from "vitest";
import { gabarit, ratioDe, recadrage } from "./gabaritPhotos";
import type { Media } from "@/lib/api";

/**
 * 🔴 CE QUE CES TESTS PROTÈGENT : la promesse de netteté du fil.
 *    Le fil plein écran agrandissait les photos 3,56× et n'en montrait que
 *    33 %. La règle testée ici est ce qui l'en empêche — et elle ne vaut que
 *    si personne ne la contourne « juste pour une grille régulière ».
 *
 * Les six publications servent de témoins : ce sont de vraies publications de
 * la production, avec leurs vraies dimensions relevées le 06/09/2026.
 */
const photo = (w: number, h: number, url = `p${w}x${h}`): Media => ({ url, w, h });

describe("gabarit — la photo dicte le cadre", () => {
  it("une seule photo garde son ratio, donc aucun recadrage", () => {
    const g = gabarit([photo(810, 540)]);
    expect(g.forme).toBe("une");
    if (g.forme === "une") expect(recadrage(g.grande, ratioDe(g.grande))).toBe(0);
  });

  it("deux photos identiques : duo au ratio commun, 0 % de recadrage", () => {
    // Manambato : deux fois 590 × 443.
    const g = gabarit([photo(590, 443), photo(590, 443)]);
    expect(g.forme).toBe("duo");
    if (g.forme === "duo") {
      expect(g.ratio).toBeCloseTo(1.332, 3);
      expect(recadrage(g.a, g.ratio)).toBe(0);
      expect(recadrage(g.b, g.ratio)).toBe(0);
    }
  });

  it("deux photos de ratios voisins : on s'aligne sur la PLUS ÉTROITE, une seule est rognée", () => {
    // Mahajanga : 590 × 393 (1,501) et 590 × 371 (1,590).
    const g = gabarit([photo(590, 393), photo(590, 371)]);
    expect(g.forme).toBe("duo");
    if (g.forme === "duo") {
      expect(g.ratio).toBeCloseTo(1.501, 3); // la plus étroite, pas la moyenne
      expect(recadrage(g.a, g.ratio)).toBe(0);
      expect(recadrage(g.b, g.ratio)).toBeLessThan(0.06); // 5,6 %
    }
  });

  it("aligner sur la MOYENNE rognerait les deux : c'est ce qu'on refuse", () => {
    const a = photo(590, 393), b = photo(590, 371);
    const moyenne = (ratioDe(a) + ratioDe(b)) / 2;
    expect(recadrage(a, moyenne)).toBeGreaterThan(0);
    expect(recadrage(b, moyenne)).toBeGreaterThan(0);
    const g = gabarit([a, b]);
    if (g.forme === "duo") expect(recadrage(a, g.ratio)).toBe(0);
  });

  it("trois photos : une grande intacte, et une planche de deux", () => {
    // Boanamary : 590 × 394 · 590 × 393 · 590 × 332.
    const g = gabarit([photo(590, 394), photo(590, 393), photo(590, 332)]);
    expect(g.forme).toBe("planche");
    if (g.forme === "planche") {
      expect(g.suite).toHaveLength(2);
      expect(recadrage(g.grande, ratioDe(g.grande))).toBe(0);
      for (const m of g.suite) expect(recadrage(m, g.ratio)).toBeLessThan(0.25); // plafond du projet
    }
  });

  it("cinq photos : la planche s'arrête à quatre", () => {
    const g = gabarit(Array.from({ length: 5 }, (_, i) => photo(590, 443, `s${i}`)));
    expect(g.forme).toBe("planche");
    if (g.forme === "planche") expect(g.suite).toHaveLength(4);
  });

  it("aucune photo du corpus ne dépasse le plafond de 25 % de recadrage", () => {
    // Les six publications réelles du 06/09/2026, dimensions relevées à la source.
    const corpus: Media[][] = [
      [photo(810, 540)],
      [photo(590, 443), photo(590, 443)],
      [photo(590, 393), photo(590, 371)],
      [photo(590, 394), photo(590, 393), photo(590, 332)],
      [photo(587, 394), photo(590, 324), photo(590, 384)],
      Array.from({ length: 5 }, (_, i) => photo(590, 443, `x${i}`)).flat(),
    ];
    for (const media of corpus) {
      const g = gabarit(media);
      if (g.forme === "duo") {
        expect(Math.max(recadrage(g.a, g.ratio), recadrage(g.b, g.ratio))).toBeLessThan(0.25);
      }
      if (g.forme === "planche") {
        expect(recadrage(g.grande, ratioDe(g.grande))).toBe(0);
        for (const m of g.suite) expect(recadrage(m, g.ratio)).toBeLessThan(0.25);
      }
    }
  });

  it("une vidéo repart au carrousel, elle ne suit pas la règle des photos", () => {
    expect(gabarit([{ url: "v.mp4", type: "video" }, photo(590, 443)]).forme).toBe("video");
  });

  it("sans dimensions, on suppose 3:2 plutôt que de casser la mise en page", () => {
    expect(ratioDe({ url: "a.jpg" })).toBeCloseTo(1.5, 5);
    expect(gabarit([]).forme).toBe("aucune");
    expect(gabarit(null).forme).toBe("aucune");
  });
});
