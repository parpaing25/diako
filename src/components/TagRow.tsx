import { Link } from "react-router-dom";
import { MapPin, Store, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LES TROIS TAGS — composant n°2 du DESIGN-HANDOFF §4.
 *
 * ⚠ TOUT L'ÉCRAN DÉCOULE DE CES TROIS GESTES. Taguer un lieu fait remonter le
 *   récit sur la page de la destination ; taguer un établissement lui donne sa
 *   preuve sociale ; taguer un plat alimente l'atlas culinaire. Ce ne sont pas
 *   des étiquettes décoratives, ce sont les trois arêtes du graphe.
 *
 * ⚠ L'ORDRE NE CHANGE JAMAIS : lieu, établissement, plat. Ni le code couleur —
 *   teal, encre, corail. Un lecteur doit pouvoir reconnaître la nature d'un tag
 *   à la couleur, sans lire, et cela ne marche que si c'est constant sur tout
 *   le site.
 *
 * ⚠ LE CORAIL DES PLATS EST LE FONCÉ (#D0471C, 4,57:1), jamais le clair
 *   (#F4633A, 3,14:1) : ces pastilles portent du texte.
 */
export function TagRow({
  lieu,
  etablissement,
  plat,
  taille = "normale",
  className,
}: {
  lieu?: { nom: string; slug?: string | null } | null;
  etablissement?: { nom: string; slug?: string | null } | null;
  plat?: { nom: string; slug?: string | null } | null;
  taille?: "normale" | "compacte";
  className?: string;
}) {
  const tags = [
    lieu && {
      cle: "lieu",
      nom: lieu.nom,
      vers: lieu.slug ? `/lieu/${lieu.slug}` : `/recherche?q=${encodeURIComponent(lieu.nom)}`,
      Icone: MapPin,
      classe: "border-primary/30 bg-primary/[0.07] text-primary",
    },
    etablissement && {
      cle: "etablissement",
      nom: etablissement.nom,
      vers: etablissement.slug
        ? `/p/${etablissement.slug}`
        : `/recherche?q=${encodeURIComponent(etablissement.nom)}`,
      Icone: Store,
      classe: "border-foreground/25 bg-foreground/[0.06] text-foreground",
    },
    plat && {
      cle: "plat",
      nom: plat.nom,
      vers: plat.slug ? `/plat/${plat.slug}` : `/recherche?q=${encodeURIComponent(plat.nom)}`,
      Icone: UtensilsCrossed,
      classe: "border-accent-strong/30 bg-accent/[0.09] text-accent-strong",
    },
  ].filter(Boolean) as {
    cle: string;
    nom: string;
    vers: string;
    Icone: typeof MapPin;
    classe: string;
  }[];

  if (!tags.length) return null;

  const compact = taille === "compacte";

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((t) => (
        <li key={t.cle}>
          <Link
            to={t.vers}
            /* ⚠ `stopPropagation` : ces tags vivent DANS une carte qui est
               elle-même un lien. Sans ça, cliquer sur « ravitoto » ouvrait le
               récit au lieu de la fiche du plat. */
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex max-w-[16rem] items-center gap-1 rounded-full border font-medium transition hover:brightness-95",
              t.classe,
              compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
            )}
          >
            <t.Icone className={compact ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden="true" />
            <span className="truncate">{t.nom}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
