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
  | "verre";

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
};

/** Le jour où les tarifs cessent d'être crédibles. TDR §8.2. */
const JOURS_AVANT_PEREMPTION = 183;

function fraicheur(confirmeLe?: string | null) {
  if (!confirmeLe) return { perime: true, texte: null as string | null };
  const jours = (Date.now() - new Date(confirmeLe).getTime()) / 86_400_000;
  return {
    perime: jours > JOURS_AVANT_PEREMPTION,
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
  /** Prix barré d'une promo. */
  ancienMontant?: number | null;
  taille?: "normale" | "grande" | "compacte";
  className?: string;
}) {
  const { perime, texte } = fraicheur(confirmeLe);

  // Au-delà de six mois sans confirmation, on n'affiche plus le chiffre : un
  // prix faux coûte plus cher qu'un prix absent. TDR §8.2.
  if (montant === null || perime) {
    return (
      <span className={cn("inline-flex flex-col gap-0.5", className)}>
        <span className="dk-sous-titre text-muted-foreground">
          {montant === null ? "Tarif non communiqué" : "Nous consulter"}
        </span>
        {montant !== null && (
          <span className="text-xs text-accent-strong">
            Tarifs non confirmés depuis plus de 6 mois
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

      {texte && <span className="text-xs font-medium text-primary">{texte}</span>}
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
