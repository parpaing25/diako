import {
  Bell,
  Bookmark,
  Briefcase,
  CalendarDays,
  Compass,
  Map,
  Home,
  MessageCircle,
  Mountain,
  Plus,
  Route,
  Search,
  Settings,
  Sun,
  Trees,
  User,
  UtensilsCrossed,
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

/**
 * Les 5 emplacements de la barre du bas (mobile), avec « Publier » AU CENTRE.
 *
 * ⚠ « GOÛTS » A PRIS LA PLACE DE « RECHERCHER » (ecran M1 du design final).
 *   Ce n'est pas un arbitrage esthetique : la recherche est deja dans l'entete,
 *   sur toutes les pages, alors que l'aventure culinaire n'avait aucune porte
 *   d'entree. Et c'est la seule mecanique du produit qui fonctionne avec un
 *   seul membre inscrit — marquer un plat goute n'a besoin de personne.
 */
export const NAV_PRINCIPAL: NavItem[] = [
  { to: "/", label: "Fil", icon: Home, pret: true },
  { to: "/explorer", label: "Explorer", icon: Compass, pret: true },
  { to: "/publier", label: "Publier", icon: Plus, pret: true },
  { to: "/gouts", label: "Goûts", icon: UtensilsCrossed, pret: true },
  { to: "/messages", label: "Messages", icon: MessageCircle, pret: true },
];

/**
 * Le rail desktop et le menu mobile : tout le produit (ecran D1).
 *
 * ⚠ TOUTES CES ENTREES MENENT A UN ECRAN BRANCHE SUR UNE VRAIE TABLE. La regle
 *   du projet est explicite : aucune entree de navigation vers un ecran non
 *   branche, parce qu'un onglet vide coute plus cher en confiance que son
 *   absence. Les circuits, les sites et les evenements sont vides AUJOURD'HUI,
 *   mais leurs tables existent depuis la migration 0032 et ce qu'on y ecrit se
 *   garde — la difference est entiere.
 */
export const NAV_COMPLET: NavItem[] = [
  { to: "/", label: "Fil", icon: Home, pret: true },
  { to: "/explorer", label: "Explorer les destinations", icon: Compass, pret: true },
  { to: "/plats", label: "Atlas des plats", icon: UtensilsCrossed, pret: true },
  { to: "/circuits", label: "Circuits", icon: Route, pret: true },
  { to: "/sites", label: "Sites et parcs", icon: Trees, pret: true },
  { to: "/evenements", label: "Événements", icon: CalendarDays, pret: true },
  /* ⚠ AJOUTE APRES L'AUDIT : `/projet` n'avait qu'UN SEUL lien dans tout le
     depot — la carte du bas de SideNav, qui n'apparait qu'a 1280 px. Sur la
     cible du produit (390 px), l'ecran que le code decrit comme « le seul
     endroit ou l'offre vient au voyageur » n'etait joignable qu'en tapant
     l'URL a la main. */
  { to: "/projet", label: "Mon projet de voyage", icon: Compass, pret: true },
  { to: "/quand-partir", label: "Quand partir", icon: Sun, pret: true },
  { to: "/y-aller", label: "Y aller", icon: Route, pret: true },
  { to: "/guides", label: "Guides", icon: Mountain, pret: true },
  { to: "/carte", label: "Carte", icon: Map, pret: true },
  { to: "/recherche", label: "Rechercher", icon: Search, pret: true },
  { to: "/publier", label: "Publier", icon: Plus, pret: true },
  { to: "/favoris", label: "Mon carnet", icon: Bookmark, pret: true },
  { to: "/gouts", label: "Mon carnet de goûts", icon: UtensilsCrossed, pret: true },
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
