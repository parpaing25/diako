import { describe, expect, it } from "vitest";
import {
  construireCircuitJsonLd,
  construireFicheJsonLd,
  construireFilAriane,
  construireOffresChambres,
  filArianeFiche,
  slug,
  typeSchema,
  type FichePourJsonLd,
} from "./jsonld";

/**
 * Le balisage est ce qui décide si Google affiche une ligne bleue ou une fiche
 * avec la note et la fourchette de prix. Deux règles y sont vérifiées, parce
 * que les deux ont déjà été enfreintes sur le projet frère :
 *   ① le type dit la vérité (pas de « location de voiture » sur un logement) ;
 *   ② aucune clé vide ni aucune note sans avis n'est émise.
 */

const base: FichePourJsonLd = {
  slug: "kavitaha-hotel",
  name: "Kavitaha Hôtel Restaurant",
  categories: ["hotel", "restaurant"],
  place: { name: "Ampefy", region: "Itasy" },
};

describe("typeSchema", () => {
  it("un écolodge hôtel ET restaurant reste un LodgingBusiness", () => {
    // C'est ce qu'on vient y chercher : dormir. Le reste est décrit par
    // servesCuisine.
    expect(typeSchema(["hotel", "restaurant"])).toBe("LodgingBusiness");
  });

  it("un restaurant seul est un Restaurant", () => {
    expect(typeSchema(["restaurant"])).toBe("Restaurant");
  });

  it("une agence est une TravelAgency", () => {
    expect(typeSchema(["agence_voyage"])).toBe("TravelAgency");
  });

  it("un métier sans type dédié retombe sur LocalBusiness, pas sur un type flatteur", () => {
    expect(typeSchema(["guide"])).toBe("LocalBusiness");
    expect(typeSchema([])).toBe("LocalBusiness");
  });
});

describe("construireFicheJsonLd", () => {
  it("n'émet aucune clé vide", () => {
    const j = construireFicheJsonLd(base);
    expect(j).not.toHaveProperty("telephone");
    expect(j).not.toHaveProperty("description");
    expect(j).not.toHaveProperty("image");
    expect(j).not.toHaveProperty("sameAs");
  });

  it("pose l'URL canonique de la fiche", () => {
    const j = construireFicheJsonLd(base);
    expect(j.url).toBe("https://diako.fonenako.mg/p/kavitaha-hotel");
    expect(j["@id"]).toBe("https://diako.fonenako.mg/p/kavitaha-hotel");
  });

  it("N'INVENTE PAS de note quand personne n'a noté", () => {
    const j = construireFicheJsonLd({ ...base, rating_avg: 0, rating_count: 0 });
    expect(j).not.toHaveProperty("aggregateRating");
  });

  it("émet la note dès qu'il existe de vrais avis", () => {
    const j = construireFicheJsonLd({ ...base, rating_avg: 4.5, rating_count: 12 });
    expect(j.aggregateRating).toMatchObject({ ratingValue: 4.5, reviewCount: 12 });
  });

  it("met l'adresse à Madagascar même sans rue", () => {
    const j = construireFicheJsonLd(base);
    expect(j.address).toMatchObject({ addressLocality: "Ampefy", addressCountry: "MG" });
  });

  it("n'émet pas de coordonnées quand elles sont absentes", () => {
    expect(construireFicheJsonLd(base)).not.toHaveProperty("geo");
    expect(construireFicheJsonLd({ ...base, lat: -19.03, lng: 46.71 }).geo).toMatchObject({
      latitude: -19.03,
    });
  });

  it("traduit le niveau de prix en fourchette symbolique", () => {
    expect(construireFicheJsonLd({ ...base, price_level: 2 }).priceRange).toBe("€€");
    expect(construireFicheJsonLd({ ...base, price_level: 9 }).priceRange).toBe("€€€€");
  });

  it("liste les équipements en LocationFeatureSpecification", () => {
    const j = construireFicheJsonLd({
      ...base,
      amenities: [{ code: "piscine", label: "Piscine" }],
    });
    expect(j.amenityFeature).toEqual([
      { "@type": "LocationFeatureSpecification", name: "Piscine", value: true },
    ]);
  });

  it("ignore un jour de fermeture dans les horaires", () => {
    const j = construireFicheJsonLd({
      ...base,
      hours: [
        { jour: 1, ouvre: "08:00", ferme: "22:00", ferme_journee: false },
        { jour: 2, ouvre: null, ferme: null, ferme_journee: true },
      ],
    });
    expect(j.openingHoursSpecification).toHaveLength(1);
  });
});

describe("construireOffresChambres", () => {
  it("rend null sans chambre — plutôt qu'un catalogue vide", () => {
    expect(construireOffresChambres("x", [])).toBeNull();
  });

  it("porte le prix en ariary sur chaque offre", () => {
    const j = construireOffresChambres("kavitaha-hotel", [
      { name: "Chambre double", base_price_ar: 93000, price_unit: "chambre", max_adults: 2 },
    ]);
    const offres = j?.itemListElement as Record<string, unknown>[];
    expect(offres[0]).toMatchObject({ price: 93000, priceCurrency: "MGA" });
  });
});

describe("construireCircuitJsonLd", () => {
  it("retient le prix le PLUS BAS — c'est celui qu'on annonce", () => {
    const j = construireCircuitJsonLd("agence", {
      slug: "rn7",
      title: "RN7 en 8 jours",
      duration_days: 8,
      prices: [
        { base_pax: 2, price_ar: 4_000_000 },
        { base_pax: 4, price_ar: 2_500_000 },
      ],
    });
    expect(j.offers).toMatchObject({ price: 2_500_000 });
  });

  it("numérote l'itinéraire dans l'ordre des jours", () => {
    const j = construireCircuitJsonLd("agence", {
      slug: "rn7",
      title: "RN7",
      duration_days: 2,
      days: [
        { jour: 1, titre: "Tana → Antsirabe" },
        { jour: 2, titre: "Antsirabe → Ambositra" },
      ],
    });
    const it = j.itinerary as { itemListElement: { position: number }[] };
    expect(it.itemListElement.map((x) => x.position)).toEqual([1, 2]);
  });
});

describe("fil d'Ariane", () => {
  it("ne met pas de lien sur la dernière maille — c'est la page courante", () => {
    const j = construireFilAriane([{ nom: "Accueil", url: "/" }, { nom: "Ampefy" }]);
    const items = j.itemListElement as Record<string, unknown>[];
    expect(items[0]).toHaveProperty("item");
    expect(items[1]).not.toHaveProperty("item");
  });

  it("passe par la destination : Accueil › Ampefy › l'hôtel", () => {
    const j = filArianeFiche(base);
    const noms = (j.itemListElement as { name: string }[]).map((x) => x.name);
    expect(noms).toEqual(["Accueil", "Ampefy", "Kavitaha Hôtel Restaurant"]);
  });
});

describe("slug", () => {
  it("retire les accents — même règle qu'en base", () => {
    expect(slug("Hôtel Kavitaha")).toBe("hotel-kavitaha");
    expect(slug("Île aux Nattes")).toBe("ile-aux-nattes");
    expect(slug("  L'Arôme Lodge  ")).toBe("l-arome-lodge");
  });
});
