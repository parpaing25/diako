import { describe, expect, it } from "vitest";
import { dateDuReleve, decouperRecit, numeroAppelable } from "./recit";

/**
 * Les corps ci-dessous sont de VRAIS `posts.body` relevés le 03/09/2026 :
 * le découpage doit tenir sur ce que le bot produit, pas sur un idéal.
 */
describe("decouperRecit", () => {
  it("découpe un corps complet, marqueur par marqueur", () => {
    const corps = [
      "📍 Anjanahary",
      "",
      "« Salama o. Miverina afaka jifainao ety aminay indray ireo karazana pack sy sakafo… »",
      "",
      "🧭 en face N'Hair Beauty",
      "",
      "💰 20 000 Ar le plat — relevé le 24/08/2026",
      "📞 038 90 794 95",
      "Vu sur Facebook — Élégance Street Food le 24/08/2026",
    ].join("\n");
    const b = decouperRecit(corps);
    expect(b.citation).toBe(
      "Salama o. Miverina afaka jifainao ety aminay indray ireo karazana pack sy sakafo",
    );
    expect(b.repere).toBe("en face N'Hair Beauty");
    expect(b.prix).toBe("20 000 Ar le plat — relevé le 24/08/2026");
    expect(b.telephone).toBe("038 90 794 95");
    expect(b.source).toBe("Vu sur Facebook — Élégance Street Food le 24/08/2026");
    expect(b.prose).toEqual([]);
  });

  it("jette la ligne 📍 : elle porte tantôt le nom, tantôt le lieu", () => {
    // 262 corps y mettent le nom de l'établissement, 210 le lieu, et rien ne
    // dit lequel : le titre de la page le dit déjà, à partir des colonnes.
    const b = decouperRecit("📍 Madagascar Tourisme — Boanamary\n\n« Des flamants roses. »");
    expect(b.prose).toEqual([]);
    expect(b.citation).toBe("Des flamants roses.");
  });

  it("n'affiche qu'une seule provenance quand le corps la répète", () => {
    // 25 des 219 récits publiés portent cette ligne deux fois.
    const corps = [
      "« Un souvenir. »",
      "Vu sur Facebook — Andri.matel le 23/08/2026",
      "Vu sur Facebook — Andri.matel le 23/08/2026",
    ].join("\n");
    expect(decouperRecit(corps).source).toBe("Vu sur Facebook — Andri.matel le 23/08/2026");
  });

  it("garde une citation qui contient elle-même des guillemets", () => {
    // Le test porte sur les BORNES : chercher l'intérieur couperait ici.
    const b = decouperRecit("« Il disait « mora mora » à chaque virage. »");
    expect(b.citation).toBe("Il disait « mora mora » à chaque virage.");
  });

  it("dégrade proprement un corps sans aucun marqueur", () => {
    // redaction.py laisse passer la prose libre du modèle : le rendu ne doit
    // jamais échouer sur un marqueur absent.
    const b = decouperRecit("On est partis à l'aube.\nLa route était longue.");
    expect(b.citation).toBeNull();
    expect(b.prose).toEqual(["On est partis à l'aube.", "La route était longue."]);
  });

  it("garde la ligne 📍 en prose quand aucune colonne ne nomme le lieu", () => {
    const b = decouperRecit("📍 Chez Olivia — Nosy Iranja\n\n« Bivouac magique. »", {
      lieuConnu: false,
    });
    expect(b.prose).toEqual(["Chez Olivia — Nosy Iranja"]);
  });

  it("ne perd pas une deuxième ligne d'un même marqueur", () => {
    const b = decouperRecit("🧭 face à la plage\n🧭 derrière le marché\n📞 034 00 000 00\n📞 032 11 111 11");
    expect(b.repere).toBe("face à la plage");
    expect(b.telephone).toBe("034 00 000 00");
    expect(b.prose).toEqual(["derrière le marché", "032 11 111 11"]);
  });

  it("ne rend que des blocs vides sur un corps absent", () => {
    const b = decouperRecit(null);
    expect(b).toEqual({
      citation: null,
      prose: [],
      repere: null,
      prix: null,
      telephone: null,
      source: null,
    });
  });
});

describe("numeroAppelable", () => {
  it("garde les chiffres et le plus", () => {
    expect(numeroAppelable("038 90 794 95")).toBe("0389079495");
    expect(numeroAppelable("+261 34 20 150 58")).toBe("+261342015058");
  });

  it("refuse ce qui n'est pas un numéro", () => {
    expect(numeroAppelable("sur demande")).toBeNull();
    expect(numeroAppelable(null)).toBeNull();
  });
});

describe("dateDuReleve", () => {
  it("garde la partie datée, pas le montant déjà porté par la colonne", () => {
    expect(dateDuReleve("20 000 Ar le plat — relevé le 24/08/2026")).toBe("relevé le 24/08/2026");
    expect(dateDuReleve("25 000 Ar la portion — lu le 24/08/2026 (date de publication inconnue)")).toBe(
      "lu le 24/08/2026 (date de publication inconnue)",
    );
    expect(dateDuReleve("20 000 Ar")).toBeNull();
    expect(dateDuReleve(null)).toBeNull();
  });
});
