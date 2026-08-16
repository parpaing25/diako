/**
 * Les quelques briques que les cinq onglets de la console partagent.
 *
 * ⚠ PAS DE shadcn/ui ICI, ET CE N'EST PAS UN OUBLI. Les 51 composants de
 *   `src/components/ui/` existent mais ne sont importés nulle part dans
 *   l'application : un `grep` de « @/components/ui » hors de ce dossier ne rend
 *   que `sonner` dans `App.tsx`. Les 34 pages sont écrites en Tailwind à la
 *   main. Une console qui introduirait `Card`, `Tabs` et `Button` tirerait
 *   Radix dans le bundle pour un seul écran et ne ressemblerait à aucun autre.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Recettes de classes, écrites une fois ──────────────────────────────── */

export const CARTE = "rounded-2xl border border-border bg-card p-4 sm:p-5";
export const BTN_PRIMAIRE =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60";
export const BTN_SECONDAIRE =
  "dk-tap inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-input px-3 text-sm disabled:opacity-60";
/**
 * ⚠ `text-accent-strong` ET JAMAIS `#F4633A` POUR UN TEXTE. Le corail clair
 *   plafonne à 3,14:1 sur fond clair ; c'est une couleur décorative. Tout ce
 *   qui se lit — ici les actions destructrices — prend le corail foncé.
 */
export const BTN_DANGER =
  "dk-tap inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-input px-3 text-sm text-accent-strong disabled:opacity-60";
export const CHAMP =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:ring-2 focus:ring-ring";
export const ETIQUETTE = "mb-1 block text-sm font-medium";

/* ── Briques ────────────────────────────────────────────────────────────── */

export function Carte({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(CARTE, className)}>{children}</div>;
}

/**
 * Une tuile de chiffre.
 *
 * ⚠ `valeur` PEUT ÊTRE « — ». Une console d'administration sert à trancher :
 *   quand la donnée n'existe pas, la tuile le montre au lieu d'afficher un
 *   zéro, qui se lit comme une mesure.
 */
export function Chiffre({
  valeur,
  libelle,
  precision,
  ton = "neutre",
}: {
  valeur: string;
  libelle: string;
  precision?: string;
  ton?: "neutre" | "attention";
}) {
  return (
    <div className={cn(CARTE, "p-3 sm:p-4")}>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          ton === "attention" && valeur !== "0" && "text-accent-strong"
        )}
      >
        {valeur}
      </p>
      <p className="mt-0.5 text-sm font-medium">{libelle}</p>
      {precision ? <p className="dk-secondaire mt-0.5">{precision}</p> : null}
    </div>
  );
}

export function Pastille({
  children,
  ton = "neutre",
}: {
  children: ReactNode;
  ton?: "neutre" | "primaire" | "alerte";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        ton === "primaire" && "bg-primary/10 text-primary",
        ton === "alerte" && "bg-accent/10 text-accent-strong",
        ton === "neutre" && "bg-secondary text-foreground"
      )}
    >
      {children}
    </span>
  );
}

/** Bandeau d'explication sobre, pour dire une limite au lieu de la cacher. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl bg-secondary p-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

export function Squelette({ nombre = 3, hauteur = "h-24" }: { nombre?: number; hauteur?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: nombre }).map((_, i) => (
        <div key={i} className={cn("dk-skeleton w-full rounded-2xl", hauteur)} />
      ))}
    </div>
  );
}

/**
 * Le bouton « charger la suite ».
 *
 * ⚠ IL N'APPARAÎT QUE S'IL Y A UNE SUITE, et « il y a une suite » se déduit
 *   d'un curseur non nul — jamais d'un total, qu'on ne demande pas. Voir
 *   `curseurSuivant()` dans `src/lib/admin.ts`.
 */
export function BoutonSuite({
  onClick,
  chargement,
}: {
  onClick: () => void;
  chargement: boolean;
}) {
  return (
    <div className="pt-1 text-center">
      <button type="button" onClick={onClick} disabled={chargement} className={BTN_SECONDAIRE}>
        {chargement ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Un instant…
          </>
        ) : (
          "Charger la suite"
        )}
      </button>
    </div>
  );
}

/** Barre de filtres en pastilles — le même geste dans les cinq onglets. */
export function Filtres<T extends string>({
  valeur,
  options,
  onChange,
}: {
  valeur: T;
  options: { cle: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((o) => (
        <button
          key={o.cle}
          type="button"
          onClick={() => onChange(o.cle)}
          aria-pressed={valeur === o.cle}
          className={cn(
            "dk-tap min-h-9 rounded-full border px-3 text-sm",
            valeur === o.cle
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
