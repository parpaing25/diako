import {
  Bed,
  Bus,
  Compass,
  Landmark,
  Map,
  Mountain,
  Palmtree,
  Sparkles,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";

/**
 * Catégories de Diako — l'équivalent voyage des « stories » de catégories de
 * Fonenako (CATEGORIES dans HeroSection.tsx).
 *
 * Même langage visuel : pastille arrondie, dégradé quand elle est active.
 * Le contenu, lui, est celui du tourisme malgache.
 */
export interface Categorie {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Ce que la catégorie regroupera réellement (affiché sur les écrans d'attente). */
  quoi: string;
}

export const CATEGORIES: Categorie[] = [
  { key: "all", label: "Tout", icon: Sparkles, color: "from-primary to-cyan-600", quoi: "Tout Diako" },
  { key: "hotel", label: "Hôtels", icon: Bed, color: "from-teal-500 to-teal-700", quoi: "Hôtels, bungalows, écolodges et chambres d'hôte" },
  { key: "restaurant", label: "Restaurants", icon: UtensilsCrossed, color: "from-orange-500 to-red-600", quoi: "Restaurants, hotely gasy, snacks et salons de thé" },
  { key: "agence", label: "Agences", icon: Map, color: "from-violet-500 to-purple-700", quoi: "Agences de voyage et tour-opérateurs" },
  { key: "bon_plan", label: "Bons plans", icon: Sparkles, color: "from-amber-500 to-orange-600", quoi: "Promotions et bonnes adresses signalées par les voyageurs" },
  { key: "plage", label: "Plages", icon: Waves, color: "from-sky-500 to-blue-700", quoi: "Plages, îles et spots de plongée" },
  { key: "parc", label: "Parcs", icon: Mountain, color: "from-lime-600 to-green-700", quoi: "Parcs nationaux, réserves et sites naturels" },
  { key: "circuit", label: "Circuits", icon: Compass, color: "from-indigo-500 to-indigo-700", quoi: "Circuits organisés et itinéraires jour par jour" },
  { key: "culture", label: "Culture", icon: Landmark, color: "from-rose-500 to-pink-700", quoi: "Rova, marchés, artisanat et fêtes traditionnelles" },
  { key: "transport", label: "Transport", icon: Bus, color: "from-slate-500 to-slate-700", quoi: "Taxi-brousse, vols intérieurs, bateaux et location de 4x4" },
  { key: "guide", label: "Guides", icon: Palmtree, color: "from-emerald-500 to-teal-700", quoi: "Guides agréés et accompagnateurs indépendants" },
];

export const categorie = (key: string) => CATEGORIES.find((c) => c.key === key);
