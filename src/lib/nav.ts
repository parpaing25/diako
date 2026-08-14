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
  { to: "/explorer", label: "Explorer", icon: Compass, pret: true },
  { to: "/publier", label: "Publier", icon: Plus, pret: true },
  { to: "/recherche", label: "Rechercher", icon: Search, pret: true },
  { to: "/compte", label: "Compte", icon: User, pret: true },
];

/** Le rail desktop et le menu mobile : tout le produit. */
export const NAV_COMPLET: NavItem[] = [
  { to: "/", label: "Accueil", icon: Home, pret: true },
  { to: "/explorer", label: "Explorer", icon: Compass, pret: true },
  { to: "/recherche", label: "Rechercher", icon: Search, pret: true },
  { to: "/publier", label: "Publier", icon: Plus, pret: true },
  { to: "/favoris", label: "Mon carnet", icon: Bookmark, pret: true },
  { to: "/messages", label: "Messages", icon: MessageCircle, pret: true },
  { to: "/notifications", label: "Notifications", icon: Bell, pret: true },
  { to: "/pro", label: "Espace pro", icon: Briefcase, pret: true },
  { to: "/compte", label: "Mon compte", icon: User, pret: true },
  { to: "/parametres", label: "Paramètres", icon: Settings, pret: true },
];

/** Ce qui est réellement en construction, affiché tel quel aux visiteurs. */
export const FEUILLE_DE_ROUTE = [
  { quoi: "Fil des voyageurs", etat: "ouvert" as const },
  { quoi: "178 destinations et 95 plats référencés", etat: "ouvert" as const },
  { quoi: "Recherche par destination, par plat et par budget", etat: "ouvert" as const },
  { quoi: "Pages des hôtels, restaurants et agences", etat: "ouvert" as const },
  { quoi: "Premiers établissements référencés", etat: "en cours" as const },
  { quoi: "Réservation et paiement", etat: "à venir" as const },
];
