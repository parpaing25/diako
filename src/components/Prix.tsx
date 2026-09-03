import { ariary } from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * LA RÈGLE DE PRIX — TRANSVERSE.
 *
 * La maquette la place dans les fondations, à côté des couleurs et de la
 * typographie, et c'est la bonne place : c'est la donnée la plus regardée du
 * site, et celle qui fait perdre la confiance le plus vite quand elle ment.
 *
 * ⚠ TROIS ATTRIBUTS, TOUJOURS AFFICHÉS ENSEMBLE (TDR §5.11) :
 *   ① le MONTANT, ② l'UNITÉ (la nuit, la portion, le jour, par personne),
 *   ③ la BASE (par chambre, résident, enfant, groupe).
 *   Sans l'unité et la base, un hôtel en pension complète par personne paraît
 *   trois fois plus cher qu'il ne l'est, et le voyageur ne revient pas.
 *
 * ⚠ LA TAXE DE SÉJOUR EST À PART, jamais fondue dans le prix.
 *
 * ⚠ AUCUN PLAFOND SENTINELLE. Chez Fonenako, `priceMax === 5000000` voulait
 *   dire « sans limite » : un utilisateur qui avait réellement 5 000 000 Ar de
 *   budget voyait son filtre ignoré en silence. Ici « sans limite » s'écrit
 *   `null`, et `null` ne s'affiche pas — il affiche « nous consulter ».
 */

// ⚠ Un SEUL formateur d'ariary dans le projet. Il vivait deja dans
//   lib/etablissements ; en redefinir un ici aurait donne deux facons
//   d'ecrire un prix sur le meme ecran, ce que la regle interdit.
const ARIARY = new Intl.NumberFormat("fr-FR");

export type Unite =
  | "nuit"
  | "portion"
  | "jour"
  | "personne"
  | "personne_nuit"
  | "chambre"
  | "vehicule"
  | "groupe"
  | "circuit"
  | "kg"
  | "part"
  | "verre"
  | "trajet"
  | "entree";

const LIBELLE_UNITE: Record<Unite, string> = {
  nuit: "la nuit",
  portion: "la portion",
  jour: "la journée",
  personne: "par personne",
  personne_nuit: "par personne et par nuit",
  chambre: "par chambre",
  vehicule: "par véhicule",
  groupe: "par groupe",
  circuit: "le circuit",
  kg: "le kilo",
  part: "la part",
  verre: "le verre",
  trajet: "le trajet",
  entree: "l\'entrée",
};

/** Le jour où les tarifs cessent d'être crédibles. TDR §8.2. */
/**
 * ⭐ LA LISTE QUE LES ÉCRANS DOIVENT CONSULTER, dérivée des libellés : une unité
 *   absente d'ici ne se nomme pas, donc ne s'affiche pas seule. Tenir une copie
 *   ailleurs, c'est la voir dériver (Post.tsx en avait une à 12 entrées quand
 *   la base en écrivait 14).
 */
export const UNITES = Object.keys(LIBELLE_UNITE) as Unite[];

const JOURS_AVANT_PEREMPTION = 183;

/**
 * TROIS ÉTATS, ET NON DEUX.
 *
 * 🔴 DÉFAUT CORRIGÉ. `fraicheur(undefined)` renvoyait `{ perime: true }` : tout
 *    appel SANS date de confirmation affichait « Nous consulter » ET « Tarifs
 *    non confirmés depuis plus de 6 mois ». C'est une DATE DE PÉREMPTION
 *    FABRIQUÉE — exactement ce que la règle n°1 du projet interdit — sur un
 *    tarif que personne n'a jamais dit périmé : simplement, personne ne l'a
 *    encore confirmé.
 *
 *    Cinq appelants sur six omettent `confirmeLe`. Conséquence mesurée sur le
 *    site : la seule fiche des 54 qui porte un prix affichait « 93 000 Ar »
 *    sous 1024 px et « Nous consulter » au-dessus — même donnée, même seconde,
 *    deux réponses selon la largeur de l'écran.
 *
 *    Et surtout : `rates_checked_at` n'est alimenté que par les tarifs de
 *    saison, dont il y a zéro. Chaque tarif que saisiront les premiers gérants
 *    d'Ampefy serait donc arrivé barré d'un « non confirmé depuis 6 mois ».
 *
 * ⚠ « jamais confirmé » N'EST PAS « périmé ». Le premier montre le chiffre avec
 *   une réserve honnête ; le second le retire. Confondre les deux, c'est soit
 *   mentir sur l'âge d'un prix, soit cacher un prix valide.
 */
