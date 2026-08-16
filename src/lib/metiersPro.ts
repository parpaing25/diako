/**
 * LES MÉTIERS D'UN COMPTE PROFESSIONNEL.
 *
 * 🔴 POURQUOI CE FICHIER EXISTE. La liste ne vivait que dans le `<select>` de
 *    /bienvenue. Ouvrir un second chemin vers le statut pro — depuis son
 *    compte, pour qui s'est inscrit par Google ou a cliqué « Plus tard » —
 *    imposait de la recopier ; et deux listes qui doivent rester identiques
 *    finissent toujours par diverger. Celle qui diverge ne produit pas un
 *    affichage bancal : elle produit « Metier inconnu. » brut de Postgres dans
 *    un toast, et le compte reste voyageur.
 *
 * ⚠ CES SEPT CODES SONT CEUX DE LA BASE, pas une liste d'affichage. La
 *   contrainte `profiles_metier_pro_check` et le test de `devenir_pro()`
 *   (migration 0069) les énumèrent tous les deux. Ajouter un huitième métier
 *   ici sans toucher à la base fait échouer l'appel.
 */

export interface MetierPro {
  cle: string;
  /** Ce qu'on lit dans une phrase — court, sans la précision entre tirets. */
  court: string;
  /** Ce qu'on lit dans la liste déroulante : le court, plus ses exemples. */
  label: string;
}

export const METIERS_PRO: MetierPro[] = [
  { cle: "hotellerie", court: "Hôtellerie", label: "Hôtellerie — hôtel, bungalow, chambres" },
  { cle: "restauration", court: "Restauration", label: "Restauration — restaurant, gargote" },
  { cle: "guide", court: "Guide", label: "Guide" },
  { cle: "agence", court: "Agence de voyage", label: "Agence de voyage — circuits" },
  { cle: "transport", court: "Transport", label: "Transport" },
  { cle: "artisanat", court: "Artisanat", label: "Artisanat" },
  { cle: "autre", court: "Autre", label: "Autre" },
];

/** ⚠ Le code brut sort en dernier recours plutôt qu'un vide : un métier déclaré
 *  qui s'afficherait comme absent pousserait la personne à le redéclarer. */
export function libelleMetier(cle: string | null | undefined): string {
  if (!cle) return "non renseigné";
  return METIERS_PRO.find((m) => m.cle === cle)?.court ?? cle;
}
