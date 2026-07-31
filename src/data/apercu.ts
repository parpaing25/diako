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
/*  Publications d'aperçu — MAQUETTE. Ni ces personnes ni ces séjours        */
/*  n'existent. Affichées uniquement sous le bandeau <BandeauApercu />.      */
/* ------------------------------------------------------------------------ */
import type { PostApercu } from "@/components/PostCard";
import type { PlaceApercu } from "@/components/PlaceCard";

export const POSTS: PostApercu[] = [
  {
    id: "a1",
    auteur: "Hery R.",
    quand: "il y a 2 h",
    lieu: "Ampefy, Itasy",
    texte:
      "Week-end au lac Itasy. Départ de Tana à 6 h, on y est à 9 h par la RN1 — la route est bonne jusqu'à Analavory.\nLa chute de la Lily vaut vraiment le détour en cette saison, il y a de l'eau.",
    page: "Bungalow vue lac",
    media: { emoji: "🌋", couleur: "from-sky-400 to-cyan-700", ratio: "4/3" },
    reactions: 34,
    commentaires: 7,
  },
  {
    id: "a2",
    auteur: "Chez Mariette",
    role: "Restaurant",
    verifie: true,
    quand: "il y a 5 h",
    lieu: "Analakely, Antananarivo",
    texte:
      "Le ravitoto sy henakisoa est prêt tous les mercredis et samedis midi. Sur place ou à emporter.",
    plat: "Ravitoto sy henakisoa",
    media: { emoji: "🥬", couleur: "from-green-500 to-emerald-800", ratio: "4/3" },
    reactions: 58,
    commentaires: 12,
  },
  {
    id: "a3",
    auteur: "Naina A.",
    quand: "hier",
    lieu: "Sainte-Marie",
    texte:
      "Sortie baleines ce matin. Trois sauts à moins de cinquante mètres du bateau. La saison commence bien.",
    media: { emoji: "🐋", couleur: "from-blue-500 to-indigo-800", ratio: "16/9" },
    reactions: 126,
    commentaires: 23,
  },
];

export const PLACES: PlaceApercu[] = [
  { slug: "apercu-hotel-ampefy", nom: "Bungalow vue lac", categorie: "hôtel", lieu: "Ampefy, Itasy", note: 4.6, avis: 18, prixDepuis: "85 000 Ar", unite: "la nuit, par chambre", emoji: "🛖", couleur: "from-sky-500 to-cyan-700", verifie: true },
  { slug: "apercu-resto-tana", nom: "Chez Mariette", categorie: "restaurant", lieu: "Analakely, Tana", note: 4.4, avis: 42, prixDepuis: "12 000 Ar", unite: "le plat", emoji: "🍲", couleur: "from-orange-500 to-red-700" },
  { slug: "apercu-agence-rn7", nom: "Circuit RN7 · 8 jours", categorie: "agence", lieu: "Départ Antananarivo", note: 4.8, avis: 9, prixDepuis: "2 400 000 Ar", unite: "par pers. (base 2)", emoji: "🚙", couleur: "from-violet-500 to-purple-700", verifie: true },
  { slug: "apercu-ecolodge-ifaty", nom: "Écolodge bord de mer", categorie: "hôtel", lieu: "Ifaty, Tuléar", note: 4.5, avis: 27, prixDepuis: "120 000 Ar", unite: "la nuit, par chambre", emoji: "🏝️", couleur: "from-teal-500 to-cyan-800" },
];
