import { describe, expect, it } from "vitest";
import { jeuDeTailles, getThumbUrl } from "./imageThumb";

/**
 * 🔴 CE QUE CES TESTS PROTÈGENT. Le `srcset` annonçait « 960w » et « 1600w »
 *    pour TOUTES les photos, alors que `o2upload.php` ne fabrique jamais plus
 *    grand que la source. Une photo de 590 px donnait donc trois fichiers de
 *    480, 590 et 590 px, tous annoncés plus larges qu'ils ne sont — et le
 *    navigateur agrandissait en croyant réduire.
 *    Mesuré en production le 06/09/2026 : `01.w960.webp` du récit de Manambato
 *    fait 590 × 443.
 */
const U = "https://diako.fonenako.mg/uploads/posts/abc/1788272748/01.jpg";

describe("jeuDeTailles — les largeurs annoncées sont les vraies", () => {
  it("une photo plus petite que 960 n'annonce jamais 960 ni 1600", () => {
    // 590 × 443 : la vignette tombe à 480 (plus grand côté), les deux autres
    // variantes rendent le fichier d'origine — une seule candidate suffit.
    expect(jeuDeTailles(U, 590, 443)).toBe(
      "https://diako.fonenako.mg/uploads/posts/abc/1788272748/01.thumb.webp 480w, " +
        "https://diako.fonenako.mg/uploads/posts/abc/1788272748/01.w960.webp 590w"
    );
  });

  it("le plafond porte sur le PLUS GRAND CÔTÉ : une photo en portrait a une vignette plus étroite que 480", () => {
    // 443 × 590 : l'échelle est 480/590, donc la vignette fait 360 px de large.
    // L'annoncer à 480w ferait choisir la vignette pour un créneau trop grand.
    expect(jeuDeTailles(U, 443, 590)).toBe(
      "https://diako.fonenako.mg/uploads/posts/abc/1788272748/01.thumb.webp 360w, " +
        "https://diako.fonenako.mg/uploads/posts/abc/1788272748/01.w960.webp 443w"
    );
  });

  it("une grande photo garde bien ses trois paliers", () => {
    // 2000 × 1333 : 480, 960 et 1600 existent tous les trois pour de vrai.
    const s = jeuDeTailles(U, 2000, 1333) ?? "";
    expect(s).toContain("01.thumb.webp 480w");
    expect(s).toContain("01.w960.webp 960w");
    expect(s).toContain("01.w1600.webp 1600w");
  });

  it("sans dimensions connues, on garde l'ancien comportement plutôt que de deviner", () => {
    const s = jeuDeTailles(U) ?? "";
    expect(s).toContain("480w");
    expect(s).toContain("960w");
    expect(s).toContain("1600w");
  });

  it("une URL qui n'est pas à nous n'est pas touchée", () => {
    expect(jeuDeTailles("https://exemple.org/photo.jpg", 800, 600)).toBeNull();
    expect(jeuDeTailles(null)).toBeNull();
  });

  it("la vignette remplace l'extension, en gardant la requête", () => {
    expect(getThumbUrl(U)).toBe("https://diako.fonenako.mg/uploads/posts/abc/1788272748/01.thumb.webp");
    expect(getThumbUrl(U + "?v=2")).toBe(
      "https://diako.fonenako.mg/uploads/posts/abc/1788272748/01.thumb.webp?v=2"
    );
    expect(getThumbUrl("https://exemple.org/a.png")).toBe("https://exemple.org/a.png");
  });
});
