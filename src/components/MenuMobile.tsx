import { useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut, Moon, Sun, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getAvatarUrl } from "@/lib/supabaseImage";
import { NAV_COMPLET } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Tiroir de navigation mobile.
 *
 * Il donne accès, sur téléphone, à tout ce que le rail latéral offre en
 * desktop : la barre du bas ne peut porter que 5 emplacements, or le produit
 * en compte dix.
 */
export function MenuMobile({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const { user, signOut } = useAuth();
  const { profile } = useUserData();
  const { effectif, setTheme } = useTheme();
  const { pathname } = useLocation();

  // Se referme à chaque navigation, sinon il reste ouvert par-dessus la page.
  useEffect(fermer, [pathname, fermer]);

  // Empêche la page de défiler derrière le tiroir.
  useEffect(() => {
    if (!ouvert) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [ouvert]);

  // Échap ferme — attendu de tout panneau modal.
  useEffect(() => {
    if (!ouvert) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ouvert, fermer]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="Fermer le menu"
        onClick={fermer}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xl font-bold text-primary">Diako</span>
          <button
            onClick={fermer}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {user ? (
          <Link to="/compte" className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
              {profile?.avatar_url ? (
                <img src={getAvatarUrl(profile.avatar_url, 44)} alt="" width={44} height={44} className="h-11 w-11 object-cover" />
              ) : (
                <span className="font-semibold">{(profile?.display_name || "D").slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{profile?.display_name || "Mon profil"}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </Link>
        ) : (
          <div className="border-b border-border px-4 py-3.5">
            <Link
              to="/auth"
              className="flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 font-medium text-primary-foreground"
            >
              Se connecter / créer un compte
            </Link>
          </div>
        )}

        <nav aria-label="Navigation" className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {NAV_COMPLET.map(({ to, label, icon: Icon, pret }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px]",
                      isActive ? "bg-secondary font-medium text-primary" : "hover:bg-muted"
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  {!pret && (
                    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      bientôt
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-border px-2 py-2">
          <button
            onClick={() => setTheme(effectif === "sombre" ? "clair" : "sombre")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] hover:bg-muted"
          >
            {effectif === "sombre" ? (
              <Sun className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5" aria-hidden="true" />
            )}
            Passer en mode {effectif === "sombre" ? "clair" : "sombre"}
          </button>
          {user && (
            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] text-muted-foreground hover:bg-muted"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              Se déconnecter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
