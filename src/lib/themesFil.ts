import {
  Bed,
  Car,
  Compass,
  MapPin,
  UtensilsCrossed,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { chargerAtlas, type PlatAtlas } from "@/lib/decouverte";
import {
  chargerDestinations,
  chercherPages,
  type Lieu,
  type ResultatPage,
} from "@/lib/etablissements";

/**
 * LES SIX THÈMES DU FIL — et ce que chacun charge VRAIMENT.
 *
 * 🔴 CE QUE ÇA CORRIGE. Le fil était un seul flux indifférencié : 417
 *    publications, un récit de Nosy Be entre une photo de Tuléar et un bon plan
 *    de taxi-brousse. Six pastilles thématiques existaient bien sur l'accueil
 *    (`src/lib/categories.ts`) mais elles EXPÉDIAIENT ailleurs — `/recherche`,
 *    `/sites`, `/location`. Il fallait quitter le fil pour le filtrer.
 *
 * ⚠ CHAQUE ONGLET REPOSE SUR DEUX SOURCES, ET C'EST LE POINT DE TOUT L'ÉCRAN.
 *   Les récits seuls ne remplissent PAS ces thèmes — mesuré le 01/09/2026 :
 *   restaurants 1 récit, plats 3, location 0, voyages 0. La matière est dans
 *   l'annuaire (3 254 fiches, 95 plats, 508 destinations), pas dans le fil.
 *   Un onglet ne montre donc jamais « rien » : il montre les FICHES du thème,
 *   puis les récits qui s'y rattachent — le bloc « Ce qu'on en raconte ».
 *
 * ⚠ LES CHIFFRES NE SONT PAS ÉCRITS ICI. Ils viennent de `fil_themes_comptes()`
 *   (migration 0115), qui compte les récits avec LA MÊME fonction que le fil.
 *   Le dépôt a déjà payé deux fois le chiffre recopié à la main : « 178
 *   destinations » quand il y en avait 508, « 2 469 sites » quand il y en avait
 *   moins. Aucun compteur en dur dans ce fichier.
 */

export type CleTheme =
  | "th_hotels"
  | "th_restaurants"
  | "th_plats"
  | "th_lieux"
  | "th_location"
  | "th_voyages";

/** Ce que le bloc de fiches sait afficher. Trois formes, trois cartes. */
export type FormeFiches = "page" | "plat" | "lieu";

export interface ThemeFil {
  cle: CleTheme;
  /** Le libellé du bouton, à côté de « Près de moi ». Court : la barre défile. */
  label: string;
  icone: LucideIcon;
  forme: FormeFiches;
  /** Le nom de ce qu'on compte, accordé par `libelleFiches()`. */
  motFiches: [singulier: string, pluriel: string];
  /**
   * ⚠ LE GENRE DU MOT, parce que le titre l'accorde. Sans lui l'écran écrivait
   *   « 508 destinations référencés » et « 35 agences de voyage référencés ».
   *   Une faute d'accord sur le titre principal d'un onglet se lit comme un
   *   texte généré à la va-vite — sur un produit dont l'argument est la
   *   précision des données, c'est cher payé pour une lettre.
   */
  feminin?: boolean;
  /** Où voir la liste complète — un écran qui existe et qui filtre déjà. */
  vers: string;
  /** Un second chemin quand le thème en a un vrai. `null` sinon. */
  aussi?: { libelle: string; vers: string };
  /** ① Ce qui manque, quand aucun récit ne se rattache au thème. */
  videManque: string;
  /** ② L'action offerte. Un état vide sans action est un cul-de-sac. */
  videAction: { libelle: string; lien: string };
}

export const THEMES: ThemeFil[] = [
  {
    cle: "th_hotels",
    label: "Hôtels",
    icone: Bed,
    forme: "page",
    motFiches: ["hôtel", "hôtels"],
    vers: "/recherche?cat=hotel",
    videManque: "Personne n'a encore raconté son séjour dans un hôtel.",
    videAction: { libelle: "Raconter un séjour", lien: "/publier" },
  },
  {
    cle: "th_restaurants",
    label: "Restaurants",
    icone: UtensilsCrossed,
    forme: "page",
    motFiches: ["restaurant", "restaurants"],
    vers: "/recherche?cat=restaurant",
    videManque: "Personne n'a encore raconté un repas dans un restaurant référencé.",
    videAction: { libelle: "Raconter un repas", lien: "/publier" },
  },
  {
    cle: "th_plats",
    label: "Plats",
    icone: Utensils,
    forme: "plat",
    motFiches: ["plat", "plats"],
    vers: "/plats",
    /* ⚠ CE THÈME NE PEUT PAS SE REMPLIR SEUL, et l'écran doit le dire sans
       détour : aucune publication ne porte de plat rattaché à l'atlas (mesuré
       le 01/09/2026 : 0 `dish_id` sur 417). Le formulaire de publication exige
       pourtant le plat sur le type « assiette » — c'est donc une question de
       volume, pas de plomberie. */
    videManque:
      "Aucune publication n'est encore rattachée à un plat de l'atlas — c'est le champ « plat » du type « Assiette » qui les y range.",
    videAction: { libelle: "Publier une assiette", lien: "/publier" },
  },
  {
    cle: "th_lieux",
    label: "Lieux",
    icone: MapPin,
    forme: "lieu",
    motFiches: ["destination", "destinations"],
    feminin: true,
    vers: "/explorer",
    aussi: { libelle: "Les sites à visiter", vers: "/sites" },
    videManque: "Aucun récit n'est encore rattaché à une destination.",
    videAction: { libelle: "Raconter un voyage", lien: "/publier" },
  },
  {
    cle: "th_location",
    label: "Location voiture",
    icone: Car,
    forme: "page",
    motFiches: ["loueur", "loueurs et transporteurs"],
    /* ⚠ Vers `/location` et non `/recherche?cat=…` : cet écran résume la grille
       des véhicules de chaque loueur (`vehicle_offers`, migration 0114), ce que
       la recherche brute ne sait pas faire. Même raison qu'en `categories.ts`. */
    vers: "/location",
    videManque: "Personne n'a encore raconté une location de véhicule.",
    videAction: { libelle: "Raconter une location", lien: "/publier" },
  },
  {
    cle: "th_voyages",
    label: "Voyages organisés",
    icone: Compass,
    forme: "page",
    motFiches: ["agence de voyage", "agences de voyage"],
    feminin: true,
    vers: "/recherche?cat=agence_voyage",
    aussi: { libelle: "Les circuits", vers: "/circuits" },
    videManque: "Personne n'a encore raconté un voyage organisé par une agence.",
    videAction: { libelle: "Raconter un circuit", lien: "/publier" },
  },
];

export const theme = (cle: string): ThemeFil | undefined =>
  THEMES.find((t) => t.cle === cle);

export const estTheme = (m: string): m is CleTheme =>
  THEMES.some((t) => t.cle === m);

/** « 1 hôtel » / « 1 428 hôtels ». Le nombre vient de la base, jamais d'ici. */
export function libelleFiches(t: ThemeFil, n: number): string {
  return `${n.toLocaleString("fr-FR")} ${n <= 1 ? t.motFiches[0] : t.motFiches[1]}`;
}

/**
 * Le titre du bloc de fiches, ACCORDÉ.
 *
 * ⚠ UN SEUL ENDROIT POUR L'ACCORD. Écrit dans le JSX comme
 *   `{libelleFiches(...)}{" référencés"}`, le titre donnait « 508 destinations
 *   référencés » et « 35 agences de voyage référencés ». Le genre et le nombre
 *   se décident ici, avec la donnée qui les porte.
 */
export function titreFiches(t: ThemeFil, n: number): string {
  return `${libelleFiches(t, n)} référencé${t.feminin ? "e" : ""}${n <= 1 ? "" : "s"}`;
}

/* ── Le chargement des fiches d'un thème ───────────────────────────────── */

export type FichesTheme =
  | { forme: "page"; liste: ResultatPage[] }
  | { forme: "plat"; liste: PlatAtlas[] }
  | { forme: "lieu"; liste: Lieu[] };

/**
 * Les fiches à poser en tête d'un onglet.
 *
 * ⚠ ON RÉUTILISE LES CHARGEURS EXISTANTS, on n'en écrit pas de nouveaux.
 *   `chercherPages`, `chargerAtlas` et `chargerDestinations` portent déjà les
 *   colonnes énumérées, la pagination par curseur et les pièges PostgREST
 *   documentés (la liste de colonnes en UNE seule chaîne littérale, sans quoi
 *   le typage du retour dégénère). En recopier une variante ici, c'est
 *   reperdre ces trois leçons.
 *
 * ⚠ CE BLOC NE PAGINE PAS, et c'est voulu : c'est un aperçu, suivi d'un lien
 *   vers l'écran qui, lui, va jusqu'au bout. Le défilement infini de la page
 *   appartient aux RÉCITS — sinon deux scrolls infinis s'empilent et aucun des
 *   deux n'est atteignable.
 */
export async function chargerFichesTheme(
  t: ThemeFil,
  limite = 8
): Promise<FichesTheme> {
  switch (t.cle) {
    case "th_plats":
      return { forme: "plat", liste: await chargerAtlas({ limite }) };
    case "th_lieux":
      return { forme: "lieu", liste: await chargerDestinations(limite) };
    case "th_hotels":
      return { forme: "page", liste: await chercherPages({ categorie: "hotel", limite }) };
    case "th_restaurants":
      return { forme: "page", liste: await chercherPages({ categorie: "restaurant", limite }) };
    case "th_location":
      /* ⚠ `chercherPages` ne prend qu'UNE catégorie. Les transporteurs sont
         comptés avec les loueurs côté serveur (`fil_cats_du_theme`) mais ne
         peuvent pas être demandés dans le même appel : l'aperçu montre les
         loueurs, et `/location` — la destination du lien — sert bien les deux
         sections. Le compteur reste celui du serveur, donc juste. */
      return { forme: "page", liste: await chercherPages({ categorie: "location_vehicule", limite }) };
    case "th_voyages":
      return { forme: "page", liste: await chercherPages({ categorie: "agence_voyage", limite }) };
  }
}
