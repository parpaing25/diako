/**
 * CE QUE CHAQUE TYPE DE PUBLICATION DEMANDE.
 *
 * 🔴 CE QUE ÇA CORRIGE. Le formulaire posait les MÊMES questions à tout le
 *    monde : un même grand cadre de texte, un lieu, un plat, des photos — que
 *    l'on raconte deux semaines à Sainte-Marie ou que l'on signale le prix
 *    d'un taxi-brousse. Résultat : les bons plans arrivaient sans prix (la
 *    seule chose qui fait un bon plan), les questions ressemblaient à des
 *    récits, et les assiettes n'étaient reliées à aucun plat de l'atlas.
 *
 * ⚠ LE CHAMP OBLIGATOIRE EST CE QUI DÉFINIT LE TYPE. Un bon plan sans montant
 *   n'est pas un bon plan ; une assiette sans plat n'entre pas dans l'atlas
 *   culinaire. On le demande donc, et on l'explique — plutôt que d'accepter
 *   une publication qui ne servira à personne.
 *
 * ⚠ LES CONSIGNES SONT CONCRÈTES, JAMAIS « racontez votre expérience ». Sur ce
 *   marché l'information qui manque est toujours la même : combien, comment on
 *   y va, ce qu'on aurait aimé savoir avant. Les amorces posent ces questions
 *   à la place de l'auteur.
 */

import type { LucideIcon } from "lucide-react";
import {
  Camera,
  HelpCircle,
  PenLine,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";

export type CleType = "recit" | "assiette" | "bon_plan" | "question" | "photo";

/** Les unités de prix proposées, par type. Un prix sans unité ne veut rien dire. */
export const UNITES: { cle: string; label: string }[] = [
  { cle: "personne", label: "par personne" },
  { cle: "portion", label: "la portion" },
  { cle: "nuit", label: "la nuit" },
  { cle: "chambre", label: "par chambre" },
  { cle: "jour", label: "la journée" },
  { cle: "trajet", label: "le trajet" },
  { cle: "entree", label: "l'entrée" },
  { cle: "vehicule", label: "par véhicule" },
  { cle: "groupe", label: "par groupe" },
];

export interface DefType {
  cle: CleType;
  label: string;
  icone: LucideIcon;
  /** Ce que l'écran promet en une ligne, sous les onglets. */
  promesse: string;
  /** Le libellé du grand champ de texte — il change de nature selon le type. */
  labelTexte: string;
  placeholder: string;
  /** Amorces cliquables : elles s'insèrent dans le texte. */
  amorces: string[];
  texteObligatoire: boolean;
  /** `null` = champ absent, `false` = proposé, `true` = exigé. */
  lieu: boolean | null;
  plat: boolean | null;
  prix: boolean | null;
  photos: boolean | null;
  uniteParDefaut?: string;
  /** Pourquoi le champ exigé l'est — dit à l'écran, pas seulement bloqué. */
  raisonExigence?: string;
}

export const TYPES: DefType[] = [
  {
    cle: "recit",
    label: "Récit",
    icone: PenLine,
    promesse: "Un voyage raconté : le trajet, les étapes, ce que ça a coûté.",
    labelTexte: "Votre récit",
    placeholder:
      "Comment vous y êtes allé, où vous avez dormi, ce que vous avez payé, ce que vous auriez aimé savoir avant de partir…",
    amorces: [
      "Comment j'y suis allé :",
      "Où j'ai dormi :",
      "Ce que ça m'a coûté :",
      "Ce que je referais autrement :",
    ],
    texteObligatoire: true,
    lieu: false,
    plat: false,
    prix: false,
    photos: false,
  },
  {
    cle: "assiette",
    label: "Assiette",
    icone: UtensilsCrossed,
    promesse: "Un plat goûté quelque part — il rejoint l'atlas culinaire.",
    labelTexte: "Ce que vous avez mangé",
    placeholder:
      "Le goût, la portion, si c'était copieux, à quelle heure on en trouve encore…",
    amorces: ["C'était :", "La portion :", "À quelle heure en trouver :"],
    texteObligatoire: false,
    lieu: false,
    plat: true,
    prix: false,
    photos: false,
    uniteParDefaut: "portion",
    raisonExigence:
      "Le plat relie votre publication à l'atlas culinaire et aux 254 orthographes du référentiel — sans lui, elle reste introuvable.",
  },
  {
    cle: "bon_plan",
    label: "Bon plan",
    icone: Sparkles,
    promesse: "Un tarif relevé sur le terrain, avec sa date.",
    labelTexte: "Le bon plan",
    placeholder:
      "Ce que c'est, où exactement, à qui s'adresser, ce qu'il faut demander…",
    amorces: ["Où exactement :", "À qui demander :", "Ce qui est compris :"],
    texteObligatoire: true,
    lieu: false,
    plat: null,
    prix: true,
    photos: false,
    uniteParDefaut: "personne",
    raisonExigence:
      "Un bon plan sans montant n'en est pas un : c'est le chiffre que les autres viennent chercher, et il doit porter sa date.",
  },
  {
    cle: "question",
    label: "Question",
    icone: HelpCircle,
    promesse: "Une question posée à ceux qui y sont allés.",
    labelTexte: "Votre question",
    placeholder:
      "Posez-la précisément : la période, le budget, d'où vous partez. Une question précise obtient une réponse précise.",
    amorces: ["Je pars quand :", "Mon budget :", "Je pars d'où :"],
    texteObligatoire: true,
    lieu: false,
    plat: null,
    prix: null,
    photos: null,
  },
  {
    cle: "photo",
    label: "Photo",
    icone: Camera,
    promesse: "Une image, et où elle a été prise.",
    labelTexte: "Légende",
    placeholder: "Ce qu'on voit, quand, depuis où…",
    amorces: [],
    texteObligatoire: false,
    lieu: false,
    plat: null,
    prix: null,
    photos: true,
    raisonExigence: "Une publication « photo » sans photo n'a rien à montrer.",
  },
];

export function defDuType(cle: string): DefType {
  return TYPES.find((t) => t.cle === cle) ?? TYPES[0];
}
