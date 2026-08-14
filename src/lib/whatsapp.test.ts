import { describe, expect, it } from "vitest";
import {
  afficherNumero,
  estMobileMalgache,
  lienAppel,
  lienWhatsApp,
  numeroInternational,
  peutRecevoirWhatsApp,
} from "./whatsapp";

/**
 * Les 54 fiches d'Ampefy portent leur numéro en +261 : ces conversions sont
 * sur le chemin critique de la mise en relation, qui est tout ce que le site
 * promet. Un lien wa.me faux, c'est un client perdu sans que personne ne le
 * sache.
 */

describe("numeroInternational", () => {
  it("garde un numéro déjà international", () => {
    expect(numeroInternational("+261 34 10 459 70")).toBe("261341045970");
  });

  it("remplace le zéro initial par l'indicatif pays", () => {
    expect(numeroInternational("034 10 459 70")).toBe("261341045970");
  });

  it("rétablit l'indicatif quand le zéro a été oublié", () => {
    expect(numeroInternational("34 10 459 70")).toBe("261341045970");
  });

  it("laisse un numéro étranger intact", () => {
    expect(numeroInternational("+33 7 58 43 08 72")).toBe("33758430872");
  });
});

describe("estMobileMalgache", () => {
  it.each(["032 12 345 67", "033 12 345 67", "034 12 345 67", "037 12 345 67", "038 12 345 67"])(
    "reconnaît %s",
    (n) => expect(estMobileMalgache(n)).toBe(true)
  );

  it("écarte un fixe en 020 — il n'a pas WhatsApp", () => {
    expect(estMobileMalgache("020 22 123 45")).toBe(false);
  });

  it("écarte un numéro trop court", () => {
    expect(estMobileMalgache("034 12 34")).toBe(false);
  });
});

describe("peutRecevoirWhatsApp", () => {
  it("accepte un mobile malgache", () => {
    expect(peutRecevoirWhatsApp("+261 34 10 459 70")).toBe(true);
  });

  it("refuse un fixe malgache", () => {
    expect(peutRecevoirWhatsApp("020 22 123 45")).toBe(false);
  });

  it("accepte un numéro étranger — Falafa Ampefy est joignable en France", () => {
    expect(peutRecevoirWhatsApp("+33 7 58 43 08 72")).toBe(true);
  });

  it("refuse une valeur absente", () => {
    expect(peutRecevoirWhatsApp(null)).toBe(false);
    expect(peutRecevoirWhatsApp("")).toBe(false);
  });
});

describe("afficherNumero", () => {
  it("découpe à la malgache, pas en tranches fixes", () => {
    // Le projet frère rendait « +261 34 10 45970 » : ce n'est pas ainsi
    // qu'on lit ni qu'on dicte un numéro ici.
    expect(afficherNumero("+261341045970")).toBe("+261 34 10 459 70");
  });

  it("laisse un numéro étranger tel quel", () => {
    expect(afficherNumero("+33 7 58 43 08 72")).toBe("+33 7 58 43 08 72");
  });

  it("rend une chaîne vide plutôt que « undefined »", () => {
    expect(afficherNumero(null)).toBe("");
  });
});

describe("lienWhatsApp", () => {
  it("nomme l'établissement dans le premier message", () => {
    const l = lienWhatsApp("034 10 459 70", { etablissement: "Kavitaha" });
    expect(l).toContain("https://wa.me/261341045970");
    expect(decodeURIComponent(l)).toContain("Kavitaha");
    // Le gérant doit savoir d'où vient le contact, sinon Diako reste invisible
    // dans la chaîne qui lui amène un client.
    expect(decodeURIComponent(l)).toContain("Diako");
  });
});

describe("lienAppel", () => {
  it("ne laisse aucun espace — certains Android cassent la composition", () => {
    expect(lienAppel("034 10 459 70")).toBe("tel:+261341045970");
  });
});
