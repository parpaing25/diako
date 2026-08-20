import {
  Bed,
  Bus,
  Landmark,
  Mountain,
  Sparkles,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";

/**
 * LES CATÉGORIES DE L'ACCUEIL — et où chacune MÈNE vraiment.
 *
 * 🔴 CE QU'ELLES FAISAIENT AVANT, C'EST-À-DIRE RIEN. Onze pastilles en haut de
 *    l'accueil — Hôtels, Restaurants, Agences, Bons plans, Plages, Parcs,
 *    Circuits, Culture, Transport, Guides. En toucher une n'ouvrait aucune
 *    liste : elle affichait un encart disant « le filtrage par catégorie
 *    fonctionnera dès que les établissements seront référencés », et le fil en
 *    dessous ne bougeait pas d'une ligne.
 *
 *    Ce message était vrai le jour où il a été écrit. Il ne l'est plus depuis
 *    l'import : l'annuaire porte 3 254 établissements publiés et 2 451 sites.
 *    C'est la même famille de défaut que le « 178 destinations » affiché quand
 *    il y en avait 508 — une phrase juste une fois, jamais relue.
 *
 * ⚠ CHAQUE CATÉGORIE PORTE MAINTENANT SA DESTINATION, et elle est réelle :
 *   `/recherche?cat=…` pour ce qui est un établissement, `/sites?type=…` pour ce
 *   qui est un lieu à voir. Les deux écrans filtrent déjà ; il ne manquait que
 *   le lien.
 *
 * 🔴 ET QUATRE CATÉGORIES ONT DISPARU : Agences, Circuits, Guides, Bons plans.
 *    Comptées en base, elles valent zéro — aucune fiche d'agence publiée, aucun
 *    circuit, aucun guide, et les 29 publications du fil sont toutes des récits.
 *    La règle du dépôt est explicite : pas d'entrée de navigation vers un écran
 *    qui ouvre sur du vide. Une pastille « Agences » bien visible qui ne mène à
 *    rien coûte plus cher qu'une pastille absente : elle donne l'impression d'un
 *    site en panne, pas d'un site jeune.
 *
 *    Elles reviendront le jour où une agence publiera — pas avant. Les chiffres
 *    en commentaire datent du 18/08/2026 ; les recompter avant d'en rajouter.
 */
export interface Categorie {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Ce que la catégorie regroupe réellement. */
  quoi: string;
  /**
   * ⚠ L'ADRESSE OÙ LA PASTILLE MÈNE. `null` pour « Tout », qui reste sur le fil.
   *   Aucune autre valeur nulle n'est admise : une catégorie sans destination
   *   n'a rien à faire dans cette liste.
   */
  vers: string | null;
}

export const CATEGORIES: Categorie[] = [
  {
    key: "all",
    label: "Tout",
    icon: Sparkles,
    color: "from-primary to-cyan-600",
    quoi: "Tout Diako",
    vers: null,
  },
  {
    key: "hotel",
    label: "Hôtels",
    icon: Bed,
    color: "from-teal-500 to-teal-700",
    quoi: "Hôtels, bungalows, écolodges et chambres d'hôte",
    vers: "/recherche?cat=hotel", // 1 421 fiches publiées
  },
  {
    key: "restaurant",
    label: "Restaurants",
    icon: UtensilsCrossed,
    color: "from-orange-500 to-red-600",
    quoi: "Restaurants, hotely gasy, snacks et salons de thé",
    vers: "/recherche?cat=restaurant", // 1 816 fiches publiées
  },
  {
    key: "plage",
    label: "Plages",
    icon: Waves,
    color: "from-sky-500 to-blue-700",
    quoi: "Plages, îles et spots de plongée",
    vers: "/sites?type=plage", // 318 sites
  },
  {
    key: "parc",
    label: "Parcs",
    icon: Mountain,
    color: "from-lime-600 to-green-700",
    quoi: "Parcs nationaux, réserves et sites naturels",
    vers: "/sites?type=parc", // 122 parcs, plus 127 réserves
  },
  {
    key: "culture",
    label: "Culture",
    icon: Landmark,
    color: "from-rose-500 to-pink-700",
    quoi: "Rova, marchés, artisanat et patrimoine bâti",
    vers: "/sites?type=patrimoine", // 299 sites
  },
  {
    key: "transport",
    label: "Transport",
    icon: Bus,
    color: "from-slate-500 to-slate-700",
    quoi: "Location de 4x4 et de véhicules avec chauffeur",
    vers: "/recherche?cat=location_vehicule", // 18 fiches publiées
  },
];

export const categorie = (key: string) => CATEGORIES.find((c) => c.key === key);
