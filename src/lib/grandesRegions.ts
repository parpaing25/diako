/**
 * LES GRANDES RÉGIONS — un premier tri à cinq entrées, pas à vingt-trois.
 *
 * 🔴 CE QUE ÇA REMPLACE : RIEN. Le catalogue d'Explorer était une liste
 *    alphabétique de 520 destinations, sans le moindre filtre géographique.
 *    Chercher où aller dans le Nord voulait dire faire défiler d'Ambalavao à
 *    Vohipeno en connaissant déjà les noms — c'est-à-dire n'avoir plus besoin
 *    du catalogue.
 *
 * ⚠ POURQUOI PAS LES 23 RÉGIONS DIRECTEMENT. Elles sont administratives, et un
 *   voyageur — malgache comme étranger — ne pense pas en « Fitovinany » : il
 *   pense « la côte est ». Vingt-trois boutons, c'est aussi une barre de
 *   filtres plus haute que les résultats sur un téléphone. Les cinq grandes
 *   régions donnent l'entrée, les régions administratives restent dessous pour
 *   qui sait ce qu'il cherche.
 *
 * ⚠ LES 23 RÉGIONS Y SONT TOUTES, ET UNE SEULE FOIS. C'est vérifié par un test
 *   à l'exécution plus bas : une région oubliée disparaîtrait silencieusement
 *   du catalogue — ses destinations ne seraient JAMAIS atteignables par le
 *   filtre, sans qu'aucune erreur ne le signale.
 *
 * ⚠ Alaotra-Mangoro est rangée à l'EST. Elle est enclavée, mais c'est la
 *   région d'Andasibe et du corridor forestier : le voyageur qui la cherche
 *   descend la route de Tamatave, il ne visite pas les Hauts Plateaux.
 */
export interface GrandeRegion {
  code: string;
  libelle: string;
  regions: string[];
}

export const GRANDES_REGIONS: GrandeRegion[] = [
  { code: "nord", libelle: "Nord", regions: ["Diana", "Sava"] },
  {
    code: "hauts-plateaux",
    libelle: "Hauts Plateaux",
    regions: [
      "Analamanga",
      "Vakinankaratra",
      "Itasy",
      "Bongolava",
      "Amoron'i Mania",
      "Haute Matsiatra",
    ],
  },
  {
    code: "est",
    libelle: "Côte Est",
    regions: [
      "Analanjirofo",
      "Atsinanana",
      "Alaotra-Mangoro",
      "Vatovavy",
      "Fitovinany",
      "Atsimo-Atsinanana",
    ],
  },
  {
    code: "ouest",
    libelle: "Ouest",
    regions: ["Boeny", "Sofia", "Betsiboka", "Melaky", "Menabe"],
  },
  {
    code: "sud",
    libelle: "Sud",
    regions: ["Atsimo-Andrefana", "Androy", "Anosy", "Ihorombe"],
  },
];

/** Les 23 régions telles qu'elles sont ÉCRITES dans `places.region`. Toute
 *  divergence d'orthographe casse le filtre en silence — « Amoron'i Mania »
 *  avec une apostrophe droite n'est pas « Amoron’i Mania » avec une courbe. */
export const REGIONS_ADMIN = GRANDES_REGIONS.flatMap((g) => g.regions);

if (import.meta.env.DEV) {
  const vues = new Set<string>();
  for (const r of REGIONS_ADMIN) {
    if (vues.has(r)) console.error(`[grandesRegions] « ${r} » est rangée deux fois.`);
    vues.add(r);
  }
  if (vues.size !== 23)
    console.error(`[grandesRegions] ${vues.size} régions rangées au lieu de 23.`);
}

export function grandeRegionDe(region: string | null): GrandeRegion | null {
  if (!region) return null;
  return GRANDES_REGIONS.find((g) => g.regions.includes(region)) ?? null;
}
