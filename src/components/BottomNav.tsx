import { NavLink, useLocation } from "react-router-dom";
import { NAV_PRINCIPAL } from "@/lib/nav";
import { prechargerRoute } from "@/lib/prechargerRoute";
import { cn } from "@/lib/utils";

/**
 * Barre du bas — jusqu'à 1024 px (au-delà, le rail latéral prend le relais).
 * 5 emplacements pour que « Publier » tombe pile au centre, en bouton surélevé,
 * exactement comme sur Fonenako.
 */
export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background xl:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigation principale"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {NAV_PRINCIPAL.map(({ to, label, icon: Icon }, i) => {
          const actif = pathname === to;
          const centre = i === 2;
          return (
            <li key={to} className="flex flex-1 items-center justify-center">
              <NavLink
                to={to}
              // Le code de la page part AU TOUCHER, pas au clic : sur o2switch,
              // l\'etablissement de connexion coute deja ~800 ms.
              onPointerDown={() => prechargerRoute(to)}
                onClick={(e) => {
                  if (to === "/" && actif) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                aria-label={label}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px]",
                  centre && "-mt-7",
                  actif ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center",
                    centre
                      ? "h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
                      : "h-6 w-6"
                  )}
                >
                  <Icon className={centre ? "h-6 w-6" : "h-5 w-5"} aria-hidden="true" />
                </span>
                {!centre && <span>{label}</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
