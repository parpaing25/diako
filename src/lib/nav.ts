import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  Car,
  Compass,
  Map,
  Home,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sun,
  Route,
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
  /**
   * ⚠ `false` = ABSENT DU RAIL DESKTOP, présent partout ailleurs.
   *
   * 🔴 POURQUOI UN DRAPEAU ET PAS UNE SUPPRESSION. Publier, Messages,
   *    Notifications et Mon compte sont déjà des icônes de l'en-tête sur grand
   *    écran : les répéter dans le rail fait doublon, et la liste de vingt
   *    entrées devient illisible.
   *
   *    Mais `NAV_COMPLET` alimente AUSSI le tiroir mobile et le pied de page.
   *    Les retirer de la liste les ferait disparaître à 390 px — où l'en-tête
   *    porte moins d'icônes, et où rien ne se plaignait. On filtre le rail,
   *    on ne coupe pas la source.
   */
  railDesktop?: boolean;
  /**
   * ⚠ LE GROUPE DU RAIL. Seize entrees a plat se lisent comme une liste de
   *   courses : l'oeil ne sait pas par ou commencer. Trois intentions —
   *   DECOUVRIR, PREPARER, CHEZ MOI — donnent trois points d'entree.
   */
  groupe?: "decouvrir" | "preparer" | "chez_moi";
  /** Le compte affiche a droite de l'entree, quand il est CONNU et VRAI. */
  compteur?: "destinations" | "plats" | "sites";
  promesse?: string;
}

/**
 * Les 5 emplacements de la barre du bas (mobile), avec « Publier » AU CENTRE.
 *
 * 🔴 LA REFONTE DU 27/10/2026 — ce que la barre disait, et ce qu'elle dit.
 *    Avant : Fil · Explorer · Publier · Goûts · Messages.
 *    Deux des cinq places allaient à des écrans personnels (les plats goûtés,
 *    la messagerie), et aucune n'ouvrait sur les 3 377 adresses ni sur les
 *    5 624 points situés — c'est-à-dire sur la quasi-totalité de ce que le
 *    site contient. Demande du propriétaire : « un réseau social de voyage à
 *    Madagascar, avec toutes les options qu'on a déjà mises en place, mais en
 *    plus pratique. »
 *
 * ⚠ MESSAGES SORT DE LA BARRE SANS PERDRE SA PORTE. L'en-tête porte le bouton
 *   sur TOUTES les tailles d'écran, avec sa pastille de non-lus et un aperçu
 *   qui s'ouvre sans changer de page (Header.tsx) : la messagerie est plus
 *   accessible là qu'au fond d'une barre, et elle ne coûte plus une des cinq
 *   places.
 *
 * ⚠ GOÛTS REJOINT LE CARNET. Marquer un plat goûté et enregistrer un lieu sont
 *   le même geste — garder ce qui est à moi. Deux onglets pour deux listes
 *   personnelles sur cinq places, quand les adresses n'en avaient aucune, ne
 *   tenait pas. L'entrée reste dans le menu, groupe « Chez moi ».
 */
export const NAV_PRINCIPAL: NavItem[] = [
  { to: "/", label: "Fil", icon: Home, pret: true },
  { to: "/explorer", label: "Explorer", icon: Compass, pret: true },
  { to: "/publier", label: "Publier", icon: Plus, pret: true },
  /* ⚠ L'URL RESTE `/recherche`, LE LIBELLÉ DEVIENT « Adresses ». Des liens
     partagés et la barre de recherche de l'en-tête y mènent depuis des mois ;
     changer l'adresse casserait les uns et le référencement des autres pour un
     gain cosmétique. Ce qui comptait, c'est que le mot dise ce qu'on trouve :
     « Rechercher » nomme un geste, « Adresses » nomme la matière — 3 377
     hôtels, restaurants, agences et loueurs. */
  { to: "/recherche", label: "Adresses", icon: MapPin, pret: true },
  { to: "/favoris", label: "Carnet", icon: Bookmark, pret: true },
];

/**
 * Le rail desktop et le menu mobile : tout le produit.
 *
 * ⚠ TOUTES CES ENTREES MENENT A UN ECRAN BRANCHE SUR UNE VRAIE TABLE. La regle
 *   du projet est explicite : aucune entree de navigation vers un ecran non
 *   branche, parce qu'un onglet vide coute plus cher en confiance que son
 *   absence.
 *
 * 🔴 CIRCUITS ET GUIDES SONT SORTIS DE LA LISTE le 27/10/2026. Ils y figuraient
 *    en `pret: false` avec une pastille « bientôt » — deux promesses dans un
 *    menu qu'on refait justement parce qu'il en disait trop. Leurs tables sont
 *    toujours vides (0 circuit, 0 guide publié), leurs ROUTES restent câblées,
 *    et `FEUILLE_DE_ROUTE` continue de les annoncer là où c'est sa place : la
 *    page « À propos ». À remettre ici le jour où elles se remplissent.
 */
