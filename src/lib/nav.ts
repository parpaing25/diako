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
   * ⚠ LE GROUPE DU RAIL, repris de la maquette « Explorer regions » de Claude
   *   Design. Seize entrees a plat se lisent comme une liste de courses : l'oeil
   *   ne sait pas par ou commencer. Trois intentions — DECOUVRIR, PREPARER,
   *   CHEZ MOI — donnent trois points d'entree au lieu de seize.
   */
  groupe?: "decouvrir" | "preparer" | "chez_moi";
  /** Le compte affiche a droite de l'entree, quand il est CONNU et VRAI. */
  compteur?: "destinations" | "plats" | "sites";
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
  { to: "/explorer", label: "Destinations", icon: Compass, pret: true, groupe: "decouvrir", compteur: "destinations" },
  /* ⚠ SORTIE DE « DESTINATIONS » SUR DEMANDE DU PROPRIÉTAIRE : une descente
     régions › communes n'est pas ce qu'on attend derrière ce mot. /explorer
     ne montre plus que les lieux emblématiques ; les villes ont leur entrée.
     Pas de compteur ici : `stats_diako` n'a pas de clé « villes », et un
     chiffre approximatif serait pire qu'aucun. */
  { to: "/villes", label: "Villes et villages", icon: Building2, pret: true, groupe: "decouvrir" },
  { to: "/plats", label: "Atlas des plats", icon: UtensilsCrossed, pret: true, groupe: "decouvrir", compteur: "plats" },
  /* 🔴 `pret: false` PARCE QUE LA TABLE EST VIDE. Mesuré : 0 circuit, 0 guide
     publiés. Ces deux entrées menaient à un écran qui ne peut rien afficher, et
     la pastille « bientôt » — dont le commentaire de SideNav dit qu'elle « dit
     la vérité AVANT le clic » — ne s'affichait sur aucune des deux. On promet
     un catalogue, on ouvre le vide : c'est le clic de trop qui fait douter du
     reste du site. À repasser à `true` le jour où ces tables se remplissent. */
  { to: "/circuits", label: "Circuits", icon: Route, pret: false, groupe: "decouvrir" },
  { to: "/sites", label: "Sites et parcs", icon: Trees, pret: true, groupe: "decouvrir", compteur: "sites" },
  { to: "/evenements", label: "Événements", icon: CalendarDays, pret: true, groupe: "decouvrir" },
  /* ⚠ AJOUTE APRES L'AUDIT : `/projet` n'avait qu'UN SEUL lien dans tout le
     depot — la carte du bas de SideNav, qui n'apparait qu'a 1280 px. Sur la
     cible du produit (390 px), l'ecran que le code decrit comme « le seul
     endroit ou l'offre vient au voyageur » n'etait joignable qu'en tapant
     l'URL a la main. */
  /* 🔴 L'ENTRÉE « Mon projet de voyage » A ÉTÉ RETIRÉE D'ICI. Elle faisait
     DOUBLON : le rail portait la ligne de menu ET la carte de bas de rail
     (SideNav.tsx), toutes deux vers /projet. Le propriétaire l'a signalé
     capture à l'appui. On garde la CARTE, pas la ligne : c'est le seul endroit
     du produit où l'offre vient au voyageur, une ligne parmi seize l'aurait
     noyé — et c'est précisément l'argument écrit dans SideNav.tsx. */
  { to: "/quand-partir", label: "Quand partir", icon: Sun, pret: true, groupe: "preparer" },
  { to: "/y-aller", label: "Y aller", icon: Route, pret: true, groupe: "preparer" },
  /* ⚠ AJOUTÉE AVEC LA GRILLE DES LOUEURS (0114) : 18 loueurs publiés avec
     leurs types de véhicules et leurs tarifs par jour. L'écran ouvre sur du
     réel — la règle « pas d'entrée vers un écran vide » est respectée. */
  { to: "/location", label: "Louer un véhicule", icon: Car, pret: true, groupe: "preparer" },
  { to: "/guides", label: "Guides", icon: Mountain, pret: false, groupe: "decouvrir" },
  { to: "/carte", label: "Carte", icon: Map, pret: true },
  /* 🔴 RETIRÉS DU RAIL GAUCHE sur demande du propriétaire, captures à l'appui :
     · « Rechercher » — la recherche vit déjà dans l'entête, sur TOUTES les
       pages ; une deuxième porte dans le rail n'ajoute rien et prend une ligne.
     · « Paramètres » — déjà dans le menu du profil (avatar, en haut à droite).
     Les ROUTES restent câblées : seul le rail ne les liste plus. */
  { to: "/recherche", label: "Rechercher", icon: Search, pret: true, railDesktop: false },
  { to: "/publier", label: "Publier", icon: Plus, pret: true, railDesktop: false },
  { to: "/favoris", label: "Mon carnet", icon: Bookmark, pret: true, railDesktop: false, groupe: "chez_moi" },
  { to: "/gouts", label: "Mon carnet de goûts", icon: UtensilsCrossed, pret: true, railDesktop: false, groupe: "chez_moi" },
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
 * ⚠ « Fil », « Carte » et « Rechercher » restent HORS GROUPE, en tete : ce sont
 *   les trois gestes qu'on fait sans y penser. Les ranger sous un intitule les
 *   ralentirait pour rien.
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
  { quoi: "Réservation et paiement", etat: "à venir" as const },
];
