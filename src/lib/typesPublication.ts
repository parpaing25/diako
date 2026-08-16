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
  /**
   * `null` = champ absent, `false` = proposé, `true` = exigé.
   * ⚠ Pour le lieu, `false` n'est pas un état stable : il devient exigé dès
   *   qu'une photo est jointe. Passer par `lieuExige()` et jamais par ce champ
   *   brut, sinon le verrou saute selon l'appelant.
   */
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
    // 🔴 LA DÉFINITION DISAIT « champ absent » ALORS QUE L'ÉCRAN OFFRAIT LE
    //    BOUTON « Ajouter des photos ». Une photo aide souvent une question
    //    (« c'est quoi ce fruit ? ») : c'est la définition qui avait tort, pas
    //    l'écran. Elle dit maintenant « proposé », et la règle du lieu
    //    ci-dessous s'y applique comme partout ailleurs.
    photos: false,
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
    // ⚠ Ce type porte TOUJOURS une photo : le lieu y est donc exigé d'entrée,
    //   avant même le premier fichier — l'étoile ne doit pas apparaître après
    //   coup, quand la personne croit avoir fini.
    lieu: true,
    plat: null,
    prix: null,
    photos: true,
    raisonExigence:
      "Une publication « photo » sans photo n'a rien à montrer — et sans lieu, personne ne la retrouvera.",
  },
];

export function defDuType(cle: string): DefType {
  return TYPES.find((t) => t.cle === cle) ?? TYPES[0];
}

/**
 * LE LIEU DEVIENT OBLIGATOIRE DÈS QU'UNE PHOTO EST JOINTE.
 *
 * 🔴 CE QUE ÇA CORRIGE. Le lieu était facultatif partout, y compris sur une
 *    publication qui ne porte qu'une image — et `def.lieu` n'était même lu
 *    nulle part. Or une photo sans lieu n'est atteignable par AUCUN chemin de
 *    lecture : la fiche de destination et la recherche interrogent `place_id`
 *    (`recitsParLieu`), le mode « près de moi » du fil joint `places` sur
 *    `place_id` et écarte tout ce qui n'a pas de coordonnées, et le compteur
 *    de lieux du profil compte des `place_id` distincts. La photo tombait dans
 *    le fil, descendait, et disparaissait — y compris pour celui qui l'a prise.
 *
 * ⚠ ON EXIGE UN LIEU, PAS UN LIEU DU RÉFÉRENTIEL. Refuser un nom que la
 *   personne CONNAÎT la ferait renoncer à publier, et le référentiel n'est
 *   jamais complet. L'écran dit alors ce que le nom écrit à la main coûte
 *   (voir `AVERTISSEMENT_LIEU_LIBRE`) au lieu de le refuser.
 */
export function lieuExige(def: DefType, nbPhotos: number): boolean {
  if (def.lieu === null) return false;
  return def.lieu === true || nbPhotos > 0;
}

/**
 * ⚠ LA RAISON EST DITE, PAS SEULEMENT LA RÈGLE. Une contrainte qu'on
 *   n'explique pas se contourne : on tape n'importe quoi pour débloquer le
 *   bouton, et la publication est perdue quand même.
 */
export const RAISON_LIEU_PHOTO =
  "Sans lieu, personne ne retrouvera cette photo : ni sur la fiche de la destination, ni dans la recherche, ni dans « près de moi ».";

/**
 * 🔴 CE QUE LA SAISIE LIBRE FAIT VRAIMENT. Un nom écrit à la main part dans
 *    `place` et laisse `place_id` nul. Aucun écran de lecture n'interroge
 *    `place` en texte : la recherche résout d'abord le terme contre le
 *    référentiel puis appelle `recitsParLieu(id)`. Le champ est donc rempli,
 *    la publication reste introuvable, et rien ne le disait.
 */
export const AVERTISSEMENT_LIEU_LIBRE =
  "Ce nom s'affichera, mais il ne rattache la publication à rien : elle n'apparaîtra ni sur la fiche de la destination, ni dans la recherche, ni dans « près de moi ». Si l'une des propositions correspond, choisissez-la plutôt.";
