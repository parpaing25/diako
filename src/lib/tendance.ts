/**
 * « EN VOGUE » DOIT VOULOIR DIRE « EN CE MOMENT », PAS « DEPUIS TOUJOURS ».
 *
 * ⚠ Défaut relevé sur Fonenako le 10/08/2026, repris ici AVANT de le refaire.
 *   Les sections « en vogue » y classaient par nombre TOTAL de vues. Ce total
 *   ne fait que monter : un récit de six mois à 500 vues bat pour toujours un
 *   récit d'avant-hier qui en a fait 60 — alors que le second intéresse
 *   manifestement plus de monde en ce moment. Les gagnants d'hier
 *   verrouillaient la vitrine, et rien de neuf ne pouvait plus y entrer.
 *
 * Deux corrections, transposées au voyage :
 *
 *   ① On classe sur un RYTHME, pas sur un cumul : l'attention rapportée à
 *     l'âge du récit. Un récit récent qui marche monte tout de suite, un
 *     ancien redescend de lui-même. Aucun ménage à faire.
 *
 *   ② On TIRE AU SORT parmi les meilleurs plutôt que de prendre toujours les
 *     premiers. Le tirage est pondéré : mieux un récit se porte, plus il a de
 *     chances de sortir — mais rien n'est garanti. Le rail change donc à
 *     chaque visite sans jamais devenir arbitraire.
 */

export interface CandidatTendance {
  id: string;
  reactions_count?: number | null;
  comments_count?: number | null;
  saves_count?: number | null;
  created_at?: string | null;
}

/** Une réaction est un acte volontaire, un commentaire l'est davantage — et
 *  sur un site de voyage, ENREGISTRER est le signal le plus fort qui soit :
 *  celui qui garde un récit prépare son départ. */
export const POIDS = { reaction: 20, commentaire: 30, enregistrement: 40 } as const;

/** En dessous, le récit est « du jour » : pas de division punitive. */
const AGE_PLANCHER_JOURS = 1;

/** 0,7 plutôt que 1 : l'âge pénalise sans effacer un récit d'une semaine qui
 *  marche très bien. */
const DECROISSANCE = 0.7;

/** Attention reçue, rapportée à l'âge du récit. */
export function scoreTendance(c: CandidatTendance, maintenant = Date.now()): number {
  const attention =
    (c.reactions_count ?? 0) * POIDS.reaction +
    (c.comments_count ?? 0) * POIDS.commentaire +
    (c.saves_count ?? 0) * POIDS.enregistrement;
  if (attention <= 0) return 0;

  const publieLe = c.created_at ? new Date(c.created_at).getTime() : maintenant;
  const jours = Math.max((maintenant - publieLe) / 86_400_000, AGE_PLANCHER_JOURS);
  return attention / Math.pow(jours, DECROISSANCE);
}

/**
 * Tirage PONDÉRÉ sans remise parmi les `bassin` meilleurs.
 *
 * ⚠ Le bassin est volontairement plus large que le nombre voulu : tirer parmi
 *   exactement n candidats revient à les prendre tous, dans le désordre — ce
 *   qui ne change rien au problème d'origine.
 */
export function choisirEnVogue<T extends CandidatTendance>(
  candidats: T[],
  combien: number,
  options: { bassin?: number; alea?: () => number; maintenant?: number } = {}
): T[] {
  const alea = options.alea ?? Math.random;
  const maintenant = options.maintenant ?? Date.now();
  const bassin = options.bassin ?? Math.max(combien * 3, combien + 4);

  const notes = candidats
    .map((c) => ({ c, s: scoreTendance(c, maintenant) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, bassin);

  const sortis: T[] = [];
  const restants = [...notes];
  while (sortis.length < combien && restants.length > 0) {
    const total = restants.reduce((t, x) => t + x.s, 0);
    // Tous les scores restants à zéro ne peut pas arriver (filtre ci-dessus),
    // mais un total nul ferait boucler : on prend alors le premier.
    let tir = alea() * total;
    let i = 0;
    while (i < restants.length - 1 && tir > restants[i].s) {
      tir -= restants[i].s;
      i += 1;
    }
    sortis.push(restants[i].c);
    restants.splice(i, 1);
  }
  return sortis;
}
