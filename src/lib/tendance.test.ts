import { describe, expect, it } from "vitest";
import { choisirEnVogue, POIDS, scoreTendance } from "./tendance";

const T0 = new Date("2026-08-14T12:00:00Z").getTime();
const ilYA = (jours: number) => new Date(T0 - jours * 86_400_000).toISOString();

describe("scoreTendance", () => {
  it("vaut zéro quand personne n'a réagi", () => {
    expect(scoreTendance({ id: "a", created_at: ilYA(3) }, T0)).toBe(0);
  });

  it("classe un enregistrement au-dessus d'une réaction", () => {
    const meme = { created_at: ilYA(2) };
    const aime = scoreTendance({ id: "a", ...meme, reactions_count: 1 }, T0);
    const garde = scoreTendance({ id: "b", ...meme, saves_count: 1 }, T0);
    expect(garde).toBeGreaterThan(aime);
    expect(garde / aime).toBeCloseTo(POIDS.enregistrement / POIDS.reaction, 5);
  });

  it("⚠ LE DÉFAUT CORRIGÉ : un récit récent bat un ancien plus gros", () => {
    // 60 d'attention en 2 jours doit passer devant 500 en six mois — c'est
    // exactement le cas qui verrouillait la vitrine de Fonenako.
    const frais = scoreTendance({ id: "frais", reactions_count: 3, created_at: ilYA(2) }, T0);
    const ancien = scoreTendance({ id: "ancien", reactions_count: 25, created_at: ilYA(180) }, T0);
    expect(frais).toBeGreaterThan(ancien);
  });

  it("ne divise pas un récit du jour par un âge inférieur à un jour", () => {
    const aLInstant = scoreTendance({ id: "a", reactions_count: 1, created_at: ilYA(0) }, T0);
    const hier = scoreTendance({ id: "b", reactions_count: 1, created_at: ilYA(1) }, T0);
    expect(aLInstant).toBe(hier);
    expect(aLInstant).toBe(POIDS.reaction);
  });

  it("ne renvoie jamais l'infini sur une date future", () => {
    const s = scoreTendance({ id: "a", reactions_count: 1, created_at: ilYA(-5) }, T0);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBe(POIDS.reaction);
  });

  it("tolère une date absente", () => {
    expect(scoreTendance({ id: "a", reactions_count: 2 }, T0)).toBe(2 * POIDS.reaction);
  });
});

describe("choisirEnVogue", () => {
  const lot = Array.from({ length: 10 }, (_, i) => ({
    id: `p${i}`,
    reactions_count: 10 - i,
    created_at: ilYA(2),
  }));

  it("rend exactement le nombre demandé", () => {
    expect(choisirEnVogue(lot, 4, { alea: () => 0.5, maintenant: T0 })).toHaveLength(4);
  });

  it("ne rend jamais deux fois le même récit", () => {
    const r = choisirEnVogue(lot, 6, { alea: () => 0.31, maintenant: T0 });
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length);
  });

  it("écarte ceux dont personne n'a rien fait", () => {
    const muets = [{ id: "muet", created_at: ilYA(1) }];
    expect(choisirEnVogue(muets, 3, { alea: () => 0.5, maintenant: T0 })).toHaveLength(0);
  });

  it("rend moins que demandé plutôt que de compléter avec du vide", () => {
    const deux = lot.slice(0, 2);
    expect(choisirEnVogue(deux, 5, { alea: () => 0.5, maintenant: T0 })).toHaveLength(2);
  });

  it("privilégie le mieux noté quand le tirage tombe au plus bas", () => {
    const r = choisirEnVogue(lot, 1, { alea: () => 0, maintenant: T0 });
    expect(r[0].id).toBe("p0");
  });

  it("⚠ CE QUI CHANGE VRAIMENT : deux visites ne donnent pas le même rail", () => {
    const a = choisirEnVogue(lot, 3, { alea: () => 0.05, maintenant: T0 });
    const b = choisirEnVogue(lot, 3, { alea: () => 0.95, maintenant: T0 });
    expect(a.map((x) => x.id).join()).not.toBe(b.map((x) => x.id).join());
  });

  it("ne boucle pas quand on demande plus que le bassin", () => {
    const r = choisirEnVogue(lot, 50, { alea: () => 0.5, maintenant: T0 });
    expect(r.length).toBeLessThanOrEqual(lot.length);
  });
});
