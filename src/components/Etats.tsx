import { Link } from "react-router-dom";
import { WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LES ÉTATS SYSTÈME (écran F2 de la maquette).
 *
 * ⚠ LA RÈGLE, ÉCRITE DANS LA MAQUETTE : « squelettes partout, jamais d'écran
 *   blanc · états vides toujours accompagnés d'une action · erreurs
 *   récupérables avec réessayer ».
 *
 *   Un état vide décoratif — une jolie illustration et « rien ici » — laisse
 *   l'utilisateur dans une impasse. Sur Diako c'est l'état le plus FRÉQUENT
 *   aujourd'hui : la plupart des écrans n'ont pas encore de données. Chaque
 *   vide doit donc dire quoi faire maintenant, sinon le site paraît cassé
 *   alors qu'il est seulement jeune.
 */

export function EtatVide({
  icone: Icone,
  titre,
  texte,
  action,
  lien,
  onAction,
  className,
}: {
  icone?: LucideIcon;
  titre: string;
  texte?: string;
  /** Libellé du bouton. Un état vide SANS action est un cul-de-sac. */
  action?: string;
  lien?: string;
  onAction?: () => void;
  className?: string;
}) {
  const bouton =
    "mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground";
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      {Icone && (
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Icone className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
      )}
      <p className={cn("font-semibold", Icone && "mt-4")}>{titre}</p>
      {texte && <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{texte}</p>}
      {action && lien && (
        <Link to={lien} className={bouton}>
          {action}
        </Link>
      )}
      {action && !lien && onAction && (
        <button onClick={onAction} className={bouton}>
          {action}
        </button>
      )}
    </div>
  );
}

/**
 * Une erreur RÉCUPÉRABLE.
 *
 * ⚠ « Rien n'est perdu » n'est pas une politesse : sur ce marché, la coupure
 *   est la règle et non l'exception, et un message qui dit seulement « une
 *   erreur est survenue » fait fermer l'onglet. On nomme la cause probable —
 *   le réseau — et on donne le geste qui répare.
 */
export function EtatErreur({
  titre = "Le chargement a échoué",
  texte = "Rien n'est perdu. Réessayez, la connexion est peut-être passée en 2G.",
  onReessayer,
  className,
}: {
  titre?: string;
  texte?: string;
  onReessayer?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("rounded-2xl border border-accent/40 bg-accent/5 p-5 text-center", className)}
    >
      <p className="font-semibold">{titre}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{texte}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onReessayer && (
          <button
            onClick={onReessayer}
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            Réessayer
          </button>
        )}
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-full border border-input px-6 font-medium"
        >
          Accueil
        </Link>
      </div>
    </div>
  );
}

/**
 * Le bandeau hors ligne.
 *
 * ⚠ NON BLOQUANT, et sans rejeu automatique des envois. La maquette insiste
 *   sur ce dernier point et le TDR §11.4 l'explique : rejouer une connexion ou
 *   un paiement au retour du réseau crée des doubles écritures. On informe, on
 *   ne répare pas tout seul.
 */
export function BandeauHorsLigne({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm",
        className
      )}
    >
      <WifiOff className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
      Connexion perdue — les nouvelles publications s'afficheront au retour.
    </div>
  );
}

/** Squelettes calés sur la forme de ce qu'ils annoncent. */
export function Squelettes({
  nombre = 3,
  hauteur = "h-24",
  className,
}: {
  nombre?: number;
  hauteur?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: nombre }, (_, i) => (
        <div key={i} className={cn("dk-skeleton rounded-2xl", hauteur)} />
      ))}
    </div>
  );
}