export const NAV_COMPLET: NavItem[] = [
  { to: "/", label: "Fil", icon: Home, pret: true },
  /* ⚠ « Explorer » PASSE EN TÊTE DU GROUPE : depuis la refonte du 27/10, c'est
     la porte unique de la découverte — six envies, la carte, puis les lieux
     emblématiques. Les écrans qui suivent restent des chemins vers la même
     matière, pour qui sait déjà où il va. */
  /* ⚠ PAS DE COMPTEUR SUR CETTE ENTRÉE. Le rail affichait « Explorer 61 » —
     les 61 lieux emblématiques — alors que l'écran ouvre désormais sur les
     318 plages, les 824 sommets, les 95 plats et les 5 624 points de la
     carte. Un chiffre qui sous-estime de deux ordres de grandeur ferme la
     porte qu'il est censé ouvrir. */
  { to: "/explorer", label: "Explorer", icon: Compass, pret: true, groupe: "decouvrir" },
  { to: "/carte", label: "Carte", icon: Map, pret: true, groupe: "decouvrir" },
  { to: "/villes", label: "Villes et villages", icon: Building2, pret: true, groupe: "decouvrir" },
  { to: "/sites", label: "Sites et parcs", icon: Trees, pret: true, groupe: "decouvrir", compteur: "sites" },
  { to: "/plats", label: "Atlas des plats", icon: UtensilsCrossed, pret: true, groupe: "decouvrir", compteur: "plats" },
  { to: "/evenements", label: "Événements", icon: CalendarDays, pret: true, groupe: "decouvrir" },

  { to: "/quand-partir", label: "Quand partir", icon: Sun, pret: true, groupe: "preparer" },
  { to: "/y-aller", label: "Y aller", icon: Route, pret: true, groupe: "preparer" },
  /* ⚠ AJOUTÉE AVEC LA GRILLE DES LOUEURS (0114) : 18 loueurs publiés avec
     leurs types de véhicules et leurs tarifs par jour. L'écran ouvre sur du
     réel — la règle « pas d'entrée vers un écran vide » est respectée. */
  { to: "/location", label: "Louer un véhicule", icon: Car, pret: true, groupe: "preparer" },

  /* 🔴 RETIRÉS DU RAIL GAUCHE sur demande du propriétaire, captures à l'appui :
     · « Adresses » — la recherche vit déjà dans l'entête, sur TOUTES les
       pages ; une deuxième porte dans le rail n'ajoute rien et prend une ligne.
     · « Paramètres » — déjà dans le menu du profil (avatar, en haut à droite).
     Les ROUTES restent câblées : seul le rail ne les liste plus. */
  { to: "/recherche", label: "Adresses", icon: Search, pret: true, railDesktop: false },
  { to: "/publier", label: "Publier", icon: Plus, pret: true, railDesktop: false },
  { to: "/favoris", label: "Mon carnet", icon: Bookmark, pret: true, railDesktop: false, groupe: "chez_moi" },
  { to: "/gouts", label: "Mes goûts", icon: UtensilsCrossed, pret: true, railDesktop: false, groupe: "chez_moi" },
  { to: "/messages", label: "Messages", icon: MessageCircle, pret: true, railDesktop: false },
  { to: "/notifications", label: "Notifications", icon: Bell, pret: true, railDesktop: false },
  { to: "/pro", label: "Espace pro", icon: Briefcase, pret: true, groupe: "chez_moi" },
  { to: "/compte", label: "Mon compte", icon: User, pret: true, railDesktop: false },
  { to: "/parametres", label: "Paramètres", icon: Settings, pret: true, railDesktop: false },
];

/**
 * Ce que le rail desktop affiche : tout sauf ce que l'en-tête porte déjà.
 *
 * ⚠ Le tiroir mobile et le pied de page continuent de lire `NAV_COMPLET` :
 *   c'est le rail seul qui se raccourcit.
 */
export const NAV_RAIL = NAV_COMPLET.filter((e) => e.railDesktop !== false);

/**
 * Les groupes du rail, dans l'ordre de la maquette.
 *
 * ⚠ « Fil » reste HORS GROUPE, en tete : c'est le geste qu'on fait sans y
 *   penser. Le ranger sous un intitule le ralentirait pour rien.
 */
export const GROUPES_RAIL: { cle: NonNullable<NavItem["groupe"]>; titre: string }[] = [
  { cle: "decouvrir", titre: "Découvrir" },
  { cle: "preparer", titre: "Préparer" },
  { cle: "chez_moi", titre: "Chez moi" },
];

/** Ce qui est réellement en construction, affiché tel quel aux visiteurs. */
export const FEUILLE_DE_ROUTE = [
  { quoi: "Fil des voyageurs", etat: "ouvert" as const },
  { quoi: "Destinations et plats référencés", etat: "ouvert" as const },
  { quoi: "Recherche par destination, par plat et par budget", etat: "ouvert" as const },
  { quoi: "Pages des hôtels, restaurants et agences", etat: "ouvert" as const },
  { quoi: "Premiers établissements référencés", etat: "en cours" as const },
  { quoi: "Circuits et guides", etat: "à venir" as const },
  { quoi: "Réservation et paiement", etat: "à venir" as const },
];