type Fraicheur =
  | { etat: "confirme"; texte: string }
  | { etat: "jamais_confirme"; texte: null }
  | { etat: "perime"; texte: null };

function fraicheur(confirmeLe?: string | null): Fraicheur {
  if (!confirmeLe) return { etat: "jamais_confirme", texte: null };
  const jours = (Date.now() - new Date(confirmeLe).getTime()) / 86_400_000;
  if (jours > JOURS_AVANT_PEREMPTION) return { etat: "perime", texte: null };
  return {
    etat: "confirme",
    texte: `Tarifs confirmés le ${new Date(confirmeLe).toLocaleDateString("fr-FR")}`,
  };
}

export function Prix({
  montant,
  unite,
  base,
  aPartirDe = false,
  precisions,
  taxeSejourAr,
  confirmeLe,
  releve,
  ancienMontant,
  taille = "normale",
  className,
}: {
  /** `null` = tarif non communiqué. JAMAIS une valeur sentinelle. */
  montant: number | null;
  unite?: Unite | null;
  /** « par chambre », « résident », « base 2 personnes »… */
  base?: string | null;
  aPartirDe?: boolean;
  /** « petit-déjeuner non inclus », « droits de parcs non inclus »… */
  precisions?: string[];
  taxeSejourAr?: number | null;
  /** Date ISO de dernière confirmation par le gérant. */
  confirmeLe?: string | null;
  /**
   * ⭐ UN RELEVÉ DATÉ, PAS UN TARIF EN VIGUEUR. Sur la page d'un récit, le prix
   *   est ce qu'un voyageur a vu tel jour : « Relevé le 24 août 2026 ». Il ne
   *   se périme jamais en « Nous consulter » (règle des FICHES, 183 jours), et
   *   il ne se fait pas coiffer d'un « Tarif à confirmer » — la date dit déjà
   *   ce qu'il vaut. Ce texte remplace la ligne de fraîcheur.
   */
  releve?: string | null;
  /** Prix barré d'une promo. */
  ancienMontant?: number | null;
  taille?: "normale" | "grande" | "compacte";
  className?: string;
}) {
  const { etat, texte }: Fraicheur = releve
    ? { etat: "confirme", texte: releve }
    : fraicheur(confirmeLe);

  // Au-delà de six mois SANS AVOIR ÉTÉ RECONFIRMÉ, on n'affiche plus le
  // chiffre : un prix faux coûte plus cher qu'un prix absent. TDR §8.2.
  if (montant === null || etat === "perime") {
    return (
      <span className={cn("inline-flex flex-col gap-0.5", className)}>
        <span className="dk-sous-titre text-muted-foreground">
          {montant === null ? "Tarif non communiqué" : "Nous consulter"}
        </span>
        {/* ⚠ ON DIT CE QU'ON SAIT, SANS LE PRÉSENTER COMME ACTUEL. Un tarif
            périmé était retiré ET tu : l'écran affichait « Nous consulter »
            alors qu'on connaissait le dernier montant relevé et sa date. Sur un
            marché où presque aucun établissement ne publie ses prix, « 55 000 Ar
            relevés en juin 2023 » aide un voyageur à préparer son budget ;
            « Nous consulter » ne l'aide en rien.
            ⚠ Le montant est en petit, en gris, DERRIÈRE la mention de son âge —
              jamais mis en avant comme un prix en cours. La hiérarchie visuelle
              porte l'avertissement, pas le chiffre. */}
        {montant !== null && (
          <span className="text-xs text-accent-strong">
            Tarifs non confirmés depuis plus de 6 mois
            {confirmeLe && (
              <span className="block font-normal text-muted-foreground">
                Dernier relevé&nbsp;: {ARIARY.format(montant)}&nbsp;Ar
                {unite ? ` ${LIBELLE_UNITE[unite]}` : ""}, le{" "}
                {new Date(confirmeLe).toLocaleDateString("fr-FR")}. À reconfirmer.
              </span>
            )}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className="flex flex-wrap items-baseline gap-x-2">
        {aPartirDe && taille !== "compacte" && (
          <span className="text-xs text-muted-foreground">à partir de</span>
        )}
        {ancienMontant != null && ancienMontant > montant && (
          <s className="text-sm text-muted-foreground decoration-1">{ariary(ancienMontant)}</s>
        )}
        <span
          className={cn(
            "font-bold tabular-nums",
            taille === "grande" && "text-2xl",
            taille === "normale" && "text-lg",
            taille === "compacte" && "text-base",
            ancienMontant != null ? "text-accent-strong" : "text-foreground"
          )}
        >
          {ariary(montant)}
        </span>
      </span>

      {/* Unité et base sur la même ligne : elles ne se séparent jamais du
          montant, c'est tout l'intérêt de la règle. */}
      {(unite || base) && (
        <span className="text-xs text-muted-foreground">
          {aPartirDe && taille === "compacte" && "à partir de · "}
          {[unite ? LIBELLE_UNITE[unite] : null, base].filter(Boolean).join(", ")}
        </span>
      )}

      {precisions && precisions.length > 0 && (
        <span className="text-xs text-muted-foreground">{precisions.join(" · ")}</span>
      )}

      {taxeSejourAr != null && taxeSejourAr > 0 && (
        <span className="text-xs text-muted-foreground">
          Taxe de séjour {ariary(taxeSejourAr)} par personne et par nuit, à part
        </span>
      )}

      {/* ⚠ LE TROISIÈME ÉTAT S'AFFICHE, il ne se tait pas. Un prix jamais
          confirmé reste un prix relevé quelque part : le montrer sans réserve
          serait le faire passer pour vérifié, le cacher reviendrait à priver le
          voyageur de la seule indication qu'il a. On dit lequel des deux c'est. */}
      {texte ? (
        <span className="text-xs font-medium text-primary">{texte}</span>
      ) : etat === "jamais_confirme" ? (
        <span className="text-xs text-muted-foreground">Tarif à confirmer</span>
      ) : null}
    </span>
  );
}

/**
 * Une fourchette — « de 8 000 à 32 000 Ar la portion ».
 * Les deux bornes partagent obligatoirement la même unité et la même base :
 * comparer deux prix d'unités différentes est le piège que la règle interdit.
 */
export function Fourchette({
  min,
  max,
  unite,
  base,
  className,
}: {
  min: number | null;
  max: number | null;
  unite?: Unite | null;
  base?: string | null;
  className?: string;
}) {
  if (min === null && max === null)
    return <span className={cn("text-sm text-muted-foreground", className)}>Tarifs non communiqués</span>;
  if (min === null || max === null || min === max)
    return <Prix montant={min ?? max} unite={unite} base={base} taille="compacte" className={className} />;

  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className="font-semibold tabular-nums">
        de {ARIARY.format(min)} à {ariary(max)}
      </span>
      {(unite || base) && (
        <span className="text-xs text-muted-foreground">
          {[unite ? LIBELLE_UNITE[unite] : null, base].filter(Boolean).join(", ")}
        </span>
      )}
    </span>
  );
}
