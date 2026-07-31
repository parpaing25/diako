import {
  Bell,
  Bookmark,
  Briefcase,
  Compass,
  Home,
  MessageCircle,
  Plus,
  Search,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

/**
 * Source UNIQUE de la navigation.
 * Partagée par la barre du bas, le rail latéral, le menu mobile et le pied de
 * page. Sur Fonenako les libellés vivaient à trois endroits et avaient
 * divergé : la barre disait « Chercher », la page s'appelait « Recherche ».
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** false = l'écran existe et est dessiné, mais rien n'est encore enregistré. */
  pret: boolean;
  promesse?: string;
}

/** Les 5 emplacements de la barre du bas (mobile). « Publier » au centre. */
export const NAV_PRINCIPAL: NavItem[] = [
  { to: "/", label: "Accueil", icon: Home, pret: true },
  { to: "/explorer", label: "Explorer", icon: Compass, pret: false },
  { to: "/publier", label: "Publier", icon: Plus, pret: false },
  { to: "/recherche", label: "Rechercher", icon: Search, pret: false },
  { to: "/compte", label: "Compte", icon: User, pret: true },
];

/** Le rail desktop et le menu mobile : tout le produit. */
export const NAV_COMPLET: NavItem[] = [
  { to: "/", label: "Accueil", icon: Home, pret: true },
  { to: "/explorer", label: "Explorer", icon: Compass, pret: false },
  { to: "/recherche", label: "Rechercher", icon: Search, pret: false },
  { to: "/publier", label: "Publier", icon: Plus, pret: false },
  { to: "/favoris", label: "Favoris", icon: Bookmark, pret: false },
  { to: "/messages", label: "Messages", icon: MessageCircle, pret: false },
  { to: "/notifications", label: "Notifications", icon: Bell, pret: false },
  { to: "/pro", label: "Espace pro", icon: Briefcase, pret: false },
  { to: "/compte", label: "Mon compte", icon: User, pret: true },
  { to: "/parametres", label: "Paramètres", icon: Settings, pret: true },
];

/** Ce qui est réellement en construction, affiché tel quel aux visiteurs. */
export const FEUILLE_DE_ROUTE = [
  { quoi: "Créer son compte", etat: "ouvert" as const },
  { quoi: "Destinations et plats de Madagascar", etat: "en cours" as const },
  { quoi: "Pages des hôtels, restaurants et agences", etat: "à venir" as const },
  { quoi: "Recherche par plat et par destination", etat: "à venir" as const },
  { quoi: "Fil des voyageurs", etat: "à venir" as const },
];
