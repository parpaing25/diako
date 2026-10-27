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

/* ── UN REPÈRE QUI N'EN EST PAS UN ─────────────────────────────────────── */

describe("repères fabriqués par le collecteur", () => {
  /**
   * 🔴 L'INCIDENT, 27/10/2026. Le fil affichait sous une photo de baobab :
   *    « 🧭 face à cette épreuve ». Le récit parlait d'un arbre en danger ;
   *    le collecteur avait pris la locution « face à » pour un repère. Deux
   *    autres sur les onze récits marqués : « 🧭 au bout de la nuit, jusqu'au
   *    petit matin ! » (un festival), et un vrai, « 🧭 sur la route de
   *    Mahajanga ».
   *
   * ⚠ LE TEST DE CRÉDIBILITÉ EST LA MAJUSCULE, et c'est volontairement étroit :
   *   un repère sert à TROUVER un endroit, donc il nomme quelque chose — une
   *   enseigne, une rue, une ville. Une suite de mots communs n'oriente
   *   personne, et affichée sous une boussole elle affirme une information
   *   qui n'existe pas.
   */
  it("écarte un repère sans aucun nom propre", () => {
    expect(decouperRecit("🧭 face à cette épreuve").repere).toBeNull();
    expect(decouperRecit("🧭 au bout de la nuit, jusqu'au petit matin !").repere).toBeNull();
  });

  it("garde un repère qui nomme un endroit", () => {
    expect(decouperRecit("🧭 sur la route de Mahajanga").repere).toBe("sur la route de Mahajanga");
    expect(decouperRecit("🧭 en face N'Hair Beauty").repere).toBe("en face N'Hair Beauty");
  });

  it("n'invente pas de prose avec le repère écarté", () => {
    const b = decouperRecit("🧭 face à cette épreuve");
    expect(b.prose).toEqual([]);
  });
  /**
   * ⚠ LE CORPUS RÉEL, FIGÉ. Les 11 récits publiés qui portaient la boussole
   *   le 27/10/2026, relus un par un. Cinq orientent, six sont des morceaux de
   *   phrase. Toute règle qui remplacera celle d'aujourd'hui devra repasser
   *   ces onze cas — c'est pour cela qu'ils sont écrits ici en entier, et pas
   *   résumés en deux exemples choisis.
   */
  const CORPUS_27_10 = {
    gardes: [
      "À 20 km du Cap Sainte-Marie et à environ 31 km au sud de Beloha, district de Beloha, commune de Tranovaho",
      "En face La Promenade",
      "en face N'Hair Beauty",
      "entre Ambanitsena et Sahamamy, vers Antsapanana",
      "sur la route de Mahajanga",
    ],
    ecartes: [
      "Après les festivités, quoi de mieux qu’un généreux sandwich accompagné d’une boisson bien chaud",
      "après une journée à Nosy Be",
      "au bout de la nuit, jusqu’au petit matin !",
      "derrière cette richesse minérale se cache une réalité beaucoup moins brillante",
      "face à cette épreuve",
      "face, Nosy Be révèle toute sa magie",
    ],
  };

  it("garde les 5 repères du corpus qui orientent vraiment", () => {
    for (const r of CORPUS_27_10.gardes) {
      expect(decouperRecit(`🧭 ${r}`).repere, r).toBe(r);
    }
  });

  it("écarte les 6 morceaux de phrase du corpus", () => {
    for (const r of CORPUS_27_10.ecartes) {
      expect(decouperRecit(`🧭 ${r}`).repere, r).toBeNull();
    }
  });
});
