import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Rail de navigation desktop (≥ 768 px).
 *
 * Corrige un défaut bloquant : la barre du bas étant `md:hidden` et l'en-tête
 * ne contenant aucun lien de section, il n'existait AUCUNE navigation à la
 * souris au-delà de 768 px — Explorer, Publier et Compte n'étaient atteignables
 * qu'en tapant l'URL à la main.
 *
 * La pastille « bientôt » dit la vérité AVANT le clic.
 */
export function SideNav() {
  return (
    <nav
      aria-label="Sections du site"
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 border-r border-border px-2 py-4 md:block"
    >
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, pret }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition",
                  isActive
                    ? "bg-secondary font-medium text-primary"
                    : "text-foreground hover:bg-muted"
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
              {!pret && (
                <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                  bientôt
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
