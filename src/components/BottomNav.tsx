import { NavLink, useLocation } from "react-router-dom";
import { Compass, Home, Plus, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barre du bas — 5 emplacements pour que « Publier » tombe PILE au centre
 * en bouton flottant surélevé. Reprise de Fonenako, items adaptés au voyage.
 *
 * Cliquer sur Accueil alors qu'on y est déjà = retour en haut + rechargement
 * de la première page du fil (événement `dk:home-refresh`).
 */
const items = [
  { to: "/", icon: Home, label: "Accueil" },
  { to: "/explorer", icon: Compass, label: "Explorer" },
  { to: "/publier", icon: Plus, label: "Publier", center: true },
  { to: "/recherche", icon: Search, label: "Chercher" },
  { to: "/compte", icon: User, label: "Compte" },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigation principale"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {items.map(({ to, icon: Icon, label, center }) => {
          const active = location.pathname === to;
          return (
            <li key={to} className="flex flex-1 items-center justify-center">
              <NavLink
                to={to}
                onClick={(e) => {
                  if (to === "/" && active) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    window.dispatchEvent(new CustomEvent("dk:home-refresh"));
                  }
                }}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "dk-tap flex flex-col items-center justify-center gap-0.5 text-[11px]",
                  center && "-mt-7",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center",
                    center
                      ? "h-12 w-12 rounded-full bg-primary text-primary-foreground ring-4 ring-background"
                      : "h-6 w-6"
                  )}
                >
                  <Icon className={center ? "h-6 w-6" : "h-5 w-5"} strokeWidth={2} />
                </span>
                {!center && <span>{label}</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
