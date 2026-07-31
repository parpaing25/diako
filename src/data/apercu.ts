/**
 * ⚠️⚠️  DONNÉES D'APERÇU — NE SONT PAS DE VRAIES DONNÉES  ⚠️⚠️
 *
 * Elles servent UNIQUEMENT à montrer à quoi ressembleront les écrans une fois
 * les Lots 1 à 4 livrés. Tout écran qui les affiche DOIT porter le bandeau
 * <BandeauApercu /> : l'utilisateur doit savoir en une seconde qu'il regarde
 * une maquette.
 *
 * La version précédente de Diako affichait « Hôtel Sakamanga 4.8 (245 avis) »
 * et « Festival Donia 15 Déc 2024 » comme si c'était réel. On ne rejoue pas ça.
 *
 * ➜ À SUPPRIMER intégralement au Lot 2, quand les vraies pages arrivent.
 */

export const APERCU = true;

export interface DestinationApercu {
  slug: string;
  nom: string;
  region: string;
  saison: string;
  couleur: string;
  emoji: string;
}

/** Destinations réelles de Madagascar — les noms et régions sont exacts,
 *  mais aucun établissement n'y est encore référencé. */
export const DESTINATIONS: DestinationApercu[] = [
  { slug: "ampefy", nom: "Ampefy", region: "Itasy", saison: "avril à novembre", couleur: "from-sky-500 to-cyan-700", emoji: "🌋" },
  { slug: "nosy-be", nom: "Nosy Be", region: "Diana", saison: "mai à décembre", couleur: "from-cyan-500 to-teal-700", emoji: "🏝️" },
  { slug: "andasibe", nom: "Andasibe", region: "Alaotra-Mangoro", saison: "toute l'année", couleur: "from-green-600 to-emerald-800", emoji: "🌳" },
  { slug: "isalo", nom: "Isalo", region: "Ihorombe", saison: "avril à octobre", couleur: "from-amber-500 to-orange-700", emoji: "🏜️" },
  { slug: "sainte-marie", nom: "Sainte-Marie", region: "Analanjirofo", saison: "juillet à septembre", couleur: "from-blue-500 to-indigo-700", emoji: "🐋" },
  { slug: "morondava", nom: "Morondava", region: "Menabe", saison: "avril à novembre", couleur: "from-orange-500 to-red-700", emoji: "🌅" },
  { slug: "antsirabe", nom: "Antsirabe", region: "Vakinankaratra", saison: "toute l'année", couleur: "from-violet-500 to-purple-700", emoji: "🚲" },
  { slug: "ifaty", nom: "Ifaty", region: "Atsimo-Andrefana", saison: "avril à novembre", couleur: "from-teal-500 to-cyan-700", emoji: "🤿" },
];

/** Plats malgaches réels — le référentiel complet arrive au Lot 1. */
export const PLATS = [
  { nom: "Romazava", emoji: "🍲" },
  { nom: "Ravitoto sy henakisoa", emoji: "🥬" },
  { nom: "Henakisoa sy amalona", emoji: "🐟" },
  { nom: "Vary amin'anana", emoji: "🍚" },
  { nom: "Masikita", emoji: "🍢" },
  { nom: "Mofo gasy", emoji: "🥞" },
  { nom: "Koba ravina", emoji: "🍡" },
  { nom: "Poisson grillé", emoji: "🐠" },
];

/** Recherches que le moteur saura traiter au Lot 3. */
export const RECHERCHES_EXEMPLE = [
  "un hôtel à Ampefy",
  "où manger du ravitoto",
  "quand partir à Sainte-Marie",
  "circuit 5 jours dans le Sud",
  "restaurant ouvert maintenant",
  "bungalow moins de 100 000 Ar",
];

/* ------------------------------------------------------------------------ */
/*  Etablissements d'apercu — MAQUETTE, en attendant les vraies pages (Lot 2). */
/*  Le FIL, lui, est desormais REEL : il n'y a plus de publications d'apercu.  */
/* ------------------------------------------------------------------------ */
import type { PlaceApercu } from "@/components/PlaceCard";

export const PLACES: PlaceApercu[] = [
  { slug: "apercu-hotel-ampefy", nom: "Bungalow vue lac", categorie: "hôtel", lieu: "Ampefy, Itasy", note: 4.6, avis: 18, prixDepuis: "85 000 Ar", unite: "la nuit, par chambre", emoji: "🛖", couleur: "from-sky-500 to-cyan-700", verifie: true },
  { slug: "apercu-resto-tana", nom: "Chez Mariette", categorie: "restaurant", lieu: "Analakely, Tana", note: 4.4, avis: 42, prixDepuis: "12 000 Ar", unite: "le plat", emoji: "🍲", couleur: "from-orange-500 to-red-700" },
  { slug: "apercu-agence-rn7", nom: "Circuit RN7 · 8 jours", categorie: "agence", lieu: "Départ Antananarivo", note: 4.8, avis: 9, prixDepuis: "2 400 000 Ar", unite: "par pers. (base 2)", emoji: "🚙", couleur: "from-violet-500 to-purple-700", verifie: true },
  { slug: "apercu-ecolodge-ifaty", nom: "Écolodge bord de mer", categorie: "hôtel", lieu: "Ifaty, Tuléar", note: 4.5, avis: 27, prixDepuis: "120 000 Ar", unite: "la nuit, par chambre", emoji: "🏝️", couleur: "from-teal-500 to-cyan-800" },
];
