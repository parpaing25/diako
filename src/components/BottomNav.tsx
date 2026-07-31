import { NavLink, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Barre du bas — mobile uniquement (le rail latéral prend le relais ≥ 768 px).
 * 5 emplacements pour que « Publier » tombe pile au centre, en bouton surélevé.
 *
 * Les libellés viennent de src/lib/nav.ts, partagés avec le rail et le pied de
 * page : sur Fonenako ils vivaient à trois endroits et avaient divergé.
 */
export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigation principale"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {NAV_ITEMS.map(({ to, label, icon: Icon }, i) => {
          const active = location.pathname === to;
          const centre = i === 2;
          return (
            <li key={to} className="flex flex-1 items-center justify-center">
              <NavLink
                to={to}
                onClick={(e) => {
                  if (to === "/" && active) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px]",
                  centre && "-mt-7",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center",
                    centre
                      ? "h-12 w-12 rounded-full bg-primary text-primary-foreground ring-4 ring-background"
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
