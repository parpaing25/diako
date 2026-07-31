import { Compass, Home, Plus, Search, User, type LucideIcon } from "lucide-react";

/**
 * Source UNIQUE de la navigation.
 * Partagée par la barre du bas (mobile), le rail latéral (desktop) et le pied
 * de page. Sur Fonenako, les libellés vivaient à trois endroits et divergeaient :
 * la barre disait « Chercher », la page s'appelait « Recherche ».
 *
 * `pret` dit la vérité : false = l'écran existe mais la fonctionnalité n'est pas
 * encore livrée. On affiche alors une pastille « bientôt » AVANT le clic, plutôt
 * que d'envoyer le visiteur dans un cul-de-sac sans prévenir.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  pret: boolean;
  /** Uniquement pour l'écran d'attente : ce que fera vraiment cette page. */
  promesse?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Accueil", icon: Home, pret: true },
  {
    to: "/explorer",
    label: "Explorer",
    icon: Compass,
    pret: false,
    promesse:
      "Parcourir Madagascar destination par destination : Ampefy, Nosy Be, Andasibe, Sainte-Marie… avec la meilleure saison pour y aller, comment s'y rendre et combien de temps de route.",
  },
  {
    to: "/publier",
    label: "Publier",
    icon: Plus,
    pret: false,
    promesse:
      "Raconter un voyage, partager une photo ou un bon plan, et taguer le lieu, l'établissement et le plat — c'est ce qui alimentera le fil.",
  },
  {
    to: "/recherche",
    label: "Rechercher",
    icon: Search,
    pret: false,
    promesse:
      "Poser une vraie question — « un hôtel à Ampefy », « où manger du ravitoto » — et obtenir une réponse directe : les établissements, leurs tarifs et le prix du plat chez chacun.",
  },
  { to: "/compte", label: "Mon compte", icon: User, pret: true },
];

/** Ce qui est réellement en construction, affiché tel quel aux visiteurs. */
export const FEUILLE_DE_ROUTE = [
  { quoi: "Créer son compte", etat: "ouvert" as const },
  { quoi: "Destinations et plats de Madagascar", etat: "en cours" as const },
  { quoi: "Pages des hôtels, restaurants et agences", etat: "à venir" as const },
  { quoi: "Recherche par plat et par destination", etat: "à venir" as const },
  { quoi: "Fil des voyageurs", etat: "à venir" as const },
];
